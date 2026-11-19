"""Baked work-leather and twill materials, and the loader's articulated uniform sleeves.

All texture fields wrap at their boundaries. Blender's bundled NumPy is used only
at authoring time; the exported game asset contains ordinary glTF PBR textures.
"""
import math
import struct
import tempfile
import zlib
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

TAU = math.tau
SIZE = 384


def tile_noise(rng, cells):
    grid = rng.random((cells, cells)).astype(np.float32)
    t = np.arange(SIZE) * cells / SIZE
    index = t.astype(int)
    k = t - index
    k = (k * k * (3 - 2 * k)).reshape(1, -1)
    j = (index + 1) % cells
    top = grid[np.ix_(index, index)] * (1 - k) + grid[np.ix_(index, j)] * k
    bot = grid[np.ix_(j, index)] * (1 - k) + grid[np.ix_(j, j)] * k
    return top * (1 - k.T) + bot * k.T


def hide_grain(rng, u, v):
    """Crevices between irregular pebbles of hide, with small raised centres."""
    cells = 43
    centres = rng.uniform(.12, .88, (cells, cells, 2))
    x = u * cells + .24 * tile_noise(rng, 14)
    y = v * cells + .55 * np.sin(TAU * (u + v)) + .31 * tile_noise(rng, 20)
    i, j = x.astype(int), y.astype(int)
    nearest = np.full_like(u, 99.)
    second = nearest.copy()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            point = centres[(j + dy) % cells, (i + dx) % cells]
            distance = (i + dx + point[..., 0] - x) ** 2 + (j + dy + point[..., 1] - y) ** 2
            second = np.minimum(second, np.maximum(nearest, distance))
            nearest = np.minimum(nearest, distance)
    return np.clip((np.sqrt(second) - np.sqrt(nearest)) * 5.8, 0, 1)


def packed_png(name, rgb, directory, color_space):
    """Write known sRGB/linear byte values, then pack them into the editable Blend."""
    rgb = np.uint8(np.clip(rgb, 0, 255))
    h, w, _ = rgb.shape
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    scanlines = b"".join(b"\x00" + row.tobytes() for row in rgb)
    path = directory / (name + ".png")
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", w, h, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(scanlines, 7)) + chunk(b"IEND", b""))
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = color_space
    image.pack()
    # Also give unpacking from the Blend a safe, project-relative destination.
    image.filepath = "//textures/" + path.name
    return image


