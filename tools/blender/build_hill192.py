"""Author Hill 192 vegetation, ground blending and fixed summer light.

Input is a read-only export from the web level. +X is east, +Y north and
+Z up in Blender. Runtime placements convert to +X east, +Z south, +Y up.
"""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import random
import struct
import sys
import zlib

import addon_utils
import bmesh
import bpy
from mathutils import Matrix, Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "public/art"
OUT = ART / "hill192"
SKY = ART / "sky/kloofendal_48d_partly_cloudy_puresky_1k.hdr"
STRIDE = 6
rng = random.Random(19271)


def point(x, z, height):
    return (x, -z, height)


def smooth(edge0, edge1, value):
    t = np.clip((value - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def segments(roads):
    return [(a, b, road["width"]) for road in roads
            for a, b in zip(road["points"], road["points"][1:])]


def height(grid, x, z):
    rows = grid["elevations"]
    fu = max(0., min(len(rows[0]) - 1, (x - grid["minX"]) / grid["spacing"]))
    fv = max(0., min(len(rows) - 1, (z - grid["minZ"]) / grid["spacing"]))
    u, v = min(len(rows[0]) - 2, int(fu)), min(len(rows) - 2, int(fv))
    a, b = fu - u, fv - v
    nw, ne = rows[v][u:u + 2]
    sw, se = rows[v + 1][u:u + 2]
    if a + b <= 1:
        return nw + (ne - nw) * a + (sw - nw) * b
    return se + (sw - se) * (1 - a) + (ne - se) * (1 - b)


def nearest_road(x, z, paths):
    best = math.inf
    for (ax, az), (bx, bz), width in paths:
        dx, dz = bx - ax, bz - az
        t = max(0., min(1., ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
        best = min(best, math.hypot(x - ax - t * dx, z - az - t * dz) - width / 2)
    return best


def png(path, pixels):
    h, w, channels = pixels.shape
    colour_type = {1: 0, 3: 2}[channels]
    def chunk(key, data):
        return struct.pack(">I", len(data)) + key + data + struct.pack(">I", zlib.crc32(key + data))
    data = b"".join(b"\x00" + row.tobytes() for row in pixels)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" +
                     chunk(b"IHDR", struct.pack(">2I5B", w, h, 8, colour_type, 0, 0, 0)) +
                     chunk(b"IDAT", zlib.compress(data, 7)) + chunk(b"IEND", b""))


def bake_ground(layout):
    """RGB: field finish, road bedding and twin ruts. Separate grey flint band."""
    resolution = 1536
    coordinates = (np.arange(resolution, dtype=np.float32) + .5) / resolution * 600 - 300
    x, z = np.meshgrid(coordinates, coordinates)
    margins = np.full_like(x, np.inf)
    lane = np.zeros_like(x)
    rut = np.zeros_like(x)
    breakup = .5 + .22 * np.sin(x * .48 + np.cos(z * .31) * 2) + .22 * np.sin(z * .92 + x * .71)
    for (ax, az), (bx, bz), width in segments(layout["roads"]):
        dx, dz = bx - ax, bz - az
        t = np.clip(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1)
        distance = np.hypot(x - ax - t * dx, z - az - t * dz)
        margins = np.minimum(margins, distance - width / 2)
        lane = np.maximum(lane, 1 - smooth(width * .41, width * .56, distance + breakup * .45))
        tracks = (1 - smooth(.29, .64, np.abs(distance - width * .22)))
        rut = np.maximum(rut, tracks * (.55 + .45 * breakup) * (1 - smooth(width * .33, width * .46, distance)))
    field_mask = np.zeros_like(x)
    kinds = {"pasture": .33, "stubble": .68, "plough": 1.0}
    for field in layout["fields"]:
        edge = np.maximum(np.abs(x - field["x"]) - field["width"] / 2,
                          np.abs(z - field["z"]) - field["depth"] / 2)
        mask = 1 - smooth(-1.4, 1.35, edge + (breakup - .5) * 1.85)
        field_mask = np.maximum(field_mask, mask * kinds[field["kind"]])
    local_patches = .5 + .3 * np.sin(x * .18 + z * .29) + .2 * np.sin(z * .78 - x * .53)
    rock = (1 - smooth(.35, 1.95, np.abs(margins - .85))) * smooth(.54, .82, local_patches)
    rgb = np.uint8(np.clip(np.dstack((field_mask, lane, rut)), 0, 1) * 255 + .5)
    png(OUT / "ground-weights.png", rgb)
    png(OUT / "flint-weights.png", np.uint8(rock[::2, ::2, None] * 255 + .5))


def material(name, colour, roughness=.9):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*colour, 1)
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*colour, 1)
    shader.inputs["Roughness"].default_value = roughness
    return item


def mesh_object(name, vertices, faces, materials, indices=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    for mat in materials:
        data.materials.append(mat)
    if indices is not None:
        for face, index in zip(data.polygons, indices):
            face.material_index = index
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def oak(collection, palettes):
    plugin = "bl_ext.user_default.sapling_tree_gen"
    if not addon_utils.check(plugin)[1] and not addon_utils.enable(plugin):
        raise RuntimeError("Install Sapling Tree Gen 1.0.0 in Blender user extensions")
    if "FINISHED" not in bpy.ops.curve.tree_add(preset="cambridge_oak"):
        raise RuntimeError("Sapling could not generate the Cambridge Oak")
    original = bpy.context.object
    settings = json.loads(original["sapling_settings"])["settings"]
    settings.update(
        levels=3, branches=(0, 13, 8, 0), curveRes=(7, 5, 3, 1),
        leaves=8, leafScale=.28, leafShape="hex", scale=10.8, scaleV=.8,
        resU=2, bevelRes=0, seed=19, segSplits=(.35, .2, .05, 0)
    )
    setting_keys = bpy.ops.curve.tree_add.get_rna_type().properties.keys()
    settings = {key: value for key, value in settings.items() if key in setting_keys}
    if "FINISHED" not in bpy.ops.curve.tree_add(replace=original.name, load_stored=False, **settings):
        raise RuntimeError("Sapling could not refine the gameplay oak")
    authored = bpy.context.object
    authored.name = "Oak | editable Cambridge Oak, Sapling Tree Gen"
    leaves = next(child for child in authored.children if child.type == "MESH")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    prototypes = []
    for component, source, face_budget, mats in (
        ("OakTrunk", authored, 1500, palettes["bark"]),
        ("OakCrown", leaves, 5400, palettes["foliage"]),
    ):
        data = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), depsgraph=depsgraph)
        data.materials.clear()
        for mat in mats:
            data.materials.append(mat)
        for face in data.polygons:
            face.material_index = rng.randrange(len(mats))
            face.use_smooth = component == "OakTrunk"
        obj = bpy.data.objects.new(component, data)
        bpy.context.collection.objects.link(obj)
        obj.matrix_world = source.matrix_world
        face_count = sum(max(1, len(face.vertices) - 2) for face in data.polygons)
        if face_count > face_budget:
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new("Downsample to game foliage budget", "DECIMATE")
            modifier.ratio = face_budget / face_count
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        prototypes.append(obj)
    # Cluster the actual Sapling leaf tips into crown masses. Individual leaves
    # remain beyond the masses, so the silhouette breaks up at close range.
    tip_cells = defaultdict(list)
    for face in leaves.data.polygons:
        tip = leaves.matrix_world @ face.center
        key = tuple(math.floor(component / .83) for component in tip)
        tip_cells[key].append(tip)
    foliage = []
    for samples in tip_cells.values():
        if len(samples) < 2:
            continue
        centre = sum(samples, Vector()) / len(samples)
        spread = rng.uniform(.56, .78)
        foliage.append((*centre, spread, spread * rng.uniform(.8, 1.2), spread * rng.uniform(.64, .90)))
    prototypes.append(rounded_cluster("OakLeafMasses", foliage, palettes["foliage"], subdivisions=1))
    for obj in [authored, *authored.children_recursive]:
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
        obj.hide_set(True)
        obj.hide_render = True
    return prototypes


