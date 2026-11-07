"""Detailed scenery parts for the Normandy map: materials, stonework,
buildings, wrecks and generated foliage. Imported by build_map.py.

All geometry is original and generated here. Poly Haven CC0 textures (see
tools/blender/sources/map-sources.json) provide surface detail; buildings are
weathered in a bake-only Cycles graph like the tanks.
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import common as C

PI = math.pi
S = (-1, 1)


# ------------------------------------------------------------ materials


def _img(name, kind):
    return C._tex(name, kind)


def tex_material(name, tex, tile=2.0, tint=(1, 1, 1, 1), moss=0.0, soot=0.0, mud=0.5, wear=0.25, bump=0.6, rough=None, metal=0.0):
    """Tiled Poly Haven set in object space with tint, moss on top faces and in
    crevices, scattered soot, chipped pale edges and mud at the foot."""
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    N = C.Nodes(mat)
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    N.nt.links.new(N.out(bsdf, "BSDF"), N.sock(out, "Surface"))
    mat["bsdf"] = bsdf.name
    coord = N.out(N.new("ShaderNodeTexCoord"), "Object")
    geo = N.new("ShaderNodeNewGeometry")
    sep = N.new("ShaderNodeSeparateXYZ")
    N.feed(sep, "Vector", coord)
    z = N.out(sep, "Z")
    nz = N.new("ShaderNodeSeparateXYZ")
    N.feed(nz, "Vector", N.out(geo, "Normal"))
    up = N.out(nz, "Z")

    uv = N.mapping(coord, (1 / tile,) * 3)
    col = N.image(_img(tex, "diff"), uv, 0.2)
    col = N.mix(1.0, col, tint, "MULTIPLY")
    # broad tonal drift so repeats do not read
    drift = N.ramp(N.noise(N.mapping(coord, (0.25, 0.25, 0.25)), 1.0, 2.0, 0.5), 0.3, 0.7)
    col = N.mix(N.math("MULTIPLY", drift, 0.35), col, N.mix(1.0, col, (0.7, 0.68, 0.62, 1), "MULTIPLY"))
    r = N.lum(N.image(_img(tex, "rough"), uv, 0.2)) if rough is None else rough
    height_src = N.lum(col)

    # chipped edges read paler on stone and timber
    bev = N.new("ShaderNodeBevel", samples=8)
    N.feed(bev, "Radius", 0.03)
    dot = N.new("ShaderNodeVectorMath", operation="DOT_PRODUCT")
    N.feed(dot, dot.inputs[0].identifier, N.out(bev, "Normal"))
    N.feed(dot, dot.inputs[1].identifier, N.out(geo, "Normal"))
    edge = N.ramp(N.math("SUBTRACT", 1.0, N.out(dot, "Value")), 0.004, 0.04)
    col = N.mix(N.math("MULTIPLY", edge, wear), col, N.mix(1.0, col, (1.35, 1.32, 1.25, 1), "MULTIPLY"))

    # crevice grime from occlusion
    ao = N.new("ShaderNodeAmbientOcclusion", samples=16, only_local=True)
    N.feed(ao, "Distance", 0.3)
    crevice = N.math("SUBTRACT", 1.0, N.ramp(N.out(ao, "AO"), 0.2, 0.95))
    col = N.mix(N.math("MULTIPLY", crevice, 0.75), col, (0.02, 0.019, 0.015, 1))

    # rain streaks below sills and copings
    vertical = N.math("SUBTRACT", 1.0, N.math("ABSOLUTE", up))
    streak = N.ramp(N.noise(N.mapping(coord, (10, 10, 0.6)), 2.0, 3.0, 0.6), 0.55, 0.72)
    col = N.mix(N.math("MULTIPLY", N.math("MULTIPLY", streak, vertical), 0.35), col, (0.05, 0.05, 0.045, 1))

    if moss:
        mn = N.noise(N.mapping(coord, (2.5, 2.5, 2.5)), 3.0, 6.0, 0.65)
        on_top = N.math("MULTIPLY", N.ramp(up, 0.35, 0.9), N.ramp(mn, 0.42, 0.62))
        in_cracks = N.math("MULTIPLY", crevice, N.ramp(mn, 0.5, 0.7))
        low = N.math("MULTIPLY", N.ramp(z, 0.9, 0.1), N.ramp(mn, 0.45, 0.65))
        m = N.math("MULTIPLY", N.math("MAXIMUM", N.math("MAXIMUM", on_top, in_cracks), low), moss, clamp=True)
        moss_col = N.mix(N.ramp(mn, 0.4, 0.8), (0.03, 0.05, 0.015, 1), (0.08, 0.1, 0.03, 1))
        col = N.mix(m, col, moss_col)
        r = N.mixf(m, r, 0.95)
    if soot:
        sn = N.noise(N.mapping(coord, (1.2, 1.2, 0.5)), 2.0, 4.0, 0.6)
        s = N.math("MULTIPLY", N.ramp(sn, 0.55, 0.75), soot)
        col = N.mix(s, col, (0.012, 0.011, 0.01, 1))
        r = N.mixf(s, r, 0.9)
    if mud:
        mn = N.noise(N.mapping(coord, (3, 3, 3)), 2.0, 5.0, 0.6)
        foot = N.math("MULTIPLY", N.ramp(N.math("ADD", z, N.math("MULTIPLY", mn, 0.5)), 0.75, 0.15), mud)
        mud_col = N.mix(0.4, N.image(_img("brown_mud_02", "diff"), N.mapping(coord, (0.8, 0.8, 0.8))), (0, 0, 0, 1), "MULTIPLY")
        col = N.mix(foot, col, mud_col)
    N.feed(bsdf, "Base Color", col)
    N.feed(bsdf, "Roughness", r)
    N.feed(bsdf, "Metallic", metal)
    b = N.new("ShaderNodeBump")
    N.feed(b, "Strength", bump)
    N.feed(b, "Distance", 0.01)
    N.feed(b, "Height", height_src)
    N.feed(bsdf, "Normal", N.out(b, "Normal"))
    target = N.new("ShaderNodeTexImage")
    target.name = "bake_target"
    mat["metal_src"] = ""
    return mat


def flat_material(name, rgb, rough=0.8, metal=0.0):
    """Plain surface that still carries the bake contract."""
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    N = C.Nodes(mat)
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    N.nt.links.new(N.out(bsdf, "BSDF"), N.sock(out, "Surface"))
    mat["bsdf"] = bsdf.name
    N.feed(bsdf, "Base Color", (*rgb, 1))
    N.feed(bsdf, "Roughness", rough)
    N.feed(bsdf, "Metallic", metal)
    target = N.new("ShaderNodeTexImage")
    target.name = "bake_target"
    mat["metal_src"] = ""
    return mat


def building_materials():
    return {
        "drystone": tex_material("drystone", "castle_wall_slates", 1.6, (0.95, 0.9, 0.8, 1), moss=0.5, mud=0.6),
        "cope": tex_material("cope", "castle_wall_slates", 1.1, (1.0, 0.95, 0.85, 1), moss=0.9, mud=0.0),
        "rubble": tex_material("rubble", "rustic_stone_wall", 2.4, (1.0, 0.95, 0.85, 1), moss=0.35, mud=0.6),
        "quoin": tex_material("quoin", "rustic_stone_wall", 0.9, (1.45, 1.38, 1.22, 1), moss=0.25, mud=0.5, bump=0.25),
        "plaster": tex_material("plaster", "plastered_stone_wall", 2.6, (1.05, 1.0, 0.9, 1), moss=0.2, mud=0.5),
        "slate": tex_material("slate", "roof_slates_02", 1.8, (0.85, 0.88, 0.92, 1), moss=0.6, mud=0.0),
        "tile": tex_material("tile", "clay_roof_tiles_02", 2.2, (0.95, 0.85, 0.8, 1), moss=0.5, mud=0.0),
        "timber": tex_material("timber", "old_planks_02", 1.6, (0.55, 0.48, 0.42, 1), moss=0.2, mud=0.4),
        "door": tex_material("door", "old_planks_02", 1.4, (0.9, 0.95, 0.9, 1), moss=0.0, mud=0.5),
        "shutter": tex_material("shutter", "old_planks_02", 1.2, (0.55, 0.75, 0.75, 1), mud=0.0),
        "beam": tex_material("beam", "old_planks_02", 2.0, (0.3, 0.25, 0.2, 1), mud=0.0, wear=0.1),
        "iron": tex_material("iron", "rusty_painted_metal", 1.0, (0.35, 0.3, 0.28, 1), mud=0.3, metal=0.5),
        "wreck": tex_material("wreck", "rusty_painted_metal", 1.4, (0.6, 0.5, 0.45, 1), soot=0.9, mud=0.6, metal=0.4),
        "charred": tex_material("charred", "old_planks_02", 1.2, (0.12, 0.1, 0.09, 1), soot=1.0, mud=0.3),
        "ceramic": flat_material("ceramic", (0.62, 0.6, 0.55), 0.35),
        "dark": flat_material("void", (0.008, 0.008, 0.008), 0.9),
        "glass": flat_material("glass", (0.02, 0.025, 0.028), 0.15, 0.2),
    }


# ------------------------------------------------------------ stonework


_HEIGHTS = {}


def _height_map(tex):
    if tex not in _HEIGHTS:
        img = _img(tex, "diff")
        w, h = img.size
        a = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(a)
        a = a.reshape(h, w, 4)
        lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
        lo, hi = np.percentile(lum, 6), np.percentile(lum, 94)
        _HEIGHTS[tex] = (np.clip((lum - lo) / (hi - lo), 0, 1), w, h)
    return _HEIGHTS[tex]


def bm_grid_box(size, center, step):
    """Closed box whose faces are evenly gridded, so it can be displaced."""
    sx, sy, sz = size
    c = Vector(center) - Vector((sx, sy, sz)) / 2
    bm = bmesh.new()
    X, Y, Z = Vector((sx, 0, 0)), Vector((0, sy, 0)), Vector((0, 0, sz))

    def face(o, u, v):
        nu, nv = max(1, round(u.length / step)), max(1, round(v.length / step))
        g = [[bm.verts.new(o + u * (i / nu) + v * (j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]))

    face(c, Y, Z)
    face(c + X, Y, Z)
    face(c, X, Z)
    face(c + Y, X, Z)
    face(c, X, Y)
    face(c + Z, X, Y)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def displace_inward(bm, tex, tile, depth, keep_bottom=True):
    """Push mortar joints in along the vertex normal, sampling the same
    box projection the material uses, so relief and texture line up."""
    arr, w, h = _height_map(tex)
    bm.normal_update()
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        if keep_bottom and v.co.z < zmin + 1e-4:
            continue
        n = v.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        u, vv = {0: (v.co.y, v.co.z), 1: (v.co.x, v.co.z), 2: (v.co.x, v.co.y)}[ax]
        px = int((u / tile) % 1.0 * (w - 1))
        py = int((vv / tile) % 1.0 * (h - 1))
        d = depth * (1.0 - arr[py, px]) ** 1.4
        v.co -= n * d


def stone_mass(k, group, size, center, mat, tex, tile, step=0.08, depth=0.05, ratio=0.35):
    """Displaced masonry block that never grows past its box."""
    bm = bm_grid_box(size, center, step)
    displace_inward(bm, tex, tile, depth)
    ob = k.add(group, bm, mat, 0.0, smooth=40)
    dec = ob.modifiers.new("decimate", "DECIMATE")
    dec.ratio = ratio
    return ob


def cut(ob, cutters):
    """Boolean the given cutter objects out of ob (applied when realised)."""
    coll = bpy.data.collections.new(f"cut_{ob.name}")
    bpy.context.scene.collection.children.link(coll)
    for c in cutters:
        # cut faces take the wall's own masonry, not an empty slot
        c.data.materials.append(ob.data.materials[0])
        coll.objects.link(c)
        c.hide_render = True
        c.display_type = "WIRE"
    m = ob.modifiers.new("cut", "BOOLEAN")
    m.operand_type = "COLLECTION"
    m.collection = coll
    m.operation = "DIFFERENCE"
    m.solver = "EXACT"
    # decimate must run after the cut
    dec = ob.modifiers.get("decimate")
    if dec:
        ob.modifiers.move(ob.modifiers.find("decimate"), len(ob.modifiers) - 1)
    return coll


def cutter(size, loc, rot=(0, 0, 0), shape="box"):
    bm = bmesh.new()
    if shape == "box":
        bmesh.ops.create_cube(bm, size=1.0, matrix=C.mat4(loc, rot, size))
    else:
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.5, matrix=C.mat4(loc, rot, size))
        for v in bm.verts:
            v.co += Vector((np.random.uniform(-1, 1), np.random.uniform(-1, 1), np.random.uniform(-1, 1))) * 0.06 * max(size)
    me = bpy.data.meshes.new("cutter")
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new("cutter", me)


def rubble(k, group, rng, center, spread, count, size=(0.12, 0.35), mat="rubble", max_h=0.45):
    """Loose stones on the ground, never taller than max_h."""
    cx, cy = center
    for _ in range(count):
        s = rng.uniform(*size)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=s)
        for v in bm.verts:
            v.co *= rng.uniform(0.85, 1.12)
        bm.transform(C.mat4((cx + rng.uniform(-spread[0], spread[0]), cy + rng.uniform(-spread[1], spread[1]), s * 0.35),
                            (rng.random(), rng.random(), rng.random()), (1, rng.uniform(0.7, 1.1), min(0.7, max_h / (2 * s)))))
        k.add(group, bm, mat, 0.0, smooth=60)


def drystone_wall(k, group, c, rng):
    """Authoritative wall box: displaced dry-laid body plus a coping of
    stones set on edge; nothing leaves the box except low rubble."""
    w, d, h = c["w"], c["d"], c["h"]
    x, y = c["x"], -c["z"]
    cap = 0.22
    stone_mass(k, group, (w, d, h - cap), (x, y, (h - cap) / 2), "drystone", "castle_wall_slates", 1.6, depth=0.06)
    along_x = w >= d
    L, T = (w, d) if along_x else (d, w)
    t = -L / 2
    while t < L / 2 - 0.04:
        sw = min(rng.uniform(0.11, 0.22), L / 2 - t)
        sh = rng.uniform(0.17, cap)
        lean = rng.uniform(-0.1, 0.1)
        a = t + sw / 2
        if along_x:
            k.box(group, (sw, T * rng.uniform(0.92, 1.0), sh), (x + a, y, h - cap + sh / 2), (0, lean, 0), mat="cope", bevel=0.025, segs=2)
        else:
            k.box(group, (T * rng.uniform(0.92, 1.0), sw, sh), (x, y + a, h - cap + sh / 2), (lean, 0, 0), mat="cope", bevel=0.025, segs=2)
        t += sw + rng.uniform(0.0, 0.015)
    # fallen stones along both faces
    for side in S:
        for _ in range(3):
            a = rng.uniform(-L / 2 + 0.5, L / 2 - 0.5)
            p = (x + a, y + side * (T / 2 + 0.35)) if along_x else (x + side * (T / 2 + 0.35), y + a)
            rubble(k, group, rng, p, (0.6, 0.25) if along_x else (0.25, 0.6), rng.randint(2, 5))


# ------------------------------------------------------------ roofs and openings


def slate_roof(k, group, rng, half_w, half_d, eave, ridge, mat="slate", hole=None, overhang=0.0, verge=0.0, course=0.26, origin=(0.0, 0.0)):
    """Two pitched slopes laid as overlapping courses of individual slates.
    Ridge runs along local X; slopes face +-Y. hole = (x0, x1, row0, row1) on the -Y slope,
    in local X. origin shifts the whole roof."""
    ox, oy = origin
    run = half_d + overhang
    rise = ridge - eave
    L = math.hypot(run, rise + overhang * rise / half_d)
    ang = math.atan2(rise, half_d)
    rows = int(L / course) + 1
    for side in S:
        for r in range(rows):
            s = r * course  # distance up the slope from the eave
            y = side * (run - s * math.cos(ang))
            z = eave - overhang * math.tan(ang) + s * math.sin(ang) + 0.02
            x = -half_w - verge + (0.15 if r % 2 else 0.0)
            while x < half_w + verge - 0.05:
                sw = min(rng.uniform(0.22, 0.32), half_w + verge - x)
                missing = hole and side < 0 and hole[0] < x < hole[1] and hole[2] <= r <= hole[3]
                if missing:
                    x += sw
                    continue
                edge = hole and side < 0 and (abs(x - hole[0]) < 0.35 or abs(x - hole[1]) < 0.35) and hole[2] <= r <= hole[3]
                tilt = rng.uniform(-0.03, 0.03) + (rng.uniform(0.1, 0.35) if edge and rng.random() < 0.5 else 0)
                k.box(group, (sw - 0.01, course * 1.75, 0.018), (ox + x + sw / 2, oy + y, z),
                      (-side * (ang + tilt), 0, rng.uniform(-0.02, 0.02)), mat=mat, bevel=0.0)
                x += sw
    # ridge capping
    n = int((2 * (half_w + verge)) / 0.42) + 1
    for i in range(n):
        x = -half_w - verge + (i + 0.5) * (2 * (half_w + verge)) / n
        k.add(group, C.bm_cyl(0.13, 0.42, 10, (ox + x, oy, ridge - 0.05), (0, PI / 2, 0), scale=(1, 1, 0.7)), "tile", 0.0)
    return ang


def window(k, group, center, normal_axis, sign, w=0.8, h=1.1, shutter="shutter", rng=None, open_shutters=True):
    """Framed casement with dark panes, stone sill and shutters folded flat
    against the wall. normal_axis 'x' or 'y', sign = outward direction."""
    cx, cy, cz = center
    out = 0.03 * sign

    def at(a, n=0.0, dz=0.0):
        return (cx + n, cy + a, cz + dz) if normal_axis == "x" else (cx + a, cy + n, cz + dz)

    def sz(a, n, hh):
        return (n, a, hh) if normal_axis == "x" else (a, n, hh)

    k.box(group, sz(w, 0.03, h), at(0, out * 0.3), mat="glass", bevel=0.0)
    for s in S:
        k.box(group, sz(0.08, 0.08, h + 0.08), at(s * (w / 2 + 0.02), out), mat="beam", bevel=0.01)
        k.box(group, sz(w + 0.12, 0.08, 0.08), at(0, out, s * (h / 2 + 0.02)), mat="beam", bevel=0.01)
    k.box(group, sz(0.04, 0.05, h), at(0, out * 1.4), mat="beam", bevel=0.005)
    k.box(group, sz(w, 0.05, 0.04), at(0, out * 1.4, h * 0.1), mat="beam", bevel=0.005)
    k.box(group, sz(w + 0.3, 0.14, 0.08), at(0, out * 2.5, -h / 2 - 0.08), mat="quoin", bevel=0.015)
    if open_shutters:
        for s in S:
            if rng and rng.random() < 0.18:
                continue  # a shutter long gone
            k.box(group, sz(w / 2, 0.035, h), at(s * (w * 0.75 + 0.12), out * 1.2), mat=shutter, bevel=0.008)
            for dz in (-h * 0.32, h * 0.32):
                k.box(group, sz(w / 2 - 0.05, 0.02, 0.04), at(s * (w * 0.75 + 0.12), out * 2.2, dz), mat="iron", bevel=0.0)


def plank_door(k, group, center, normal_axis, sign, w, h, rng, mat="door"):
    cx, cy, cz = center
    n = max(2, int(w / 0.17))
    for i in range(n):
        a = -w / 2 + (i + 0.5) * w / n
        hh = h - rng.uniform(0, 0.04)
        loc = (cx, cy + a, cz - (h - hh) / 2) if normal_axis == "x" else (cx + a, cy, cz - (h - hh) / 2)
        size = (0.05, w / n - 0.008, hh) if normal_axis == "x" else (w / n - 0.008, 0.05, hh)
        k.box(group, size, loc, mat=mat, bevel=0.006)
    for dz in (-h * 0.35, h * 0.35):
        loc = (cx + sign * 0.04, cy, cz + dz) if normal_axis == "x" else (cx, cy + sign * 0.04, cz + dz)
        size = (0.03, w * 0.95, 0.14) if normal_axis == "x" else (w * 0.95, 0.03, 0.14)
        k.box(group, size, loc, mat=mat, bevel=0.006)
        size = (0.02, w * 0.45, 0.05) if normal_axis == "x" else (w * 0.45, 0.02, 0.05)
        off = -w * 0.25
        loc = (cx + sign * 0.065, cy + off, cz + dz) if normal_axis == "x" else (cx + off, cy + sign * 0.065, cz + dz)
        k.box(group, size, loc, mat="iron", bevel=0.0)


# ------------------------------------------------------------ the farm store (cover)


def farm_store(k, group, c, rng):
    """Cover box 9 x 8 x 7: rubble walls to the eaves, dressed quoins, a cart
    door facing the player, slate roof with a shell hole. Built in place."""
    w, d, h = c["w"], c["d"], c["h"]
    X, Y = c["x"], -c["z"]
    hw, hd = w / 2, d / 2
    eave = h - 2.6
    body = stone_mass(k, group, (w, d, eave), (X, Y, eave / 2), "rubble", "rustic_stone_wall", 2.4, step=0.09, depth=0.06, ratio=0.4)
    front = Y - hd  # faces the player (game +z)
    cutters = [
        cutter((3.0, 0.5, 3.2), (X - 1.2, front, 1.6)),
        cutter((0.7, 0.6, 0.9), (X + 2.7, front, 3.05)),
        cutter((0.7, 0.6, 0.9), (X - 1.2, Y + hd, 3.05)),
        cutter((0.6, 1.1, 2.1), (X + hw, Y + 1.4, 1.05)),
        cutter((1.2, 0.8, 1.1), (X - 3.4, front, 3.5), (0.3, 0.2, 0.4), "sphere"),
    ]
    cut(body, cutters)
    # dark interior behind openings
    k.box(group, (2.9, 0.04, 3.15), (X - 1.2, front + 0.3, 1.58), mat="dark", bevel=0)
    k.box(group, (0.66, 0.05, 0.86), (X + 2.7, front + 0.32, 3.05), mat="dark", bevel=0)
    k.box(group, (0.66, 0.05, 0.86), (X - 1.2, Y + hd - 0.32, 3.05), mat="dark", bevel=0)
    k.box(group, (0.05, 1.0, 2.05), (X + hw - 0.32, Y + 1.4, 1.05), mat="dark", bevel=0)
    k.box(group, (1.0, 0.05, 0.9), (X - 3.4, front + 0.42, 3.5), mat="dark", bevel=0)
    # cart doors: one leaf shut, the other hanging ajar inside the recess
    plank_door(k, group, (X - 1.95, front + 0.24, 1.58), "y", -1, 1.45, 3.1, rng)
    plank_door(k, group, (X - 0.47, front + 0.24, 1.56), "y", -1, 1.42, 3.05, rng)
    plank_door(k, group, (X + hw - 0.26, Y + 1.4, 1.03), "x", 1, 0.55, 2.05, rng)
    window(k, group, (X + 2.7, front + 0.26, 3.05), "y", -1, 0.62, 0.82, rng=rng, open_shutters=False)
    window(k, group, (X - 1.2, Y + hd - 0.26, 3.05), "y", 1, 0.62, 0.82, rng=rng, open_shutters=False)
    # lintels and jambs in dressed stone, flush with the face
    k.box(group, (3.5, 0.32, 0.38), (X - 1.2, front + 0.16, 3.39), mat="quoin", bevel=0.02)
    for sx in S:
        for i in range(6):
            wide = 0.42 if i % 2 else 0.28
            k.box(group, (wide, 0.3, 0.5), (X - 1.2 + sx * (1.5 + wide / 2), front + 0.15, 0.27 + i * 0.52), mat="quoin", bevel=0.02)
    for x0, y0 in ((X + 2.7, front + 0.15), (X - 1.2, Y + hd - 0.15)):
        k.box(group, (0.95, 0.3, 0.22), (x0, y0, 3.6), mat="quoin", bevel=0.02)
    # corner quoins, alternating long and short, within the box
    for sx in S:
        for sy in S:
            for i in range(int(eave / 0.32)):
                lx, ly = (0.62, 0.34) if i % 2 else (0.34, 0.62)
                k.box(group, (lx, ly, 0.3), (X + sx * (hw - lx / 2), Y + sy * (hd - ly / 2), 0.16 + i * 0.32), mat="quoin", bevel=0.025)
    # gable walls at the X ends, ridge along X
    for sx in S:
        pts = []
        for x in (X + sx * hw, X + sx * (hw - 0.6)):
            pts += [(x, Y - hd, eave), (x, Y + hd, eave), (x, Y, h - 0.16)]
        k.hull(group, pts, mat="rubble", bevel=0.02)
        for dy in (-1.6, 1.6):  # iron tie-rod anchor plates
            k.box(group, (0.03, 0.5, 0.06), (X + sx * (hw + 0.005), Y + dy, eave - 0.45), (0.8, 0, 0), mat="iron", bevel=0)
            k.box(group, (0.03, 0.5, 0.06), (X + sx * (hw + 0.005), Y + dy, eave - 0.45), (-0.8, 0, 0), mat="iron", bevel=0)
    # attic floor seen through the hole, rafters and battens
    k.box(group, (w - 1.3, d - 1.3, 0.04), (X, Y, eave + 0.02), mat="dark", bevel=0)
    ang = math.atan2(h - 0.16 - eave, hd)
    for side in S:
        for i in range(15):
            x = X - hw + 0.6 + i * (w - 1.2) / 14
            broken = side < 0 and X + 0.9 < x < X + 3.1
            length = math.hypot(hd, h - 0.16 - eave) * (rng.uniform(0.35, 0.6) if broken else 0.98)
            mid = length / 2
            k.box(group, (0.12, length, 0.15), (x, Y + side * (hd - mid * math.cos(ang)), eave + mid * math.sin(ang) - 0.06),
                  (-side * ang, 0, 0), mat="beam", bevel=0.01)
    for r in range(4, 14):
        s = r * 0.26
        k.box(group, (2.8, 0.05, 0.03), (X + 2.0, Y - (hd - s * math.cos(ang)), eave + s * math.sin(ang) - 0.0),
              (-ang, 0, rng.uniform(-0.03, 0.03)), mat="beam", bevel=0)
    slate_roof(k, group, rng, hw, hd, eave, h - 0.16, hole=(0.9, 3.1, 5, 12), course=0.26, mat="slate", origin=(X, Y))


# ------------------------------------------------------------ farm and village houses


def house(k, group, rng, w, d, wall, ridge, roof="slate", style="plaster", chimney=True, ruin=False):
    """Built at the origin: walls along X (width) and Y (depth), ridge along Y.
    Long walls face +-X. Returns nothing; caller moves the realised object."""
    hw, hd = w / 2, d / 2
    wall_mat = {"plaster": "plaster", "stone": "rubble", "timber": "plaster"}[style]
    # deep plinth hides sloping ground
    k.box(group, (w + 0.1, d + 0.1, 2.2), (0, 0, -0.75), mat="rubble", bevel=0.02)
    if ruin:
        # broken walls of uneven height, no roof, charred beams
        for sx in S:
            for i in range(int(d / 1.2)):
                hh = wall * rng.uniform(0.35, 1.0)
                k.box(group, (0.55, 1.2, hh), (sx * (hw - 0.27), -hd + 0.6 + i * 1.2, hh / 2), mat="rubble", bevel=0.03)
        for sy in S:
            for i in range(int(w / 1.2)):
                hh = wall * rng.uniform(0.3, 1.05)
                k.box(group, (1.2, 0.55, hh), (-hw + 0.6 + i * 1.2, sy * (hd - 0.27), hh / 2), mat="rubble", bevel=0.03)
        for i in range(5):
            a = rng.uniform(-0.6, 0.6)
            k.box(group, (0.18, d * 0.8, 0.2), (rng.uniform(-hw + 1, hw - 1), rng.uniform(-1, 1), rng.uniform(0.3, wall * 0.6)),
                  (rng.uniform(-0.5, 0.5), 0, a), mat="charred", bevel=0.02)
        rubble(k, group, rng, (0, 0), (hw - 0.6, hd - 0.6), 30, (0.2, 0.5))
        return
    k.box(group, (w, d, wall), (0, 0, wall / 2), mat=wall_mat, bevel=0.04, segs=2)
    for sx in S:  # corner quoins
        for sy in S:
            for i in range(int(wall / 0.34)):
                lx, ly = (0.5, 0.3) if i % 2 else (0.3, 0.5)
                k.box(group, (lx, ly, 0.32), (sx * (hw - lx / 2 + 0.015), sy * (hd - ly / 2 + 0.015), 0.17 + i * 0.34), mat="quoin", bevel=0.02)
    if style == "timber":  # Normandy colombage over the plaster
        for sx in S:
            x = sx * (hw + 0.025)
            n = int(d / 0.55)
            for i in range(n + 1):
                k.box(group, (0.05, 0.16, wall - 0.6), (x, -hd + i * d / n, wall / 2 + 0.3), mat="beam", bevel=0.01)
            for z in (0.6, wall / 2 + 0.2, wall - 0.1):
                k.box(group, (0.06, d, 0.18), (x, 0, z), mat="beam", bevel=0.01)
            for i in range(0, n, 2):
                y0 = -hd + i * d / n
                k.box(group, (0.05, 0.14, 1.6), (x, y0 + d / n, wall / 2 - 0.6), (sx * 0.5, 0, 0), mat="beam", bevel=0.01)
    # gables at the Y ends
    for sy in S:
        y = sy * hd
        pts = [(x, yy, z) for x, z in ((-hw, wall), (hw, wall), (0, ridge + wall)) for yy in (y, y - sy * 0.5)]
        k.hull(group, pts, mat=wall_mat, bevel=0.02)
    # roof slabs with eaves and verges
    ov = 0.4
    ang = math.atan2(ridge, hw)
    L = math.hypot(hw + ov, ridge + ov * ridge / hw)
    for sx in S:
        mid = L / 2
        k.box(group, (L, d + 0.6, 0.16), (sx * (hw + ov - mid * math.cos(ang)), 0, wall - ov * math.tan(ang) + mid * math.sin(ang) + 0.1),
              (0, sx * ang, 0), mat=roof, bevel=0.03)
        k.box(group, (0.08, d + 0.6, 0.16), (sx * (hw + ov - 0.02), 0, wall - ov * math.tan(ang) - 0.02), mat="beam", bevel=0.01)
    n = int((d + 0.6) / 0.42) + 1
    for i in range(n):
        y = -(d + 0.6) / 2 + (i + 0.5) * (d + 0.6) / n
        k.add(group, C.bm_cyl(0.14, 0.42, 10, (0, y, wall + ridge + 0.12), (PI / 2, 0, 0), scale=(1, 0.7, 1)), "tile", 0.0)
    # openings on both long walls, ground and upper floor
    floors = [1.2] + ([wall * 0.72] if wall > 4.5 else [])
    bays = max(1, int(d / 2.6))
    for sx in S:
        for f, z in enumerate(floors):
            for b in range(bays):
                y = -hd + (b + 0.5) * d / bays
                if sx > 0 and f == 0 and b == bays // 2:
                    plank_door(k, group, (sx * (hw + 0.01), y, 1.05), "x", sx, 0.95, 2.1, rng)
                    k.box(group, (0.1, 1.3, 0.25), (sx * (hw + 0.03), y, 2.25), mat="quoin", bevel=0.015)
                    continue
                window(k, group, (sx * (hw + 0.005), y, z + 0.4), "x", sx, 0.8, 1.15 if f == 0 else 1.0, rng=rng)
    if chimney:
        sy = rng.choice(S)
        k.box(group, (0.9, 0.7, 2.4), (rng.uniform(-0.6, 0.6), sy * (hd - 0.5), wall + ridge - 0.1), mat="rubble", bevel=0.02)
        k.box(group, (1.0, 0.8, 0.1), (0, sy * (hd - 0.5), wall + ridge + 1.1), mat="quoin", bevel=0.01)
        for dx in (-0.18, 0.18):
            k.cyl(group, 0.1, 0.35, (dx, sy * (hd - 0.5), wall + ridge + 1.3), mat="tile", segs=12)


def church(k, group, rng):
    """Village church at the origin: nave along Y, tower at -Y with spire."""
    nw, nd, nh = 9, 22, 9
    k.box(group, (nw + 0.2, nd + 0.2, 2.0), (0, 0, -0.7), mat="rubble", bevel=0.02)
    k.box(group, (nw, nd, nh), (0, 0, nh / 2), mat="rubble", bevel=0.04)
    for sx in S:
        for i in range(6):
            y = -nd / 2 + 2 + i * 3.6
            k.hull(group, [(sx * (nw / 2 + dx), y + dy, z) for dx, z in ((0, 0), (1.1, 0), (0.4, nh * 0.85), (0, nh * 0.9)) for dy in (-0.35, 0.35)],
                   mat="quoin", bevel=0.03)
            if i < 5:
                yy = y + 1.8
                pts = [(sx * (nw / 2 + 0.02), yy + dy, z) for dy, z in ((-0.45, 3.2), (0.45, 3.2), (0.45, 6.6), (0, 7.4), (-0.45, 6.6))]
                k.hull(group, pts + [(p[0] - sx * 0.08, p[1], p[2]) for p in pts], mat="glass", bevel=0)
    for sy in S:
        y = sy * nd / 2
        k.hull(group, [(x, yy, z) for x, z in ((-nw / 2, nh), (nw / 2, nh), (0, nh + 6.5)) for yy in (y, y - sy * 0.6)], mat="rubble", bevel=0.03)
    ang = math.atan2(6.5, nw / 2)
    L = math.hypot(nw / 2 + 0.4, 6.5 + 0.6)
    for sx in S:
        k.box(group, (L, nd + 0.5, 0.18), (sx * (nw / 2 + 0.4 - L / 2 * math.cos(ang)), 0, nh - 0.5 + L / 2 * math.sin(ang)), (0, sx * ang, 0), mat="slate", bevel=0.03)
    # tower with belfry and octagonal spire
    ty = -nd / 2 - 2.6
    k.box(group, (5.6, 5.6, 2.0), (0, ty, -0.7), mat="rubble", bevel=0.02)
    k.box(group, (5.4, 5.4, 22), (0, ty, 11), mat="rubble", bevel=0.05)
    for i in range(3):
        k.box(group, (5.6, 5.6, 0.3), (0, ty, 7 + i * 6.5), mat="quoin", bevel=0.03)
    for a in range(4):
        r = a * PI / 2
        for off in (-0.9, 0.9):
            loc = Vector((off, 2.72, 19)).copy()
            loc.rotate(Matrix.Rotation(r, 3, "Z"))
            k.box(group, (0.7, 0.08, 3.0), (loc.x, ty + loc.y, 19), (0, 0, r), mat="dark", bevel=0)
            for j in range(6):
                k.box(group, (0.72, 0.1, 0.06), (loc.x, ty + loc.y, 17.8 + j * 0.45), (0.5, 0, r), mat="beam", bevel=0)
    k.add(group, C.bm_cyl(3.9, 16, 8, (0, ty, 22 + 8), (0, 0, PI / 8), r2=0.05), "slate", 0.03)
    k.cyl(group, 0.05, 1.6, (0, ty, 38.6), mat="iron", segs=6)
    k.box(group, (0.8, 0.06, 0.06), (0, ty, 38.9), mat="iron", bevel=0)
    k.box(group, (2.0, 0.3, 2.6), (0, -nd / 2 - 5.35, 1.3), mat="door", bevel=0.02)


# ------------------------------------------------------------ wrecks and farm gear


def truck_wreck(k, group, rng):
    """Generic 1940s light lorry, burnt out: no markings, built at the origin facing +Y."""
    k.bar(group, (-0.45, -2.6, 0.55), (-0.45, 2.3, 0.55), 0.12, 0.16, mat="wreck")
    k.bar(group, (0.45, -2.6, 0.55), (0.45, 2.3, 0.55), 0.12, 0.16, mat="wreck")
    # bonnet, radiator, cab
    k.hull(group, [(sx * 0.55, y, z) for sx in S for y, z in ((2.35, 0.7), (2.35, 1.35), (1.2, 1.4), (1.2, 0.7))], mat="wreck", bevel=0.04)
    k.box(group, (0.95, 0.08, 0.6), (0, 2.4, 1.0), mat="dark", bevel=0.01)
    for i in range(7):
        k.box(group, (0.04, 0.1, 0.55), (-0.36 + i * 0.12, 2.43, 1.0), mat="wreck", bevel=0)
    k.hull(group, [(sx * 1.0, y, z) for sx in S for y, z in ((1.2, 0.75), (1.2, 2.1), (0.3, 2.15), (0.1, 0.75))], mat="wreck", bevel=0.05)
    for sx in S:  # empty window holes as dark insets
        k.box(group, (0.04, 0.6, 0.45), (sx * 1.0, 0.75, 1.75), mat="dark", bevel=0)
    k.box(group, (1.7, 0.04, 0.5), (0, 1.22, 1.78), mat="dark", bevel=0)
    for sx in S:  # mudguards
        k.hull(group, [(sx * dx, y, z) for dx in (0.6, 1.05) for y, z in ((2.2, 0.75), (1.95, 1.05), (1.35, 1.05), (1.15, 0.75))], mat="wreck", bevel=0.01)
    # cargo bed with half the side planks burnt away
    k.box(group, (2.1, 3.2, 0.08), (0, -1.15, 0.75), (0, 0, 0), mat="charred", bevel=0.01)
    for sx in S:
        for i in range(4):
            if rng.random() < 0.45:
                continue
            k.box(group, (0.05, 3.2 * rng.uniform(0.5, 1.0), 0.16), (sx * 1.03, -1.15, 0.88 + i * 0.18), mat="charred", bevel=0.01)
        for y in (-2.7, -1.6, -0.5, 0.35):
            k.box(group, (0.08, 0.08, 0.7), (sx * 1.04, y, 1.1), mat="wreck", bevel=0.01)
    # rims without tyres, one wheel gone so the lorry slumps
    for sx in S:
        for y in (1.75, -1.9):
            if sx < 0 and y < 0:
                continue
            k.add(group, C.bm_lathe([(0, -0.12), (0.3, -0.12), (0.34, -0.08), (0.34, 0.08), (0.3, 0.12), (0, 0.12)], 20,
                                    (sx * 0.9, y, 0.34), (0, PI / 2, 0)), "wreck", 0.0)


def farm_cart(k, group, rng):
    """Two-wheeled tip cart, tipped on its side with one wheel broken."""
    k.box(group, (1.5, 2.6, 0.06), (0, 0, 0.75), mat="timber", bevel=0.01)
    for sx in S:
        k.box(group, (0.05, 2.6, 0.45), (sx * 0.75, 0, 1.0), mat="timber", bevel=0.01)
        k.bar(group, (sx * 0.5, 1.2, 0.72), (sx * 0.3, 3.4, 0.3), 0.08, 0.08, mat="timber")
    k.box(group, (1.5, 0.05, 0.45), (0, -1.3, 1.0), mat="timber", bevel=0.01)
    for sx in S:
        r = 0.7
        k.ring(group, r, 0.04, (sx * 0.95, 0, r), (0, PI / 2, 0), mat="timber", segs=24, sides=6)
        k.cyl(group, 0.1, 0.18, (sx * 0.95, 0, r), (0, PI / 2, 0), mat="timber", segs=10)
        for i in range(10 if sx > 0 else 6):
            a = 2 * PI * i / 10
            k.strut(group, (sx * 0.95, 0, r), (sx * 0.95, math.cos(a) * r, r + math.sin(a) * r), 0.025, mat="timber", segs=5)


def telegraph_pole(k, group, h=8.0):
    k.cyl(group, 0.13, h, (0, 0, h / 2 - 0.4), mat="beam", segs=8, r2=0.1)
    k.box(group, (1.7, 0.1, 0.12), (0, 0, h - 0.7), mat="beam", bevel=0.01)
    for x in (-0.7, -0.35, 0.35, 0.7):
        k.cyl(group, 0.04, 0.14, (x, 0, h - 0.56), mat="ceramic", segs=8)


# ------------------------------------------------------------ generated foliage


def leaf_atlas(path, size=2048, seed=7):
    """Render four leaf-cluster cards (2 x 2 atlas) as albedo with alpha.
    Every leaf is a generated lobed outline; nothing is downloaded."""
    import random

    rng = random.Random(seed)
    scene = bpy.data.scenes.new("leaf_atlas")
    world = bpy.data.worlds.new("leaf_world")
    scene.world = world
    mats = []
    for i, rgb in enumerate(((0.06, 0.11, 0.03), (0.09, 0.14, 0.04), (0.05, 0.09, 0.025), (0.13, 0.15, 0.05))):
        m = bpy.data.materials.new(f"leafcol{i}")
        try:
            m.use_nodes = True
        except AttributeError:
            pass
        nt = m.node_tree
        nt.nodes.clear()
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*rgb, 1)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(em.outputs[0], out.inputs["Surface"])
        mats.append(m)
    twig = bpy.data.materials.new("twig")
    try:
        twig.use_nodes = True
    except AttributeError:
        pass
    twig.node_tree.nodes.clear()
    em = twig.node_tree.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.04, 0.03, 0.02, 1)
    out = twig.node_tree.nodes.new("ShaderNodeOutputMaterial")
    twig.node_tree.links.new(em.outputs[0], out.inputs["Surface"])

    def leaf_outline(lobes, length, width):
        pts = []
        n = 40
        for i in range(n + 1):
            t = i / n
            env = math.sin(math.pi * t) ** 0.8 * width
            wob = 1 + 0.28 * math.sin(t * math.pi * 2 * lobes) if lobes else 1
            pts.append((env * wob, t * length))
        return pts + [(-x, y) for x, y in reversed(pts[1:-1])]

    for cell in range(4):
        cx, cy = (cell % 2) - 0.5, (cell // 2) - 0.5
        bm = bmesh.new()
        twigs = bmesh.new()
        lobes = (3, 3, 0, 2)[cell]
        # a few twigs fanning from the base, leaves along them
        for b in range(rng.randint(6, 9)):
            a = rng.uniform(-1.3, 1.3) + PI / 2
            L = rng.uniform(0.25, 0.45)
            p0 = Vector((cx, cy - 0.45, 0))
            p1 = p0 + Vector((math.cos(a), math.sin(a), 0)) * L * 1.6
            m, length = C.strut_matrix(p0, p1)
            bmesh.ops.create_cone(twigs, cap_ends=False, segments=4, radius1=0.006, radius2=0.002, depth=length, matrix=m)
            for j in range(rng.randint(28, 40)):
                t = rng.uniform(0.15, 1.0)
                base = p0.lerp(p1, t) + Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rng.uniform(0, 0.01)))
                if (base - Vector((cx, cy, 0))).length > 0.47:
                    continue
                s = rng.uniform(0.045, 0.075) * (0.8 if lobes == 0 else 1)
                outline = leaf_outline(lobes, s * 2.2, s * (0.45 if lobes else 0.38))
                rot = rng.uniform(0, 2 * PI)
                verts = []
                for x, y in outline:
                    v = Vector((x, y, 0))
                    v.rotate(Matrix.Rotation(rot, 3, "Z"))
                    verts.append(bm.verts.new(base + v + Vector((0, 0, rng.uniform(0, 0.02)))))
                f = bm.faces.new(verts)
                f.material_index = rng.choice((0, 0, 1, 1, 2, 3))
        me = bpy.data.meshes.new(f"cluster{cell}")
        bm.to_mesh(me)
        bm.free()
        for m in mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(me.name, me)
        scene.collection.objects.link(ob)
        tme = bpy.data.meshes.new(f"twigs{cell}")
        twigs.to_mesh(tme)
        twigs.free()
        tme.materials.append(twig)
        tob = bpy.data.objects.new(tme.name, tme)
        scene.collection.objects.link(tob)
    cam = bpy.data.objects.new("leafcam", bpy.data.cameras.new("leafcam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.0
    cam.location = (0, 0, 5)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    bpy.data.scenes.remove(scene)
    return path


def foliage_materials(atlas_path):
    img = bpy.data.images.load(atlas_path, check_existing=True)
    leaves = bpy.data.materials.new("leaves")
    try:
        leaves.use_nodes = True
    except AttributeError:
        pass
    nt = leaves.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    clip = nt.nodes.new("ShaderNodeMath")
    clip.operation = "ROUND"
    nt.links.new(tex.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.75
    try:
        bsdf.inputs["Subsurface Weight"].default_value = 0.0
        bsdf.inputs["Transmission Weight"].default_value = 0.0
    except KeyError:
        pass
    leaves.surface_render_method = "DITHERED"
    bark = bpy.data.materials.new("bark")
    try:
        bark.use_nodes = True
    except AttributeError:
        pass
    nt = bark.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    for kind, sock in (("diff", "Base Color"), ("rough", "Roughness")):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _img("bark_brown_02", kind)
        nt.links.new(t.outputs["Color"], bsdf.inputs[sock])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = _img("bark_brown_02", "nor_gl")
    nt.links.new(t.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return leaves, bark


def _tube(bm, uv, path, radii, segs=7, v0=0.0):
    """Skin a bent tube along path points with per-point radii; UVs wrap the bark."""
    rings = []
    vacc = v0
    for i, p in enumerate(path):
        a = path[max(0, i - 1)]
        b = path[min(len(path) - 1, i + 1)]
        t = (b - a).normalized()
        side = t.orthogonal().normalized()
        up = t.cross(side)
        ring = []
        for j in range(segs + 1):
            ang = 2 * PI * j / segs
            ring.append(bm.verts.new(p + (side * math.cos(ang) + up * math.sin(ang)) * radii[i]))
        if i:
            vacc += (path[i] - path[i - 1]).length / 1.5
        rings.append((ring, vacc))
    for (r0, v0_), (r1, v1_) in zip(rings, rings[1:]):
        for j in range(segs):
            f = bm.faces.new((r0[j], r0[j + 1], r1[j + 1], r1[j]))
            for loop, (u, v) in zip(f.loops, ((j / segs, v0_), ((j + 1) / segs, v0_), ((j + 1) / segs, v1_), (j / segs, v1_))):
                loop[uv].uv = (u, v)


def tree_proto(name, rng, height, crown, kind, leaves_mat, bark_mat, cards=260):
    """Generated tree: bent trunk, limbs and twigs as tubes, foliage as
    leaf-cluster cards whose normals point out from the crown for soft light."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    tips = []
    trunk_h = height * (0.45 if kind != "poplar" else 0.3)
    lean = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0))
    path = [Vector((0, 0, -0.3))]
    for i in range(1, 6):
        t = i / 5
        path.append(Vector((0, 0, trunk_h * t)) + lean * t * t + Vector((rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), 0)))
    r0 = 0.18 + height * 0.025
    _tube(bm, uv, path, [r0 * (1.25 if i == 0 else 1 - 0.35 * i / 5) for i in range(len(path))], 9)
    centre = Vector((lean.x, lean.y, height - crown * (0.95 if kind != "poplar" else 1.6)))
    limbs = {"oak": 6, "apple": 5, "poplar": 9}[kind]
    for li in range(limbs):
        a = 2 * PI * li / limbs + rng.uniform(-0.3, 0.3)
        if kind == "poplar":
            base = path[-1].lerp(path[0], rng.uniform(0.0, 0.5)) + Vector((0, 0, li * height * 0.05))
            out = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 1.0)).normalized()
            L = height * rng.uniform(0.35, 0.55)
        else:
            base = path[-1].lerp(path[-3], rng.uniform(0, 0.6))
            out = Vector((math.cos(a), math.sin(a), rng.uniform(0.5, 1.1))).normalized()
            L = crown * rng.uniform(0.85, 1.2)
        p = [base]
        d = out
        for s in range(1, 5):
            d = (d + Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(-0.1, 0.2)))).normalized()
            p.append(p[-1] + d * L / 4)
        rr = r0 * 0.55
        _tube(bm, uv, p, [rr * (1 - 0.8 * s / 4) for s in range(5)], 6)
        for s in (2, 3, 4):
            for _ in range(2):
                tw = (d + Vector((rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8), rng.uniform(-0.2, 0.6)))).normalized()
                q = [p[s], p[s] + tw * L * 0.3]
                _tube(bm, uv, q, [rr * 0.25, rr * 0.08], 4)
                tips.append(q[-1])
        tips.append(p[-1])
    # foliage cards: clusters around tips plus fill inside the crown shell
    cards_bm = bmesh.new()
    cuv = cards_bm.loops.layers.uv.new("UVMap")
    normals = []
    squash = Vector((1, 1, 0.8)) if kind != "poplar" else Vector((0.45, 0.45, 1.6))
    for i in range(cards):
        if i < len(tips) * 3:
            c = tips[i % len(tips)] + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(-0.3, 0.6)))
        else:
            dvec = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized() * (crown * rng.uniform(0.55, 1.0))
            c = centre + Vector((dvec.x * squash.x, dvec.y * squash.y, dvec.z * squash.z))
        s = rng.uniform(1.3, 2.0) * (0.8 if kind == "apple" else 1.0)
        rot = Matrix.Rotation(rng.uniform(0, 2 * PI), 3, "Z") @ Matrix.Rotation(rng.uniform(-1.2, 1.2), 3, "X")
        cell = rng.randrange(4) if kind != "apple" else rng.choice((1, 3))
        u0, v0 = (cell % 2) * 0.5, (cell // 2) * 0.5
        corners = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]
        vs = [cards_bm.verts.new(c + rot @ Vector((x * s, y * s, 0))) for x, y in corners]
        f = cards_bm.faces.new(vs)
        for loop, (x, y) in zip(f.loops, corners):
            loop[cuv].uv = (u0 + (x + 0.5) * 0.5, v0 + (y + 0.5) * 0.5)
        n = (c - centre)
        n = Vector((n.x / squash.x, n.y / squash.y, n.z / squash.z + crown * 0.3)).normalized()
        normals.extend([n] * 4)
    wood = bpy.data.meshes.new(f"{name}_wood")
    bm.to_mesh(wood)
    bm.free()
    wood.materials.append(bark_mat)
    for p in wood.polygons:
        p.use_smooth = True
    foliage = bpy.data.meshes.new(f"{name}_leaves")
    cards_bm.to_mesh(foliage)
    cards_bm.free()
    foliage.materials.append(leaves_mat)
    foliage.normals_split_custom_set([tuple(n) for n in normals])
    return wood, foliage


