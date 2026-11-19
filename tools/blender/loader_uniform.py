"""Baked work-leather and twill materials, and the loader's articulated uniform sleeves.

All texture fields wrap at their boundaries. Blender's bundled NumPy is used only
at authoring time; the exported game asset contains ordinary glTF PBR textures.
"""
import math
from bisect import bisect_right
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


ELBOW = .36
WRIST = .68


def ease(x):
    x = max(0., min(1., x))
    return x * x * (3 - 2*x)


def mound(x, center, width):
    return math.exp(-((x - center) / width) ** 2)


def tailored_width(z, knots):
    # Hermite sections have one shared tangent at each landmark, preserving the
    # long natural silhouette through deltoid and forearm without stepped rings.
    def slope(i):
        a, va = knots[max(0,i-1)]
        b, vb = knots[min(len(knots)-1,i+1)]
        return (vb-va)/(b-a)
    idx = max(0,min(len(knots)-2,bisect_right(knots,(z,float("inf")))-1))
    (a, va),(b,vb) = knots[idx:idx+2]
    t = max(0., min(1.,(z-a)/(b-a)))
    return ((1-t)**2*((1+2*t)*va + t*(b-a)*slope(idx))
            + t*t*((3-2*t)*vb - (1-t)*(b-a)*slope(idx+1)))


# Shoulder, biceps, supracondylar narrowing, proximal forearm and wrist.
# Width and depth are fitted separately, rather than scaling a circular tube.
WIDTH = [(-.059, .014), (-.046, .056), (-.017, .087), (.053, .104),
         (.138, .090), (.213, .078), (.301, .060), (.349, .064),
         (.386, .064), (.44, .072), (.485, .069), (.561, .054),
         (.608, .048), (.643, .043), (WRIST, .038)]
DEPTH = [(-.059, .014), (-.046, .053), (-.017, .083), (.055, .097),
         (.144, .086), (.218, .082), (.297, .062), (.344, .060),
         (.386, .062), (.444, .074), (.505, .064), (.578, .050),
         (.611, .043), (.643, .039), (WRIST, .036)]


def elbow_darts(z, angle):
    """Three oblique cloth ridges across the antecubital hollow, each dying out at its side seam."""
    inner = max(0., -math.sin(angle))
    across = math.cos(angle)
    pleat = 0.
    for center, slope, width, depth in ((.326, .025, .010, .011), (.355, -.014, .008, .013),
                                      (.394, .025, .011, .010)):
        distance = (z - center - slope*across - .005*across**2)/width
        pleat += depth * (math.exp(-distance**2) - .70*math.exp(-((distance-.97)/.78)**2))
    return inner**1.25 * pleat


def shell_point(angle, z, cuff=False):
    side, facing = math.cos(angle), math.sin(angle)
    if cuff:
        t = (z - .612) / (WRIST - .612)
        radius = .0515 - .0095*t + .0016 * math.cos(3*angle + t)
        return Vector((1.04*radius*side, .94*radius*facing, z))
    upper = (z + .059) / (ELBOW + .059)
    fore = (z - ELBOW) / (WRIST - ELBOW)
    # Straight sleeve still has some slack, but most compression appears only
    # with elbow flexion. Keep the outside smooth enough to read through twill.
    crease = (crease_radius(upper, angle, UPPER_FOLDS) * (1-ease((z-.275)/.07))
              + crease_radius(fore, angle, FORE_FOLDS) * ease((z-.397)/.065))
    crease *= ease((z+.044)/.065)
    crease += .20 * elbow_darts(z, angle)
    crease += .0045*math.cos(7*angle+.85+3*fore)*mound(z,.604,.029)
    width, depth = tailored_width(z, WIDTH), tailored_width(z, DEPTH)
    if z < .024:
        dome = math.sqrt(max(.00055, 1-((z-.032)/.096)**2))
        fade = ease((z+.021)/.045)
        width = .104*dome*(1-fade) + width*fade
        depth = .097*dome*(1-fade) + depth*fade
    # Deltoid breadth sits to the lateral side. The upper-arm anterior belly,
    # olecranon and radial extensors are at three distinct heights and angles.
    dx = .009*mound(z,.051,.060) - .006*mound(z,.444,.062)
    dy = -.008*mound(z,.162,.076) + .004*mound(z,.238,.060) - .005*mound(z,.450,.077)
    olecranon = .020 * mound(z,.358,.029) * max(0.,facing)**3
    epicondyle = .009 * mound(z,.348+.009*side,.027) * abs(side)**3
    return Vector((dx + (width + crease + epicondyle)*side,
                   dy + (depth + crease + olecranon)*facing, z))