def rounded_cluster(name, specs, palettes, subdivisions=2):
    bm = bmesh.new()
    for index, (x, y, z, sx, sy, sz) in enumerate(specs):
        transform = Matrix.Translation(Vector((x, y, z))) @ Matrix.Diagonal(Vector((sx, sy, sz, 1)))
        old = set(bm.faces)
        created = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1, matrix=transform)
        if name in ("Bocage", "OakLeafMasses"):
            centre = Vector((x, y, z))
            for vertex in created["verts"]:
                edge = vertex.co - centre
                # Short irregular leaf clumps break up the silhouette of each mass.
                vertex.co = centre + edge * (1 + .13 * math.sin(vertex.co.x * 28 + vertex.co.z * 21))
        for face in bm.faces:
            if face in old:
                continue
            face.material_index = (index + rng.randrange(2)) % len(palettes)
            face.smooth = name != "Flint"
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in palettes:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def grass(name, mats, dry=False):
    verts, faces, slots = [], [], []
    for blade in range(10 if dry else 11):
        ax, ay = rng.uniform(-.22, .22), rng.uniform(-.18, .18)
        bearing = rng.random() * math.tau
        half_width = rng.uniform(.017, .038)
        sx, sy = math.cos(bearing), math.sin(bearing)
        length = rng.uniform(.19, .46) * (1.32 if dry else 1)
        base = len(verts)
        verts.extend(((ax - sx * half_width, ay - sy * half_width, 0),
                      (ax + sx * half_width, ay + sy * half_width, 0),
                      (ax + sy * length * .19, ay - sx * length * .19, length * .59),
                      (ax + sy * length * .34, ay - sx * length * .34, length)))
        faces.extend(((base, base + 1, base + 2), (base + 2, base + 1, base + 3)))
        shade = rng.randrange(len(mats))
        slots.extend((shade, shade))
    return mesh_object(name, verts, faces, mats, slots)


