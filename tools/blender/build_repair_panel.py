"""Build the loader's fold-out service panel, its contact points and socket wrench."""

import math
from pathlib import Path
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C
from build_crew_closeups import PALETTE, material, planar_uv


def main():
    C.reset_scene()
    metals = {name: material(name, *PALETTE[name]) for name in
              ("Paint", "Cast", "Recess", "Burnished", "Latch", "Machined")}
    metals["IndexEnamel"] = material("IndexEnamel", 0xF2EEE0, 0.02, 0.76)
    k = C.Kit(metals)
    panel, ring, wrench = "PanelCasting", "RingGrip", "ToolSteel"
    # Front is Blender -Y, exported Three.js +Z. Narrow legs meet the cabin floor.
    k.box(panel, (0.73, 0.115, 0.46), (0, 0, 0), mat="Cast", bevel=0.024)
    k.box(panel, (0.69, 0.020, 0.42), (0, -0.057, 0), mat="Recess")
    k.box(panel, (0.665, 0.018, 0.398), (0, -0.069, 0), mat="Paint")
    for x in (-0.245, 0.245):
        k.box(panel, (0.060, 0.075, 1.35), (x, 0.07, -0.81), mat="Cast")
        k.box(panel, (0.14, 0.17, 0.032), (x, 0.072, -1.47), mat="Machined")
    for z in (0.142, -0.14):
        k.cyl_x(panel, 0.028, 0.108, (-0.294, -0.082, z), mat="Machined")
    k.bolts(panel, [(x, -0.081, z) for x in (-0.29, 0.29) for z in (-0.165, 0.165)],
            "y", r=0.017, h=0.012, mat="Burnished")

    # Inset ventilation grille and a row of inspection fasteners.
    k.box(panel, (0.22, 0.009, 0.171), (-0.13, -0.081, 0.044), mat="Recess")
    for z in (-0.009, 0.022, 0.053, 0.084, 0.115):
        k.box(panel, (0.192, 0.024, 0.012), (-0.13, -0.091, z),
              rot=(0.28, 0, 0), mat="Machined", bevel=0.003)
    for x in (-0.15, -0.06, 0.03, 0.12):
        k.cyl_y(panel, 0.026, 0.018, (x, -0.087, -0.111), mat="Recess")
        k.cyl_y(panel, 0.019, 0.019, (x, -0.103, -0.111),
                mat="Burnished", segs=6, bevel=0.003)

    # Collar has a recessed center, raised knurl and an index notch. Its pivot
    # travels with the visible ring when the calibration animation turns it.
    dial = (0.133, -0.080, 0.069)
    k.cyl_y(panel, 0.111, 0.021, dial, mat="Recess")
    k.cyl_y(panel, 0.059, 0.019, (dial[0], -0.099, dial[2]), mat="Machined")
    k.lathe(ring, [(0.061, 0), (0.090, 0), (0.096, 0.012), (0.093, 0.032),
                   (0.085, 0.039), (0.064, 0.039), (0.060, 0.031)],
            36, rot=(math.pi / 2, 0, 0), mat="Latch", closed=True)
    for i in range(16):
        a = 2 * math.pi * i / 16
        k.box(ring, (0.010, 0.027, 0.010),
              (math.sin(a)*0.093, -0.022, math.cos(a)*0.093),
              rot=(0, a, 0), mat="Machined", bevel=0.003)
    # White inlay in a dark cut on the brass face. Cant the mark to meet the
    # casting pointer at the installed starting angle, away from the fingers.
    mark = -0.48
    x, z = math.sin(mark) * 0.075, math.cos(mark) * 0.075
    k.box(ring, (0.021, 0.002, 0.027), (x, -0.0395, z),
          rot=(0, mark, 0), mat="Recess", bevel=0.0008)
    k.box(ring, (0.012, 0.001, 0.022), (x, -0.041, z),
          rot=(0, mark, 0), mat="IndexEnamel", bevel=0.0005)

    # A stationary triangular pointer on the casting just clears the knurls.
    # Give it a dark base so both marks read in the work light at game scale.
    for mat, half_width, tip, tail, front, back in (
        ("Recess", 0.018, 0.102, 0.129, -0.101, -0.077),
        ("IndexEnamel", 0.011, 0.108, 0.124, -0.103, -0.101),
    ):
        k.hull(panel, [(dial[0] + dx, y, dial[2] + dz)
                       for dx, dz in ((-half_width, tail), (half_width, tail), (0, tip))
                       for y in (back, front)], mat=mat, bevel=0.0005)

    # Tool origin is the socket face. +X runs from the fastener into the glove.
    k.lathe(wrench, [(0.020, 0), (0.030, 0), (0.032, 0.004), (0.032, 0.034),
                     (0.026, 0.040), (0.018, 0.037)], 24,
            rot=(math.pi / 2, 0, 0), mat="Burnished", closed=True)
    k.box(wrench, (0.193, 0.017, 0.020), (0.119, -0.032, 0), mat="Machined", bevel=0.006)
    k.box(wrench, (0.106, 0.028, 0.030), (0.226, -0.032, 0), mat="Recess", bevel=0.009)
    for x in (0.193, 0.214, 0.235, 0.256):
        k.box(wrench, (0.005, 0.030, 0.032), (x, -0.032, 0), mat="Cast", bevel=0.002)

    root = C.empty("RepairKit")
    support = C.empty("RepairPanel", parent=root)
    collar = C.empty("AdjustmentRing", dial, parent=support)
    tool = C.empty("SocketWrench", parent=root)
    C.empty("Brace", (-0.302, -0.107, -0.09), parent=support)
    C.empty("Fastener", (0.12, -0.112, -0.111), parent=support)
    # Placement in the editable file keeps both pieces visible separately.
    tool.location.x = 0.52

    groups = {panel: support, ring: collar, wrench: tool}
    for name, parent in groups.items():
        for part in k.groups[name]:
            part.parent = parent
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(C.ROOT) / "tools/blender/repair-panel.blend"), compress=True)
    for name in groups:
        planar_uv(k.realise(name, name).data)
    C.export_glb(root, str(Path(C.ROOT) / "public/assets/closeups/repair-panel.glb"))


if __name__ == "__main__":
    main()
