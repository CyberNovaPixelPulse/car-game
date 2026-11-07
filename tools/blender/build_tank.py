"""Build one tank model and export it as a glTF binary.

Blender --background --factory-startup --python tools/blender/build_tank.py -- \
    --kind sherman --out public/art/vehicles/sherman.glb [--tex 2048]

Node contract read by web/tank-vehicle-model.ts:
  tank            root, origin at ground centre, forward -Z (Blender +Y).
                  extras: kind, track_x, track_path [z,y,...], track_length, track_links
  turret          yaw pivot on the ring centre
  elevation       child of turret, pitch pivot on the trunnions
  muzzle          child of elevation, at the bore exit
  hull / running_gear / turret_shell / gun   static meshes
  wheel_*         spinning wheels, extras.spin_r (rolling radius)
  track_link      one link, template for the runtime instanced track
  <name>_lod1     decimated sibling of every mesh above, shown beyond close range
Markings are fictional turret numbers, a crew name and generic bridge-class
discs only: no national insignia or real unit identity.
"""

import json
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

import common as C  # noqa: E402

S = (-1, 1)
PI = math.pi

LOOKS = {
    # linear-ish colours; olive drab weathered toward a dusty khaki-green
    # olive drab with hard-edged black disruptive patches, campaign-worn
    "sherman": dict(base=(0.062, 0.066, 0.036, 1), camo=[((0.008, 0.008, 0.007, 1), 0.8, 0.515)], camo_edge=0.008,
                    wear=0.95, dust=0.45, mud=0.95, zimmerit=False),
    # dunkelgelb with soft sprayed olive and red-brown bands; zimmerit only on armour
    "panzer": dict(base=(0.43, 0.33, 0.15, 1), camo=[((0.07, 0.085, 0.04, 1), 0.7, 0.515), ((0.13, 0.045, 0.022, 1), 0.85, 0.545)],
                   camo_edge=0.03, wear=0.85, dust=0.45, mud=0.95, zimmerit=False, streak=0.45),
    "tiger": dict(base=(0.45, 0.34, 0.155, 1), camo=[((0.075, 0.09, 0.045, 1), 0.6, 0.52), ((0.14, 0.05, 0.025, 1), 0.75, 0.55)],
                  camo_edge=0.03, wear=0.85, dust=0.5, mud=0.95, zimmerit=False, streak=0.45),
}


def materials(kind):
    look = LOOKS[kind]
    return {
        "paint": C.make_surface_material(f"{kind}_paint", look, "paint"),
        "cast": C.make_surface_material(f"{kind}_cast", look, "paint", cast=1.0),
        "steel": C.make_surface_material(f"{kind}_steel", look, "steel"),
        "rubber": C.make_surface_material(f"{kind}_rubber", look, "rubber"),
        "dark": C.make_surface_material(f"{kind}_dark", look, "dark"),
        "canvas": C.make_surface_material(f"{kind}_canvas", look, "canvas"),
        # markings: brushed paint that weathers with the plate but carries no camouflage
        "mark_white": C.make_surface_material(f"{kind}_mark_white", {**look, "base": (0.5, 0.5, 0.45, 1), "camo": []}, "paint"),
        "mark_yellow": C.make_surface_material(f"{kind}_mark_yellow", {**look, "base": (0.55, 0.38, 0.03, 1), "camo": []}, "paint"),
        "mark_black": C.make_surface_material(f"{kind}_mark_black", {**look, "base": (0.012, 0.012, 0.01, 1), "camo": []}, "paint"),
        # anti-magnetic paste ridges on the armour plates only
        "zim": C.make_surface_material(f"{kind}_zim", {**look, "zimmerit": True}, "paint"),
    }


# ------------------------------------------------------------ shared parts


def road_wheel_dual(k, group, r, half, tyre=0.04, dish=True, bolts=6, steel_rim=False, ribs=0):
    """Two discs sharing a hub with a centre gap for the track guide horns."""
    inner = r - tyre
    for sgn in (-1, 1):
        a, b = 0.012, half
        ring = [(inner, a), (r - 0.008, a), (r, a + 0.01), (r, b - 0.01), (r - 0.008, b), (inner, b)]
        k.lathe(group, [(rr, sgn * h) for rr, h in ring], 40, rot=(0, PI / 2, 0), mat="steel" if steel_rim else "rubber", closed=True, smooth=50)
    prof = [(0, -half - 0.03), (0.055, -half - 0.03), (0.07, -half - 0.012), (inner * 0.62, -half + (0.02 if dish else 0.004)),
            (inner + 0.004, -half + 0.008), (inner + 0.004, -0.01), (inner * 0.7, 0.0)]
    prof = prof + [(rr, -h) for rr, h in reversed(prof)]
    k.lathe(group, prof, 40, rot=(0, PI / 2, 0), mat="paint", smooth=45)
    for sgn in (-1, 1):  # pressed spokes stand proud of the dish
        for i in range(ribs):
            a = 2 * PI * (i + 0.5) / ribs
            mid = (0.075 + inner * 0.9) / 2
            k.box(group, (0.022, 0.035, inner * 0.9 - 0.075), (sgn * (half - 0.004), math.cos(a) * mid, math.sin(a) * mid),
                  rot=(a - PI / 2, 0, 0), bevel=0.01, segs=2)
    for sgn in (-1, 1):
        for i in range(bolts):
            a = 2 * PI * i / bolts
            k.cyl(group, 0.011, 0.02, (0, math.cos(a) * 0.045, math.sin(a) * 0.045), rot=(0, PI / 2, 0), mat="steel", segs=6, bevel=0)
            # bolts are placed at the axle origin; shift to each face
            k.groups[group][-1].location.x = sgn * (half + 0.03)


def sprocket(k, group, pitch_r, teeth, half, hub_r=0.12):
    for sgn in (-1, 1):
        x = sgn * half
        k.cyl_x(group, pitch_r - 0.035, 0.028, (x, 0, 0), mat="steel", segs=48, bevel=0.004)
        for i in range(teeth):
            a = 2 * PI * (i + 0.5) / teeth
            k.box(group, (0.03, 0.055, 0.075), (x, math.cos(a) * (pitch_r + 0.005), math.sin(a) * (pitch_r + 0.005)),
                  rot=(a - PI / 2, 0, 0), mat="steel", bevel=0.008)
    prof = [(0, -half - 0.09), (hub_r * 0.6, -half - 0.09), (hub_r, -half - 0.05), (pitch_r * 0.7, -half - 0.01),
            (pitch_r * 0.82, -half), (pitch_r * 0.82, -half + 0.02), (hub_r, 0.0)]
    prof = prof + [(rr, -h) for rr, h in reversed(prof)]
    k.lathe(group, prof, 40, mat="paint", rot=(0, PI / 2, 0), smooth=45)
    for i in range(10):
        a = 2 * PI * i / 10
        k.cyl(group, 0.014, 0.03, (-half - 0.075, math.cos(a) * hub_r * 0.75, math.sin(a) * hub_r * 0.75), rot=(0, PI / 2, 0), mat="steel", segs=6, bevel=0)


def link_bm(width, pitch, kind):
    """One track link in its own frame: X across, Y along the run, -Z outward."""
    bm = bmesh.new()

    def add(src):
        me = bpy.data.meshes.new("tmp")
        src.to_mesh(me)
        src.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    body = pitch * 0.95
    if kind == "sherman":  # T48 rubber chevron block on a steel backing
        add(C.bm_box((width * 0.88, body, 0.03), (0, 0, 0.022)))
        add(C.bm_box((width * 0.93, body * 0.94, 0.042), (0, 0, -0.016)))
        for sx in S:
            add(C.bm_box((width * 0.42, 0.034, 0.022), (sx * width * 0.21, 0.0, -0.045), (0, 0, sx * 0.42)))
        for sx in S:  # end connectors clamp the shared pin between two links
            add(C.bm_box((0.034, 0.05, 0.046), (sx * width * 0.52, pitch * 0.5, 0.004)))
        add(C.bm_box((0.026, 0.075, 0.07), (0, 0, 0.068)))
    else:  # cast steel links with grousers and a centre guide horn
        add(C.bm_box((width, body, 0.03), (0, 0, -0.012)))
        add(C.bm_box((width * 0.96, 0.03, 0.022), (0, 0.0, -0.036)))
        horn = 0.09 if kind == "tiger" else 0.07  # one centre guide horn runs between the wheel discs
        add(C.bm_box((0.026, body * 0.6, horn), (0, 0, 0.004 + horn / 2)))
        for sx in S:
            add(C.bm_cyl(0.022, width * 0.47, 10, (sx * width * 0.25, -pitch * 0.47, -0.005), (0, PI / 2, 0)))
    add(C.bm_cyl(0.02, width * 1.08, 10, (0, pitch * 0.5, 0), (0, PI / 2, 0)))
    return bm


# ------------------------------------------------------------ sherman