def library():
    palettes = {
        "bark": [material("Oak bark | shadow", (.084, .053, .030)),
                 material("Oak bark | ridges", (.129, .086, .049))],
        "foliage": [material("Oak canopy | dark", (.051, .100, .027)),
                    material("Oak canopy | green", (.086, .156, .041)),
                    material("Oak canopy | light", (.157, .223, .065))],
        "understory": [material("Hawthorn | shaded", (.065, .104, .026)),
                       material("Hawthorn | new leaf", (.113, .183, .046)),
                       material("Bramble | dry tips", (.191, .218, .065))],
    }
    editable = bpy.data.collections.new("Sapling authoring source")
    bpy.context.scene.collection.children.link(editable)
    trees = oak(editable, palettes)
    hedge = rounded_cluster("Bocage", [
        (-.37, .19, .31, .39, .30, .40), (.16, -.21, .38, .43, .38, .46),
        (.36, .16, .29, .41, .33, .37), (-.17, -.10, .50, .44, .38, .43),
        (-.42, -.16, .20, .37, .32, .25), (.22, .26, .14, .37, .25, .21),
        (-.34, .32, .63, .22, .17, .26), (.55, -.06, .49, .26, .20, .26),
        (-.61, -.25, .34, .23, .24, .19), (.02, .31, .62, .25, .18, .28),
        (-.48, .04, .83, .15, .17, .16), (.30, .26, .72, .17, .20, .24),
        (.20, -.32, .64, .21, .22, .23), (.62, .26, .33, .18, .20, .19),
    ], palettes["understory"])
    stone = rounded_cluster("Flint", [
        (0, 0, .11, .42, .33, .23), (.32, .21, .04, .21, .19, .12),
        (-.23, -.18, .01, .25, .16, .10),
    ], [material("Flint | grey face", (.21, .208, .178)),
        material("Flint | raw edge", (.34, .315, .24)),
        material("Flint | lichen", (.23, .244, .157))])
    green = grass("Verge", [material("Field grass | green", (.14, .23, .062)),
                            material("Field grass | olive", (.22, .29, .082)),
                            material("Field grass | seed heads", (.32, .31, .127))])
    straw = grass("Stubble", [material("Cut wheat | straw", (.37, .326, .128)),
                              material("Cut wheat | dark stem", (.27, .221, .072)),
                              material("Cut wheat | amber", (.44, .367, .144))], dry=True)
    return {"oak": trees, "bocage": [hedge], "flint": [stone], "verge": [green], "stubble": [straw]}


