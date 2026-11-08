"""Build the Normandy farm battlefield scenery.

Blender --background --factory-startup --python tools/blender/build_map.py -- \
    --stage blockout --render /tmp/map-review [--tanks DIR_WITH_GLBS] [--samples 32]

Coordinates follow the game: game (x, z) is Blender (x, -z), +Z up, origin at
the centre of the playable square. Gameplay never reads this geometry: the
cover boxes in web/tank-core.ts BATTLEFIELD stay authoritative, are parsed
here, and every cover model must fill its box exactly. Inside the playable
square (+/-42 m plus a margin) the ground is exactly flat at zero.

Stage "blockout" lays out the whole map in flat colours with simple shapes
and renders review stills; detailed modelling replaces it shape for shape.
"""

import json
import math
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Euler, Matrix, Vector, noise  # noqa: E402

import common as C  # noqa: E402
import map_parts as P  # noqa: E402
import numpy as np  # noqa: E402

FLAT = 46.0  # playable 42 m plus a margin stays exactly flat
RNG = random.Random(1944)


# ------------------------------------------------------------ gameplay data


def battlefield():
    src = open(os.path.join(C.ROOT, "web", "tank-core.ts")).read()
    block = src[src.index("export const BATTLEFIELD"):]
    block = block[: block.index("} as const")]
    limit = float(re.search(r"limit:\s*([\d.]+)", block).group(1))
    cover = [
        dict(x=float(m[0]), z=float(m[1]), w=float(m[2]), d=float(m[3]), h=float(m[4]))
        for m in re.findall(r"\{\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+),\s*width:\s*([\d.]+),\s*depth:\s*([\d.]+),\s*height:\s*([\d.]+)\s*\}", block)
    ]
    if len(cover) != 4 or limit != 42:
        raise SystemExit(f"[map] BATTLEFIELD changed (limit {limit}, {len(cover)} covers): update build_map.py first")
    return limit, cover


def B(x, z, y=0.0):
    """Game (x, z) and height to a Blender location."""
    return (x, -z, y)


# ------------------------------------------------------------ materials


def flat(name, rgb, rough=0.9, metal=0.0):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return mat


def varied(name, a, b, scale=0.08, rough=0.95):
    """Two-tone noise so large ground areas are not a flat colour."""
    mat = flat(name, a, rough)
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 6
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["Object"], tex.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*a, 1)
    ramp.color_ramp.elements[1].color = (*b, 1)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.65
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return mat


MATS = {}


def mats():
    MATS.update(
        grass=varied("grass", (0.10, 0.14, 0.045), (0.16, 0.18, 0.07)),
        pasture=varied("pasture", (0.13, 0.16, 0.06), (0.2, 0.2, 0.09), 0.2),
        plough=varied("plough", (0.09, 0.065, 0.04), (0.14, 0.1, 0.06), 0.5),
        stubble=varied("stubble", (0.32, 0.26, 0.13), (0.42, 0.35, 0.18), 0.3),
        lane=varied("lane", (0.17, 0.13, 0.08), (0.24, 0.19, 0.12), 0.4),
        scorch=flat("scorch", (0.02, 0.018, 0.015)),
        stone=varied("stone", (0.36, 0.32, 0.25), (0.48, 0.44, 0.36), 0.6, 0.9),
        slate=flat("slate", (0.06, 0.065, 0.07), 0.7),
        tile=flat("tile", (0.28, 0.1, 0.06), 0.8),
        timber=flat("timber", (0.12, 0.08, 0.05)),
        bank=varied("bank", (0.12, 0.09, 0.05), (0.1, 0.13, 0.05), 0.5),
        shrub=varied("shrub", (0.035, 0.06, 0.02), (0.06, 0.09, 0.03), 0.6),
        leaf=varied("leaf", (0.04, 0.075, 0.025), (0.08, 0.11, 0.035), 0.4),
        bark=flat("bark", (0.07, 0.06, 0.05)),
        wreck=flat("wreck", (0.05, 0.035, 0.025), 0.8, 0.3),
        render=flat("render", (0.55, 0.5, 0.42)),
    )


# ------------------------------------------------------------ terrain


# lane centreline in game (x, z): south road, bend into the farmyard, track north
LANE = [(0, 160), (0, 46), (0, 2), (5, -7), (10, -15), (10.5, -34), (8, -46), (18, -60), (30, -64)]
# fictional village on the northern horizon
VILLAGE = (10, -150)
CRATERS = [(-58, -52, 4.5), (62, 38, 3.5), (-66, 70, 5.0), (48, -88, 4.0), (-20, 74, 3.0)]
# bocage: hedge banks outside the playable square, broken where lanes pass
HEDGES = [[(-50, -50), (50, -50), (50, 50), (-50, 50), (-50, -50)],
          [(-150, -95), (150, -95)], [(-150, 105), (150, 105)], [(-95, -170), (-95, 170)],
          [(100, -170), (100, 170)], [(-95, 20), (-50, 20)], [(50, -10), (100, -10)], [(-50, -95), (-50, -50)]]
HEDGE_GAPS = [(0, 50, 6), (9.5, -50, 6), (0, 105, 6), (40, -95, 6), (72, -95, 5), (72, 105, 5), (72, -10, 5)]
BANKS = False  # the detailed stage raises earth banks under the hedges


def hedge_dist(x, z):
    if any(math.hypot(x - gx, z - gz) < gr for gx, gz, gr in HEDGE_GAPS):
        return 99.0
    return min(seg_dist((x, z), line[i], line[i + 1]) for line in HEDGES for i in range(len(line) - 1))


def seg_dist(p, a, b):
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - az) * dz) / (dx * dx + dz * dz)))
    return math.hypot(p[0] - ax - dx * t, p[1] - az - dz * t)


def lane_dist(x, z):
    return min(seg_dist((x, z), LANE[i], LANE[i + 1]) for i in range(len(LANE) - 1))


