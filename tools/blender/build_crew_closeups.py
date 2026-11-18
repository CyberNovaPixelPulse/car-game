"""Build the editable near-view fittings and export the two runtime GLBs.

Blender --background --factory-startup --python tools/blender/build_crew_closeups.py
The authoring dimensions are scene proportions for our game cameras.
"""

import math
from pathlib import Path
import sys

import bmesh
import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C

ROOT = Path(C.ROOT)
OUT = ROOT / "public/assets/closeups"
PALETTE = {
    "Cast": (0x535B48, 0.24, 0.66),
    "Paint": (0x686C52, 0.17, 0.7),
    "Recess": (0x252824, 0.12, 0.84),
    "Machined": (0x85867D, 0.56, 0.39),
    "Burnished": (0xA0A097, 0.58, 0.35),
    "Latch": (0x9B8558, 0.42, 0.5),
    "WindowPlate": (0x3B4537, 0.24, 0.82),
    "WindowLiner": (0x454C3F, 0.3, 0.77),
    "WindowShoulder": (0x535847, 0.28, 0.74),
    "WindowSteel": (0x6C7061, 0.4, 0.58),
    "WindowWear": (0x787869, 0.41, 0.53),
    "WindowJoint": (0x20251E, 0.14, 0.86),
}


def linear(value):
    unit = value / 255
    return unit / 12.92 if unit <= 0.04045 else ((unit + 0.055) / 1.055) ** 2.4