def distribute(layout):
    paths = segments(layout["roads"])
    rows = defaultdict(list)
    zone = layout["zone"]
    grid = layout["terrain"]

    def add(key, x, z, scale, lift=0):
        rows[key].extend(round(value, 3) for value in (
            x, height(grid, x, z) + lift, z, rng.random() * math.tau, scale, rng.uniform(.87, 1.15)
        ))

    def out_of_play_line(x, z, clear):
        return not (-87 < z < 145 and abs(x + 110) < clear)

    for (ax, az), (bx, bz), width in paths:
        dx, dz = bx - ax, bz - az
        span = math.hypot(dx, dz)
        nx, nz = dz / span, -dx / span
        for step in range(int(span * 2)):
            t = (step + rng.random()) / max(1, int(span * 2))
            x, z = ax + dx * t, az + dz * t
            for sign in (-1, 1):
                offset = sign * (width * .58 + rng.uniform(.12, 2.65))
                gx, gz = x + offset * nx, z + offset * nz
                if abs(gx) > 305 or abs(gz) > 305 or nearest_road(gx, gz, paths) < .25:
                    continue
                add("verge", gx, gz, rng.uniform(.63, 1.33))
                if step % 14 == 2 and rng.random() < .68:
                    add("flint", gx + nx * sign, gz + nz * sign, rng.uniform(.72, 1.47), -.045)
                if step % 8 == 1 and rng.random() < .73 and out_of_play_line(gx, gz, 5.8):
                    add("bocage", gx + nx * sign * rng.uniform(.65, 1.8),
                        gz + nz * sign * rng.uniform(.65, 1.8), rng.uniform(.58, .96), -.06)

    # Selected thick banks turn the shallow cut into a recognizable bocage
    # route. End before junctions and keep the central 200 m sight lane open.
    for (ax, az), (bx, bz) in [
        ((-119, -72), (-119, -48)), ((-119, -44), (-122, -16)),
        ((-122, -10), (-120, 23)), ((-120, 37), (-119, 70)),
        ((-101, -62), (-101, -34)), ((-100, -28), (-99, 12)),
        ((-100, 48), (-99, 72)), ((-153, -100), (-181, -111)),
        ((-223, 36), (-213, 60)), ((-206, 70), (-182, 96)),
    ]:
        span = math.hypot(bx - ax, bz - az)
        for step in range(int(span)):
            t = (step + rng.uniform(.25, .75)) / span
            x = ax + (bx - ax) * t + rng.uniform(-.68, .68)
            z = az + (bz - az) * t + rng.uniform(-.58, .58)
            if nearest_road(x, z, paths) > 1.7 and out_of_play_line(x, z, 7):
                add("bocage", x, z, rng.uniform(.94, 1.43), -.11)
                grass_x = x + (.65 if x < -110 else -.65)
                if nearest_road(grass_x, z, paths) > .5:
                    add("verge", grass_x, z, rng.uniform(.7, 1.29))
    for field in layout["fields"]:
        fx, fz = field["x"], field["z"]
        w, d = field["width"] / 2, field["depth"] / 2
        for side in (-1, 1):
            for step in range(int(d)):
                x, z = fx + side * w + rng.uniform(-1.35, 1.35), fz - d + (step + .3) * 2
                if nearest_road(x, z, paths) > 1.15 and out_of_play_line(x, z, 7.0):
                    if rng.random() < .73:
                        add("bocage", x, z, rng.uniform(.75, 1.67), -.07)
                    if step % 12 == 7 and rng.random() < .82 and out_of_play_line(x, z, 14.5):
                        if nearest_road(x, z, paths) > 6 and math.hypot(x - zone["x"], z - zone["z"]) > 30:
                            add("oak", x, z, rng.uniform(.73, 1.21), -.15)
            for step in range(int(w)):
                x, z = fx - w + (step + .3) * 2, fz + side * d + rng.uniform(-1.35, 1.35)
                if nearest_road(x, z, paths) > 1.35 and out_of_play_line(x, z, 7.0) and rng.random() < .74:
                    add("bocage", x, z, rng.uniform(.75, 1.55), -.07)
        if field["kind"] == "stubble":
            for _ in range(680):
                x, z = fx + rng.uniform(-w, w), fz + rng.uniform(-d, d)
                if nearest_road(x, z, paths) > .55:
                    add("stubble", x, z, rng.uniform(.31, .74), -.01)
    for x, z, scale in [(-132, -54, 1.14), (-141, -16, .92), (-88, -27, 1.18), (-89, 31, .93),
                        (-128, 48, 1.12), (-140, 77, .94), (-81, 117, .86),
                        (-268, -124, 1.35), (-271, -102, .91), (47, 81, .93)]:
        if nearest_road(x, z, paths) > 6.5 and out_of_play_line(x, z, 14.5):
            add("oak", x, z, scale, -.17)
    for _ in range(105):
        theta = rng.random() * math.tau
        x, z = math.cos(theta), math.sin(theta)
        scale = rng.uniform(290, 331) / max(abs(x), abs(z))
        add("oak", x * scale, z * scale, rng.uniform(.65, 1.33), -.17)
    return rows