def forearm_weight(point):
    outside = max(0., math.sin(math.atan2(point.y,point.x)))
    span = .147-.042*outside
    return ease((point.z - (ELBOW - span))/(2*span))


def flex_offset(p):
    """Corrective cloth allowance at the hinge; the game blends it with elbow flexion."""
    x, y, z = p
    angle = math.atan2(y, x)
    s, c = math.sin(angle), math.cos(angle)
    outer, inner = max(0., s), max(0., -s)
    # Linear skinning draws the rear of the arm into the hinge. Retain the
    # olecranon and wrap the stretching cloth over it, without a spherical pad.
    back = .038 * outer**2 * mound(z, .358, .041)
    side = .010 * abs(c)**3 * mound(z, .358, .045)
    # Biceps and brachioradialis shorten and lift independently.
    tension = inner * (.009*mound(z,.202,.066) + .007*mound(z,.443,.050))
    pleats = elbow_darts(z, angle)
    # Pull the loose inside of the cuff of the elbow slightly away from the
    # hinge. This keeps the inner fold between the two limbs rather than crossing them.
    hollow = -.014 * inner**2 * mound(z, .36, .040)
    radial = back + side + tension + pleats + hollow
    offset = Vector((c*radial, s*radial, .008*outer**2*mound(z,.358,.038)))
    if inner:
        # At deep flexion, cloth on the biceps can otherwise pass through cloth
        # on the forearm. Ease the inner surface along the bisector of a 141°
        # bend, retaining the folds perpendicular to it. Invert the local linear
        # skin transform to store this allowance as one rest-space shape key.
        target = math.radians(141)
        sn, cs = math.sin(target/2), math.cos(target/2)
        weight = forearm_weight(p)
        a, b = 1-weight+weight*math.cos(target), weight*math.sin(target)
        h = z-ELBOW
        yy, zz = y+offset.y, h+offset.z
        current = -sn*(a*yy-b*zz) + cs*(b*yy+a*zz)
        side_of_joint = 2*ease((h+.32)/.64)-1
        wanted = cs*h + sn*y*side_of_joint
        distance = (wanted-current)*ease(inner*2.5)
        dy, dz = -sn*distance, cs*distance
        offset.y += (a*dy+b*dz)/(a*a+b*b)
        offset.z += (a*dz-b*dy)/(a*a+b*b)
    return offset


def shell_layer(mesh, levels, slot, cuff=False):
    count = 44
    previous = None
    for z in levels:
        row = mesh.ring([shell_point(TAU*i/count, z, cuff) for i in range(count)])
        if previous is None:
            mesh.cap(row, slot, reverse=True)
        else:
            mesh.join(previous, row, slot, last_z/.40, z/.40)
        previous, last_z = row, z
    mesh.cap(previous, slot)


def raised(point, amount):
    return point + Vector((point.x, point.y, 0)).normalized() * amount