def shrub_proto(name, rng, length, height, leaves_mat, bark_mat, cards=90):
    """Hedge shrub: a mass of leaf cards on a lumpy ellipsoid with a few stems."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for _ in range(5):
        base = Vector((rng.uniform(-length * 0.3, length * 0.3), rng.uniform(-0.3, 0.3), -0.2))
        top = base + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.4, 0.4), height * 0.8))
        _tube(bm, uv, [base, base.lerp(top, 0.5) + Vector((0.1, 0, 0)), top], [0.06, 0.04, 0.015], 5)
    cards_bm = bmesh.new()
    cuv = cards_bm.loops.layers.uv.new("UVMap")
    normals = []
    centre = Vector((0, 0, height * 0.42))
    for _ in range(cards):
        dvec = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
        c = centre + Vector((dvec.x * length * 0.5, dvec.y * 1.0, dvec.z * height * 0.5)) * rng.uniform(0.5, 1.0)
        c.z = max(c.z, 0.55)
        s = rng.uniform(1.1, 1.6)
        rot = Matrix.Rotation(rng.uniform(0, 2 * PI), 3, "Z") @ Matrix.Rotation(rng.uniform(-1.3, 1.3), 3, "X")
        cell = rng.randrange(4)
        u0, v0 = (cell % 2) * 0.5, (cell // 2) * 0.5
        corners = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]
        vs = [cards_bm.verts.new(c + rot @ Vector((x * s, y * s, 0))) for x, y in corners]
        f = cards_bm.faces.new(vs)
        for loop, (x, y) in zip(f.loops, corners):
            loop[cuv].uv = (u0 + (x + 0.5) * 0.5, v0 + (y + 0.5) * 0.5)
        n = (c - centre + Vector((0, 0, height * 0.4))).normalized()
        normals.extend([n] * 4)
    wood = bpy.data.meshes.new(f"{name}_wood")
    bm.to_mesh(wood)
    bm.free()
    wood.materials.append(bark_mat)
    foliage = bpy.data.meshes.new(f"{name}_leaves")
    cards_bm.to_mesh(foliage)
    cards_bm.free()
    foliage.materials.append(leaves_mat)
    foliage.normals_split_custom_set([tuple(n) for n in normals])
    return wood, foliage