def fixed_light(layout, addon_root):
    sys.path.insert(0, str(addon_root))
    import sun_position
    from sun_position.sun_calc import get_sun_coordinates, get_sun_vector
    sun_position.register()
    lon, lat = layout["origin"]
    try:
        # The extension's low-level UTC argument is hours added to local time.
        azimuth, elevation = get_sun_coordinates(15.5, lat, lon, -2, 7, 11, 1944)
        vector = get_sun_vector(azimuth, elevation).normalized()
    finally:
        sun_position.unregister()
    return vector, {"day": "1944-07-11", "localHour": 15.5, "utcOffset": 2,
                    "sun": [round(value, 6) for value in (vector.x, vector.z, -vector.y)],
                    "skyYaw": -.62}


def disposition(prototypes, rows):
    lib = bpy.data.collections.new("Game-ready provenance")
    bpy.context.scene.collection.children.link(lib)
    for kind, objects in prototypes.items():
        collection = bpy.data.collections.new(kind)
        lib.children.link(collection)
        for obj in objects:
            for owner in list(obj.users_collection):
                owner.objects.unlink(obj)
            collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [obj for objects in prototypes.values() for obj in objects]:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / "vegetation.glb"), export_format="GLB",
        use_selection=True, export_animations=False, export_extras=True,
        export_cameras=False, export_lights=False,
    )
    instances = bpy.data.collections.new("Bocage, verges and scattered flint")
    bpy.context.scene.collection.children.link(instances)
    for kind, row in rows.items():
        collection = lib.children[kind]
        for index in range(0, len(row), STRIDE):
            x, y, z, turn, size, _ = row[index:index + STRIDE]
            # Reserve the densest small ground cover for the runtime instanced mesh.
            if kind in ("verge", "stubble") and (index / STRIDE) % 2:
                continue
            duplicate = bpy.data.objects.new(f"{kind} {index // STRIDE}", None)
            duplicate.instance_collection = collection
            duplicate.instance_type = "COLLECTION"
            duplicate.empty_display_size = .15
            duplicate.location = point(x, z, y)
            duplicate.rotation_euler.z = turn
            duplicate.scale = (size,) * 3
            instances.objects.link(duplicate)
    bpy.context.scene.collection.children.unlink(lib)
    return lib