def cuff_button(mesh):
    angle, z = -1.26, .630
    anchor = shell_point(angle, z, cuff=True)
    normal = Vector((anchor.x, anchor.y, 0)).normalized()
    across = Vector((-normal.y, normal.x, 0))
    up = Vector((0, 0, 1))
    center = anchor + .0004*normal

    def local(u, v, lift):
        return center + u*across + v*up + lift*normal

    last = None
    for radius, lift in ((.008, 0), (.010, .001), (.0105, .0028), (.0094, .0041), (.0075, .0040), (.0069, .0026)):
        row = mesh.ring([local(radius*math.cos(TAU*j/20), radius*math.sin(TAU*j/20), lift) for j in range(20)])
        if last:
            mesh.join(last, row, 3)
        last = row
    mesh.cap(last, 3)
    for x in (-.002, .002):
        mesh.thread([local(x, -.0029, .0026), local(x+.0003, 0, .0035), local(x, .0029, .0026)], .00065, 2)


def sleeve_mesh(mats):
    mesh = SleeveMesh()
    # Single contiguous set of quads below the shoulder crown and across the
    # elbow. Closely spaced joint rings carry the rolled cloth in the power grip.
    levels = [-.064, -.063, -.0615, -.059, -.055, -.05] + list(np.linspace(-.045, .276, 34)) + list(np.linspace(.281,.439,39)) + list(np.linspace(.445,.655,26))
    shell_layer(mesh, levels, 0)
    for offset in (-.041, .041):
        path = [raised(shell_point(-2.16+.83*z/.68-.12*math.sin(z*8)+offset, z), .0005)
                for z in np.linspace(-.015, .615, 111)]
        mesh.thread(path, .00085, 0)
        for i in range(1,len(path)-1,2):
            mesh.thread([raised(path[i-1].lerp(path[i],.35),.00088), raised(path[i],.0009)], .00064, 2)
    shell_layer(mesh, [.612,.614,.617,.629,.652,.674,.678,WRIST], 1, True)
    for hem in (.619, .674):
        for j in range(54):
            a = j*TAU/54
            mesh.thread([raised(shell_point(ang, hem, True), .0006) for ang in (a,a+.037,a+.078)], .00067, 2)
    placket = [raised(shell_point(-.94+.12*(z-.612)/.068,z,True),.0006)
               for z in np.linspace(.614,.678,11)]
    mesh.thread(placket, .00145, 0)
    cuff_button(mesh)
    obj = mesh.make_object("UniformSleeve", [mats["cloth"], mats["cuff"], mats["thread"], mats["button"]])
    obj.shape_key_add(name="Straight")
    flex = obj.shape_key_add(name="ElbowFlex")
    for v in flex.data:
        v.co += flex_offset(v.co)
    return obj


def build_sleeved_arm(materials):
    """Right-arm source. Blender +Z follows the bones; -Y faces the inner elbow."""
    root = bpy.data.objects.new("SleevedArm", None)
    root.empty_display_size = .045
    bpy.context.collection.objects.link(root)
    bones = bpy.data.armatures.new("SleeveBones")
    rig = bpy.data.objects.new("SleeveSkeleton", bones)
    bpy.context.collection.objects.link(rig)
    rig.parent = root
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    parent = None
    for name, start, end in (("UpperArm", 0., ELBOW), ("Forearm", ELBOW, WRIST), ("Wrist", WRIST, WRIST+.055)):
        bone = bones.edit_bones.new(name)
        bone.head, bone.tail = (0,0,start), (0,0,end)
        if parent:
            bone.parent = parent
            bone.use_connect = True
        parent = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    sleeve = sleeve_mesh(materials)
    sleeve.parent = rig
    modifier = sleeve.modifiers.new("Cloth follows the arm", "ARMATURE")
    modifier.object = rig
    names = ("UpperArm", "Forearm", "Wrist")
    upper, fore, wrist = [sleeve.vertex_groups.new(name=n) for n in names]
    for v in sleeve.data.vertices:
        # The cloth on the inside has more ease up the arm to gather into a
        # tight bend. Twist gradually transfers to the cuff towards the wrist.
        bend = forearm_weight(v.co)
        twist = ease((v.co.z-.482)/(.663-.482))
        for group, weight in ((upper,1-bend), (fore,bend*(1-twist)), (wrist,bend*twist)):
            if weight > 0:
                group.add([v.index], weight, "REPLACE")
    return root