def smooth(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def height(x, z):
    """Ground height at game (x, z); exactly zero inside the flat square."""
    d = max(abs(x), abs(z))
    if d <= FLAT:
        return 0.0
    near = smooth(FLAT, 80, d)
    far = smooth(90, 200, d)
    h = near * (1.4 + 2.2 * noise.noise(Vector((x / 45, z / 45, 0.3))))
    h += far * (7 + 9 * noise.noise(Vector((x / 110, z / 110, 2.7))))
    # sunken lane between hedge banks once it leaves the flat square
    ld = lane_dist(x, z)
    cut = 1 - smooth(3.0, 7.0, ld)
    h = h * (1 - cut) + cut * (h * 0.5 - 1.1 * near)
    for cx, cz, r in CRATERS:
        c = math.hypot(x - cx, z - cz)
        if c < r * 1.4:
            h += -0.9 * (1 - smooth(0, r, c)) + 0.35 * math.exp(-((c - r) ** 2) / 0.8)
    if BANKS:
        h += 1.1 * (1 - smooth(0.8, 2.8, hedge_dist(x, z)))
    # the village sits on a gentle shelf
    v = math.hypot(x - VILLAGE[0], z - VILLAGE[1])
    shelf = 1 - smooth(25, 60, v)
    return h * (1 - shelf) + shelf * 6.0


def terrain(size=420, step=2.0):
    n = int(size / step) + 1
    bm = bmesh.new()
    verts = []
    for j in range(n):
        for i in range(n):
            x = -size / 2 + i * step
            z = -size / 2 + j * step
            verts.append(bm.verts.new(B(x, z, height(x, z))))
    for j in range(n - 1):
        for i in range(n - 1):
            a = j * n + i
            bm.faces.new((verts[a], verts[a + 1], verts[a + n + 1], verts[a + n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return obj("terrain", bm, "grass", smooth_shade=True)


def obj(name, bm, mat, smooth_shade=False, collection=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth_shade:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(MATS[mat])
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def drape(name, poly, width, mat, lift=0.03, step=1.0):
    """Ribbon following the ground along a polyline (lanes, ruts)."""
    pts = []
    for (ax, az), (bx, bz) in zip(poly, poly[1:]):
        n = max(1, int(math.hypot(bx - ax, bz - az) / step))
        for k in range(n):
            t = k / n
            pts.append((ax + (bx - ax) * t, az + (bz - az) * t))
    pts.append(poly[-1])
    bm = bmesh.new()
    rows = []
    for i, (x, z) in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz) or 1
        nx, nz = -dz / L, dx / L
        row = []
        for s in (-0.5, 0.5):
            px, pz = x + nx * width * s, z + nz * width * s
            row.append(bm.verts.new(B(px, pz, height(px, pz) + lift)))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        bm.faces.new((r0[0], r0[1], r1[1], r1[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return obj(name, bm, mat, smooth_shade=True)


def patch(name, x, z, w, d, mat, lift=0.015):
    """Flat field plot (only used inside the flat square)."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5,
                          matrix=C.mat4(B(x, z, lift), (0, 0, 0), (w, d, 1)))
    return obj(name, bm, mat)


def disc(name, x, z, r, mat, lift=0.02):
    bm = bmesh.new()
    pts = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        rr = r * (0.75 + 0.35 * RNG.random())
        pts.append(bm.verts.new(B(x + math.cos(a) * rr, z + math.sin(a) * rr, lift)))
    bm.faces.new(pts)
    return obj(name, bm, mat)


# ------------------------------------------------------------ blockout props


def box(name, x, z, w, d, h, mat, y0=None, yaw=0.0):
    y0 = height(x, z) if y0 is None else y0
    bm = C.bm_box((w, d, h), B(x, z, y0 + h / 2), (0, 0, yaw))
    return obj(name, bm, mat)


def gable(name, x, z, w, d, wall, ridge, mat, y0=None, yaw=0.0, eave=0.3):
    """Pitched roof prism, ridge running along the building's depth."""
    y0 = height(x, z) if y0 is None else y0
    hw, hd = w / 2 + eave, d / 2 + eave
    prof = [(-hw, 0), (hw, 0), (0, ridge)]
    bm = bmesh.new()
    a = [bm.verts.new((px, -hd, pz)) for px, pz in prof]
    b = [bm.verts.new((px, hd, pz)) for px, pz in prof]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.transform(C.mat4(B(x, z, y0 + wall), (0, 0, yaw)))
    return obj(name, bm, mat)


def house(name, x, z, w, d, wall, ridge, roof="slate", yaw=0.0):
    y0 = min(height(x + sx * w / 2, z + sz * d / 2) for sx in (-1, 1) for sz in (-1, 1))
    box(name + "_walls", x, z, w, d, wall + 0.6, "stone", y0 - 0.6, yaw)
    gable(name + "_roof", x, z, w, d, wall, ridge, roof, y0, yaw)


def tree(x, z, h, crown, kind="oak"):
    y = height(x, z)
    bm = C.bm_cyl(0.18 + h * 0.02, h * 0.55, 8, B(x, z, y + h * 0.27))
    obj("trunk", bm, "bark")
    bm = bmesh.new()
    for i in range(4 if kind == "oak" else 2):
        ox, oz = RNG.uniform(-crown, crown) * 0.4, RNG.uniform(-crown, crown) * 0.4
        r = crown * RNG.uniform(0.6, 0.85)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r,
                                   matrix=C.mat4(B(x + ox, z + oz, y + h - crown * 0.7 + RNG.uniform(-0.6, 0.8)), (0, 0, 0), (1, 1, 0.85)))
    obj("crown", bm, "leaf", smooth_shade=True)


def hedgerow(line, trees=True, gaps=()):
    """Bocage: an earth bank topped with dense shrubs and standard trees."""
    pts = []
    for (ax, az), (bx, bz) in zip(line, line[1:]):
        n = max(1, int(math.hypot(bx - ax, bz - az) / 2.2))
        for k in range(n):
            t = k / n
            pts.append((ax + (bx - ax) * t, az + (bz - az) * t))
    bm_bank = bmesh.new()
    bm_shrub = bmesh.new()
    since = RNG.uniform(0, 10)
    for i, (x, z) in enumerate(pts):
        if any(math.hypot(x - gx, z - gz) < gr for gx, gz, gr in gaps):
            continue
        y = height(x, z)
        bmesh.ops.create_icosphere(bm_bank, subdivisions=1, radius=1.6,
                                   matrix=C.mat4(B(x, z, y - 0.4), (0, 0, RNG.random()), (1.1, 1.1, 0.75)))
        bmesh.ops.create_icosphere(bm_shrub, subdivisions=1, radius=RNG.uniform(1.2, 1.9),
                                   matrix=C.mat4(B(x + RNG.uniform(-0.5, 0.5), z + RNG.uniform(-0.5, 0.5), y + 1.6 + RNG.uniform(0, 0.8)),
                                                 (0, 0, RNG.random()), (1, 1, 1.2)))
        since += 2.2
        if trees and since > RNG.uniform(7, 14):
            since = 0
            tree(x, z, RNG.uniform(10, 15), RNG.uniform(3.2, 4.5))
    obj("hedge_bank", bm_bank, "bank", smooth_shade=True)
    obj("hedge_shrubs", bm_shrub, "shrub", smooth_shade=True)


# ------------------------------------------------------------ layout


def cover_models(cover):
    """Each authoritative box becomes a building or wall that fills it exactly."""
    for i, c in enumerate(cover):
        if c["h"] > 4:  # farm store: stone walls to the eaves, roof up to the box top
            wall = c["h"] - 2.4
            box(f"cover{i}_walls", c["x"], c["z"], c["w"], c["d"], wall, "stone", 0.0)
            # ridge runs along game x: swap footprint axes for the quarter turn
            gable(f"cover{i}_roof", c["x"], c["z"], c["d"], c["w"], wall, 2.4, "slate", 0.0, math.pi / 2, eave=0.0)
        else:  # drystone wall: body, cap course, a slumped section
            box(f"cover{i}_wall", c["x"], c["z"], c["w"], c["d"], c["h"] - 0.25, "stone", 0.0)
            box(f"cover{i}_cap", c["x"], c["z"], c["w"], c["d"], 0.25, "stone", c["h"] - 0.25)
            # rubble spills at the foot, kept below 0.6 m and outside nothing solid
            along_x = c["w"] > c["d"]
            for k in range(6):
                t = RNG.uniform(-0.45, 0.45)
                rx = c["x"] + (t * c["w"] if along_x else RNG.choice((-1, 1)) * (c["w"] / 2 + 0.35))
                rz = c["z"] + (RNG.choice((-1, 1)) * (c["d"] / 2 + 0.35) if along_x else t * c["d"])
                s = RNG.uniform(0.25, 0.5)
                box("rubble", rx, rz, s, s * 0.8, s * 0.6, "stone", 0.0, RNG.random())


def layout():
    limit, cover = battlefield()
    mats()
    terrain()
    # fields inside the flat square (same plots as today) and lane
    for i, (x, z, w, d, m) in enumerate([(-27, -24, 25, 36, "plough"), (28, 8, 24, 42, "stubble"), (-26, 24, 26, 20, "pasture")]):
        patch(f"field{i}", x, z, w, d, m)
    drape("lane", LANE, 5.0, "lane")
    for i, (x, z, r) in enumerate([(-6, -28, 2.2), (24, -6, 1.8), (-25, 10, 2.5), (6, 30, 1.6)]):
        disc(f"scorch{i}", x, z, r, "scorch")
    cover_models(cover)

    # bocage ring just outside the boundary, broken where the lane passes
    for line in HEDGES:
        hedgerow(line, gaps=HEDGE_GAPS)
    # orchard north-west, beyond the hedge
    for i in range(5):
        for j in range(4):
            tree(-34 + i * 7 + RNG.uniform(-0.6, 0.6), -60 - j * 7 + RNG.uniform(-0.6, 0.6), RNG.uniform(5, 6.5), 2.4, "apple")
    # farms outside the boundary
    house("farmhouse", 35, -70, 13, 9, 6.0, 3.6, "tile")
    house("barn_n", -28, -70, 9, 16, 5.0, 4.0, yaw=0.0)
    house("farm_w", -66, 13, 8, 12, 5.2, 3.2)
    house("cart_shed", 22, -78, 10, 5, 3.2, 1.8, "tile")
    # village and church on the northern horizon
    vx, vz = VILLAGE
    for k in range(9):
        a = k / 9 * math.pi * 2
        hx, hz = vx + math.cos(a) * RNG.uniform(16, 28), vz + math.sin(a) * RNG.uniform(10, 18)
        house(f"village{k}", hx, hz, RNG.uniform(7, 10), RNG.uniform(8, 12), RNG.uniform(5, 7.5), RNG.uniform(3, 4.5),
              RNG.choice(("slate", "tile")), yaw=RNG.choice((0.0, math.pi / 2)))
    y = height(vx, vz)
    box("church_nave", vx, vz + 6, 9, 22, 9, "stone", y)
    gable("church_roof", vx, vz + 6, 9, 22, 9, 5.5, "slate", y)
    box("church_tower", vx, vz - 8, 5.5, 5.5, 22, "stone", y)
    bm = C.bm_cyl(3.6, 15, 8, B(vx, vz - 8, y + 22 + 7.5), r2=0.05)
    obj("church_spire", bm, "slate")
    # telegraph poles along the eastern road, a burnt-out truck, a broken cart
    drape("road_e", [(72, 180), (72, -180)], 6.0, "lane")
    for k in range(-5, 6):
        z = k * 30
        y = height(76, z)
        obj("pole", C.bm_cyl(0.13, 8, 6, B(76, z, y + 4)), "timber")
        obj("arm", C.bm_box((1.6, 0.12, 0.12), B(76, z, y + 7.6)), "timber")
    box("truck_cab", 64, -24, 2.3, 2.2, 2.3, "wreck", yaw=0.5)
    box("truck_bed", 63, -20.5, 2.4, 4.2, 1.4, "wreck", yaw=0.5)
    box("cart", -56, -32, 1.8, 3.2, 0.9, "timber", yaw=1.2)
    # scattered field trees on the far slopes
    for _ in range(60):
        x, z = RNG.uniform(-190, 190), RNG.uniform(-190, 190)
        if max(abs(x), abs(z)) < 60 or math.hypot(x - vx, z - vz) < 40 or lane_dist(x, z) < 6 or abs(x - 72) < 6:
            continue
        tree(x, z, RNG.uniform(9, 14), RNG.uniform(3, 4.5))
    return cover



# ------------------------------------------------------------ detailed stage


BUILT = []  # realised buildings, wrecks and poles, baked into one atlas on export
SPLAT = 1024  # splat maps cover the 420 m terrain square (0.41 m per pixel)
SIZE = 420.0


def _seg_dist_np(px, pz, a, b):
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    t = np.clip(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1)
    return np.hypot(px - ax - dx * t, pz - az - dz * t)


def _value_noise(shape, cells, seed):
    """Smooth value noise in numpy (bilinear upsample of a random lattice)."""
    rs = np.random.RandomState(seed)
    lat = rs.rand(cells + 1, cells + 1)
    ys = np.linspace(0, cells, shape[0], endpoint=False)
    xs = np.linspace(0, cells, shape[1], endpoint=False)
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = lat[y0][:, x0]
    b = lat[y0][:, x0 + 1]
    c = lat[y0 + 1][:, x0]
    d = lat[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def splat_maps(out_dir):
    """Two RGB weight maps over the terrain, row 0 at game z = -210 (north).
    A: R lane mud, G ploughed soil, B burnt ground. B: R leaf litter, G dry stubble, B wet ruts."""
    n = SPLAT
    coords = (np.arange(n) + 0.5) / n * SIZE - SIZE / 2
    gx, gz = np.meshgrid(coords, coords)  # gz rows: north (-210) first
    noise1 = _value_noise((n, n), 60, 1)
    noise2 = _value_noise((n, n), 180, 2)
    wob = (noise1 - 0.5) * 1.6 + (noise2 - 0.5) * 0.6
    lane = np.full((n, n), 99.0)
    for a, b in zip(LANE, LANE[1:]):
        lane = np.minimum(lane, _seg_dist_np(gx, gz, a, b))
    road = np.full((n, n), 99.0)
    road = np.minimum(road, np.abs(gx - 72))
    lane_w = 1 - np.clip((np.minimum(lane, road * 0.9) + wob - 2.3) / 1.2, 0, 1)
    ruts = np.zeros((n, n))
    for off in (-1.2, 1.2):  # wheel ruts hold water
        ruts = np.maximum(ruts, 1 - np.clip(np.abs(lane - abs(off)) / 0.35, 0, 1))
    ruts *= (noise2 > 0.45) * lane_w
    plough = np.zeros((n, n))
    stubble = np.zeros((n, n))
    for (x, z, w, d, kind) in [(-27, -24, 25, 36, "plough"), (28, 8, 24, 42, "stubble"), (26, -62, 34, 24, "plough"),
                               (-125, 50, 50, 90, "stubble"), (130, 40, 50, 100, "plough"), (-40, 145, 100, 60, "stubble"),
                               (40, -130, 60, 50, "stubble")]:
        inside = np.minimum(np.minimum(gx - (x - w / 2), (x + w / 2) - gx), np.minimum(gz - (z - d / 2), (z + d / 2) - gz))
        m = np.clip((inside + wob * 0.8) / 1.0, 0, 1)
        if kind == "plough":
            plough = np.maximum(plough, m)
        else:
            stubble = np.maximum(stubble, m)
    burnt = np.zeros((n, n))
    for x, z, r in [(-6, -28, 2.6), (24, -6, 2.2), (-25, 10, 3.0), (6, 30, 1.9), (-12, -40, 1.6), (33, -30, 2.0)] + [(c[0], c[1], c[2] * 1.3) for c in CRATERS]:
        dd = np.hypot(gx - x, gz - z) + (noise2 - 0.5) * 2.2
        burnt = np.maximum(burnt, 1 - np.clip((dd - r) / 1.2, 0, 1))
    # scorched ground around the burnt-out lorry
    burnt = np.maximum(burnt, 1 - np.clip((np.hypot(gx - 64, gz + 23) + wob * 2 - 5) / 2, 0, 1))
    hedge = np.full((n, n), 99.0)
    for line in HEDGES:
        for a, b in zip(line, line[1:]):
            hedge = np.minimum(hedge, _seg_dist_np(gx, gz, a, b))
    litter = 1 - np.clip((hedge + wob - 3.2) / 1.5, 0, 1)
    for x, z, r in [(VILLAGE[0], VILLAGE[1], 32), (35, -70, 12), (-28, -70, 12), (-66, 13, 9), (22, -78, 8)]:
        yard = 1 - np.clip((np.hypot(gx - x, gz - z) + wob * 3 - r) / 3, 0, 1)
        lane_w = np.maximum(lane_w, yard * 0.75)
    plough *= 1 - lane_w
    stubble *= 1 - lane_w
    a = np.stack([lane_w, plough, burnt], -1)
    b = np.stack([litter * (1 - lane_w), stubble, ruts], -1)
    paths = {}
    for key, arr in (("splat_a", a), ("splat_b", b)):
        img = bpy.data.images.new(key, n, n, alpha=False)
        img.colorspace_settings.name = "Non-Color"
        rgba = np.ones((n, n, 4), np.float32)
        rgba[..., :3] = arr[::-1]  # Blender rows start at the bottom (south)
        img.pixels.foreach_set(rgba.ravel())
        path = os.path.join(out_dir, f"{key}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        paths[key] = path
    return paths


def terrain_material(splats):
    """Preview of the runtime terrain shader: tiled sets blended by the splat maps."""
    mat = bpy.data.materials.new("terrain")
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    N = C.Nodes(mat)
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    N.nt.links.new(N.out(bsdf, "BSDF"), N.sock(out, "Surface"))
    uvn = N.new("ShaderNodeUVMap")
    uvn.uv_map = "splat"
    uv = N.out(uvn, "UV")
    coord = N.out(N.new("ShaderNodeTexCoord"), "Object")

    def splat(key):
        img = bpy.data.images.load(splats[key], check_existing=True)
        img.colorspace_settings.name = "Non-Color"
        n = N.new("ShaderNodeTexImage", image=img, interpolation="Cubic")
        N.feed(n, "Vector", uv)
        sep = N.new("ShaderNodeSeparateColor")
        N.feed(sep, "Color", N.out(n, "Color"))
        return [N.out(sep, c) for c in ("Red", "Green", "Blue")]

    lane, plough, burnt = splat("splat_a")
    litter, stubble, wet = splat("splat_b")

    def layer(tex, tile, folder=None):
        m = N.mapping(coord, (1 / tile,) * 3)
        if folder:
            img = bpy.data.images.load(os.path.join(C.ROOT, "public", "art", folder, f"{tex}_diff_1k.jpg"), check_existing=True)
            n = N.new("ShaderNodeTexImage", image=img)
            N.feed(n, "Vector", m)
            return N.out(n, "Color")
        n = N.new("ShaderNodeTexImage", image=P._img(tex, "diff"))
        N.feed(n, "Vector", m)
        return N.out(n, "Color")

    grass = N.mix(1.0, layer("leafy_grass", 3.0), (0.62, 0.95, 0.42, 1), "MULTIPLY")
    big = N.ramp(N.noise(N.mapping(coord, (0.03, 0.03, 0.03)), 1.0, 3.0, 0.5), 0.3, 0.7)
    grass = N.mix(N.math("MULTIPLY", big, 0.5), grass, N.mix(1.0, grass, (1.15, 1.0, 0.8, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", stubble, 0.85), grass, N.mix(1.0, layer("leafy_grass", 2.2), (1.25, 1.05, 0.45, 1), "MULTIPLY"))
    col = N.mix(plough, col, layer("farm_soil", 4.0, "terrain"))
    col = N.mix(litter, col, layer("brown_mud_leaves_01", 2.5))
    col = N.mix(lane, col, N.mix(1.0, layer("muddy_tracks", 3.5), (0.72, 0.7, 0.72, 1), "MULTIPLY"))
    col = N.mix(burnt, col, layer("burned_ground_01", 3.0))
    col = N.mix(N.math("MULTIPLY", wet, 0.7), col, N.mix(1.0, col, (0.35, 0.33, 0.3, 1), "MULTIPLY"))
    N.feed(bsdf, "Base Color", col)
    N.feed(bsdf, "Roughness", N.mixf(wet, 0.95, 0.25))
    return mat


def detailed_terrain(splats, size=SIZE, step=2.0):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("splat")
    n = int(size / step) + 1
    verts = []
    for j in range(n):
        for i in range(n):
            x = -size / 2 + i * step
            z = -size / 2 + j * step
            verts.append(bm.verts.new(B(x, z, height(x, z))))
    for j in range(n - 1):
        for i in range(n - 1):
            a = j * n + i
            f = bm.faces.new((verts[a], verts[a + 1], verts[a + n + 1], verts[a + n]))
            for loop in f.loops:
                x, y = loop.vert.co.x, loop.vert.co.y
                loop[uv].uv = ((x + size / 2) / size, (y + size / 2) / size)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("terrain")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(terrain_material(splats))
    ob = bpy.data.objects.new("terrain", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def ground_under(x, z, w, d, yaw=0.0):
    pts = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx, lz = sx * w / 2, sz * d / 2
            pts.append(height(x + lx * math.cos(yaw) - lz * math.sin(yaw), z + lx * math.sin(yaw) + lz * math.cos(yaw)))
    return min(pts + [height(x, z)])


def place_built(k, group, name, x, z, yaw=0.0, footprint=(6, 6), tilt=(0.0, 0.0), lighten=1.0):
    """Realise a part built at the origin and set it on the ground; distant
    buildings are lightened since fog and range hide small bevels."""
    ob = k.realise(group, name)
    if lighten < 1.0:
        dec = ob.modifiers.new("lighten", "DECIMATE")
        dec.ratio = lighten
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.clear()
        old = ob.data
        ob.data = me
        bpy.data.meshes.remove(old)
    BUILT.append(ob)
    ob.location = B(x, z, ground_under(x, z, *footprint, yaw=yaw))
    ob.rotation_euler = (tilt[0], tilt[1], yaw)
    return ob


def import_props():
    """Poly Haven CC0 props: import once, lighten heavy meshes, keep their PBR sets."""
    protos = {}
    budget = {"rock_moss_set_01": 0.03, "rock_moss_set_02": 0.03, "dead_tree_trunk_02": 0.02,
              "tree_stump_01": 0.04, "nettle_plant": 0.04, "weed_plant_02": 0.08, "fern_02": 0.3, "dry_branches_medium_01": 0.08,
              "wooden_barrels_01": 0.15, "wooden_crate_02": 0.6}
    hidden = bpy.data.collections.new("prop_protos")
    bpy.context.scene.collection.children.link(hidden)
    for asset, ratio in budget.items():
        path = os.path.join(C.SOURCES, "models", asset, f"{asset}_1k.gltf")
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        meshes = [o for o in new if o.type == "MESH"]
        for o in meshes:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
            if ratio < 1.0:
                dec = o.modifiers.new("lighten", "DECIMATE")
                dec.ratio = ratio
                dg = bpy.context.evaluated_depsgraph_get()
                me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
                o.modifiers.clear()
                o.data = me
            for c in list(o.users_collection):
                c.objects.unlink(o)
            hidden.objects.link(o)
            o.hide_render = True
            protos.setdefault(asset, []).append(o)
        for o in new:
            if o.type != "MESH":
                bpy.data.objects.remove(o)
    return protos


class Instances:
    """Instance lists in game coordinates; linked duplicates for review renders."""

    def __init__(self):
        self.items = {}

    def add(self, proto, x, z, yaw=0.0, scale=1.0, y=None, tilt=(0.0, 0.0)):
        y = height(x, z) if y is None else y
        self.items.setdefault(proto, []).append((round(x, 3), round(y, 3), round(z, 3), round(yaw, 4), round(scale, 3), tilt))

    def realise(self, protos):
        coll = bpy.data.collections.new("instances")
        bpy.context.scene.collection.children.link(coll)
        for name, rows in self.items.items():
            for o in protos[name]:
                for x, y, z, yaw, sc, tilt in rows:
                    inst = bpy.data.objects.new(f"{name}_i", o.data)
                    place = Matrix.LocRotScale(Vector(B(x, z, y)), Euler((tilt[0], tilt[1], yaw)), Vector((sc, sc, sc)))
                    inst.matrix_world = place @ o.matrix_world
                    coll.objects.link(inst)


def along(line, step, rng, jitter=0.4):
    for (ax, az), (bx, bz) in zip(line, line[1:]):
        L = math.hypot(bx - ax, bz - az)
        n = max(1, int(L / step))
        yaw = math.atan2(-(bz - az), bx - ax)
        for k in range(n):
            t = (k + rng.uniform(0.2, 0.8)) / n
            x, z = ax + (bx - ax) * t, az + (bz - az) * t
            if any(math.hypot(x - gx, z - gz) < gr for gx, gz, gr in HEDGE_GAPS):
                continue
            yield x + rng.uniform(-jitter, jitter), z + rng.uniform(-jitter, jitter), yaw


def detailed(out_dir):
    global BANKS
    BANKS = True
    np.random.seed(1944)
    rng = random.Random(1944)
    limit, cover = battlefield()
    k = C.Kit(P.building_materials())
    # ---- authoritative cover, built in place
    for c in cover:
        if c["h"] > 4:
            P.farm_store(k, "cover", c, rng)
        else:
            P.drystone_wall(k, "cover", c, rng)
    k.realise("cover", "covers", {"dirt": 0.0})
    for coll in [c for c in bpy.data.collections if c.name.startswith("cut_")]:
        for o in list(coll.objects):
            bpy.data.objects.remove(o)
        bpy.data.collections.remove(coll)
    # ---- farms outside the boundary
    P.house(k, "b", rng, 9, 13, 5.6, 3.8, roof="tile", style="timber")
    place_built(k, "b", "farmhouse", 35, -70, math.pi / 2, (13, 9), lighten=0.6)
    P.house(k, "b", rng, 9, 16, 5.0, 4.2, roof="slate", style="stone", chimney=False)
    place_built(k, "b", "barn_north", -28, -70, 0.0, (9, 16), lighten=0.6)
    P.house(k, "b", rng, 8, 12, 5.2, 3.4, roof="slate", style="plaster")
    place_built(k, "b", "farm_west", -66, 13, 0.0, (8, 12), lighten=0.6)
    # open cart shed: back wall, posts, tiled lean-to roof, the farm cart inside
    k.box("b", (10, 0.5, 3.2), (0, 2.3, 1.6), mat="rubble", bevel=0.03)
    k.box("b", (10.4, 0.7, 2.0), (0, 2.3, -0.9), mat="rubble", bevel=0.02)
    for x in (-4.8, -1.6, 1.6, 4.8):
        k.box("b", (0.22, 0.22, 2.6), (x, -2.2, 1.3), mat="beam", bevel=0.02)
        k.box("b", (0.6, 0.6, 1.2), (x, -2.2, -0.5), mat="rubble", bevel=0.02)
    k.box("b", (10.6, 5.6, 0.14), (0, 0, 3.2), (math.atan2(0.8, 5), 0, 0), mat="tile", bevel=0.02)
    k.box("b", (10.2, 0.16, 0.2), (0, -2.2, 2.66), mat="beam", bevel=0.01)
    place_built(k, "b", "cart_shed", 22, -78, 0.0, (10, 5))
    P.farm_cart(k, "b", rng)
    place_built(k, "b", "cart", 20, -77.5, 0.3, (2, 3))
    P.farm_cart(k, "b", rng)
    place_built(k, "b", "cart_tipped", -56, -32, 1.2, (2, 3), tilt=(0.0, 0.32))
    P.truck_wreck(k, "b", rng)
    place_built(k, "b", "lorry_wreck", 64, -24, 0.5, (2.2, 5.0), tilt=(0.03, -0.06))
    # ---- village and church on the northern shelf
    vx, vz = VILLAGE
    P.church(k, "b", rng)
    place_built(k, "b", "church", vx, vz + 4, 0.0, (9, 26), lighten=0.4)
    for i in range(10):
        a = i / 10 * math.pi * 2 + 0.3
        hx, hz = vx + math.cos(a) * rng.uniform(18, 30), vz + math.sin(a) * rng.uniform(14, 22)
        w, d = rng.uniform(7, 9), rng.uniform(9, 13)
        P.house(k, "b", rng, w, d, rng.uniform(5, 7), rng.uniform(3, 4.2), roof=rng.choice(("slate", "tile")),
                style=rng.choice(("plaster", "stone", "timber")), ruin=i in (2, 6))
        place_built(k, "b", f"village_{i}", hx, hz, rng.choice((0.0, math.pi / 2)) + rng.uniform(-0.08, 0.08), (w, d), lighten=0.35)
    # ---- telegraph line along the eastern road
    for i in range(-6, 7):
        P.telegraph_pole(k, "b")
        place_built(k, "b", f"pole_{i}", 76, i * 30, 0.0, (0.3, 0.3))

    # ---- terrain and splat maps
    splats = splat_maps(out_dir)
    detailed_terrain(splats)

    # ---- generated foliage prototypes
    atlas = P.leaf_atlas(os.path.join(out_dir, "leaf_atlas.png"))
    leaves, bark = P.foliage_materials(atlas)
    protos = {}
    hidden = bpy.data.collections.new("foliage_protos")
    bpy.context.scene.collection.children.link(hidden)
    specs = [("oak_a", 13, 4.4, "oak"), ("oak_b", 10.5, 3.6, "oak"), ("oak_c", 15, 5.0, "oak"),
             ("apple", 5.6, 2.5, "apple"), ("poplar", 21, 2.4, "poplar")]
    for name, h, crown, kind in specs:
        wood, foliage = P.tree_proto(name, rng, h, crown, kind, leaves, bark, cards=300 if kind != "apple" else 140)
        protos[name] = [bpy.data.objects.new(name + "_wood", wood), bpy.data.objects.new(name + "_leaves", foliage)]
    for name, L, h in (("shrub_a", 3.2, 2.4), ("shrub_b", 2.6, 2.0), ("shrub_c", 4.0, 2.8)):
        wood, foliage = P.shrub_proto(name, rng, L, h, leaves, bark)
        protos[name] = [bpy.data.objects.new(name + "_wood", wood), bpy.data.objects.new(name + "_leaves", foliage)]
    for obs in protos.values():
        for o in obs:
            hidden.objects.link(o)
            o.hide_render = True
    protos.update(import_props())

    inst = Instances()
    oaks = ("oak_a", "oak_b", "oak_c")
    for line in HEDGES:
        since = rng.uniform(0, 8)
        for x, z, yaw in along(line, 2.3, rng):
            inst.add(rng.choice(("shrub_a", "shrub_b", "shrub_c")), x, z, yaw + rng.uniform(-0.3, 0.3), rng.uniform(0.85, 1.25))
            since += 2.3
            if since > rng.uniform(7, 13):
                since = 0
                inst.add(rng.choice(oaks), x + rng.uniform(-0.5, 0.5), z + rng.uniform(-0.5, 0.5), rng.uniform(0, 6.28), rng.uniform(0.8, 1.15))
    for i in range(5):
        for j in range(4):
            inst.add("apple", -34 + i * 7 + rng.uniform(-0.6, 0.6), -60 - j * 7 + rng.uniform(-0.6, 0.6), rng.uniform(0, 6.28), rng.uniform(0.85, 1.1))
    for z in range(-170, 175, 12):
        if all(abs(z - gz) > 6 for gz in (-95, 105, -10)):
            inst.add("poplar", 67.5, z + rng.uniform(-1, 1), rng.uniform(0, 6.28), rng.uniform(0.85, 1.15))
    count = 0
    while count < 70:
        x, z = rng.uniform(-195, 195), rng.uniform(-195, 195)
        if max(abs(x), abs(z)) < 58 or math.hypot(x - vx, z - vz) < 42 or lane_dist(x, z) < 6 or abs(x - 72) < 7 or hedge_dist(x, z) < 4:
            continue
        inst.add(rng.choice(oaks), x, z, rng.uniform(0, 6.28), rng.uniform(0.8, 1.2))
        count += 1
    # rocks, stumps and dead wood on the banks and field corners (outside the boundary)
    for line in HEDGES:
        for x, z, yaw in along(line, 9.0, rng, 1.2):
            if rng.random() < 0.35:
                inst.add(rng.choice(("rock_moss_set_01", "rock_moss_set_02")), x, z, rng.uniform(0, 6.28), rng.uniform(0.35, 0.6))
            elif rng.random() < 0.2:
                inst.add(rng.choice(("tree_stump_01", "dead_tree_trunk_02", "dry_branches_medium_01")), x, z, rng.uniform(0, 6.28), rng.uniform(0.9, 1.1))
    for x, z in ((-60, -45), (58, 46), (-62, 62), (54, -84), (-80, -20)):
        inst.add("rock_moss_set_01", x, z, rng.uniform(0, 6.28), rng.uniform(0.7, 0.9))
    # weeds at the foot of walls and buildings: plants only, never blockers
    for c in cover:
        hw, hd = c["w"] / 2 + 0.25, c["d"] / 2 + 0.25
        for _ in range(int((c["w"] + c["d"]) * 1.2)):
            side = rng.randrange(4)
            t = rng.uniform(-1, 1)
            x = c["x"] + (t * hw if side < 2 else (hw if side == 2 else -hw))
            z = c["z"] + (t * hd if side >= 2 else (hd if side == 0 else -hd))
            inst.add(rng.choice(("nettle_plant", "fern_02", "weed_plant_02", "weed_plant_02")), x, z, rng.uniform(0, 6.28), rng.uniform(0.7, 1.2), y=0.0)
    # farmyard clutter beyond the boundary
    for x, z in ((28, -64), (30.5, -63.5), (16, -74), (-22, -61), (-60, 20)):
        inst.add(rng.choice(("wooden_barrels_01", "wooden_crate_02")), x, z, rng.uniform(0, 6.28))
    inst.realise(protos)
    return inst, protos


def add_fog(scene, density=0.003):
    """Haze in a finite slab over the map (a world volume would swallow the sun)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=C.mat4((0, 0, 28), (0, 0, 0), (440, 440, 64)))
    me = bpy.data.meshes.new("haze")
    bm.to_mesh(me)
    bm.free()
    mat = bpy.data.materials.new("haze")
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (0.75, 0.8, 0.82, 1)
    vol.inputs["Density"].default_value = density
    vol.inputs["Anisotropy"].default_value = 0.3
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    me.materials.append(mat)
    ob = bpy.data.objects.new("haze", me)
    scene.collection.objects.link(ob)


# ------------------------------------------------------------ export


def _bake_group(objs, size, name, work):
    for ob in objs:
        for slot in ob.material_slots:
            if slot.material is None:
                raise SystemExit(f"[map] {ob.name} has an empty material slot")
    C.unwrap(objs, margin=0.002)
    files = C.bake_atlas(objs, size, work, samples=32)
    final = C.export_material(name, files)
    for ob in objs:
        ob.data.materials.clear()
        ob.data.materials.append(final)
    return files


def export_map(out_dir, inst, protos, tex):
    """normandy.glb: covers, buildings and terrain. foliage.glb: instanced prototypes
    plus their placements in game coordinates (extras.instances)."""
    import tempfile

    work = tempfile.mkdtemp(prefix="map-bake-")
    for o in [o for o in bpy.data.objects if o.name.endswith("_i")]:
        bpy.data.objects.remove(o)
    covers = bpy.data.objects["covers"]
    _bake_group([covers], tex, "covers_finish", os.path.join(work))
    os.makedirs(os.path.join(work, "b"), exist_ok=True)
    _bake_group(BUILT, tex // 2, "buildings_finish", os.path.join(work, "b"))
    # terrain: flat areas collapse to a few large faces; runtime shader does the surface
    terrain = bpy.data.objects["terrain"]
    dec = terrain.modifiers.new("flatten", "DECIMATE")
    dec.decimate_type = "DISSOLVE"
    dec.angle_limit = math.radians(0.5)
    tri = terrain.modifiers.new("tri", "TRIANGULATE")
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(terrain.evaluated_get(dg))
    terrain.modifiers.clear()
    terrain.data = me
    plain = bpy.data.materials.new("terrain")
    me.materials.clear()
    me.materials.append(plain)
    root = C.empty("map")
    root["splat"] = ["splat_a.png", "splat_b.png"]
    root["size"] = SIZE
    for ob in [covers, terrain] + BUILT:
        C.parent_keep(ob, root)
    C.export_glb(root, os.path.join(out_dir, "normandy.glb"), draco=True)

    # foliage and props: prototypes at the origin, placements as extras
    froot = C.empty("foliage")
    vis = bpy.data.collections.new("export_protos")
    bpy.context.scene.collection.children.link(vis)
    rows = {}
    for name, items in inst.items.items():
        flat_rows = []
        for x, y, z, yaw, sc, tilt in items:
            flat_rows += [x, y, z, yaw, sc, round(tilt[0], 4), round(tilt[1], 4)]
        rows[name] = flat_rows
        for i, o in enumerate(protos[name]):
            for c in list(o.users_collection):
                c.objects.unlink(o)
            vis.objects.link(o)
            o.hide_render = False
            o.name = f"{name}__{i}"
            C.parent_keep(o, froot)
    froot["instances"] = json.dumps(rows, separators=(",", ":"))
    froot["stride"] = 7
    for img in bpy.data.images:  # bark is seen at metres, not centimetres
        if img.name.startswith("bark_brown_02") and img.size[0] > 1024:
            img.scale(1024, 1024)
    C.export_glb(froot, os.path.join(out_dir, "foliage.glb"), draco=True)
    report = {}
    for key in ("normandy", "foliage"):
        report[key] = os.path.getsize(os.path.join(out_dir, f"{key}.glb"))
    report["terrain_tris"] = sum(len(p.vertices) - 2 for p in terrain.data.polygons)
    report["cover_tris"] = sum(len(p.vertices) - 2 for p in covers.data.polygons)
    report["building_tris"] = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in BUILT)
    report["instances"] = {k: len(v) // 7 for k, v in rows.items()}
    report["proto_tris"] = {k: sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in protos[k]) for k in rows}
    report["visible_instance_tris"] = sum(report["proto_tris"][k] * report["instances"][k] for k in rows)
    print("[map] export " + json.dumps(report))


# ------------------------------------------------------------ review renders


def place_tank(path, x, z, yaw):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = next(o for o in new if "track_path" in o.keys())
    link = next(o for o in new if o.name.startswith("track_link"))
    root.location = B(x, z)
    root.rotation_euler = (0, 0, yaw)
    tp = list(root["track_path"])
    pts = list(zip(tp[::2], tp[1::2]))
    count = int(root["track_links"])
    seg = [math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    total = sum(seg)
    for side in (-1, 1):
        for n in range(count):
            s, i, acc = n * total / count, 0, 0.0
            while acc + seg[i] < s:
                acc += seg[i]
                i += 1
            a, b = pts[i], pts[(i + 1) % len(pts)]
            t = (s - acc) / seg[i]
            ob = link.copy()
            bpy.context.scene.collection.objects.link(ob)
            ob.parent = root
            ob.matrix_parent_inverse.identity()
            ob.location = (side * root["track_x"], -(a[0] + (b[0] - a[0]) * t), a[1] + (b[1] - a[1]) * t)
            ob.rotation_euler = (math.atan2(-(b[1] - a[1]), b[0] - a[0]), 0, 0)
    link.hide_render = True


def place_tanks(tanks):
    place_tank(os.path.join(tanks, "sherman.glb"), 0, 0, 0)
    place_tank(os.path.join(tanks, "panzer.glb"), 0, -13, math.pi)
    place_tank(os.path.join(tanks, "tiger.glb"), 4, -29, math.pi + 0.3)


def render(out, tanks, samples, detailed_views=False, only=None):
    scene = bpy.context.scene
    if tanks:
        place_tanks(tanks)
    C.use_gpu(scene, samples)
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("sky")
    scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    nt = world.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(C.ROOT, "public", "art", "sky", "kloofendal_48d_partly_cloudy_puresky_1k.hdr"))
    bg = nt.nodes["Background"]
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.9
    if detailed_views:
        add_fog(scene)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(2.5)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    scene.collection.objects.link(sun)

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.clip_end = 1000

    def look(loc, target):
        cam.location = loc
        d = Vector(target) - Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    views = []
    # overhead plan, north (game -z) up
    views.append(("overhead", dict(ortho=300), (0, 0, 400), (0, 0.001, 0)))
    # player's gunner view: 2.85 m eye, 1.9 m ahead of the hull centre, game fov 65 deg vertical
    views.append(("gunner", dict(fov=65), B(0, -1.9, 2.85), B(0, -60, 1.2)))
    views.append(("southwest", dict(lens=28), B(-75, 80, 32), B(5, -20, 0)))
    views.append(("northeast", dict(lens=28), B(70, -95, 26), B(0, 0, 0)))
    if detailed_views:
        views.append(("farm_store", dict(lens=30), B(5, -9, 2.2), B(17, -22, 3.2)))
        views.append(("door", dict(lens=35), B(16, -15, 1.8), B(16.6, -20, 1.6)))
        views.append(("wall", dict(lens=32), B(-7, -12, 1.8), B(1, -17.5, 1.3)))
        views.append(("hedge", dict(lens=30), B(-28, 28, 2.6), B(-50, 46, 3.5)))
        views.append(("village", dict(lens=40), B(10, -44, 4.0), B(10, -150, 12)))
    for name, lens, loc, target in views:
        if only and name not in only.split(","):
            continue
        cam.data.type = "ORTHO" if "ortho" in lens else "PERSP"
        if "ortho" in lens:
            cam.data.ortho_scale = lens["ortho"]
        elif "fov" in lens:
            cam.data.sensor_fit = "VERTICAL"
            cam.data.angle = math.radians(lens["fov"])
        else:
            cam.data.sensor_fit = "AUTO"
            cam.data.lens = lens["lens"]
        look(loc, target)
        scene.render.filepath = os.path.join(out, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[map] rendered {scene.render.filepath}")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = dict(zip(argv[::2], argv[1::2]))
    C.check_version()
    stage = args.get("--stage", "blockout")
    if stage == "render":  # re-render a saved detailed build
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args["--blend"]))
        for o in [o for o in bpy.data.objects if o.name in ("haze", "cam", "sun")]:
            bpy.data.objects.remove(o)
        review = os.path.abspath(args["--render"])
        os.makedirs(review, exist_ok=True)
        render(review, None, int(args.get("--samples", 32)), True, args.get("--views"))
        return
    C.reset_scene()
    out = os.path.abspath(args.get("--out", os.path.join(C.ROOT, "public", "art", "map")))
    os.makedirs(out, exist_ok=True)
    if stage == "blockout":
        layout()
    else:
        inst, protos = detailed(out)
        if stage == "final":
            export_map(out, inst, protos, int(args.get("--tex", 4096)))
            return
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == "MESH" and not o.hide_render)
    print(f"[map] {stage} objects={len(bpy.data.objects)} triangles_rendered={tris}")
    if "--render" in args:
        review = os.path.abspath(args["--render"])
        os.makedirs(review, exist_ok=True)
        if stage != "blockout" and "--blend" in args:
            if args.get("--tanks"):
                place_tanks(args["--tanks"])
            bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args["--blend"]))
        render(review, None if "--blend" in args else args.get("--tanks"), int(args.get("--samples", 32)), stage != "blockout", args.get("--views"))


main()