def reference_ground(layout):
    grid = layout["terrain"]
    spacing = grid["spacing"]
    rows = grid["elevations"]
    cols = len(rows[0])
    verts = [point(grid["minX"] + col * spacing, grid["minZ"] + row * spacing, h)
             for row, line in enumerate(rows) for col, h in enumerate(line)]
    faces = []
    for row in range(len(rows) - 1):
        for col in range(cols - 1):
            i = row * cols + col
            faces.extend(((i, i + cols, i + 1), (i + 1, i + cols, i + cols + 1)))
    finish = material("Weathered ground · layers from packed map", (.23, .30, .11))
    terrain = mesh_object("IGN ground · exact playable triangles", verts, faces, [finish])
    for face in terrain.data.polygons:
        face.use_smooth = True
    node = finish.node_tree.nodes
    nodes = finish.node_tree
    link = nodes.links.new
    uv = terrain.data.uv_layers.new(name="Authored weight map")
    for loop in terrain.data.loops:
        x, y, _ = terrain.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((x + 300) / 600, (y + 300) / 600)
    texture = node.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(OUT / "ground-weights.png"))
    texture.image.colorspace_settings.name = "Non-Color"
    texture.extension = "EXTEND"
    texture.image.pack()
    flint = node.new("ShaderNodeTexImage")
    flint.image = bpy.data.images.load(str(OUT / "flint-weights.png"))
    flint.image.colorspace_settings.name = "Non-Color"
    flint.extension = "EXTEND"
    flint.image.pack()
    channels = node.new("ShaderNodeSeparateColor")
    link(texture.outputs["Color"], channels.inputs[0])
    texcoord = node.new("ShaderNodeTexCoord")
    uvscale = node.new("ShaderNodeVectorMath")
    uvscale.operation = "MULTIPLY"
    uvscale.inputs[1].default_value = (170., 170., 1.)
    link(texcoord.outputs["UV"], uvscale.inputs[0])

    def photo(name):
        tex = node.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(ART / "terrain" / name), check_existing=True)
        tex.image.pack()
        link(uvscale.outputs[0], tex.inputs[0])
        return tex.outputs[0]

    def math_value(operation, value, factor):
        op = node.new("ShaderNodeMath")
        op.operation = operation
        link(value, op.inputs[0])
        op.inputs[1].default_value = factor
        return op.outputs[0]

    def tint(source, colour):
        blend = node.new("ShaderNodeMixRGB")
        blend.blend_type = "MULTIPLY"
        blend.inputs[0].default_value = 1
        link(source, blend.inputs[1])
        blend.inputs[2].default_value = (*colour, 1)
        return blend.outputs[0]

    def mix(amount, a, b):
        blend = node.new("ShaderNodeMixRGB")
        link(amount, blend.inputs[0])
        link(a, blend.inputs[1])
        link(b, blend.inputs[2])
        return blend.outputs[0]

    grass = photo("leafy_grass_diff_1k.jpg")
    soil = photo("farm_soil_diff_1k.jpg")
    mud = photo("muddy_tracks_diff_1k.jpg")
    stone = photo("old_stone_wall_02_diff_1k.jpg")
    field_code = channels.outputs["Red"]
    meadow = tint(grass, (.70, 1.0, .50))
    straw = tint(grass, (1.07, .89, .47))
    stubble = math_value("MULTIPLY", math_value("GREATER_THAN", field_code, .49), .85)
    plough = math_value("GREATER_THAN", field_code, .88)
    ground = mix(stubble, meadow, straw)
    ground = mix(plough, ground, soil)
    rut = mix(channels.outputs["Blue"], mud, tint(mud, (.57, .50, .44)))
    ground = mix(channels.outputs["Green"], ground, rut)
    ground = mix(flint.outputs["Color"], ground, stone)
    link(ground, node.get("Principled BSDF").inputs["Base Color"])
    contour = [(-300, -300 + i * spacing) for i in range(cols - 1)]
    contour.extend((-300 + i * spacing, 300) for i in range(cols - 1))
    contour.extend((300, 300 - i * spacing) for i in range(cols - 1))
    contour.extend((300 - i * spacing, -300) for i in range(cols - 1))
    count = len(contour)
    edges, faces = [], []
    for ring, radius in enumerate((1., 1.05, 1.14, 1.3, 1.52, 1.78)):
        for i, (x, z) in enumerate(contour):
            wave = math.sin(x * .022 + z * .013) * 7 + math.cos(x * .015 - z * .023) * 4 - 2.4
            edges.append(point(x * radius, z * radius, height(grid, x, z) + wave * (radius - 1)))
            if ring:
                a, b = ring * count + i, ring * count + (i + 1) % count
                faces.extend(((a - count, a, b - count), (b - count, a, b)))
    horizon = mesh_object("Distant rolling land · art outside play bounds", edges, faces, [finish])
    horizon_uv = horizon.data.uv_layers.new(name="Authored weight map")
    for face in horizon.data.polygons:
        face.use_smooth = True
    for loop in horizon.data.loops:
        x, y, _ = horizon.data.vertices[loop.vertex_index].co
        horizon_uv.data[loop.index].uv = ((x + 300) / 600, (y + 300) / 600)
    return terrain