def build_sherman(k):
    H = "hull"
    xt, track_w, pitch = 1.08, 0.42, 0.152

    # lower hull tub between the tracks
    k.hull(H, [(sx * 0.82, y, z) for sx in S for y, z in [(2.25, 0.44), (2.25, 1.22), (-2.98, 1.22), (-2.98, 0.6), (-2.8, 0.43)]], bevel=0.02)
    # one-piece cast differential housing (rounded nose)
    prof = [(2.15, 1.25), (2.55, 1.18), (2.84, 1.01), (2.99, 0.8), (2.97, 0.62), (2.82, 0.49), (2.5, 0.42), (2.15, 0.42)]
    cy, cz = 2.6, 0.83
    pts = [(sx * 0.86, y, z) for sx in S for y, z in prof]
    pts += [(sx * 0.96, cy + (y - cy) * 0.9, cz + (z - cz) * 0.86) for sx in S for y, z in prof]
    k.hull(H, pts, mat="cast", bevel=0.03, segs=3, smooth=55)
    for sx in S:  # final drive housings
        k.cyl_x(H, 0.2, 0.16, (sx * 0.9, 2.53, 0.8), mat="cast", segs=32, bevel=0.015)
        for z in (0.66, 0.94):
            k.bolts(H, [(sx * 0.82, y, z) for y in (2.2, 2.3, 2.4)], "x")
    # tow clevises
    for sx in S:
        k.box(H, (0.12, 0.13, 0.16), (sx * 0.6, 2.93, 0.6), mat="cast", bevel=0.02)
        k.cyl_x(H, 0.032, 0.2, (sx * 0.6, 2.97, 0.58), mat="steel", segs=12)

    # upper hull: sponsons over the tracks, 56 degree welded glacis
    gy0, gz0, gy1, gz1 = 2.18, 1.22, 1.05, 1.98
    k.hull(H, [(sx * 1.28, y, z) for sx in S for y, z in [(gy0, gz0), (gy1, gz1), (-2.86, 1.98), (-3.02, 1.22)]], bevel=0.018)
    slope = (gz1 - gz0) / (gy0 - gy1)
    gl = lambda y: gz0 + (gy0 - y) * slope  # noqa: E731
    g_rot = (-math.atan2(gy0 - gy1, gz1 - gz0) + PI / 2 - PI / 2, 0, 0)
    tilt = math.atan(slope)  # glacis angle from horizontal
    on_glacis = (tilt - PI / 2, 0, 0)  # thin parts lying on the plate
    for sx in S:
        k.weld(H, (sx * 1.28, gy0, gz0), (sx * 1.28, gy1, gz1))
        k.weld(H, (sx * 1.28, gy0, gz0), (sx * 1.28, -3.02, gz0))
    k.weld(H, (-1.28, gy1, gz1), (1.28, gy1, gz1))
    k.weld(H, (-1.28, gy0, gz0), (1.28, gy0, gz0))

    # driver and co-driver hoods with hatches and periscopes
    for c in (-0.5, 0.5):
        pts = []
        for dx in (-0.25, 0.25):
            pts += [(c + dx, 1.72, gl(1.72) - 0.03), (c + dx, 1.72, 2.0), (c + dx * 0.9, 1.66, 2.045), (c + dx * 0.9, 1.1, 2.045), (c + dx, 1.08, 1.96)]
        k.hull(H, pts, mat="cast", bevel=0.035, segs=3)
        k.box(H, (0.2, 0.02, 0.035), (c, 1.726, 1.88), mat="dark", bevel=0)
        k.box(H, (0.42, 0.46, 0.022), (c, 1.38, 2.056), bevel=0.008)
        k.cyl_x(H, 0.024, 0.34, (c, 1.13, 2.065), mat="steel", segs=10)
        k.box(H, (0.1, 0.17, 0.075), (c + 0.1, 1.5, 2.1), bevel=0.01)
        k.box(H, (0.085, 0.012, 0.05), (c + 0.1, 1.586, 2.1), mat="dark", bevel=0)
        k.bar(H, (c - 0.12, 1.25, 2.075), (c - 0.12, 1.4, 2.075), 0.02, 0.02)
    # bow machine gun ball mount
    bx, by = 0.98, 1.72
    nrm = (0, math.sin(tilt), math.cos(tilt))
    k.add(H, C.bm_sphere(0.1, (bx, by + 0.02, gl(by) + 0.03), segs=20, rings=12), "cast", 0.0)
    k.cyl(H, 0.14, 0.05, (bx, by, gl(by) + 0.01), rot=(-(PI / 2 - tilt), 0, 0), mat="cast", segs=28)
    k.strut(H, (bx, by + 0.09, gl(by) + 0.06), (bx, by + 0.42, gl(by) + 0.04), 0.017, mat="dark")
    # headlights with brush guards
    for sx in S:
        x, y = sx * 1.06, 1.98
        k.cyl_y(H, 0.075, 0.13, (x, y + 0.02, gl(y) + 0.13), mat="steel", segs=20)
        k.cyl_y(H, 0.062, 0.01, (x, y + 0.09, gl(y) + 0.13), mat="dark", segs=20, bevel=0)
        for dx in (-0.12, 0.12):
            k.strut(H, (x + dx, y - 0.1, gl(y - 0.1)), (x + dx, y + 0.14, gl(y) + 0.26), 0.012)
        k.strut(H, (x - 0.12, y + 0.14, gl(y) + 0.26), (x + 0.12, y + 0.14, gl(y) + 0.26), 0.012)
    # spare track blocks on the lower glacis
    for i, x in enumerate((-0.84, -0.66, 0.66, 0.84)):
        bm = link_bm(track_w, pitch, "sherman")
        bm.transform(C.mat4((x, 2.06, gl(2.06) + 0.04), (tilt - PI / 2, 0, PI / 2)))
        k.add(H, bm, "rubber", 0.0)
    # appliqué armour on the sponsons
    for sx, y0, y1 in ((1, 0.12, 0.88), (-1, 0.3, 0.98)):
        x = sx * 1.2925
        k.box(H, (0.025, y1 - y0, 0.56), (x, (y0 + y1) / 2, 1.62), bevel=0.006)
        for z in (1.34, 1.9):
            k.weld(H, (x, y0, z), (x, y1, z))
    # sand-shield rails and fenders
    for sx in S:
        k.bar(H, (sx * 1.3, 2.15, 1.21), (sx * 1.3, -3.0, 1.21), 0.04, 0.03, mat="paint")
        k.box(H, (0.45, 0.6, 0.012), (sx * 1.07, 2.44, 1.2), rot=(-0.18, 0, 0), bevel=0.003)
        k.box(H, (0.45, 0.42, 0.012), (sx * 1.07, -3.18, 1.2), rot=(0.12, 0, 0), bevel=0.003)
    # engine deck: access doors, fuel caps, grille, tools
    for sx in S:
        k.box(H, (0.86, 1.06, 0.016), (sx * 0.47, -1.82, 1.988), bevel=0.004)
        for y in (-1.42, -2.22):
            k.cyl_y(H, 0.022, 0.14, (sx * 0.06, y, 2.0), mat="steel", segs=10)
        k.bar(H, (sx * 0.47 - 0.1, -1.55, 2.01), (sx * 0.47 + 0.1, -1.55, 2.01), 0.018, 0.018)
        for y in (-1.05, -2.5):
            k.cyl(H, 0.07, 0.035, (sx * 1.07, y, 1.995), mat="steel", segs=20)
    k.box(H, (2.2, 0.36, 0.03), (0, -2.66, 1.985), bevel=0.006)
    for i in range(12):
        x = -0.99 + i * 0.18
        k.box(H, (0.025, 0.3, 0.04), (x, -2.66, 2.0), rot=(0, 0.6, 0), mat="dark", bevel=0)
    k.strut(H, (-1.12, -1.25, 2.02), (-1.12, -2.25, 2.02), 0.016, mat="paint")  # shovel
    k.box(H, (0.2, 0.28, 0.02), (-1.12, -2.4, 2.01), bevel=0.004, mat="steel")
    k.strut(H, (1.12, -1.2, 2.02), (1.12, -2.85, 2.02), 0.014, mat="steel")  # crowbar
    k.strut(H, (0.95, -1.2, 2.02), (0.95, -2.05, 2.02), 0.017, mat="paint")  # axe
    k.box(H, (0.06, 0.18, 0.025), (0.95, -1.2, 2.02), mat="steel", bevel=0.004)
    for y in (-1.5, -2.0):
        for x in (-1.12, 1.12, 0.95):
            k.box(H, (0.06, 0.04, 0.04), (x, y, 2.02), mat="steel", bevel=0.004)
    # rear plate: engine doors, deflector, lights, pintle
    rear = lambda z: -3.02 + (z - 1.22) * 0.16 / 0.76  # noqa: E731
    r_rot = (-math.atan(0.16 / 0.76), 0, 0)
    for sx in S:
        k.box(H, (0.9, 0.014, 0.58), (sx * 0.48, rear(1.6) - 0.008, 1.6), rot=r_rot, bevel=0.004)
        k.box(H, (0.1, 0.06, 0.07), (sx * 1.0, rear(1.86) - 0.04, 1.86), mat="steel", bevel=0.01)
        k.box(H, (0.07, 0.012, 0.045), (sx * 1.0, rear(1.86) - 0.072, 1.86), mat="dark", bevel=0)
        k.bar(H, (sx * 0.95, -3.0, 1.21), (sx * 0.88, -2.72, 0.47), 0.08, 0.1)  # idler arm
    k.hull(H, [(sx * 1.0, y, z) for sx in S for y, z in [(-3.0, 1.21), (-3.2, 1.13), (-3.26, 0.98), (-3.13, 0.9), (-2.98, 0.95)]], bevel=0.012, smooth=50)
    k.box(H, (0.16, 0.16, 0.12), (0, -3.05, 0.8), mat="steel", bevel=0.02)
    k.cyl(H, 0.05, 0.18, (0, -3.15, 0.8), mat="steel", segs=14)

    # ---- fittings: bolted housing flange, lifting eyes, siren, hinges, welds
    k.box(H, (1.86, 0.06, 0.035), (0, 2.17, 1.258), mat="cast", bevel=0.01)
    k.bolts(H, [(x / 10, 2.17, 1.28) for x in range(-9, 10, 1)], "z", r=0.02, h=0.022)
    for sx in S:
        k.bolts(H, [(sx * 0.875, y, z) for y, z in ((2.3, 1.15), (2.55, 1.08), (2.75, 0.95), (2.88, 0.78))], "x", r=0.02, h=0.03)
        k.eye(H, (sx * 1.15, 1.2, 1.99), "z")
        k.eye(H, (sx * 1.16, -2.8, 1.99), "z")
        for y in (-1.45, -2.2):
            k.cyl_y(H, 0.025, 0.12, (sx * 0.92, y, 2.0), mat="steel", segs=10)
        k.weld(H, (sx * 1.28, -0.45, 1.22), (sx * 1.28, -0.45, 1.98))
        k.weld(H, (sx * 1.28, -2.86, 1.98), (sx * 1.28, -3.02, 1.22))
        k.bolts(H, [(sx * 1.32, y / 10, 1.21) for y in range(-28, 21, 4)], "x", r=0.014, h=0.012)
    k.cyl_y(H, 0.075, 0.2, (0, 2.0, gl(2.0) + 0.1), mat="steel", segs=20)  # siren
    k.cyl_y(H, 0.06, 0.012, (0, 2.105, gl(2.0) + 0.1), mat="dark", segs=20, bevel=0)
    k.box(H, (0.05, 0.08, 0.08), (0, 1.95, gl(1.95) + 0.04), mat="steel", bevel=0.006)
    # tow cable along the left sponson with eye loops and clamps
    cz = 1.82
    k.strut(H, (-1.305, -0.15, cz), (-1.305, -2.6, cz), 0.022, mat="steel", segs=10)
    for y in (-0.15, -2.6):
        k.ring(H, 0.07, 0.018, (-1.305, y + (0.07 if y > -1 else -0.07), cz), rot=(0, PI / 2, 0), mat="steel")
    for y in (-0.6, -1.4, -2.2):
        k.box(H, (0.04, 0.05, 0.08), (-1.3, y, cz), mat="paint", bevel=0.006)
    # bedroll and tarpaulin roll strapped across the grille, crew kit bags
    k.cyl_x(H, 0.15, 1.7, (0, -2.5, 2.13), mat="canvas", segs=28, bevel=0.03, scale=(0.85, 1, 1))
    for x in (-0.6, 0.0, 0.6):
        k.ring(H, 0.152, 0.012, (x, -2.5, 2.13), rot=(0, PI / 2, 0), mat="rubber", segs=28, sides=4)
    for x, y, w in ((-0.55, -2.15, 0.42), (0.5, -2.12, 0.36)):
        k.box(H, (w, 0.3, 0.22), (x, y, 2.1), mat="canvas", bevel=0.07, segs=3)
        k.bar(H, (x - w / 2, y, 2.21), (x + w / 2, y, 2.21), 0.04, 0.008, mat="rubber")
    # two jerrycans racked over the exhaust deflector
    for x in (-0.62, 0.62):
        k.box(H, (0.17, 0.34, 0.46), (x, -3.12, 1.45), mat="paint", bevel=0.02)
        for sy in (-1, 1):
            k.bar(H, (x + sy * 0.086, -3.25, 1.27), (x + sy * 0.086, -2.99, 1.63), 0.008, 0.02, mat="paint")
            k.bar(H, (x + sy * 0.086, -2.99, 1.27), (x + sy * 0.086, -3.25, 1.63), 0.008, 0.02, mat="paint")
        for dy in (-0.06, 0.0, 0.06):
            k.bar(H, (x, -3.12 + dy, 1.68), (x, -3.12 + dy, 1.72), 0.03, 0.012, mat="paint")
        k.cyl(H, 0.03, 0.05, (x, -3.0, 1.69), mat="steel", segs=12)
        k.bar(H, (x - 0.11, -3.29, 1.3), (x + 0.11, -3.29, 1.3), 0.025, 0.025, mat="steel")
        k.bar(H, (x - 0.11, -3.29, 1.58), (x + 0.11, -3.29, 1.58), 0.025, 0.025, mat="steel")

    # ---- markings: bridge-class discs and a crew-painted name; no national or unit insignia
    gn = (0, math.sin(tilt), math.cos(tilt))
    dy = 1.56
    base = (-0.98, dy, gl(dy))
    k.disc(H, 0.1, [base[i] + gn[i] * 0.004 for i in range(3)], gn, "mark_yellow")
    k.decal(H, "30", 0.1, [base[i] + gn[i] * 0.0075 for i in range(3)], gn, "mark_black")
    rn = (0, -math.cos(math.atan(0.16 / 0.76)), math.sin(math.atan(0.16 / 0.76)))
    rb = (-0.3, rear(1.8), 1.8)  # on the left engine door, above the jerrycan
    k.disc(H, 0.1, [rb[i] + rn[i] * 0.019 for i in range(3)], rn, "mark_yellow")
    k.decal(H, "30", 0.1, [rb[i] + rn[i] * 0.0225 for i in range(3)], rn, "mark_black")
    for sx in S:
        k.decal(H, "BRAMBLE", 0.17, (sx * 1.2845, -1.55, 1.5), (sx, 0, 0), "mark_white")

    # running gear: three VVSS bogies per side, return rollers, idler
    RG = "gear"
    bogies = (1.62, 0.0, -1.62)
    wheel_r, link_half = 0.254, 0.0375
    wheel_z = 0.075 + wheel_r
    roll = []
    for sx in S:
        for yb in bogies:
            k.box(RG, (0.34, 0.5, 0.36), (sx * 0.99, yb, 0.8), bevel=0.03, mat="cast")
            k.box(RG, (0.08, 0.3, 0.06), (sx * 1.0, yb - 0.32, 0.93), bevel=0.01)
            k.box(RG, (0.12, 0.52, 0.025), (sx * xt, yb, 0.99), mat="steel", bevel=0.008)  # track skid
            k.bolts(RG, [(sx * 1.165, yb + dy, z) for dy in (-0.17, 0.17) for z in (0.7, 0.9)], "x", r=0.022, h=0.025)
            k.bolts(RG, [(sx * 0.83, yb + dy, z) for dy in (-0.2, 0, 0.2) for z in (0.68, 0.92)], "x", r=0.02, h=0.025)
            for i in range(4):
                k.cyl(RG, 0.075, 0.036, (sx * xt, yb, 0.47 + i * 0.045), mat="steel", segs=16, bevel=0.006)
            for dy in (-1, 1):
                for dx in (-0.135, 0.135):
                    k.bar(RG, (sx * xt + dx, yb + dy * 0.12, 0.66), (sx * xt + dx, yb + dy * 0.355, wheel_z), 0.04, 0.075, mat="paint")
            ry = yb - 0.36
            k.lathe(RG, [(0.07, -0.1), (0.115, -0.1), (0.115, 0.1), (0.07, 0.1)], 28, loc=(sx * xt, ry, 0.92), rot=(0, PI / 2, 0), mat="rubber", closed=True)
            k.cyl_x(RG, 0.075, 0.22, (sx * xt, ry, 0.92), mat="steel", segs=20)
            roll.append((ry, 0.92, 0.115 + link_half))
    k.realise(RG, "running_gear", {"dirt": 0.55})

    # spinning wheels (one mesh each, instanced per position)
    road_wheel_dual(k, "roadwheel", wheel_r, 0.115, ribs=5)
    rw = k.realise("roadwheel", "roadwheel_mesh", {"dirt": 0.8})
    sprocket(k, "sprocket", 0.32, 13, 0.11)
    sp = k.realise("sprocket", "sprocket_mesh", {"dirt": 0.6})
    road_wheel_dual(k, "idler", 0.24, 0.11, tyre=0.03, steel_rim=True, bolts=8)
    idl = k.realise("idler", "idler_mesh", {"dirt": 0.7})
    wheels = []
    circles = [(2.53, 0.8, 0.32), (-2.72, 0.45, 0.24 + link_half)] + list({(y, z, r) for y, z, r in roll if True})
    i = 0
    for yb in bogies:
        for dy in (-0.355, 0.355):
            circles.append((yb + dy, wheel_z, wheel_r + link_half))
            wheels.append((rw, (yb + dy, wheel_z), wheel_r))
    wheels.append((sp, (2.53, 0.8), 0.32))
    wheels.append((idl, (-2.72, 0.45), 0.24))

    # link template
    k.add("link", link_bm(track_w, pitch, "sherman"), "rubber", 0.0)
    link = k.realise("link", "track_link", {"dirt": 1.0})

    # turret: cast shell lofted through superellipse sections
    T = "turret"
    # upright cast walls with a broad flat roof, not a dome
    rings = [(1.99, 0.95, 0.9, 1.2), (2.08, 0.99, 0.95, 1.27), (2.3, 1.0, 0.96, 1.3), (2.5, 0.985, 0.93, 1.27),
             (2.62, 0.95, 0.87, 1.21), (2.7, 0.89, 0.79, 1.12), (2.745, 0.81, 0.7, 1.02), (2.76, 0.76, 0.64, 0.96)]
    k.add(T, C.bm_loft([C.superellipse(z, hx, f, r, 2.9, 80, cy=-0.04) for z, hx, f, r in rings]), "cast", 0.0, smooth=50)
    # casting parting line round the wall and a weld fillet at the ring
    k.add(T, C.bm_loft([C.superellipse(z, hx, f, r, 2.9, 80, cy=-0.04) for z, hx, f, r in
                        [(2.395, 1.0, 0.955, 1.295), (2.405, 1.006, 0.961, 1.301), (2.415, 1.0, 0.955, 1.295)]]), "cast", 0.0, smooth=70)
    # rotor shield: a curved cast plate following the turret face
    pts = []
    for deg in range(-34, 35, 4):
        a = math.radians(deg)
        for R in (0.9, 1.0):
            for z in (2.12, 2.58):
                inset = 0.02 if z > 2.5 else 0.0
                pts.append((math.sin(a) * (R - inset), -0.04 + math.cos(a) * (R - inset), z))
    k.hull(T, pts, mat="cast", bevel=0.025, segs=3, smooth=50)
    k.cyl(T, 0.94, 0.07, (0, 0, 1.97), mat="paint", segs=64)
    # commander's split hatch, loader's hatch, periscopes, ventilator
    roof = 2.76
    # commander's split hatch: raised ring, two half doors, hinges, handles
    hx_, hy_ = 0.32, -0.3
    k.cyl(T, 0.3, 0.08, (hx_, hy_, roof - 0.005), mat="cast", segs=48, bevel=0.012)
    k.ring(T, 0.29, 0.012, (hx_, hy_, roof + 0.035), mat="paint", segs=48)
    for sy in S:
        pts = []
        for i in range(25):
            a = PI * i / 24
            for z in (roof + 0.035, roof + 0.062):
                pts.append((hx_ + math.cos(a) * 0.262, hy_ + sy * (0.006 + math.sin(a) * 0.262), z))
        k.hull(T, pts, mat="paint", bevel=0.006)
        k.bar(T, (hx_ - 0.08, hy_ + sy * 0.13, roof + 0.075), (hx_ + 0.08, hy_ + sy * 0.13, roof + 0.075), 0.016, 0.016, mat="steel")
        for x in (hx_ - 0.08, hx_ + 0.08):
            k.box(T, (0.016, 0.016, 0.03), (x, hy_ + sy * 0.13, roof + 0.065), mat="steel", bevel=0.003)
        k.cyl_x(T, 0.02, 0.16, (hx_, hy_ + sy * 0.25, roof + 0.05), mat="steel", segs=10)
    # loader's oval hatch with hinge and handle
    k.cyl(T, 0.2, 0.05, (-0.34, -0.12, roof + 0.005), scale=(1.0, 1.35, 1.0), mat="paint", segs=40, bevel=0.008)
    k.ring(T, 0.19, 0.01, (-0.34, -0.12, roof + 0.03), mat="paint", segs=40)
    k.cyl_x(T, 0.022, 0.22, (-0.34, -0.42, roof + 0.03), mat="steel", segs=10)
    k.bar(T, (-0.4, 0.02, roof + 0.05), (-0.28, 0.02, roof + 0.05), 0.016, 0.016, mat="steel")
    # rotating periscopes: armoured base, head and guard bars
    for x, y in ((0.3, 0.3), (-0.34, 0.32)):
        k.cyl(T, 0.1, 0.04, (x, y, roof), mat="cast", segs=24, bevel=0.008)
        k.box(T, (0.12, 0.2, 0.1), (x, y, roof + 0.07), bevel=0.012)
        k.box(T, (0.1, 0.012, 0.05), (x, y + 0.104, roof + 0.08), mat="dark", bevel=0)
        k.box(T, (0.16, 0.035, 0.12), (x, y + 0.15, roof + 0.07), bevel=0.008)
        for dx in (-0.08, 0.08):
            k.strut(T, (x + dx, y - 0.1, roof + 0.01), (x + dx, y + 0.14, roof + 0.16), 0.008, mat="paint", segs=6)
    # ventilator dome, smoke mortar, antenna, pistol port, lifting eyes, grab rails
    k.cyl(T, 0.15, 0.03, (0.0, -0.74, roof), mat="cast", segs=32)
    k.add(T, C.bm_sphere(0.12, (0.0, -0.74, roof + 0.02), (1, 1, 0.55)), "cast", 0.0)
    for i in range(8):
        a = 2 * PI * i / 8
        k.box(T, (0.012, 0.035, 0.02), (math.cos(a) * 0.12, -0.74 + math.sin(a) * 0.12, roof + 0.03), rot=(0, 0, a), mat="dark", bevel=0)
    k.cyl(T, 0.045, 0.17, (-0.62, 0.34, roof + 0.06), rot=(-0.75, 0.25, 0), mat="steel", segs=16)
    k.cyl(T, 0.065, 0.05, (-0.62, 0.28, roof + 0.0), mat="cast", segs=20)
    k.cyl(T, 0.06, 0.12, (-0.66, -0.92, roof - 0.08), mat="steel", segs=16)
    k.cyl(T, 0.035, 0.08, (-0.66, -0.92, roof + 0.02), mat="dark", segs=12)
    k.strut(T, (-0.66, -0.92, roof + 0.05), (-0.66, -0.98, 4.3), 0.006, mat="dark", segs=6)
    k.cyl_x(T, 0.085, 0.06, (-0.99, -0.25, 2.3), mat="cast", segs=24)
    k.cyl_x(T, 0.03, 0.04, (-1.03, -0.25, 2.3), mat="steel", segs=12)
    for sx in S:
        k.eye(T, (sx * 0.82, 0.32, 2.66), "x")
        k.eye(T, (sx * 0.68, -0.98, 2.68), "x")
        k.strut(T, (sx * 0.97, -0.55, 2.4), (sx * 0.97, -0.95, 2.38), 0.014, mat="steel", segs=8)
        for y in (-0.55, -0.95):
            k.strut(T, (sx * 0.97, y, 2.4 - (0.02 if y < -0.7 else 0)), (sx * 0.93, y, 2.4 - (0.02 if y < -0.7 else 0)), 0.012, mat="steel", segs=8)
    # .50 calibre M2 on the commander's pintle: receiver, cradle, jacketed barrel, grips, ammo box
    px, py = 0.32, -0.62
    k.cyl(T, 0.028, 0.3, (px, py, roof + 0.13), mat="steel", segs=12)
    k.box(T, (0.06, 0.12, 0.06), (px, py + 0.04, roof + 0.29), mat="steel", bevel=0.006)
    k.box(T, (0.1, 0.4, 0.13), (px, py + 0.1, roof + 0.36), mat="steel", bevel=0.01)
    k.box(T, (0.11, 0.16, 0.03), (px, py + 0.18, roof + 0.44), mat="steel", bevel=0.006)
    k.lathe(T, [(0, 0), (0.033, 0), (0.033, 0.3), (0.026, 0.32), (0.022, 0.32), (0.022, 1.08), (0.028, 1.1), (0.028, 1.15), (0.012, 1.15), (0, 1.12)],
            20, loc=(px, py + 0.3, roof + 0.36), rot=(-PI / 2, 0, 0), mat="steel")
    for i in range(6):
        k.box(T, (0.07, 0.025, 0.01), (px, py + 0.34 + i * 0.045, roof + 0.392), mat="dark", bevel=0)
    for dx in (-0.045, 0.045):
        k.strut(T, (px + dx, py - 0.1, roof + 0.36), (px + dx, py - 0.2, roof + 0.3), 0.014, mat="dark", segs=8)
    k.box(T, (0.1, 0.27, 0.18), (px + 0.14, py + 0.1, roof + 0.33), mat="paint", bevel=0.008)
    k.box(T, (0.06, 0.02, 0.012), (px + 0.14, py + 0.1, roof + 0.428), mat="steel", bevel=0.002)
    for sx in S:  # fictional turret number
        k.decal(T, "21", 0.26, (sx * 1.008, 0.08, 2.2), (sx, 0, 0), "mark_white")

    # gun, mantlet and coax on the elevation pivot
    G = "gun"
    tz, ty = 2.38, 0.30
    pts = []
    for deg in range(-21, 22, 3):
        a = math.radians(deg)
        for R in (0.7, 0.79):
            for sx in S:
                w = 0.36 - 0.03 * (abs(deg) / 21) ** 2
                pts.append((sx * w, ty + R * math.cos(a), tz + R * math.sin(a)))
    k.hull(G, pts, mat="cast", bevel=0.03, segs=3, smooth=40)
    k.cyl_y(G, 0.105, 0.3, (0, 1.2, tz), mat="cast", segs=32)
    barrel = [(0, 0), (0.076, 0), (0.07, 0.05), (0.064, 1.2), (0.058, 2.15), (0.078, 2.18), (0.078, 2.42), (0.06, 2.45),
              (0.06, 2.58), (0.064, 2.6), (0.0375, 2.6), (0.0375, 2.45), (0, 2.45)]
    k.lathe(G, barrel, 32, loc=(0, 1.35, tz), rot=(-PI / 2, 0, 0), mat="paint", smooth=40)
    k.cyl_y(G, 0.0374, 0.004, (0, 1.35 + 2.452, tz), mat="dark", segs=20, bevel=0)
    k.strut(G, (0.22, 1.02, tz - 0.05), (0.22, 1.24, tz - 0.05), 0.016, mat="dark")
    k.cyl_y(G, 0.03, 0.04, (-0.22, 1.09, tz + 0.1), mat="dark", segs=14, bevel=0)

    return dict(
        xt=xt, trunnion=(ty, tz), muzzle=1.35 + 2.6, ring_z=1.98, circles=circles, wheels=wheels,
        link=link, pitch=pitch,
    )


