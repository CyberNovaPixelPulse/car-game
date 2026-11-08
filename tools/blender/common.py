"""Shared Blender helpers for the tank model pipeline.

Run only inside Blender (`--background --python`). Geometry is built from
bmesh primitives, realised with modifiers, baked into one PBR atlas and
exported as glTF. Coordinates: Blender metres, +Y forward, +Z up, origin at
ground centre. The glTF exporter turns +Y forward into -Z forward for Three.js.
"""

import math
import os
from collections import defaultdict

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCES = os.path.join(ROOT, "tools", "blender", "sources")
TESTED_BLENDER = (5, 4)


def check_version():
    v = bpy.app.version
    print(f"[tank-art] Blender {bpy.app.version_string}")
    if (v[0], v[1]) != TESTED_BLENDER:
        print(f"[tank-art] warning: pipeline tested on {TESTED_BLENDER}, running {v[:2]}")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import addon_utils

    addon_utils.enable("cycles", default_set=True)
    addon_utils.enable("io_scene_gltf2", default_set=True)


def use_gpu(scene, samples=32):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("METAL", "OPTIX", "CUDA", "HIP"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = True
                scene.cycles.device = "GPU"
                break
        except TypeError:
            continue
    scene.cycles.samples = samples


# ---------------------------------------------------------------- geometry


def mat4(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (
        Matrix.Translation(Vector(loc))
        @ Euler(rot, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((*scale, 1))
    )


def bm_box(size, loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=mat4(loc, rot, size))
    return bm


def bm_hull(points):
    """Convex solid through points; coplanar triangles merge into clean ngons."""
    bm = bmesh.new()
    verts = [bm.verts.new(Vector(p)) for p in points]
    res = bmesh.ops.convex_hull(bm, input=verts)
    junk = list({v for v in res["geom_interior"] + res["geom_unused"] if isinstance(v, bmesh.types.BMVert)})
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.dissolve_limit(bm, angle_limit=0.002, verts=bm.verts[:], edges=bm.edges[:])
    bm.normal_update()
    return bm


def bm_cyl(r1, depth, segs=24, loc=(0, 0, 0), rot=(0, 0, 0), r2=None, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=r1,
        radius2=r1 if r2 is None else r2,
        depth=depth,
        matrix=mat4(loc, rot, scale),
    )
    return bm


def bm_sphere(r, loc=(0, 0, 0), scale=(1, 1, 1), segs=20, rings=10, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r, matrix=mat4(loc, rot, scale))
    return bm


def bm_lathe(profile, segs=32, loc=(0, 0, 0), rot=(0, 0, 0), closed=False):
    """Revolve [(radius, height)] around local Z. Open profiles should start/end on
    the axis; closed=True revolves a loop (tyres, rings) into a torus-like solid."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, h)) for r, h in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    if closed:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(
        bm,
        geom=verts + edges,
        cent=(0, 0, 0),
        axis=(0, 0, 1),
        angle=2 * math.pi,
        steps=segs,
        use_merge=True,
        use_duplicate=False,
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.transform(mat4(loc, rot))
    return bm


def bm_loft(rings, cap_bottom=True, cap_top=True):
    """Skin equal-length rings of points (bottom to top) into a closed solid."""
    bm = bmesh.new()
    vrings = [[bm.verts.new(Vector(p)) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vrings, vrings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(vrings[0])))
    if cap_top:
        bm.faces.new(vrings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def superellipse(z, half_x, front, rear, n=2.5, count=48, cx=0.0, cy=0.0):
    """Plan-view ring with different forward (+Y) and rearward reach."""
    pts = []
    for i in range(count):
        t = 2 * math.pi * i / count
        c, s = math.cos(t), math.sin(t)
        x = half_x * math.copysign(abs(c) ** (2 / n), c)
        reach = front if s > 0 else rear
        y = reach * math.copysign(abs(s) ** (2 / n), s)
        pts.append((cx + x, cy + y, z))
    return pts


def bm_extrude_profile(profile_yz, x0, x1):
    """Prism: a (y, z) polygon swept across X from x0 to x1."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in profile_yz]
    b = [bm.verts.new((x1, y, z)) for y, z in profile_yz]
    n = len(a)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


MARK_FONTS = (
    "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
)


def text_bm(body, size):
    """Flat filled glyphs in the local XY plane, facing +Z, centred."""
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    for path in MARK_FONTS:
        if os.path.exists(path):
            cu.font = bpy.data.fonts.load(path, check_existing=True)
            break
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    return bm


def decal_matrix(loc, normal, up=(0, 0, 1)):
    """Frame whose +Z is the surface normal and +Y reads upward."""
    n = Vector(normal).normalized()
    right = Vector(up).cross(n).normalized()
    up2 = n.cross(right)
    m = Matrix((right, up2, n)).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def strut_matrix(p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.normalized().to_track_quat("Z", "Y")
    return Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4(), d.length


class Kit:
    """Collects primitive objects into named groups, then realises and joins them."""

    def __init__(self, materials):
        self.materials = materials
        self.groups = defaultdict(list)
        self.count = 0

    def add(self, group, bm, mat="paint", bevel=0.0, segs=2, smooth=35.0, harden=True):
        self.count += 1
        me = bpy.data.meshes.new(f"{group}_{self.count}")
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(smooth))
        me.materials.append(self.materials[mat])
        ob = bpy.data.objects.new(me.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if bevel > 0:
            m = ob.modifiers.new("bevel", "BEVEL")
            m.width = bevel
            m.segments = segs
            m.limit_method = "ANGLE"
            m.angle_limit = math.radians(smooth)
            m.harden_normals = harden
            m.use_clamp_overlap = True
        self.groups[group].append(ob)
        return ob

    # convenience wrappers -------------------------------------------------
    def box(self, group, size, loc, rot=(0, 0, 0), mat="paint", bevel=0.012, **kw):
        return self.add(group, bm_box(size, loc, rot), mat, bevel, **kw)

    def hull(self, group, points, mat="paint", bevel=0.015, **kw):
        return self.add(group, bm_hull(points), mat, bevel, **kw)

    def cyl(self, group, r, depth, loc, rot=(0, 0, 0), mat="paint", segs=24, bevel=0.006, r2=None, scale=(1, 1, 1), **kw):
        return self.add(group, bm_cyl(r, depth, segs, loc, rot, r2, scale), mat, bevel, **kw)

    def cyl_x(self, group, r, depth, loc, **kw):
        return self.cyl(group, r, depth, loc, rot=(0, math.pi / 2, 0), **kw)

    def cyl_y(self, group, r, depth, loc, **kw):
        return self.cyl(group, r, depth, loc, rot=(math.pi / 2, 0, 0), **kw)

    def strut(self, group, p0, p1, r, mat="steel", segs=10, bevel=0.0):
        m, length = strut_matrix(p0, p1)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=length, matrix=m)
        return self.add(group, bm, mat, bevel)

    def bar(self, group, p0, p1, w, h, mat="steel", bevel=0.004):
        """Rectangular bar from p0 to p1 (handles, rails, weld strips)."""
        m, length = strut_matrix(p0, p1)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Diagonal((w, h, length, 1)))
        return self.add(group, bm, mat, bevel)

    def weld(self, group, p0, p1, r=0.011):
        return self.strut(group, p0, p1, r, mat="paint", segs=6)

    def bolts(self, group, centers, axis, r=0.018, h=0.016, mat="paint"):
        rot = {"x": (0, math.pi / 2, 0), "y": (math.pi / 2, 0, 0), "z": (0, 0, 0)}[axis]
        for c in centers:
            self.add(group, bm_cyl(r, h, 6, c, rot), mat, 0.0)

    def lathe(self, group, profile, segs=32, loc=(0, 0, 0), rot=(0, 0, 0), mat="paint", bevel=0.0, smooth=40.0, closed=False):
        return self.add(group, bm_lathe(profile, segs, loc, rot, closed), mat, bevel, smooth=smooth)

    def decal(self, group, body, size, loc, normal, mat="mark_white", up=(0, 0, 1)):
        """Painted lettering a few millimetres proud of the plate it sits on."""
        bm = text_bm(body, size)
        bm.transform(decal_matrix(loc, normal, up))
        return self.add(group, bm, mat, 0.0, smooth=89)

    def disc(self, group, r, loc, normal, mat, depth=0.006):
        bm = bm_cyl(r, depth, 32)
        bm.transform(decal_matrix(loc, normal))
        return self.add(group, bm, mat, 0.0)

    def ring(self, group, R, r, loc, rot=(0, 0, 0), mat="steel", segs=20, sides=8):
        """Torus around local Z: lifting eyes, cable loops, hatch rims."""
        prof = [(R + r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides)) for i in range(sides)]
        return self.lathe(group, prof, segs, loc, rot, mat, smooth=60, closed=True)

    def eye(self, group, loc, axis="x", mat="paint"):
        """Welded lifting eye: a base pad and an upright ring facing `axis`."""
        x, y, z = loc
        self.box(group, (0.07, 0.07, 0.02) if axis == "z" else ((0.02, 0.09, 0.06) if axis == "x" else (0.09, 0.02, 0.06)), loc, mat=mat, bevel=0.004)
        rot = {"x": (0, math.pi / 2, 0), "y": (math.pi / 2, 0, 0), "z": (math.pi / 2, 0, 0)}[axis]
        off = {"x": (0, 0, 0.045), "y": (0, 0, 0.045), "z": (0, 0, 0.05)}[axis]
        self.ring(group, 0.035, 0.009, (x + off[0], y + off[1], z + off[2]), rot, mat)

    # realise ---------------------------------------------------------------
    def realise(self, group, name, props=None):
        objs = self.groups.pop(group)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        for ob in objs:
            new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
            old = ob.data
            ob.modifiers.clear()
            ob.data = new
            bpy.data.meshes.remove(old)
        target = objs[0]
        if len(objs) > 1:
            with bpy.context.temp_override(
                active_object=target,
                object=target,
                selected_objects=objs,
                selected_editable_objects=objs,
            ):
                bpy.ops.object.join()
        # glTF tangents need tris/quads; keep quads, split only ngons
        tri = target.modifiers.new("tri", "TRIANGULATE")
        tri.min_vertices = 5
        tri.keep_custom_normals = True
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        new = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
        old = target.data
        target.modifiers.clear()
        target.data = new
        bpy.data.meshes.remove(old)
        target.name = name
        target.data.name = name
        for k, v in (props or {}).items():
            target[k] = v
        return target


def parent_keep(child, parent):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = world


def empty(name, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.2
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    if parent:
        parent_keep(ob, parent)
    return ob


# ---------------------------------------------------------------- track path


def track_path(circles):
    """Closed link-centre path around (y, z, radius) circles, in game (z, y) order.

    Game z = -Blender y. The returned loop runs counter-clockwise in the game
    (z, y) plane, so links move toward +z (rearward) along the ground run.
    """
    pts = []
    for y, z, r in circles:
        for i in range(96):
            a = 2 * math.pi * i / 96
            pts.append((-y + math.cos(a) * r, z + math.sin(a) * r))
    pts = sorted(set((round(p[0], 5), round(p[1], 5)) for p in pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    loop = lower[:-1] + upper[:-1]
    # resample to a light, even polyline (~2.5 cm)
    seg = [math.dist(loop[i], loop[(i + 1) % len(loop)]) for i in range(len(loop))]
    total = sum(seg)
    out, step, acc, i = [], 0.025, 0.0, 0
    s = 0.0
    while s < total - 1e-6:
        while acc + seg[i] < s:
            acc += seg[i]
            i += 1
        t = (s - acc) / seg[i] if seg[i] else 0
        a, b = loop[i], loop[(i + 1) % len(loop)]
        out.append((round(a[0] + (b[0] - a[0]) * t, 4), round(a[1] + (b[1] - a[1]) * t, 4)))
        s += step
    return out, total


# ---------------------------------------------------------------- materials


def _tex(name, kind):
    path = os.path.join(SOURCES, f"{name}_{kind}_2k.jpg")
    img = bpy.data.images.load(path, check_existing=True)
    if kind != "diff":
        img.colorspace_settings.name = "Non-Color"
    return img


class Nodes:
    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def new(self, kind, **props):
        n = self.nt.nodes.new(kind)
        n.location = (self.x, 0)
        self.x += 40
        for k, v in props.items():
            setattr(n, k, v)
        return n

    @staticmethod
    def sock(node, key, output=False):
        coll = node.outputs if output else node.inputs
        for s in coll:
            if s.identifier == key and s.enabled:
                return s
        for s in coll:
            if s.name == key and s.enabled:
                return s
        raise KeyError(f"{node.bl_idname}: {key}")

    def feed(self, node, key, value):
        s = self.sock(node, key)
        if isinstance(value, bpy.types.NodeSocket):
            self.nt.links.new(value, s)
        else:
            s.default_value = value

    def out(self, node, key=None):
        if key is None:
            return next(s for s in node.outputs if s.enabled)
        return self.sock(node, key, output=True)

    def math(self, op, a, b=0.0, clamp=False):
        n = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.feed(n, n.inputs[0].identifier, a)
        if n.inputs[1].enabled:
            self.feed(n, n.inputs[1].identifier, b)
        return self.out(n)

    def mix(self, fac, a, b, blend="MIX"):
        n = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_result=True)
        self.feed(n, "Factor_Float", fac)
        self.feed(n, "A_Color", a)
        self.feed(n, "B_Color", b)
        return self.out(n, "Result_Color")

    def mixf(self, fac, a, b):
        n = self.new("ShaderNodeMix", data_type="FLOAT")
        self.feed(n, "Factor_Float", fac)
        self.feed(n, "A_Float", a)
        self.feed(n, "B_Float", b)
        return self.out(n, "Result_Float")

    def ramp(self, value, lo, hi):
        """Smooth 0..1 step of value between lo and hi."""
        n = self.new("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
        self.feed(n, "Value", value)
        self.feed(n, "From Min", lo)
        self.feed(n, "From Max", hi)
        return self.out(n, "Result")

    def lum(self, color):
        n = self.new("ShaderNodeRGBToBW")
        self.feed(n, "Color", color)
        return self.out(n)

    def image(self, img, vector, blend=0.25):
        n = self.new("ShaderNodeTexImage", image=img, projection="BOX", projection_blend=blend)
        self.feed(n, "Vector", vector)
        return self.out(n, "Color")

    def noise(self, vector, scale, detail=4.0, rough=0.55):
        n = self.new("ShaderNodeTexNoise")
        self.feed(n, "Vector", vector)
        self.feed(n, "Scale", scale)
        self.feed(n, "Detail", detail)
        self.feed(n, "Roughness", rough)
        return self.out(n, "Fac")

    def mapping(self, vector, scale):
        n = self.new("ShaderNodeMapping")
        self.feed(n, "Vector", vector)
        self.feed(n, "Scale", scale)
        return self.out(n, "Vector")


def make_surface_material(name, look, surface, cast=0.0):
    """Cycles graph used only for baking: paint, camouflage, chipped edges,
    crevice grime, rain streaks, dust on top faces and mud from the ground up.

    surface: 'paint' | 'steel' | 'rubber' | 'canvas' | 'dark'; cast adds cast-steel pitting.
    look: dict with base, camo [(colour, scale, threshold)], wear, dust, mud, zimmerit.
    """
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    N = Nodes(mat)
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    N.nt.links.new(N.out(bsdf, "BSDF"), N.sock(out, "Surface"))
    mat["bsdf"] = bsdf.name

    coord = N.out(N.new("ShaderNodeTexCoord"), "Object")
    geo = N.new("ShaderNodeNewGeometry")
    attr = N.new("ShaderNodeAttribute", attribute_type="OBJECT", attribute_name="dirt")
    dirt_bias = N.out(attr, "Fac")
    height = N.out(N.new("ShaderNodeSeparateXYZ"), "Z")
    sep = height.node
    N.feed(sep, "Vector", coord)
    normal_z = N.new("ShaderNodeSeparateXYZ")
    N.feed(normal_z, "Vector", N.out(geo, "Normal"))
    up = N.out(normal_z, "Z")

    grain_uv = N.mapping(coord, (0.9, 0.9, 0.9))
    grain = N.lum(N.image(_tex("green_metal_rust", "diff"), grain_uv))
    scratch_uv = N.mapping(coord, (0.55, 0.55, 0.55))
    scratch = N.lum(N.image(_tex("blue_metal_plate", "diff"), scratch_uv))
    rust_uv = N.mapping(coord, (0.45, 0.45, 0.45))
    rust_col = N.image(_tex("rusty_painted_metal", "diff"), rust_uv)
    mud_uv = N.mapping(coord, (0.8, 0.8, 0.8))
    mud_col = N.image(_tex("brown_mud_02", "diff"), mud_uv)
    mud_rough = N.lum(N.image(_tex("brown_mud_02", "rough"), mud_uv))

    # --- base colour by surface
    if surface == "paint":
        base = look["base"]
        col = base
        for i, (camo, scale, thresh) in enumerate(look.get("camo", [])):
            # each layer samples a differently stretched field so patches don't align
            field = N.noise(N.mapping(coord, (1.0 + i * 0.37, 0.8 + i * 0.21, 1.2)), scale, 3.0, 0.5)
            m = N.ramp(field, thresh, thresh + look.get("camo_edge", 0.035))
            col = N.mix(m, col, camo)
        # paint grain from the photograph's luminance, never its hue
        grain_amt = N.ramp(grain, 0.02, 0.35)
        col = N.mix(N.mixf(grain_amt, 0.0, 1.0), N.mix(0.25, col, (0, 0, 0, 1), "MULTIPLY"), col)
        # sun-faded, retouched patches break up big flat plates
        fade = N.ramp(N.noise(N.mapping(coord, (1, 1, 1)), 0.9, 2.0, 0.5), 0.35, 0.7)
        col = N.mix(N.math("MULTIPLY", fade, 0.3), col, N.mix(1.0, col, (1.45, 1.4, 1.3, 1), "MULTIPLY"))
        rough = N.math("ADD", 0.62, N.math("MULTIPLY", grain_amt, 0.18))
        metal = 0.0
    elif surface == "steel":
        col = N.mix(0.55, (0.06, 0.055, 0.05, 1), rust_col, "MULTIPLY")
        col = N.mix(0.12, col, rust_col)
        rough = 0.72
        metal = 0.55
    elif surface == "canvas":  # tarps, bedrolls, crew bags
        tone = N.noise(N.mapping(coord, (2, 2, 2)), 2.5, 4.0, 0.6)
        col = N.mix(N.ramp(tone, 0.3, 0.7), (0.045, 0.042, 0.022, 1), (0.075, 0.068, 0.036, 1))
        rough = 0.95
        metal = 0.0
    elif surface == "rubber":
        col = (0.028, 0.027, 0.026, 1)
        rough = 0.88
        metal = 0.0
    else:  # dark: bores, vision slits, interior shadow
        col = (0.012, 0.011, 0.01, 1)
        rough = 0.6
        metal = 0.2

    # --- chipped edges (bevel normal departs from face normal near edges)
    bevel = N.new("ShaderNodeBevel", samples=8)
    N.feed(bevel, "Radius", 0.025)
    dot = N.new("ShaderNodeVectorMath", operation="DOT_PRODUCT")
    N.feed(dot, dot.inputs[0].identifier, N.out(bevel, "Normal"))
    N.feed(dot, dot.inputs[1].identifier, N.out(geo, "Normal"))
    edge = N.ramp(N.math("SUBTRACT", 1.0, N.out(dot, "Value")), 0.003, 0.035)
    chip_noise = N.noise(N.mapping(coord, (6, 6, 6)), 3.0, 6.0, 0.7)
    lo = 0.62 - look["wear"] * 0.2
    chips = N.math("MULTIPLY", edge, N.ramp(N.math("ADD", chip_noise, N.math("MULTIPLY", scratch, 0.5)), lo, lo + 0.06))
    # scattered knocks and scrapes on flat plates, not only on edges
    knock = N.noise(N.mapping(coord, (14, 14, 14)), 4.0, 8.0, 0.75)
    scrape = N.ramp(N.math("ADD", knock, N.math("MULTIPLY", scratch, 0.6)), 0.98 - look["wear"] * 0.08, 1.0 - look["wear"] * 0.08)
    chips = N.math("MAXIMUM", chips, N.math("MULTIPLY", scrape, 0.85))
    if surface in ("paint", "steel"):
        bare = N.mix(0.5, (0.32, 0.31, 0.29, 1), rust_col, "MULTIPLY") if surface == "paint" else (0.36, 0.35, 0.33, 1)
        col = N.mix(chips, col, bare)
        rough = N.mixf(chips, rough, 0.38)
        metal = N.mixf(chips, metal, 0.85)

    # --- rain streaks running down vertical faces
    if surface == "paint":
        streak = N.noise(N.mapping(coord, (14, 14, 0.9)), 2.2, 3.0, 0.6)
        vertical = N.math("SUBTRACT", 1.0, N.math("ABSOLUTE", up))
        streaks = N.math("MULTIPLY", N.ramp(streak, 0.5, 0.66), N.math("MULTIPLY", vertical, look.get("streak", 0.9)))
        col = N.mix(streaks, col, N.mix(0.75, col, rust_col, "MULTIPLY"))
        # dark grime runs washed down from the deck edge
        runs = N.noise(N.mapping(coord, (22, 22, 1.2)), 3.0, 2.0, 0.5)
        runs = N.math("MULTIPLY", N.ramp(runs, 0.55, 0.75), N.math("MULTIPLY", vertical, N.ramp(height, 0.9, 1.9)))
        col = N.mix(N.math("MULTIPLY", runs, 0.55), col, (0.02, 0.018, 0.012, 1))

    # --- crevice grime from ambient occlusion
    ao = N.new("ShaderNodeAmbientOcclusion", samples=16, only_local=True)
    N.feed(ao, "Distance", 0.25)
    occl = N.out(ao, "AO")
    crevice = N.math("SUBTRACT", 1.0, N.ramp(occl, 0.25, 0.95))
    col = N.mix(N.math("MULTIPLY", crevice, 0.9), col, (0.025, 0.021, 0.015, 1))

    # --- dust settles on upward faces
    if surface != "dark":
        dust_n = N.noise(N.mapping(coord, (5, 5, 5)), 3.0, 6.0, 0.62)
        dust = N.math("MULTIPLY", N.ramp(up, 0.6, 0.95), N.ramp(dust_n, 0.3, 0.8))
        dust = N.math("MULTIPLY", dust, look["dust"])
        col = N.mix(dust, col, (0.24, 0.2, 0.14, 1))
        rough = N.mixf(dust, rough, 0.92)

    # --- mud climbs from the ground; running gear carries the most
    if surface != "dark":
        mud_n = N.noise(N.mapping(coord, (3, 3, 3)), 1.6, 5.0, 0.65)
        rise = N.ramp(N.math("SUBTRACT", look["mud"] * 1.45, height), -0.3, 0.25)
        mud = N.math("ADD", N.math("MULTIPLY", rise, N.ramp(mud_n, 0.28, 0.62)), N.math("MULTIPLY", dirt_bias, N.ramp(mud_n, 0.2, 0.5)), clamp=True)
        # thrown splashes above the caked band
        splash = N.ramp(N.noise(N.mapping(coord, (18, 18, 18)), 5.0, 2.0, 0.5), 0.68, 0.72)
        band = N.ramp(N.math("SUBTRACT", look["mud"] * 2.0, height), 0.0, 0.5)
        mud = N.math("MAXIMUM", mud, N.math("MULTIPLY", splash, band))
        # wet dark mud low down, dry pale crust higher up
        dry = N.ramp(N.math("ADD", height, N.math("MULTIPLY", mud_n, 0.6)), 0.6, 1.2)
        mud_c = N.mix(dry, N.mix(0.7, mud_col, (0, 0, 0, 1), "MULTIPLY"), N.mix(0.15, mud_col, (0, 0, 0, 1), "MULTIPLY"))
        col = N.mix(mud, col, mud_c)
        rough = N.mixf(mud, rough, N.math("ADD", 0.75, N.math("MULTIPLY", mud_rough, 0.25)))
        metal = N.mixf(mud, metal, 0.0)

    N.feed(bsdf, "Base Color", col)
    N.feed(bsdf, "Roughness", rough)
    N.feed(bsdf, "Metallic", metal)

    # --- surface relief: cast-steel pitting, zimmerit ridges, paint grain, mud
    relief = N.math("MULTIPLY", grain, 0.25)
    if cast:
        pits = N.noise(N.mapping(coord, (9, 9, 9)), 4.0, 8.0, 0.75)
        relief = N.math("ADD", relief, N.math("MULTIPLY", pits, 1.4 * cast))
    if look.get("zimmerit") and surface == "paint":
        wave = N.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X")
        N.feed(wave, "Vector", N.mapping(coord, (1, 1, 1)))
        N.feed(wave, "Scale", 18.0)
        N.feed(wave, "Distortion", 1.5)
        N.feed(wave, "Detail", 3.0)
        relief = N.math("ADD", relief, N.math("MULTIPLY", N.out(wave, "Fac"), 1.1))
    if surface == "canvas":  # folds and coarse weave
        folds = N.noise(N.mapping(coord, (1.0, 6.0, 6.0)), 3.0, 3.0, 0.5)
        weave = N.noise(N.mapping(coord, (60, 60, 60)), 4.0, 1.0, 0.5)
        relief = N.math("ADD", N.math("MULTIPLY", folds, 3.0), N.math("MULTIPLY", weave, 0.3))
    if surface != "dark":
        relief = N.math("ADD", relief, N.math("MULTIPLY", mud, N.math("MULTIPLY", mud_rough, 0.9)))
    bump = N.new("ShaderNodeBump")
    N.feed(bump, "Strength", 0.35)
    N.feed(bump, "Distance", 0.004)
    N.feed(bump, "Height", relief)
    edge_n = N.new("ShaderNodeBevel", samples=8)
    N.feed(edge_n, "Radius", 0.01)
    N.feed(bump, "Normal", N.out(edge_n, "Normal"))
    N.feed(bsdf, "Normal", N.out(bump, "Normal"))

    # bake target lives on every material; images are swapped per pass
    target = N.new("ShaderNodeTexImage")
    target.name = "bake_target"
    mat["metal_src"] = ""  # filled lazily by bake
    return mat


# ---------------------------------------------------------------- uv + bake


def unwrap(objs, margin=0.004):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def _bake(objs, kind, img, **kw):
    for mat in {s.material for ob in objs for s in ob.material_slots}:
        node = mat.node_tree.nodes["bake_target"]
        node.image = img
        mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type=kind, margin=12, use_clear=True, **kw)


def _metal_as_emission(mats, on):
    for mat in mats:
        nt = mat.node_tree
        bsdf = nt.nodes[mat["bsdf"]]
        out = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial")
        surface = Nodes.sock(out, "Surface")
        if on:
            em = nt.nodes.new("ShaderNodeEmission")
            em.name = "metal_emit"
            src = Nodes.sock(bsdf, "Metallic")
            if src.is_linked:
                nt.links.new(src.links[0].from_socket, Nodes.sock(em, "Color"))
            else:
                v = src.default_value
                Nodes.sock(em, "Color").default_value = (v, v, v, 1)
            nt.links.new(Nodes.sock(em, "Emission", output=True), surface)
        else:
            nt.nodes.remove(nt.nodes["metal_emit"])
            nt.links.new(Nodes.sock(bsdf, "BSDF", output=True), surface)


def bake_atlas(objs, size, workdir, samples=48):
    """Bake base colour, roughness, metallic and tangent normal into one atlas."""
    import numpy as np

    scene = bpy.context.scene
    use_gpu(scene, samples)
    mats = list({s.material for ob in objs for s in ob.material_slots})
    imgs = {}
    for key, colour in (("base", "sRGB"), ("rough", "Non-Color"), ("metal", "Non-Color"), ("normal", "Non-Color")):
        img = bpy.data.images.new(f"bake_{key}", size, size, alpha=False)
        img.colorspace_settings.name = colour
        imgs[key] = img
    _bake(objs, "DIFFUSE", imgs["base"], pass_filter={"COLOR"})
    _bake(objs, "ROUGHNESS", imgs["rough"])
    _bake(objs, "NORMAL", imgs["normal"], normal_space="TANGENT")
    scene.cycles.samples = 4
    _metal_as_emission(mats, True)
    _bake(objs, "EMIT", imgs["metal"])
    _metal_as_emission(mats, False)

    def px(img):
        a = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        return a.reshape(size, size, 4)

    rough, metal = px(imgs["rough"]), px(imgs["metal"])
    orm = np.ones((size, size, 4), dtype=np.float32)
    orm[..., 1] = rough[..., 0]
    orm[..., 2] = metal[..., 0]
    orm_img = bpy.data.images.new("bake_orm", size, size, alpha=False)
    orm_img.colorspace_settings.name = "Non-Color"
    orm_img.pixels.foreach_set(orm.ravel())
    files = {}
    for key, img in (("base", imgs["base"]), ("orm", orm_img), ("normal", imgs["normal"])):
        path = os.path.join(workdir, f"{key}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        files[key] = path
    return files


def export_material(name, files):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    N = Nodes(mat)
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    N.nt.links.new(N.out(bsdf, "BSDF"), N.sock(out, "Surface"))

    def img(key, colour):
        im = bpy.data.images.load(files[key])
        im.colorspace_settings.name = colour
        n = N.new("ShaderNodeTexImage", image=im)
        return n

    base = img("base", "sRGB")
    N.feed(bsdf, "Base Color", N.out(base, "Color"))
    orm = img("orm", "Non-Color")
    sep = N.new("ShaderNodeSeparateColor")
    N.feed(sep, "Color", N.out(orm, "Color"))
    N.feed(bsdf, "Roughness", N.out(sep, "Green"))
    N.feed(bsdf, "Metallic", N.out(sep, "Blue"))
    nrm = img("normal", "Non-Color")
    nmap = N.new("ShaderNodeNormalMap")
    N.feed(nmap, "Color", N.out(nrm, "Color"))
    N.feed(bsdf, "Normal", N.out(nmap, "Normal"))
    return mat


def add_lods(root, ratio=0.2, link_ratio=0.15):
    """Give every mesh under root a decimated sibling named <name>_lod1 with the same
    parent, transform and baked material. Linked duplicates (wheel instances) share one
    low mesh. The runtime shows these beyond close range."""
    low_meshes = {}
    for ob in [o for o in root.children_recursive if o.type == "MESH"]:
        key = ob.data.name
        if key not in low_meshes:
            tmp = bpy.data.objects.new("lod_tmp", ob.data.copy())
            bpy.context.scene.collection.objects.link(tmp)
            if "custom_normal" in tmp.data.attributes:
                tmp.data.attributes.remove(tmp.data.attributes["custom_normal"])
            dec = tmp.modifiers.new("decimate", "DECIMATE")
            dec.ratio = link_ratio if ob.name == "track_link" else ratio
            dec.use_collapse_triangulate = True
            bpy.context.view_layer.update()
            dg = bpy.context.evaluated_depsgraph_get()
            me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
            me.name = key + "_lod1"
            for p in me.polygons:
                p.use_smooth = True
            me.set_sharp_from_angle(angle=math.radians(40))
            old = tmp.data
            bpy.data.objects.remove(tmp)
            bpy.data.meshes.remove(old)
            low_meshes[key] = me
        low = bpy.data.objects.new(ob.name + "_lod1", low_meshes[key])
        bpy.context.scene.collection.objects.link(low)
        low.parent = ob.parent
        low.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
        low.matrix_basis = ob.matrix_basis.copy()
        for k in ob.keys():
            low[k] = ob[k]
    bpy.context.view_layer.update()
    return sum(len(m.polygons) for m in low_meshes.values())


def export_glb(root, path, quality=86, draco=False):
    bpy.ops.object.select_all(action="DESELECT")
    stack = [root]
    while stack:
        ob = stack.pop()
        ob.select_set(True)
        stack.extend(ob.children)
    opts = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_tangents=True,
        export_image_format="WEBP",
        export_image_quality=quality,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    if draco:  # large static scenery: compressed geometry, decoded by DRACOLoader
        opts.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                    export_draco_position_quantization=14, export_draco_normal_quantization=10,
                    export_draco_texcoord_quantization=12)
    known = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    dropped = [k for k in opts if k not in known]
    if dropped:
        print(f"[tank-art] exporter lacks options: {dropped}")
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in known})