def boxes(layout):
    stone = material("Cover · warm flint rubble", (.258, .242, .205))
    node = stone.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(ART / "terrain/old_stone_wall_02_diff_1k.jpg"), check_existing=True)
    node.image.pack()
    stone.node_tree.links.new(node.outputs[0], stone.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    for index, cover in enumerate(layout["cover"]):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=point(
            cover["x"], cover["z"], cover["y"] + cover["height"] / 2))
        obj = bpy.context.object
        obj.name = f"Cover {index + 1} · authority dimensions"
        obj.scale = cover["width"], cover["depth"], cover["height"]
        obj.data.materials.append(stone)


def lighting_and_cameras(layout, sun, config):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Mottled July cloud · Kloofendal HDRI")
    world.use_nodes = True
    scene.world = world
    nodes = world.node_tree.nodes
    link = world.node_tree.links.new
    texture = nodes.new("ShaderNodeTexEnvironment")
    texture.image = bpy.data.images.load(str(SKY), check_existing=True)
    texture.image.pack()
    facing = nodes.new("ShaderNodeTexCoord")
    rotate = nodes.new("ShaderNodeMapping")
    rotate.inputs["Rotation"].default_value.z = config["skyYaw"]
    link(facing.outputs["Generated"], rotate.inputs["Vector"])
    link(rotate.outputs[0], texture.inputs[0])
    link(texture.outputs["Color"], nodes.get("Background").inputs["Color"])
    nodes.get("Background").inputs["Strength"].default_value = .66
    bpy.ops.object.light_add(type="SUN", location=sun * 60)
    light = bpy.context.object
    light.name = "Sun Position · Hill 192 · 11 July 1944 · 15:30"
    light.rotation_euler = sun.to_track_quat("Z", "Y").to_euler()
    light.data.energy = 1.15
    light.data.angle = math.radians(6.2)
    light.data.color = (1, .92, .79)

    grid = layout["terrain"]
    cameras = []
    spawn = layout["spawn"]
    snapshots = [
        ("01 Driver · sunken lane", spawn["x"], spawn["z"], 1.65, -110, -34, .02, 25),
        ("02 Driver · rising lane", -110, 5, 1.65, -107, 52, -.25, 25),
        ("03 Gunner · ridge and open approach", -110, 69, 2.85, -110, 133, .05, 28),
        ("04 Survey · fields and oak lines", -223, -140, 133, -46, 44, 0, 31),
    ]
    for name, x, z, h, tx, tz, th, focal in snapshots:
        origin = Vector(point(x, z, height(grid, x, z) + h))
        target = Vector(point(tx, tz, height(grid, tx, tz) + 1.6 + th))
        bpy.ops.object.camera_add(location=origin)
        camera = bpy.context.object
        camera.name = name
        camera.rotation_euler = (target - origin).to_track_quat("-Z", "Y").to_euler()
        camera.data.lens = focal
        camera.data.clip_end = 840
        cameras.append(camera)
    scene.camera = cameras[0]
    return cameras


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--layout", type=Path, required=True)
    args.add_argument("--sun-addon-root", type=Path, required=True)
    args.add_argument("--render", type=Path)
    settings = args.parse_args(sys.argv[sys.argv.index("--") + 1:])
    layout = json.loads(settings.layout.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bake_ground(layout)
    prototypes = library()
    placements = distribute(layout)
    sun, config = fixed_light(layout, settings.sun_addon_root)
    report = {"stride": STRIDE, "light": config, "placements": placements}
    (OUT / "layout.json").write_text(json.dumps(report, separators=(",", ":")) + "\n")
    (ROOT / "web/levels/hill192-light.json").write_text(json.dumps(config, indent=2) + "\n")
    disposition(prototypes, placements)
    reference_ground(layout)
    boxes(layout)
    cameras = lighting_and_cameras(layout, sun, config)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "tools/blender/hill192-art.blend"), compress=True)
    print("Hill 192 placement totals:", {key: len(row) // STRIDE for key, row in placements.items()})
    if settings.render:
        settings.render.mkdir(parents=True, exist_ok=True)
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 12
        scene.cycles.use_denoising = True
        scene.render.resolution_x = 800
        scene.render.resolution_y = 450
        for camera in [cameras[0], cameras[2], cameras[3]]:
            scene.camera = camera
            scene.render.filepath = str(settings.render / (camera.name[:2] + ".png"))
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