def material(name, color, metal, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    rgba = tuple(linear((color >> shift) & 255) for shift in (16, 8, 0)) + (1,)
    mat.diffuse_color = rgba
    surface = mat.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = rgba
    surface.inputs["Metallic"].default_value = metal
    surface.inputs["Roughness"].default_value = roughness
    return mat


def build_loader(k):
    # Game (x, y, z) is Blender (x, -z, y). The open bottom slot lets the
    # slide travel between the cheek rails without crossing a solid sill.
    cradle = "Cradle"
    recoil = "BreechHousing"
    slide = "SlidePlate"
    rack = "ReadyRack"
    for side in (-1, 1):
        x = side * 0.59
        k.box(cradle, (0.28, 1.35, 0.13), (x, 1.05, 1.08), mat="Cast")
        k.hull(cradle, [
            (side * width, depth, height)
            for width in (0.48, 0.70)
            for depth, height in ((0.36, 1.13), (0.86, 1.13), (0.79, 1.52), (0.43, 1.52))
        ], mat="Cast", bevel=0.024)
        k.cyl_y(cradle, 0.114, 0.18, (x, 0.43, 1.36), mat="Machined", bevel=0.014)
        k.cyl_y(cradle, 0.091, 0.055, (x, 0.318, 1.36), mat="Recess")
        k.cyl_y(recoil, 0.062, 1.58, (x, 1.00, 1.36), mat="Burnished")
        k.cyl_y(recoil, 0.077, 0.047, (x, 0.206, 1.36), mat="Machined")
        k.bolts(cradle, [(x + dx, 0.356, y) for dx in (-0.09, 0.09) for y in (1.20, 1.49)],
                "y", r=0.019, h=0.021, mat="Machined")

        k.hull(recoil, [
            (side * width, depth, height)
            for width in (0.286, 0.47)
            for depth, height in ((0.33, 1.11), (0.76, 1.10), (1.05, 1.42), (0.79, 1.81), (0.39, 1.83))
        ], mat="Cast", bevel=0.018)
        k.box(recoil, (0.05, 0.18, 0.72), (side * 0.269, 0.52, 1.13),
              mat="Machined", bevel=0.012)
        k.box(recoil, (0.048, 0.075, 0.62), (side * 0.253, 0.42, 1.19),
              mat="Recess", bevel=0.008)
        k.bolts(recoil, [(side * 0.368, 0.35, 1.20), (side * 0.368, 0.37, 1.74)],
                "y", r=0.025, h=0.035, mat="Machined")

    k.hull(recoil, [
        (x, depth, height)
        for x in (-0.45, 0.45)
        for depth, height in ((0.33, 1.73), (0.86, 1.73), (0.79, 1.94), (0.43, 1.92))
    ], mat="Cast", bevel=0.028)
    k.box(recoil, (0.58, 0.043, 0.045), (0, 0.38, 1.74), mat="Machined", bevel=0.009)
    k.box(recoil, (0.49, 0.18, 0.08), (0, 0.69, 1.18), mat="Machined", bevel=0.018)
    k.cyl_y(recoil, 0.28, 0.56, (0, 1.30, 1.47), mat="Cast", bevel=0.023)
    k.lathe(recoil, [
        (0.119, -0.02), (0.146, 0.018), (0.204, 0.018), (0.228, -0.036),
        (0.228, -0.225), (0.119, -0.225)
    ], 32, loc=(0, 0.76, 1.47), rot=(math.pi / 2, 0, 0), mat="Machined", closed=True)
    k.cyl_y(recoil, 0.126, 0.026, (0, 0.992, 1.47), mat="Recess", bevel=0.0)
    k.cyl_x(recoil, 0.08, 0.12, (0.488, 0.54, 1.66), mat="Recess")
    k.cyl_x(recoil, 0.061, 0.09, (0.532, 0.54, 1.66), mat="Machined")
    k.strut(recoil, (0.55, 0.54, 1.66), (0.73, 0.45, 1.95), 0.029, mat="Machined", segs=14)
    k.box(recoil, (0.104, 0.096, 0.135), (0.73, 0.45, 1.96), mat="Recess", bevel=0.022)

    k.hull(slide, [
        (x, depth, height)
        for x in (-0.241, 0.241)
        for depth, height in ((0.39, 1.26), (0.61, 1.23), (0.61, 1.71), (0.43, 1.70))
    ], mat="Machined", bevel=0.021)
    k.box(slide, (0.43, 0.27, 0.028), (0, 0.376, 1.466), mat="Paint", bevel=0.012)
    for x in (-0.13, 0.13):
        k.box(slide, (0.046, 0.076, 0.061), (x, 0.34, 1.47), mat="Recess", bevel=0.011)
    k.cyl_x(slide, 0.033, 0.292, (0, 0.305, 1.47), mat="Machined")

    # Three floor-mounted cups and straps, in the clear left of the loader's HUD.
    k.box(rack, (0.35, 0.92, 0.085), (-1.40, 0.39, 0.50), mat="Cast")
    k.box(rack, (0.046, 0.90, 0.075), (-1.544, 0.39, 1.02), mat="Paint")
    for y in (0.03, 0.75):
        k.box(rack, (0.08, 0.13, 0.55), (-1.55, y, 0.76), mat="Cast", bevel=0.014)
        k.box(rack, (0.31, 0.14, 0.057), (-1.45, y, 0.0235), mat="Cast")
        k.box(rack, (0.08, 0.10, 0.45), (-1.43, y, 0.247), mat="Paint")
        k.bolts(rack, [(-1.32, y, 0.057), (-1.557, y, 0.057)], "z",
                r=0.029, h=0.017, mat="Machined")
    for y in (0.12, 0.39, 0.66):
        k.lathe(rack, [(0.110, 0), (0.133, 0), (0.133, 0.039), (0.110, 0.049)],
                24, loc=(-1.40, y, 0.539), mat="Machined", closed=True)
        k.lathe(rack, [(0.093, -0.022), (0.112, -0.022), (0.112, 0.022), (0.093, 0.022)],
                24, loc=(-1.40, y, 1.02), mat="Paint", closed=True)
        k.box(rack, (0.044, 0.075, 0.108), (-1.286, y, 1.02), mat="Recess", bevel=0.010)
        k.box(rack, (0.023, 0.054, 0.063), (-1.258, y, 1.048), mat="Latch", bevel=0.007)
        k.cyl_y(rack, 0.018, 0.086, (-1.263, y, 1.005), mat="Machined", segs=12)

    root = C.empty("LoaderFittings")
    pivot = C.empty("BreechRecoil", parent=root)
    block = C.empty("BreechSlide", parent=pivot)
    return root, {cradle: root, recoil: pivot, slide: block, rack: root}


def build_window(k):
    # The runtime scales this authoring reference to the DRIVER_VIEW opening.
    # Every ring after the far throat expands outside it toward the camera.
    width, height, depth = 0.36, 0.088, 0.28
    root = C.empty("DriverWindow")
    root["opening"] = [width, height, depth]
    profiles = [
        (1.0, 1.0, 0.0, "WindowSteel"),
        (1.028, 1.115, 0.061, "WindowLiner"),
        (1.078, 1.285, 0.260, "WindowJoint"),
        (1.079, 1.292, 0.285, "WindowShoulder"),
        (1.20, 1.70, 0.440, "WindowPlate"),
        (1.365, 2.28, 0.830, "WindowLiner"),
        (1.43, 2.51, 1.0, "WindowPlate"),
        (12.0, 38.0, 1.0, "WindowPlate"),
        (12.0, 38.0, 0.0, "WindowPlate"),
        (1.0, 1.0, 0.0, "WindowSteel"),
    ]
    cuts = (-1, -0.81, -0.77, -0.51, -0.16, -0.12, 0.31, 0.35, 0.61, 0.64, 0.85, 1)
    ring = ([(t, -1) for t in cuts[:-1]] + [(1, -1), (1, 1)] +
            [(t, 1) for t in reversed(cuts[1:-1])] + [(-1, 1)])
    frame = bmesh.new()
    layers = [
        [frame.verts.new((rx * x * width, -z * depth, ry * y * height)) for x, y in ring]
        for rx, ry, z, _ in profiles[:-1]
    ]
    names = list(dict.fromkeys(p[3] for p in profiles)) + ["WindowWear"]
    for layer, ((_, _, _, finish), vertices) in enumerate(zip(profiles, layers)):
        following = layers[(layer + 1) % len(layers)]
        for index, vertex in enumerate(vertices):
            next_index = (index + 1) % len(vertices)
            face = frame.faces.new((vertex, vertices[next_index], following[next_index], following[index]))
            # Only short patches on the exposed bevel show through to bare steel.
            wear = layer == 0 and index in (1, 6, 14, 18)
            face.material_index = names.index("WindowWear" if wear else finish)
    bmesh.ops.recalc_face_normals(frame, faces=frame.faces[:])
    group = "ArmourFrame"
    frame_object = k.add(group, frame, names[0])
    for name in names[1:]:
        frame_object.data.materials.append(k.materials[name])
    for poly in frame_object.data.polygons:
        poly.use_smooth = False
    for side in (-1, 1):
        for x in (-0.275, -0.135, 0.135, 0.275):
            # Anchor fasteners to the slanted shoulder, clear of the throat.
            y, z = -0.123, side * 0.143
            rotation = (side * math.radians(145) if side > 0 else math.radians(35), 0, 0)
            k.cyl(group, 0.015, 0.009, (x, y, z), rot=rotation, mat="WindowJoint", segs=16, bevel=0.002)
            k.cyl(group, 0.0105, 0.012, (x, y - 0.006, z - side * 0.004), rot=rotation,
                  mat="WindowSteel", segs=6, bevel=0.002)
    return root, {group: root}


def planar_uv(mesh):
    uv = mesh.uv_layers.new(name="Surface")
    for face in mesh.polygons:
        axis = max(range(3), key=lambda index: abs(face.normal[index]))
        u, v = [index for index in range(3) if index != axis]
        for index in face.loop_indices:
            point = mesh.vertices[mesh.loops[index].vertex_index].co
            uv.data[index].uv = (point[u], point[v])


def main():
    C.reset_scene()
    kit = C.Kit({name: material(name, *values) for name, values in PALETTE.items()})
    loader, loader_groups = build_loader(kit)
    window, window_groups = build_window(kit)
    groups = loader_groups | window_groups
    for name, parent in groups.items():
        for part in kit.groups[name]:
            part.parent = parent
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "tools/blender/crew-closeups.blend"), compress=True)
    for name in groups:
        planar_uv(kit.realise(name, name).data)
    OUT.mkdir(parents=True, exist_ok=True)
    C.export_glb(loader, str(OUT / "loader-fittings.glb"))
    C.export_glb(window, str(OUT / "driver-window.glb"))


if __name__ == "__main__":
    main()