# ------------------------------------------------------------ german shared parts


def frame(o, X, Y, Z):
    """Matrix whose columns are the given axes, placed at o."""
    return Matrix(((X[0], Y[0], Z[0], o[0]), (X[1], Y[1], Z[1], o[1]), (X[2], Y[2], Z[2], o[2]), (0, 0, 0, 1)))


def plate(k, group, p0, p1, z0, z1, t=0.012, lean=0.0, mat="paint", bevel=0.003):
    """Thin plate standing on the plan segment p0->p1; its top shifts by lean * height
    toward the left of p0->p1 (negative leans it to the right)."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    length = math.hypot(dx, dy)
    nx, ny = -dy / length, dx / length
    h = z1 - z0
    pts = []
    for (x, y), z, s in ((p0, z0, 0), (p1, z0, 0), (p0, z1, 1), (p1, z1, 1)):
        ox, oy = x + nx * lean * h * s, y + ny * lean * h * s
        for e in (-t / 2, t / 2):
            pts.append((ox + nx * e, oy + ny * e, z))
    return k.hull(group, pts, mat=mat, bevel=bevel)


def tube_idler(k, group, r, half, spokes=8):
    """Welded tubular idler: two tube rims on spokes round a cast hub."""
    for sgn in S:
        k.ring(group, r - 0.03, 0.03, (sgn * half, 0, 0), rot=(0, PI / 2, 0), mat="steel", segs=40, sides=10)
        for i in range(spokes):
            a = 2 * PI * (i + (0.5 if sgn > 0 else 0)) / spokes
            k.strut(group, (sgn * 0.03, math.cos(a) * 0.08, math.sin(a) * 0.08),
                    (sgn * half, math.cos(a) * (r - 0.05), math.sin(a) * (r - 0.05)), 0.018, mat="paint", segs=8)
    k.cyl_x(group, 0.1, 2 * half + 0.06, (0, 0, 0), mat="paint", segs=24)
    k.cyl_x(group, 0.055, 2 * half + 0.16, (0, 0, 0), mat="steel", segs=16)
    for sgn in S:
        k.bolts(group, [(sgn * (half + 0.08), math.cos(2 * PI * i / 6) * 0.04, math.sin(2 * PI * i / 6) * 0.04) for i in range(6)], "x", r=0.01, h=0.02, mat="steel")


def interleaved_wheel(k, group, offsets, r=0.4):
    """One torsion-bar axle of an interleaved set: single rubber-tyred discs at
    the given offsets on a hub tube reaching back to the arm."""
    for dx in offsets:
        k.lathe(group, [(r - 0.055, -0.045), (r - 0.006, -0.045), (r, -0.035), (r, 0.035), (r - 0.006, 0.045), (r - 0.055, 0.045)],
                48, loc=(dx, 0, 0), rot=(0, PI / 2, 0), mat="rubber", closed=True, smooth=50)
        prof = [(0, -0.06), (0.09, -0.06), (0.11, -0.035), (r * 0.72, -0.018), (r - 0.052, -0.04), (r - 0.052, 0.04),
                (r * 0.72, 0.018), (0.11, 0.035), (0.09, 0.06), (0, 0.06)]
        k.lathe(group, prof, 48, loc=(dx, 0, 0), rot=(0, PI / 2, 0), mat="paint", smooth=45)
        side = 1 if dx > 0 else -1
        k.bolts(group, [(dx + side * 0.065, math.cos(2 * PI * i / 8) * 0.075, math.sin(2 * PI * i / 8) * 0.075) for i in range(8)],
                "x", r=0.012, h=0.02, mat="steel")
        for i in range(12):  # rim bolts holding the tyre ring
            a = 2 * PI * i / 12
            k.cyl(group, 0.009, 0.1, (dx, math.cos(a) * (r - 0.075), math.sin(a) * (r - 0.075)), rot=(0, PI / 2, 0), mat="steel", segs=6, bevel=0)
    lo, hi = -0.42, max(offsets)
    k.cyl_x(group, 0.065, hi - lo, (0.5 * (lo + hi), 0, 0), mat="steel", segs=20)
    k.cyl_x(group, 0.08, 0.05, (hi + 0.08, 0, 0), mat="steel", segs=20)
    k.cyl_x(group, 0.045, 0.03, (hi + 0.115, 0, 0), mat="steel", segs=14)


# ------------------------------------------------------------ panzer iv H


def build_panzer(k):
    H, Z = "hull", "zim"
    xt, track_w, pitch = 1.22, 0.40, 0.12
    link_half = 0.0375

    # lower hull tub: steep nose plate, shallow glacis, vertical rear
    tub = [(2.42, 0.45), (2.74, 0.96), (2.74, 1.04), (1.62, 1.27), (-2.72, 1.27), (-2.76, 0.66), (-2.52, 0.45)]
    k.hull(H, [(sx * 0.92, y, z) for sx in S for y, z in tub], mat=Z, bevel=0.015)
    slope = 0.23 / 1.12
    gl = lambda y: 1.04 + (2.74 - y) * slope  # noqa: E731
    tilt = math.atan(slope)
    # superstructure and engine compartment overhang the tracks
    k.box(H, (2.3, 2.57, 0.55), (0, 0.335, 1.525), mat=Z, bevel=0.012)
    k.hull(H, [(sx * 1.15, y, z) for sx in S for y, z in [(-0.95, 1.25), (-0.95, 1.74), (-2.5, 1.74), (-2.74, 1.56), (-2.74, 1.25)]], mat=Z, bevel=0.012)
    for sx in S:
        k.weld(H, (sx * 1.15, 1.62, 1.25), (sx * 1.15, 1.62, 1.8))
        k.weld(H, (sx * 1.15, 1.62, 1.8), (sx * 1.15, -0.95, 1.8))
        k.weld(H, (sx * 0.92, 1.62, 1.27), (sx * 0.92, 2.74, 1.04))
        k.weld(H, (sx * 1.15, -0.95, 1.25), (sx * 1.15, -0.95, 1.8))
    k.weld(H, (-1.15, 1.62, 1.8), (1.15, 1.62, 1.8))
    k.weld(H, (-0.92, 2.74, 1.04), (0.92, 2.74, 1.04))
    k.weld(H, (-0.92, 1.62, 1.27), (0.92, 1.62, 1.27))

    # driver's visor and binocular periscope ports, hull MG ball mount
    k.box(H, (0.36, 0.07, 0.15), (-0.5, 1.655, 1.58), mat="cast", bevel=0.02)
    k.box(H, (0.22, 0.012, 0.022), (-0.5, 1.692, 1.585), mat="dark", bevel=0)
    for x in (-0.58, -0.42):
        k.cyl_y(H, 0.045, 0.016, (x, 1.626, 1.72), mat="cast", segs=16, bevel=0.003)
        k.cyl_y(H, 0.026, 0.006, (x, 1.636, 1.72), mat="dark", segs=14, bevel=0)
    k.cyl_y(H, 0.17, 0.05, (0.5, 1.64, 1.55), mat="cast", segs=32, bevel=0.012)
    k.add(H, C.bm_sphere(0.115, (0.5, 1.67, 1.55), segs=20, rings=12), "cast", 0.0)
    k.cyl_y(H, 0.03, 0.2, (0.5, 1.84, 1.55), mat="dark", segs=12)
    k.strut(H, (0.5, 1.9, 1.55), (0.5, 2.06, 1.55), 0.012, mat="dark")
    # roof escape hatches for driver and radio operator
    for sx in S:
        x = sx * 0.5
        k.box(H, (0.5, 0.48, 0.03), (x, 1.22, 1.815), mat=Z, bevel=0.008)
        k.cyl_x(H, 0.022, 0.4, (x, 0.97, 1.83), mat="steel", segs=10)
        k.bar(H, (x - 0.1, 1.38, 1.845), (x + 0.1, 1.38, 1.845), 0.018, 0.018)
    # glacis: brake access hatches with cooling cowls
    for sx in S:
        x, y = sx * 0.45, 2.2
        k.box(H, (0.6, 0.52, 0.026), (x, y, gl(y) + 0.013), rot=(-tilt, 0, 0), mat=Z, bevel=0.008)
        for dx in (-0.2, 0.2):
            k.cyl_x(H, 0.022, 0.12, (x + dx, 2.47, gl(2.47) + 0.03), mat="steel", segs=10)
        k.box(H, (0.22, 0.14, 0.07), (x + sx * 0.1, 2.02, gl(2.02) + 0.05), rot=(-tilt, 0, 0), mat="paint", bevel=0.015)
        k.box(H, (0.18, 0.012, 0.035), (x + sx * 0.1, 1.948, gl(1.95) + 0.06), mat="dark", bevel=0)
        k.bar(H, (x - 0.08, 2.3, gl(2.3) + 0.04), (x + 0.08, 2.3, gl(2.3) + 0.04), 0.018, 0.018)
        k.bolts(H, [(x + dx, 1.98 + dy * 0.0, gl(1.98) + 0.015) for dx in (-0.25, 0.25) for dy in (0,)], "z", r=0.016, h=0.02)
    # spare links racked across the nose plate
    d = (0, 0.32 / 0.602, 0.51 / 0.602)
    n = (0, d[2], -d[1])
    for i in range(11):
        o = (-0.6 + i * 0.12, 2.58 + n[1] * 0.035, 0.705 + n[2] * 0.035)
        bm = link_bm(track_w, pitch, "panzer")
        bm.transform(frame(o, d, (-1, 0, 0), (0, -n[1], -n[2])))
        k.add(H, bm, "steel", 0.0)
    rb = (2.58 + n[1] * 0.08, 0.705 + n[2] * 0.08)
    k.bar(H, (-0.72, rb[0], rb[1]), (0.72, rb[0], rb[1]), 0.03, 0.03, mat="paint")
    for sx in S:
        k.bar(H, (sx * 0.72, 2.58, 0.705), (sx * 0.72, rb[0], rb[1]), 0.04, 0.03, mat="paint")
        # towing eyes and shackles
        k.box(H, (0.05, 0.3, 0.2), (sx * 0.86, 2.7, 0.8), mat=Z, bevel=0.012)
        k.cyl_x(H, 0.04, 0.054, (sx * 0.86, 2.77, 0.8), mat="dark", segs=14, bevel=0)
        k.ring(H, 0.06, 0.016, (sx * 0.86, 2.86, 0.76), rot=(0, PI / 2, 0.4), mat="steel")
        # final drive housings
        k.cyl_x(H, 0.19, 0.16, (sx * 1.0, 2.48, 0.92), mat="cast", segs=32, bevel=0.015)
        k.bolts(H, [(sx * 1.085, 2.48 + math.cos(2 * PI * i / 10) * 0.14, 0.92 + math.sin(2 * PI * i / 10) * 0.14) for i in range(10)], "x", r=0.014, h=0.02)
    # headlight and blackout light
    k.cyl_y(H, 0.075, 0.12, (-0.72, 2.42, gl(2.42) + 0.13), mat="steel", segs=20)
    k.cyl_y(H, 0.062, 0.01, (-0.72, 2.485, gl(2.42) + 0.13), mat="dark", segs=20, bevel=0)
    k.strut(H, (-0.72, 2.42, gl(2.42)), (-0.72, 2.42, gl(2.42) + 0.07), 0.015)
    k.box(H, (0.1, 0.08, 0.06), (-1.28, 2.3, 1.3), mat="steel", bevel=0.01)

    # fenders
    for sx in S:
        k.box(H, (0.56, 5.0, 0.012), (sx * 1.2, -0.04, 1.256), bevel=0.003)
        k.box(H, (0.56, 0.42, 0.012), (sx * 1.2, 2.62, 1.2), rot=(-0.3, 0, 0), bevel=0.003)
        k.box(H, (0.56, 0.3, 0.012), (sx * 1.2, -2.69, 1.22), rot=(0.25, 0, 0), bevel=0.003)
        k.bar(H, (sx * 1.475, 2.46, 1.262), (sx * 1.475, -2.54, 1.262), 0.012, 0.03, mat="paint")
    # side skirts on a hanging rail; one plate lost on the left
    for sx in S:
        rail_x = sx * 1.53
        k.bar(H, (rail_x, 2.25, 1.62), (rail_x, -2.62, 1.62), 0.035, 0.035, mat="paint")
        for y in (2.0, 1.0, 0.0, -1.0, -2.0):
            k.bar(H, (sx * 1.15, y, 1.6), (rail_x, y, 1.62), 0.03, 0.05, mat="paint")
            k.bar(H, (sx * 1.46, y, 1.262), (rail_x, y, 1.6), 0.025, 0.04, mat="paint")
        L = 0.955
        for i in range(5):
            if sx < 0 and i == 2:
                continue
            yc = 2.24 - L / 2 - i * (L + 0.012)
            jit = ((i * 37 + (11 if sx > 0 else 0)) % 7 - 3) * 0.006
            x = sx * 1.585
            if i == 0:  # front plate is cut back at the lower corner
                prof = [(yc + L / 2, 1.65), (yc - L / 2, 1.65), (yc - L / 2, 0.67), (yc + L / 2 - 0.35, 0.67), (yc + L / 2, 1.0)]
                k.hull(H, [(x + e, y, z) for e in (-0.006, 0.006) for y, z in prof], mat="paint", bevel=0.003)
            else:
                k.box(H, (0.012, L, 0.98), (x, yc, 1.16), rot=(0, -sx * 0.03 + jit, jit * 0.5), mat="paint", bevel=0.003)
            for dy in (-0.3, 0.3):
                k.box(H, (0.03, 0.06, 0.06), (sx * 1.565, yc + dy, 1.64), mat="steel", bevel=0.006)

    # engine deck: access hatches, intake louvres, grille
    for sx in S:
        k.box(H, (0.95, 1.05, 0.02), (sx * 0.5, -1.62, 1.75), mat=Z, bevel=0.005)
        k.bar(H, (sx * 0.5 - 0.1, -1.3, 1.77), (sx * 0.5 + 0.1, -1.3, 1.77), 0.018, 0.018)
        k.box(H, (0.06, 0.72, 0.3), (sx * 1.17, -1.75, 1.5), mat=Z, bevel=0.01)
        for i in range(6):
            k.box(H, (0.012, 0.62, 0.02), (sx * 1.2, -1.75, 1.39 + i * 0.044), mat="dark", bevel=0)
        k.cyl_y(H, 0.022, 0.12, (sx * 0.06, -1.25, 1.76), mat="steel", segs=10)
        k.cyl_y(H, 0.022, 0.12, (sx * 0.06, -2.0, 1.76), mat="steel", segs=10)
    k.box(H, (1.9, 0.32, 0.02), (0, -2.35, 1.75), mat="paint", bevel=0.004)
    for i in range(10):
        k.box(H, (0.025, 0.28, 0.03), (-0.81 + i * 0.18, -2.35, 1.765), rot=(0, 0.6, 0), mat="dark", bevel=0)
    # antenna on the right rear of the superstructure
    k.cyl(H, 0.05, 0.12, (1.0, -0.85, 1.86), mat="steel", segs=14)
    k.strut(H, (1.0, -0.85, 1.9), (1.0, -0.95, 3.8), 0.005, mat="dark", segs=6)
    # fender stowage: cleaning rods, extinguisher, shovel, jack, crowbar, wire cutters
    k.cyl_y(H, 0.04, 2.3, (-1.3, 0.35, 1.31), mat="paint", segs=16)
    for y in (-0.6, 0.35, 1.3):
        k.box(H, (0.1, 0.05, 0.1), (-1.3, y, 1.31), mat="steel", bevel=0.006)
    k.cyl_y(H, 0.065, 0.45, (-1.3, -1.6, 1.33), mat="paint", segs=20)
    k.strut(H, (1.3, 1.7, 1.285), (1.3, 0.85, 1.285), 0.016, mat="paint")
    k.box(H, (0.2, 0.26, 0.016), (1.3, 0.68, 1.275), mat="steel", bevel=0.004)
    k.box(H, (0.16, 0.3, 0.16), (1.3, -1.6, 1.34), mat="steel", bevel=0.02)
    k.cyl(H, 0.04, 0.12, (1.3, -1.6, 1.46), mat="steel", segs=14)
    k.strut(H, (1.27, 0.2, 1.285), (1.27, -1.1, 1.285), 0.014, mat="steel")
    # rear: mufflers, tail pipe, tow coupling, lights, idler hubs
    k.cyl_x(H, 0.16, 0.95, (0.1, -2.94, 1.02), mat="steel", segs=28, bevel=0.01)
    for x in (-0.32, 0.52):
        k.bar(H, (x, -2.76, 1.0), (x, -2.88, 1.02), 0.04, 0.06, mat="paint")
    k.strut(H, (0.45, -2.94, 1.16), (0.45, -2.94, 1.45), 0.035, mat="steel")
    k.cyl_x(H, 0.08, 0.32, (-0.6, -2.88, 0.82), mat="steel", segs=20)
    k.box(H, (0.16, 0.14, 0.14), (0, -2.83, 0.6), mat="steel", bevel=0.02)
    for sx in S:
        k.box(H, (0.1, 0.06, 0.07), (sx * 0.95, -2.77, 1.45), mat="steel", bevel=0.01)
        k.box(H, (0.07, 0.012, 0.045), (sx * 0.95, -2.802, 1.45), mat="dark", bevel=0)
        k.cyl_x(H, 0.13, 0.2, (sx * 1.0, -2.55, 0.82), mat="cast", segs=24)
        k.eye(H, (sx * 0.95, 1.4, 1.81), "z")
        k.eye(H, (sx * 0.95, -2.4, 1.75), "z")

    # running gear: four leaf-spring bogies, four return rollers
    RG = "gear"
    wheel_r = 0.235
    wheel_z = 0.075 + wheel_r
    bogies = (1.45, 0.5, -0.45, -1.4)
    roll = []
    for sx in S:
        ax = sx * (xt - 0.17)
        for yb in bogies:
            k.box(RG, (0.12, 0.38, 0.3), (sx * 0.98, yb, 0.75), mat="cast", bevel=0.025)
            k.bolts(RG, [(sx * 1.045, yb + dy, z) for dy in (-0.13, 0.13) for z in (0.66, 0.84)], "x", r=0.018, h=0.02)
            for dy in (-1, 1):
                k.bar(RG, (ax, yb + dy * 0.06, 0.66), (ax, yb + dy * 0.265, wheel_z), 0.05, 0.08, mat="paint")
                k.cyl_x(RG, 0.06, 0.08, (ax, yb + dy * 0.265, wheel_z), mat="steel", segs=16)
            for i in range(6):  # quarter-elliptic leaf spring pack
                k.box(RG, (0.07, 0.52 - i * 0.06, 0.014), (ax, yb, 0.88 - i * 0.017), mat="steel", bevel=0.003)
            k.cyl(RG, 0.04, 0.08, (ax, yb, 0.93), mat="rubber", segs=12)
        for ry in (1.62, 0.62, -0.38, -1.36):
            for dx in (-0.055, 0.055):
                k.lathe(RG, [(0.05, -0.035), (0.085, -0.035), (0.085, 0.035), (0.05, 0.035)], 24, loc=(sx * xt + dx, ry, 1.08),
                        rot=(0, PI / 2, 0), mat="rubber", closed=True)
            k.cyl_x(RG, 0.055, 0.2, (sx * xt, ry, 1.08), mat="steel", segs=16)
            k.cyl_x(RG, 0.035, 0.3, (sx * (xt - 0.2), ry, 1.08), mat="steel", segs=12)
            roll.append((ry, 1.08, 0.085 + link_half))
    k.realise(RG, "running_gear", {"dirt": 0.55})

    road_wheel_dual(k, "roadwheel", wheel_r, 0.1, tyre=0.055, bolts=8)
    rw = k.realise("roadwheel", "roadwheel_mesh", {"dirt": 0.8})
    sprocket(k, "sprocket", 0.26, 20, 0.09, hub_r=0.1)
    sp = k.realise("sprocket", "sprocket_mesh", {"dirt": 0.6})
    tube_idler(k, "idler", 0.25, 0.08)
    idl = k.realise("idler", "idler_mesh", {"dirt": 0.7})
    circles = [(2.48, 0.92, 0.26), (-2.55, 0.82, 0.25 + link_half)] + list({c for c in roll})
    wheels = []
    for yb in bogies:
        for dy in (0.265, -0.265):
            circles.append((yb + dy, wheel_z, wheel_r + link_half))
            wheels.append((rw, (yb + dy, wheel_z), wheel_r))
    wheels.append((sp, (2.48, 0.92), 0.26))
    wheels.append((idl, (-2.55, 0.82), 0.25))
    k.add("link", link_bm(track_w, pitch, "panzer"), "steel", 0.0)
    link = k.realise("link", "track_link", {"dirt": 1.0})

    # turret: faceted plates leaning in 25 degrees
    T = "turret"
    base, top = 1.81, 2.46
    pts = []
    for sx in S:
        pts += [(sx * 0.66, 0.79, base), (sx * 0.93, -0.2, base), (sx * 0.76, -1.0, base),
                (sx * 0.52, 0.73, top), (sx * 0.63, -0.2, top), (sx * 0.54, -0.9, top)]
    k.hull(T, pts, mat=Z, bevel=0.02)
    k.cyl(T, 0.88, 0.05, (0, 0, 1.8), mat=Z, segs=64)
    # vision ports either side of the mantlet
    for sx in S:
        k.box(T, (0.16, 0.05, 0.07), (sx * 0.47, 0.78, 2.25), rot=(-0.09, 0, 0), mat="cast", bevel=0.012)
        k.box(T, (0.1, 0.01, 0.014), (sx * 0.47, 0.806, 2.25), mat="dark", bevel=0)
    # commander's cupola: five armoured vision blocks, lid, MG ring
    cx, cy = 0.0, -0.6
    k.cyl(T, 0.33, 0.05, (cx, cy, top + 0.02), mat=Z, segs=40)
    k.cyl(T, 0.3, 0.2, (cx, cy, top + 0.14), mat="cast", segs=48, bevel=0.015)
    for i in range(5):
        a = PI / 2 + 2 * PI * i / 5
        k.box(T, (0.16, 0.07, 0.09), (cx + math.cos(a) * 0.3, cy + math.sin(a) * 0.3, top + 0.15), rot=(0, 0, a - PI / 2), mat="cast", bevel=0.015)
        k.box(T, (0.11, 0.012, 0.02), (cx + math.cos(a) * 0.337, cy + math.sin(a) * 0.337, top + 0.155), rot=(0, 0, a - PI / 2), mat="dark", bevel=0)
    k.cyl(T, 0.27, 0.04, (cx, cy, top + 0.26), mat="paint", segs=40, bevel=0.01)
    k.cyl_x(T, 0.022, 0.14, (cx, cy - 0.27, top + 0.26), mat="steel", segs=10)
    k.ring(T, 0.335, 0.012, (cx, cy, top + 0.235), mat="steel", segs=48)
    # roof: ventilator, signal port, crane sockets
    k.cyl(T, 0.12, 0.05, (0, 0.32, top + 0.025), mat="cast", segs=28)
    k.add(T, C.bm_sphere(0.1, (0, 0.32, top + 0.045), (1, 1, 0.45)), "cast", 0.0)
    k.cyl(T, 0.06, 0.06, (-0.32, 0.25, top + 0.03), mat="cast", segs=18)
    for x, y in ((0.42, 0.4), (-0.42, -0.3), (0.42, -0.4)):
        k.cyl(T, 0.04, 0.05, (x, y, top + 0.025), mat="steel", segs=12)
    # spaced turret skirts with side doors and a rear stowage bin
    for sx in S:
        plate(k, T, (sx * 1.12, 0.62), (sx * 1.12, -0.98), 1.9, 2.44, lean=-sx * 0.12)
        plate(k, T, (sx * 1.12, -0.98), (sx * 0.82, -1.45), 1.9, 2.44, lean=-0.08 if sx > 0 else 0.08)
        for y in (0.3, -0.6):
            k.bar(T, (sx * 0.72, y, 2.3), (sx * 1.08, y, 2.3), 0.04, 0.03, mat="paint")
        for y in (-0.08, -0.62):
            k.bar(T, (sx * 1.125, y, 1.92), (sx * 1.09, y, 2.42), 0.008, 0.012, mat="dark")
        for z in (2.0, 2.4):
            k.cyl(T, 0.016, 0.07, (sx * 1.13, -0.62, z), mat="steel", segs=8)
        k.bar(T, (sx * 1.13, -0.3, 2.2), (sx * 1.13, -0.4, 2.2), 0.015, 0.015, mat="steel")
    plate(k, T, (0.82, -1.45), (-0.82, -1.45), 1.9, 2.44, lean=-0.08)
    k.box(T, (1.2, 0.36, 0.42), (0, -1.2, 2.2), mat="paint", bevel=0.03)
    k.bar(T, (-0.6, -1.2, 2.415), (0.6, -1.2, 2.415), 0.01, 0.37, mat="dark")
    for x in (-0.35, 0.35):
        k.box(T, (0.05, 0.02, 0.07), (x, -1.385, 2.33), mat="steel", bevel=0.004)
    for sx in S:  # fictional turret number
        k.decal(T, "524", 0.24, (sx * 1.1, 0.24, 2.18), (sx, 0, 0.12), "mark_black")
    k.decal(T, "524", 0.2, (0, -1.442, 2.15), (0, -1, 0.08), "mark_black")

    # gun: box mantlet, sleeve, L/48 barrel, double-baffle brake
    G = "gun"
    ty, tz = 0.62, 2.24
    k.box(G, (0.64, 0.34, 0.42), (0, ty + 0.25, tz), mat="cast", bevel=0.07, segs=4)
    k.cyl_y(G, 0.11, 0.1, (0, ty + 0.45, tz), mat="cast", segs=28)
    k.cyl_y(G, 0.035, 0.02, (0.2, ty + 0.425, tz - 0.04), mat="dark", segs=12, bevel=0)
    k.strut(G, (0.2, ty + 0.42, tz - 0.04), (0.2, ty + 0.5, tz - 0.04), 0.014, mat="dark")
    k.box(G, (0.09, 0.05, 0.06), (-0.2, ty + 0.41, tz + 0.08), mat="cast", bevel=0.012)
    k.cyl_y(G, 0.022, 0.01, (-0.2, ty + 0.437, tz + 0.075), mat="dark", segs=12, bevel=0)
    b0 = ty + 0.42
    barrel = [(0, 0), (0.11, 0), (0.11, 0.12), (0.085, 0.14), (0.08, 0.5), (0.068, 0.52), (0.062, 0.6), (0.054, 3.12), (0.058, 3.14),
              (0.098, 3.15), (0.098, 3.28), (0.066, 3.29), (0.066, 3.37), (0.103, 3.38), (0.103, 3.52), (0.085, 3.56), (0.04, 3.56), (0.04, 3.4), (0, 3.4)]
    k.lathe(G, barrel, 32, loc=(0, b0, tz), rot=(-PI / 2, 0, 0), mat="paint", smooth=40)
    for sz in S:
        k.box(G, (0.08, 0.1, 0.04), (0, b0 + 3.33, tz + sz * 0.082), mat="paint", bevel=0.006)
    k.cyl_y(G, 0.0395, 0.004, (0, b0 + 3.402, tz), mat="dark", segs=20, bevel=0)

    return dict(xt=xt, trunnion=(ty, tz), muzzle=b0 + 3.56, ring_z=1.8, circles=circles, wheels=wheels, link=link, pitch=pitch)


# ------------------------------------------------------------ tiger I E


def tiger_ring(z, inset=0.0, n=40):
    """Horseshoe plan: rounded sides and rear, a flat chamfered front."""
    W, F, R, Cf = 1.12 - inset, 0.97 - inset, 1.22 - inset, 0.22
    pts = []
    for i in range(n + 1):
        a = -PI * i / n
        c, s = math.cos(a), math.sin(a)
        pts.append((W * math.copysign(abs(c) ** (2 / 2.4), c), R * math.copysign(abs(s) ** (2 / 2.4), s), z))
    pts += [(-W, F - Cf, z), (-W + Cf, F, z), (W - Cf, F, z), (W, F - Cf, z)]
    return pts


def tiger_wall(a):
    """Point and outward normal on the turret wall at angle a (0 = right, -pi/2 = rear)."""
    def p(t):
        c, s = math.cos(t), math.sin(t)
        return (1.12 * math.copysign(abs(c) ** (2 / 2.4), c), 1.22 * math.copysign(abs(s) ** (2 / 2.4), s))
    x, y = p(a)
    x1, y1 = p(a + 0.01)
    x0, y0 = p(a - 0.01)
    tx, ty = x1 - x0, y1 - y0
    L = math.hypot(tx, ty)
    return (x, y), (ty / L, -tx / L)


def build_tiger(k):
    H, Z = "hull", "zim"
    xt, track_w, pitch = 1.49, 0.72, 0.13
    link_half = 0.0375

    # lower hull tub between the tracks and the full-width superstructure
    tub = [(2.2, 0.45), (2.9, 0.86), (2.96, 1.2), (2.5, 1.3), (-2.9, 1.3), (-2.9, 0.62), (-2.62, 0.45)]
    k.hull(H, [(sx * 1.0, y, z) for sx in S for y, z in tub], mat=Z, bevel=0.015)
    k.box(H, (3.2, 5.45, 0.82), (0, -0.175, 1.49), mat=Z, bevel=0.015)
    k.box(H, (3.24, 0.1, 0.84), (0, 2.53, 1.49), mat=Z, bevel=0.012)  # 100 mm front plate, interlocked
    for sx in S:
        k.box(H, (0.05, 0.08, 0.8), (sx * 1.6, 2.44, 1.49), mat=Z, bevel=0.008)
        k.box(H, (0.05, 0.08, 0.8), (sx * 1.6, -2.86, 1.49), mat=Z, bevel=0.008)
        k.weld(H, (sx * 1.6, 2.4, 1.9), (sx * 1.6, -2.9, 1.9))
        k.weld(H, (sx * 1.6, 2.4, 1.08), (sx * 1.6, -2.9, 1.08))
        k.weld(H, (sx * 1.0, 2.96, 1.2), (sx * 1.0, 2.2, 0.45))
    k.weld(H, (-1.6, 2.48, 1.9), (1.6, 2.48, 1.9))
    k.weld(H, (-1.0, 2.96, 1.2), (1.0, 2.96, 1.2))
    k.weld(H, (-1.0, 2.9, 0.86), (1.0, 2.9, 0.86))
    k.weld(H, (-1.6, -2.9, 1.9), (1.6, -2.9, 1.9))
    glz = lambda y: 1.2 + (2.96 - y) * (0.1 / 0.46)  # noqa: E731
    # driver's visor block, periscope holes, hull MG ball
    k.box(H, (0.46, 0.1, 0.2), (-0.62, 2.62, 1.62), mat="cast", bevel=0.03)
    k.box(H, (0.3, 0.012, 0.03), (-0.62, 2.672, 1.625), mat="dark", bevel=0)
    for x in (-0.72, -0.52):
        k.cyl_y(H, 0.03, 0.006, (-0.0 + x, 2.582, 1.8), mat="dark", segs=14, bevel=0)
    k.cyl_y(H, 0.2, 0.07, (0.62, 2.6, 1.6), mat="cast", segs=32, bevel=0.015)
    k.add(H, C.bm_sphere(0.13, (0.62, 2.64, 1.6), segs=20, rings=12), "cast", 0.0)
    k.cyl_y(H, 0.032, 0.2, (0.62, 2.8, 1.6), mat="dark", segs=12)
    k.strut(H, (0.62, 2.86, 1.6), (0.62, 3.02, 1.6), 0.012, mat="dark")
    # headlights on the upper glacis, towing eyes on the nose
    for sx in S:
        x = sx * 0.78
        k.cyl_y(H, 0.08, 0.13, (x, 2.78, glz(2.78) + 0.14), mat="steel", segs=20)
        k.cyl_y(H, 0.066, 0.01, (x, 2.848, glz(2.78) + 0.14), mat="dark", segs=20, bevel=0)
        k.strut(H, (x, 2.78, glz(2.78)), (x, 2.78, glz(2.78) + 0.07), 0.016)
        k.box(H, (0.09, 0.42, 0.38), (sx * 1.0, 2.86, 0.86), mat=Z, bevel=0.015)
        k.cyl_x(H, 0.065, 0.094, (sx * 1.0, 2.95, 0.8), mat="dark", segs=16, bevel=0)
        k.ring(H, 0.075, 0.02, (sx * 1.0, 3.08, 0.74), rot=(0, PI / 2, 0.5), mat="steel")
        # final drive housings
        k.cyl_x(H, 0.25, 0.2, (sx * 1.1, 2.72, 0.7), mat="cast", segs=32, bevel=0.015)
        k.bolts(H, [(sx * 1.2, 2.72 + math.cos(2 * PI * i / 12) * 0.19, 0.7 + math.sin(2 * PI * i / 12) * 0.19) for i in range(12)], "x", r=0.016, h=0.02)
    # front and rear mudguards, side mudguard strips (one section torn off)
    for sx in S:
        k.box(H, (0.74, 0.5, 0.012), (sx * 1.49, 2.8, 1.11), rot=(-0.25, 0, 0), bevel=0.003)
        k.box(H, (0.74, 0.36, 0.012), (sx * 1.49, -3.06, 1.07), rot=(0.25, 0, 0), bevel=0.003)
        for i, y in enumerate((2.0, 1.1, 0.2, -0.7, -1.6, -2.45)):
            if sx > 0 and i == 3:
                continue
            k.box(H, (0.26, 0.88, 0.01), (sx * 1.73, y, 1.085), bevel=0.003)
            k.bar(H, (sx * 1.6, y, 1.12), (sx * 1.82, y, 1.085), 0.02, 0.03, mat="paint")
    # roof: driver and radio-operator hatches with periscope covers
    for sx in S:
        x = sx * 0.62
        k.cyl(H, 0.28, 0.05, (x, 2.0, 1.915), mat=Z, segs=40, bevel=0.01)
        k.cyl_x(H, 0.025, 0.2, (x, 1.7, 1.94), mat="steel", segs=10)
        k.bar(H, (x - 0.1, 2.12, 1.95), (x + 0.1, 2.12, 1.95), 0.018, 0.018)
        k.box(H, (0.16, 0.18, 0.08), (x - sx * 0.3, 2.3, 1.94), mat="cast", bevel=0.015)
        k.box(H, (0.12, 0.012, 0.03), (x - sx * 0.3, 2.392, 1.95), mat="dark", bevel=0)
        k.eye(H, (sx * 1.45, 2.3, 1.91), "z")
        k.eye(H, (sx * 1.45, -2.7, 1.91), "z")
    # engine deck: central hatch, radiator grilles, fan covers
    k.box(H, (0.9, 1.15, 0.03), (0, -1.95, 1.915), mat=Z, bevel=0.008)
    for y in (-1.5, -2.4):
        k.bar(H, (-0.1, y, 1.94), (0.1, y, 1.94), 0.018, 0.018)
    for sx in S:
        x = sx * 1.06
        k.box(H, (0.82, 1.1, 0.03), (x, -1.62, 1.915), mat="paint", bevel=0.006)
        for i in range(9):
            k.box(H, (0.025, 0.98, 0.025), (x - 0.36 + i * 0.09, -1.62, 1.935), mat="dark", bevel=0)
        k.cyl(H, 0.24, 0.035, (x, -2.52, 1.92), mat="paint", segs=40, bevel=0.006)
        for i in range(8):
            a = 2 * PI * i / 8
            k.bar(H, (x, -2.52, 1.945), (x + math.cos(a) * 0.22, -2.52 + math.sin(a) * 0.22, 1.945), 0.014, 0.012, mat="dark")
        k.cyl(H, 0.05, 0.02, (x, -2.52, 1.95), mat="steel", segs=14)
    # stowage: cleaning-rod tube, tow cables on the hull sides, shovel, axe, jack block
    k.cyl_y(H, 0.045, 2.6, (-1.42, 0.2, 1.95), mat="paint", segs=16)
    for y in (-0.8, 0.2, 1.2):
        k.box(H, (0.1, 0.05, 0.1), (-1.42, y, 1.95), mat="steel", bevel=0.006)
    for sx in S:
        k.strut(H, (sx * 1.635, 1.9, 1.62), (sx * 1.635, -2.4, 1.62), 0.024, mat="steel", segs=10)
        k.strut(H, (sx * 1.635, 1.9, 1.42), (sx * 1.635, -2.4, 1.42), 0.024, mat="steel", segs=10)
        for y, z in ((1.9, 1.52), (-2.4, 1.52)):
            k.ring(H, 0.1, 0.022, (sx * 1.635, y + (0.06 if y > 0 else -0.06), z), rot=(0, PI / 2, 0), mat="steel")
        for y in (1.0, -0.4, -1.6):
            k.box(H, (0.05, 0.06, 0.28), (sx * 1.63, y, 1.52), mat="paint", bevel=0.008)
    k.strut(H, (1.3, 1.5, 1.94), (1.3, 0.6, 1.94), 0.017, mat="paint")
    k.box(H, (0.2, 0.28, 0.018), (1.3, 0.42, 1.93), mat="steel", bevel=0.004)
    k.strut(H, (1.38, -0.3, 1.94), (1.38, -1.1, 1.94), 0.018, mat="paint")
    k.box(H, (0.06, 0.2, 0.03), (1.38, -0.3, 1.94), mat="steel", bevel=0.004)
    # rear plate: exhausts with guards, Feifel air filters and ducts, jack, coupling
    for sx in S:
        x = sx * 0.55
        k.cyl(H, 0.065, 0.8, (x, -3.0, 1.55), mat="steel", segs=18)
        k.cyl(H, 0.05, 0.01, (x, -3.0, 1.955), mat="dark", segs=14, bevel=0)
        k.hull(H, [(x + dx, -2.92 + dy, z) for dx in (-0.12, 0.12) for dy in (0.0, -0.18) for z in (1.15, 1.7)], mat="paint", bevel=0.01)
        k.box(H, (0.26, 0.012, 0.5), (x, -3.105, 1.42), mat="paint", bevel=0.003)
        fx = sx * 1.16
        k.cyl_x(H, 0.17, 0.62, (fx, -3.1, 1.42), mat="paint", segs=32, bevel=0.012)
        k.cyl_x(H, 0.175, 0.02, (fx - sx * 0.31, -3.1, 1.42), mat="steel", segs=32)
        k.cyl_x(H, 0.175, 0.02, (fx + sx * 0.31, -3.1, 1.42), mat="steel", segs=32)
        k.strut(H, (fx, -3.1, 1.58), (fx, -3.1, 2.02), 0.055, mat="paint", segs=14)
        k.strut(H, (fx, -3.1, 2.02), (fx, -2.7, 2.02), 0.055, mat="paint", segs=14)
        k.strut(H, (fx, -2.7, 2.02), (fx, -2.7, 1.9), 0.055, mat="paint", segs=14)
        k.strut(H, (fx, -3.1, 1.26), (fx, -2.92, 1.0), 0.05, mat="paint", segs=14)
        k.box(H, (0.1, 0.06, 0.07), (sx * 0.95, -2.93, 1.82), mat="steel", bevel=0.01)
        k.cyl_x(H, 0.15, 0.22, (sx * 1.1, -2.8, 0.64), mat="cast", segs=24)
    k.box(H, (0.5, 0.18, 0.18), (0, -3.0, 1.12), mat="paint", bevel=0.02)
    k.box(H, (0.18, 0.15, 0.15), (0, -2.97, 0.7), mat="steel", bevel=0.02)

    # running gear: eight torsion-bar axles, interleaved discs
    RG = "gear"
    wheel_r = 0.4
    wheel_z = 0.075 + wheel_r
    axles = [1.75 - i * 0.5 for i in range(8)]
    for sx in S:
        for y in axles:
            k.cyl_x(RG, 0.09, 0.12, (sx * 1.05, y + 0.28, 0.66), mat="cast", segs=20)
            k.bar(RG, (sx * 1.08, y + 0.28, 0.66), (sx * 1.08, y, wheel_z), 0.07, 0.11, mat="paint")
            k.cyl_x(RG, 0.075, 0.08, (sx * 1.1, y, wheel_z), mat="steel", segs=20)
            k.box(RG, (0.08, 0.12, 0.1), (sx * 1.04, y + 0.12, 0.98), mat="cast", bevel=0.015)  # bump stop
    k.realise(RG, "running_gear", {"dirt": 0.55})

    interleaved_wheel(k, "wheel_a", (0.27, -0.09))
    wa = k.realise("wheel_a", "roadwheel_outer_mesh", {"dirt": 0.85})
    interleaved_wheel(k, "wheel_b", (0.09, -0.27))
    wb = k.realise("wheel_b", "roadwheel_inner_mesh", {"dirt": 0.85})
    sprocket(k, "sprocket", 0.34, 18, 0.24, hub_r=0.16)
    sp = k.realise("sprocket", "sprocket_mesh", {"dirt": 0.6})
    road_wheel_dual(k, "idler", 0.3, 0.2, tyre=0.035, steel_rim=True, bolts=10)
    idl = k.realise("idler", "idler_mesh", {"dirt": 0.7})
    circles = [(2.72, 0.7, 0.34), (-2.8, 0.64, 0.3 + link_half)]
    wheels = []
    for i, y in enumerate(axles):
        circles.append((y, wheel_z, wheel_r + link_half))
        wheels.append((wa if i % 2 == 0 else wb, (y, wheel_z), wheel_r))
    wheels.append((sp, (2.72, 0.7), 0.34))
    wheels.append((idl, (-2.8, 0.64), 0.3))
    k.add("link", link_bm(track_w, pitch, "tiger"), "steel", 0.0)
    link = k.realise("link", "track_link", {"dirt": 1.0})

    # turret: vertical horseshoe walls, thick flat front plate
    T = "turret"
    roof = 2.75
    k.add(T, C.bm_loft([tiger_ring(1.93), tiger_ring(2.7), tiger_ring(2.73, 0.015), tiger_ring(roof, 0.04)]), Z, 0.0, smooth=50)
    k.box(T, (2.06, 0.14, 0.8), (0, 0.99, 2.33), mat=Z, bevel=0.015)
    k.cyl(T, 0.98, 0.05, (0, 0, 1.92), mat=Z, segs=64)
    # drum cupola with vision slits on the left rear
    cx, cy = -0.6, -0.48
    k.cyl(T, 0.37, 0.05, (cx, cy, roof + 0.02), mat=Z, segs=48)
    k.cyl(T, 0.33, 0.28, (cx, cy, roof + 0.18), mat="cast", segs=48, bevel=0.015)
    for i in range(6):
        a = 2 * PI * i / 6 + PI / 2
        k.box(T, (0.14, 0.012, 0.03), (cx + math.cos(a) * 0.333, cy + math.sin(a) * 0.333, roof + 0.2), rot=(0, 0, a - PI / 2), mat="dark", bevel=0)
    k.cyl(T, 0.3, 0.05, (cx, cy, roof + 0.34), mat="paint", segs=40, bevel=0.012)
    k.box(T, (0.16, 0.1, 0.06), (cx, cy - 0.32, roof + 0.33), mat="steel", bevel=0.01)
    # loader's hatch, ventilator, crane sockets, smoke dischargers
    k.cyl(T, 0.25, 0.04, (0.5, -0.1, roof + 0.02), mat="paint", segs=40, bevel=0.01)
    k.cyl_x(T, 0.022, 0.2, (0.5, -0.36, roof + 0.04), mat="steel", segs=10)
    k.bar(T, (0.42, 0.05, roof + 0.06), (0.58, 0.05, roof + 0.06), 0.016, 0.016, mat="steel")
    k.cyl(T, 0.13, 0.06, (0.15, 0.55, roof + 0.03), mat="cast", segs=28)
    k.add(T, C.bm_sphere(0.11, (0.15, 0.55, roof + 0.05), (1, 1, 0.45)), "cast", 0.0)
    for x, y in ((0.6, 0.55), (-0.2, 0.5), (0.4, -0.75)):
        k.cyl(T, 0.045, 0.06, (x, y, roof + 0.03), mat="steel", segs=12)
    for sx in S:
        k.box(T, (0.18, 0.3, 0.03), (sx * 0.9, 0.62, roof + 0.02), mat="paint", bevel=0.006)
        for i in range(3):
            k.cyl(T, 0.042, 0.2, (sx * (0.84 + i * 0.07), 0.62 + (i - 1) * 0.08, roof + 0.1), rot=(-0.55, sx * 0.45, 0), mat="steel", segs=14)
    # rear escape hatch and pistol ports on the curved wall
    (ex, ey), (enx, eny) = tiger_wall(-1.1)
    k.disc(T, 0.25, (ex + enx * 0.02, ey + eny * 0.02, 2.3), (enx, eny, 0), Z, depth=0.05)
    k.disc(T, 0.06, (ex + enx * 0.05, ey + eny * 0.05, 2.3), (enx, eny, 0), "steel", depth=0.03)
    for a in (-0.5, -2.64):
        (px, py), (pnx, pny) = tiger_wall(a)
        k.disc(T, 0.07, (px + pnx * 0.015, py + pny * 0.015, 2.06), (pnx, pny, 0), "cast", depth=0.04)
    # spare track links hung on the turret sides
    for sx in S:
        for i in range(4):
            o = (sx * 1.16, 0.3, 2.08 + i * 0.13)
            bm = link_bm(track_w, pitch, "tiger")
            bm.transform(frame(o, (0, -sx, 0), (0, 0, 1), (-sx, 0, 0)))
            k.add(T, bm, "steel", 0.0)
        for z in (2.02, 2.58):
            k.bar(T, (sx * 1.15, -0.05, z), (sx * 1.15, 0.65, z), 0.04, 0.03, mat="paint")
    # rear stowage bin
    k.box(T, (1.3, 0.45, 0.42), (0, -1.43, 2.36), mat="paint", bevel=0.05, segs=3)
    for x in (-0.45, 0.0, 0.45):
        k.bar(T, (x, -1.21, 2.58), (x, -1.66, 2.58), 0.04, 0.012, mat="paint")
    for x in (-0.38, 0.38):
        k.box(T, (0.06, 0.02, 0.08), (x, -1.66, 2.45), mat="steel", bevel=0.004)
    for sx in S:  # fictional turret numbers
        (nx_, ny_), (nnx, nny) = tiger_wall(-0.42 if sx > 0 else -PI + 0.42)
        k.decal(T, "317", 0.3, (nx_ + nnx * 0.004, ny_ + nny * 0.004, 2.42), (nnx, nny, 0), "mark_black")
    k.decal(T, "317", 0.2, (0, -1.657, 2.33), (0, -1, 0), "mark_black")

    # gun: slab mantlet, sight apertures, coax, 8.8 cm barrel with double-baffle brake
    G = "gun"
    ty, tz = 0.95, 2.32
    k.box(G, (1.42, 0.24, 0.6), (0, ty + 0.24, tz), mat="cast", bevel=0.09, segs=4)
    for sx in S:
        k.box(G, (0.12, 0.08, 0.56), (sx * 0.64, ty + 0.37, tz), mat="cast", bevel=0.03)
    k.cyl_y(G, 0.22, 0.16, (0, ty + 0.42, tz), mat="cast", segs=32, bevel=0.03)
    for x in (-0.3, -0.42):
        k.cyl_y(G, 0.055, 0.04, (x, ty + 0.37, tz + 0.13), mat="cast", segs=16, bevel=0.008)
        k.cyl_y(G, 0.028, 0.006, (x, ty + 0.392, tz + 0.13), mat="dark", segs=12, bevel=0)
    k.cyl_y(G, 0.055, 0.05, (0.4, ty + 0.38, tz + 0.06), mat="cast", segs=16, bevel=0.008)
    k.cyl_y(G, 0.03, 0.006, (0.4, ty + 0.407, tz + 0.06), mat="dark", segs=12, bevel=0)
    k.strut(G, (0.4, ty + 0.4, tz + 0.06), (0.4, ty + 0.46, tz + 0.06), 0.013, mat="dark")
    b0 = ty + 0.5
    barrel = [(0, 0), (0.15, 0), (0.15, 0.1), (0.11, 0.12), (0.105, 0.55), (0.09, 0.58), (0.085, 0.7), (0.072, 3.38), (0.076, 3.4),
              (0.135, 3.42), (0.135, 3.58), (0.09, 3.59), (0.09, 3.68), (0.14, 3.69), (0.14, 3.86), (0.12, 3.9), (0.046, 3.9), (0.046, 3.7), (0, 3.7)]
    k.lathe(G, barrel, 36, loc=(0, b0, tz), rot=(-PI / 2, 0, 0), mat="paint", smooth=40)
    for sz in S:
        k.box(G, (0.11, 0.12, 0.05), (0, b0 + 3.635, tz + sz * 0.113), mat="paint", bevel=0.008)
    k.cyl_y(G, 0.0455, 0.004, (0, b0 + 3.702, tz), mat="dark", segs=20, bevel=0)

    return dict(xt=xt, trunnion=(ty, tz), muzzle=b0 + 3.9, ring_z=1.92, circles=circles, wheels=wheels, link=link, pitch=pitch)


BUILDERS = {"sherman": build_sherman, "panzer": build_panzer, "tiger": build_tiger}


# ------------------------------------------------------------ assembly


def assemble(kind, spec, k):
    root = C.empty("tank")
    hull = k.realise("hull", "hull", {"dirt": 0.0})
    C.parent_keep(hull, root)
    C.parent_keep(C.bpy.data.objects["running_gear"], root)
    turret = C.empty("turret", (0, 0, spec["ring_z"]), root)
    shell = k.realise("turret", "turret_shell", {"dirt": 0.0})
    C.parent_keep(shell, turret)
    ty, tz = spec["trunnion"]
    elevation = C.empty("elevation", (0, ty, tz), turret)
    gun = k.realise("gun", "gun", {"dirt": 0.0})
    C.parent_keep(gun, elevation)
    C.empty("muzzle", (0, spec["muzzle"], tz), elevation)

    templates = []
    for side, sx in (("L", -1), ("R", 1)):
        for i, (ob, (y, z), r) in enumerate(spec["wheels"]):
            inst = ob if side == "R" and ob.get("_placed") is None else ob.copy()
            if inst is ob:
                ob["_placed"] = True
                templates.append(ob)
            else:
                bpy.context.scene.collection.objects.link(inst)
            inst.name = f"wheel_{side}_{i}"
            inst.location = (sx * spec["xt"], y, z)
            inst.rotation_euler = (0, 0, PI if sx < 0 else 0)
            inst["spin_r"] = r
            bpy.context.view_layer.update()
            C.parent_keep(inst, root)
    for ob in templates:
        del ob["_placed"]
    C.parent_keep(spec["link"], root)

    path, length = C.track_path(spec["circles"])
    root["kind"] = kind
    root["track_x"] = spec["xt"]
    root["track_path"] = [v for p in path for v in p]
    root["track_length"] = round(length, 4)
    root["track_links"] = int(round(length / spec["pitch"]))
    return root, templates


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = dict(zip(argv[::2], argv[1::2]))
    kind = args.get("--kind", "sherman")
    out = os.path.abspath(args.get("--out", os.path.join(C.ROOT, "public", "art", "vehicles", f"{kind}.glb")))
    tex = int(args.get("--tex", 2048))
    C.check_version()
    C.reset_scene()
    mats = materials(kind)
    k = C.Kit(mats)
    spec = BUILDERS[kind](k)
    root, templates = assemble(kind, spec, k)
    meshes = [o for o in [bpy.data.objects[n] for n in ("hull", "running_gear", "turret_shell", "gun", "track_link")]] + templates
    C.unwrap(meshes)
    work = tempfile.mkdtemp(prefix=f"tank-{kind}-")
    files = C.bake_atlas(meshes, tex, work)
    final = C.export_material(f"{kind}_finish", files)
    for ob in root.children_recursive:
        if ob.type == "MESH":
            ob.data.materials.clear()
            ob.data.materials.append(final)
    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in root.children_recursive if ob.type == "MESH" and ob.name != "track_link")
    C.add_lods(root)
    lod_tris = sum(len(ob.data.polygons) for ob in root.children_recursive
                   if ob.type == "MESH" and ob.name.endswith("_lod1") and ob.name != "track_link_lod1")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    C.export_glb(root, out)
    link_tris = sum(len(p.vertices) - 2 for p in spec["link"].data.polygons)
    stats = dict(kind=kind, out=out, triangles_static=tris, triangles_lod1=lod_tris, link_triangles=link_tris, links=root["track_links"] * 2,
                 bytes=os.path.getsize(out), work=work)
    print("[tank-art] " + json.dumps(stats))


main()