def surface_maps(name, height, rough, strength, directory):
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    n = np.dstack((-dx, dy, np.ones_like(dx)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    normal = packed_png(name + "-grain", (n * .5 + .5) * 255, directory, "Non-Color")
    # glTF stores perceptual roughness in G, metallic in B.
    orm = np.dstack((np.full_like(rough, 255), np.clip(rough, 0, 1) * 255, np.zeros_like(rough)))
    return normal, packed_png(name + "-finish", orm, directory, "Non-Color")


def make_material(name, swatch, rough, maps=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    linear = tuple(((v / 255 + .055) / 1.055) ** 2.4 for v in swatch)
    material.diffuse_color = (*linear, 1)
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = rough
    if maps:
        nodes, link = material.node_tree.nodes, material.node_tree.links.new
        def texture(image, y):
            t = nodes.new("ShaderNodeTexImage")
            t.image = image
            t.location = (-700, y)
            return t.outputs["Color"]
        base, normal, finish = maps
        link(texture(base, 350), shader.inputs["Base Color"])
        bump = nodes.new("ShaderNodeNormalMap")
        bump.location = (-300, -70)
        link(texture(normal, -70), bump.inputs["Color"])
        link(bump.outputs["Normal"], shader.inputs["Normal"])
        unpack = nodes.new("ShaderNodeSeparateColor")
        unpack.location = (-300, -360)
        link(texture(finish, -360), unpack.inputs["Color"])
        link(unpack.outputs["Green"], shader.inputs["Roughness"])
        link(unpack.outputs["Blue"], shader.inputs["Metallic"])
    return material


def build_materials():
    rng = np.random.default_rng(17411)
    y, x = np.indices((SIZE, SIZE)) / SIZE
    broad = tile_noise(rng, 5) - .5
    mottling = tile_noise(rng, 17) - .5
    scuff = np.clip((tile_noise(rng, 8) - .55) * 3, 0, 1)
    speck = rng.random(x.shape) - .5
    leather = hide_grain(rng, x, y)
    grain = .20 * leather + .09 * speck + .12 * mottling
    # Alternating warp/weft ridges follow the diagonal of a tightly woven twill.
    warp = np.cos(TAU * (96 * x + .32 * mottling))
    weft = np.cos(TAU * (100 * y + .26 * broad))
    rib = .5 + .5 * np.sin(TAU * (24 * x + 25 * y + .09 * mottling))
    weave = .52 * warp * rib + .48 * weft * (1 - rib)
    with tempfile.TemporaryDirectory() as tmp:
        directory = Path(tmp)
        hide_maps = surface_maps("Work-hide", grain, .68 + .12 * (1 - leather) - .14 * scuff, .9, directory)
        twill_maps = surface_maps("Cotton-twill", weave + .12 * speck, .91 + .045 * mottling, .19, directory)
        def finish(name, swatch, variation, maps):
            rgb = np.array(swatch) + variation[..., None] * np.array([1, .88, .72])
            base = packed_png(name + "-dye", rgb, directory, "sRGB")
            return make_material(name, swatch, .8, (base, *maps))
        weather = 20 * broad + 12 * mottling + 9 * leather + 10 * scuff + 4 * speck
        canvas = 28 * broad + 13 * mottling + 7 * weave + 6 * speck
        mats = {
            "leather": finish("Walnut goatskin", (83, 55, 37), weather, hide_maps),
            "palm": finish("Oiled palm reinforcement", (65, 43, 30), weather + 7 * scuff, hide_maps),
            "cloth": finish("Olive cotton drill", (61, 65, 44), canvas, twill_maps),
            "cuff": finish("Folded twill cuff", (52, 55, 38), canvas, twill_maps),
        }
    mats["trim"] = make_material("Dark leather welt", (54, 39, 29), .74)
    mats["thread"] = make_material("Waxed linen", (131, 112, 78), .89)
    mats["button"] = make_material("Horn button", (58, 49, 38), .43)
    return mats


class SleeveMesh:
    """One indexed mesh per moving sleeve. Fine details share its material slots."""

    def __init__(self):
        self.vertices, self.faces, self.uvs, self.slots = [], [], [], []
        self.flat_faces = set()

    def ring(self, points):
        start = len(self.vertices)
        self.vertices.extend(points)
        return list(range(start, len(self.vertices)))

    def face(self, ids, slot, uv=None):
        self.faces.append(ids)
        self.slots.append(slot)
        self.uvs.append(uv or [(0, 0)] * len(ids))

    def cap(self, row, slot, reverse=False):
        center = sum((self.vertices[i] for i in row), Vector()) / len(row)
        tip = self.ring([center])[0]
        for j in range(len(row)):
            k = (j + 1) % len(row)
            indices = (k, j) if reverse else (j, k)
            uv = [(.5+.5*math.cos(TAU*i/len(row)), .5+.5*math.sin(TAU*i/len(row))) for i in indices]
            self.flat_faces.add(len(self.faces))
            self.face((row[indices[0]], row[indices[1]], tip), slot, uv+[(.5,.5)])

    def join(self, lower, upper, slot, v0=0., v1=1.):
        count = len(lower)
        for i in range(count):
            j = (i + 1) % count
            a, b = i / count, (i + 1) / count
            self.face((lower[i], lower[j], upper[j], upper[i]), slot,
                      [(a, v0), (b, v0), (b, v1), (a, v1)])

    def thread(self, points, radius, slot):
        # Small circular cord, half embedded in the fabric so the visible profile
        # has the flattened appearance of a welt or lock stitch.
        last = None
        for i, center in enumerate(points):
            tangent = (points[min(i + 1, len(points)-1)] - points[max(0, i-1)]).normalized()
            outward = Vector((center.x, center.y, 0)).normalized()
            b = tangent.cross(outward).normalized()
            n = b.cross(tangent)
            ring = self.ring([center + radius * (n * math.cos(j * TAU / 5) + b * math.sin(j * TAU / 5))
                              for j in range(5)])
            if last:
                self.join(last, ring, slot)
            last = ring

    def make_object(self, name, materials):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        for mat in materials:
            mesh.materials.append(mat)
        uvs = mesh.uv_layers.new(name="Tailor UV")
        for polygon, slot, coords in zip(mesh.polygons, self.slots, self.uvs):
            polygon.material_index = slot
            polygon.use_smooth = polygon.index not in self.flat_faces
            for loop, uv in zip(polygon.loop_indices, coords):
                uvs.data[loop].uv = uv
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        return obj


# Centreline, bias angle, length around limb, and crest size of individual
# compression folds. Their oblique edges die away before wrapping the sleeve.
FORE_FOLDS = [
    (.06, -.9, 1.6, .011), (.17, 1.3, 1.3, .010), (.24, -2.2, 1.5, .013),
    (.38, .4, 1.7, .011), (.52, -1.25, 1.55, .009), (.65, 2.45, 1.5, .009),
    (.70, -.40, 1.2, .011), (.78, -1.8, 1.3, .009), (.82, 1.1, 1.2, .010),
]
UPPER_FOLDS = [
    (.09, 2.3, 1.6, .010), (.29, .4, 1.3, .008), (.47, -1.5, 1.4, .009),
    (.60, 1.95, 1.35, .011), (.74, -.12, 1.65, .014), (.87, -2., 1.4, .012),
    (.93, .8, 1.4, .009),
]


def crease_radius(t, angle, folds):
    delta = 0.
    for i, (height, phase, spread, scale) in enumerate(folds):
        # Sleeve folds are under alternating torsion rather than parallel rings.
        d = math.atan2(math.sin(angle-phase), math.cos(angle-phase))
        center = height + (-1 if i % 2 else 1) * (.064 * math.sin(d) + .035 * d)
        envelope = math.exp(-1.5 * (d / spread) ** 2)
        distance = (t-center) / (.043 if i % 3 else .061)
        delta += scale * envelope * (math.exp(-distance**2) - .84 * math.exp(-((distance-.88)/.73)**2))
    return delta


def shell_point(forearm, angle, t, cuff=False):
    if forearm:
        radius = .080 - .042*t + .012 * math.sin(math.pi*t)
        radius += .0035 * math.sin(4*angle+.5+2*t) * math.sin(math.pi*t)
        if cuff:
            # A doubled layer overlaps the gathered body. This shape also sets
            # the button's attachment surface and the two hem stitch paths.
            radius = .053 - .009 * (t-.78)/.22
            radius += .0015 * math.cos(3*angle + 3*t)
        else:
            radius += crease_radius(t, angle, FORE_FOLDS)
            radius += .005 * math.cos(7*angle + 3*t) * math.exp(-((t-.76)/.105)**2)
    else:
        radius = .103 - .028*t + .009 * math.sin(math.pi*t)
        radius += crease_radius(t, angle, UPPER_FOLDS)
        radius += .003 * math.sin(3*angle - t) * math.sin(math.pi*t)
    if not cuff:
        # Match both pieces at the elbow. The following shallow creases disguise
        # the transition when the upper and forearm point in different directions.
        distance_from_joint = t if forearm else 1-t
        blend = min(1, distance_from_joint/.095)
        blend = blend * blend * (3 - 2 * blend)
        radius = .080*(1-blend) + radius*blend
    # Front/back asymmetry follows the forearm, including a flatter inner face.
    x = radius * (1.04 + .025*math.cos(angle)) * math.cos(angle)
    y = radius * (.91 + .025*math.sin(angle)) * math.sin(angle)
    return Vector((x, y, .4*(t-.5)))


def layer(mesh, forearm, count, steps, slot, cuff=False):
    previous = None
    for i, t in enumerate(steps):
        row = mesh.ring([shell_point(forearm, j*TAU/count, t, cuff) for j in range(count)])
        if previous is None:
            mesh.cap(row, slot, reverse=True)
        else:
            mesh.join(previous, row, slot, steps[i-1], t)
        previous = row
    mesh.cap(previous, slot)


def raised(point, amount):
    return point + Vector((point.x, point.y, 0)).normalized() * amount


def cuff_button(mesh):
    angle, t = -1.26, .837
    anchor = shell_point(True, angle, t, cuff=True)
    normal = Vector((anchor.x, anchor.y, 0)).normalized()
    across = Vector((-normal.y, normal.x, 0))
    up = Vector((0, 0, 1))
    center = anchor + .0004*normal
    def local(u, v, lift):
        return center + u*across + v*up + lift*normal
    # A raised rim around the dished button face catches light at gameplay size.
    last = None
    for radius, lift in ((.008, 0), (.010, .001), (.0105, .0028), (.0094, .0041), (.0075, .0040), (.0069, .0026)):
        row = mesh.ring([local(radius*math.cos(TAU*j/20), radius*math.sin(TAU*j/20), lift) for j in range(20)])
        if last:
            mesh.join(last, row, 3)
        last = row
    mesh.cap(last, 3)
    for x in (-.002, .002):
        mesh.thread([local(x, -.0029, .0026), local(x+.0003, 0, .0035), local(x, .0029, .0026)], .00065, 2)


def sleeve(name, forearm, mats):
    mesh = SleeveMesh()
    steps = [i*.91/40 for i in range(41)] if forearm else [i/36 for i in range(37)]
    layer(mesh, forearm, 40, steps, 0)
    def inseam(t):
        return (-1.64 if forearm else -2.10) + .46*t - .12*math.sin(math.pi*t)
    end = .774 if forearm else 1.
    for offset in (-.041, .041):
        path = [raised(shell_point(forearm, inseam(t)+offset, t), .00045) for t in np.linspace(0, end, 63)]
        mesh.thread(path, .00085, 0)
        for i in range(1, len(path)-1, 2):
            mesh.thread([raised(path[i-1].lerp(path[i], .35), .00088), raised(path[i], .0009)], .00064, 2)

    if forearm:
        layer(mesh, True, 40, [.777, .782, .792, .835, .90, .979, .985, 1.], 1, True)
        # Catch stitched ends at both edges of the cuff, plus the overlap placket.
        for hem in (.800, .975):
            for j in range(54):
                a = j*TAU/54
                points = [raised(shell_point(True, ang, hem, True), .0006) for ang in (a, a+.037, a+.078)]
                mesh.thread(points, .00067, 2)
        placket = [raised(shell_point(True, -.94 + .12*(t-.78)/.22, t, True), .0006)
                   for t in np.linspace(.78, .988, 11)]
        mesh.thread(placket, .00145, 0)
        cuff_button(mesh)
    return mesh.make_object(name, [mats["cloth"], mats["cuff"], mats["thread"], mats["button"]])


def build_sleeves(materials):
    """Local Blender +Z goes from shoulder to wrist, both segments 0.40 m long."""
    return sleeve("ForeSleeve", True, materials), sleeve("UpperSleeve", False, materials)
