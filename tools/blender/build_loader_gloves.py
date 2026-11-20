"""Sew a jointed right-hand work glove and its field-jacket sleeves for the loader.

Control points are in the wrist frame used by the renderer (metres, +Y towards
the fingers, +Z over the knuckles). All five finger openings share vertices with
the palm. The dorsal welts and lockstitches follow the same three fitted forms.
"""

import math
from pathlib import Path
import sys
import tempfile

import bpy
import bmesh
import numpy as np
from mathutils import Vector

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import common
from loader_uniform import build_materials, build_sleeved_arm, make_material, packed_png

PI = math.pi
TAU = math.tau
CORNERS = 12  # Dorsal subdivisions across each finger opening.
WIDTH = 4 * CORNERS
EDGE = 4  # Rounded gussets turn from the palm to the back.
RING = 2 * (WIDTH + EDGE + 1)
MATERIALS = ("leather", "palm", "trim", "thread")
FORM_NAMES = ("Relaxed", "Grip", "Pinch")
HIDE_UV_SCALE = 6.0  # Texture repeats per metre of cut leather.


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3.0 - 2.0 * x)


def mound(x, center, width):
    return math.exp(-(((x - center) / width) ** 2))


def mix(a, b, f):
    return a + (b - a) * f


def profile(x, knots):
    for (x0, v0), (x1, v1) in zip(knots, knots[1:]):
        if x <= x1:
            return mix(v0, v1, smooth((x - x0) / (x1 - x0)))
    return knots[-1][1]


def blender(v):
    return (v.x, -v.z, v.y)


def patina(point):
    """Local worn dye follows the hand in every pose, under the fine hide grain."""
    x, y, z = point
    # Rubbed knuckles, thumb pad and the outer heel; oil accumulates between
    # the fingers and on the opposed thumb/forefinger which handle the metal.
    knuckles = sum(
        mound(x, k, 0.008) * mound(y, t, 0.014)
        for k, t in [(-0.033, 0.076), (-0.011, 0.082), (0.013, 0.075), (0.036, 0.064)]
    )
    palm = smooth((-z + 0.003) / 0.021)
    grime = smooth((y - 0.075) / 0.057) * (0.35 + 0.44 * palm)
    grime += 0.49 * mound(x, -0.057, 0.020) * mound(y, 0.068, 0.030)
    grime += 0.43 * mound(x, -0.026, 0.032) * mound(y, 0.036, 0.020) * palm
    grime += 0.28 * mound(y, -0.027 + 0.003 * math.sin(x * 70), 0.009)
    variation = 0.035 * math.sin(118 * x + 70 * y) * math.sin(110 * y - 37 * z)
    factor = max(0.48, min(1.0, 0.88 + variation + 0.15 * knuckles - 0.42 * grime))
    return (factor, factor * (0.99 - 0.02 * grime), factor * (0.97 - 0.04 * grime), 1.0)


def scanned_hide(materials):
    """Tint Rob Tuytel's CC0 Brown Leather scan for soft, worn work gloves."""
    def read(channel, color_space):
        path = SOURCE / "sources" / f"brown_leather_{channel}_1k.jpg"
        if not path.is_file():
            raise FileNotFoundError(f"{path.name} is missing. Run tools/blender/fetch_sources.sh.")
        image = bpy.data.images.load(str(path))
        image.colorspace_settings.name = color_space
        width, height = image.size
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        bpy.data.images.remove(image)
        return pixels.reshape(height // 2, 2, width // 2, 2, 4).mean(axis=(1, 3))[::-1, :, :3]

    dye = read("albedo", "sRGB")
    dye = 255 * np.where(dye <= 0.0031308, 12.92 * dye, 1.055 * dye ** (1 / 2.4) - 0.055)
    grain = read("nor_gl", "Non-Color")
    flat = np.array((0.5, 0.5, 1.0))
    grain = flat + (grain - flat) * 0.36
    rough = 0.73 + read("rough", "Non-Color")[..., 0] * 0.22
    orm = np.dstack((np.ones_like(rough), rough, np.zeros_like(rough)))
    with tempfile.TemporaryDirectory() as scratch:
        folder = Path(scratch)
        grain_map = packed_png("Work-glove scanned grain", grain * 255, folder, "Non-Color")
        finish_map = packed_png("Work-glove matte finish", orm * 255, folder, "Non-Color")
        for slot, name, color in (
            ("leather", "Brown work leather", (84, 59, 40)),
            ("palm", "Oiled palm leather", (72, 49, 33)),
        ):
            tinted = np.array(color) + (dye - dye.mean(axis=(0, 1))) * 0.72
            dye_map = packed_png(name + " dye", tinted, folder, "sRGB")
            materials[slot] = make_material(name, color, .83, (dye_map, grain_map, finish_map))
    materials["trim"] = make_material("Turned leather edges", (68, 47, 31), .82)
    materials["glove-thread"] = make_material("Dusty glove stitches", (110, 89, 62), .92)


def worn_dye(materials):
    for name in ("leather", "palm"):
        tree = materials[name].node_tree
        shader = tree.nodes.get("Principled BSDF")
        socket = shader.inputs["Base Color"]
        dye = socket.links[0].from_socket
        attr = tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "HidePatina"
        attr.label = "Wear at knuckles and finger pads"
        mix_node = tree.nodes.new("ShaderNodeMix")
        mix_node.data_type = "RGBA"
        mix_node.blend_type = "MULTIPLY"
        mix_node.inputs["Factor"].default_value = 1.0
        # The modern Mix node has scalar, vector and color sockets named A/B.
        sockets = {s.identifier: s for s in mix_node.inputs}
        tree.links.new(dye, sockets["A_Color"])
        tree.links.new(attr.outputs["Color"], sockets["B_Color"])
        result = next(s for s in mix_node.outputs if s.identifier == "Result_Color")
        tree.links.new(result, socket)


class Pattern:
    def __init__(self):
        self.forms = []
        self.faces = []
        self.uv = []
        self.materials = []

    def vertex(self, form):
        self.forms.append(form)
        return len(self.forms) - 1

    def face(self, ids, uv, mat, dorsal_cut=False):
        if dorsal_cut and mat == "leather":
            # One unbroken back piece runs from the cuff to the finger tips.
            # Project its relaxed form onto the cut, including across the webs.
            flat_points = [self.forms[index][0] for index in ids]
            uv = [(0.48 + p.x * HIDE_UV_SCALE, 0.28 + p.y * HIDE_UV_SCALE) for p in flat_points]
        self.faces.append(ids)
        self.uv.append(uv)
        self.materials.append(MATERIALS.index(mat))

    def strip(self, lower, upper, u, lo_v, hi_v, material, dorsal_cut=False):
        for j in range(len(lower)):
            k = (j + 1) % len(lower)
            self.face(
                [lower[j], lower[k], upper[k], upper[j]],
                [(u[j], lo_v), (u[j + 1], lo_v), (u[j + 1], hi_v), (u[j], hi_v)],
                material(j),
                dorsal_cut,
            )

    def cord(self, forms, radius, material, sides=6):
        """Swept piping/lockstitch, parallel transported independently per form."""
        if len(forms) < 2:
            return
        spans = [Vector(p[0]) for p in forms]
        total = sum((a - b).length for a, b in zip(spans, spans[1:]))
        last_ring = None
        frames = [None] * len(FORM_NAMES)
        for i, centers in enumerate(forms):
            loops = []
            for pose, center in enumerate(centers):
                tangent = forms[min(i + 1, len(forms) - 1)][pose] - forms[max(i - 1, 0)][pose]
                tangent.normalize()
                normal = frames[pose]
                if normal is None:
                    normal = Vector((0, 0, 1))
                    if abs(tangent.dot(normal)) > 0.85:
                        normal = Vector((1, 0, 0))
                normal = (normal - tangent * normal.dot(tangent)).normalized()
                frames[pose] = normal
                across = tangent.cross(normal)
                end_scale = 0.55 if i in (0, len(forms) - 1) else 1.0
                loops.append(
                    [
                        center
                        + (normal * math.cos(TAU * j / sides) + across * math.sin(TAU * j / sides))
                        * radius
                        * end_scale
                        for j in range(sides)
                    ]
                )
            row = [self.vertex(tuple(loop[j] for loop in loops)) for j in range(sides)]
            if last_ring:
                self.strip(
                    last_ring,
                    row,
                    [j / sides * 0.10 for j in range(sides + 1)],
                    total * 10 * (i - 1) / (len(forms) - 1),
                    total * 10 * i / (len(forms) - 1),
                    lambda _: material,
                )
            last_ring = row

    def finish(self, material_set, parent):
        mesh = bpy.data.meshes.new("SewnGloveWithFourchettes")
        mesh.from_pydata([blender(p[0]) for p in self.forms], [], self.faces)
        mesh.update()
        for key in MATERIALS:
            mesh.materials.append(material_set["glove-thread" if key == "thread" else key])
        uv = mesh.uv_layers.new(name="CutPattern")
        for polygon, coords, material in zip(mesh.polygons, self.uv, self.materials):
            polygon.use_smooth = True
            polygon.material_index = material
            for l, xy in zip(polygon.loop_indices, coords):
                uv.data[l].uv = xy
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        colors = mesh.color_attributes.new(name="HidePatina", type="BYTE_COLOR", domain="POINT")
        colors.data.foreach_set(
            "color", [channel for vertex in self.forms for channel in patina(vertex[0])]
        )
        obj = bpy.data.objects.new("SewnWorkGlove", mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        for i, name in enumerate(FORM_NAMES):
            key = obj.shape_key_add(name=name)
            if i:
                key.data.foreach_set("co", [c for vertex in self.forms for c in blender(vertex[i])])
        return obj


# Width and thickness follow the carpal waist, heel, then palmar arch.
PALM_PROFILE = [
    (-0.051, 0.042, 0.027),
    (-0.049, 0.043, 0.0275),
    (-0.045, 0.042, 0.027),
    (-0.039, 0.040, 0.025),
    (-0.033, 0.039, 0.023),
    (-0.028, 0.038, 0.022),
    (-0.022, 0.036, 0.021),
    (-0.016, 0.0355, 0.021),
    (-0.010, 0.035, 0.021),
    (-0.004, 0.035, 0.021),
    (0.002, 0.036, 0.022),
    (0.008, 0.038, 0.023),
    (0.014, 0.040, 0.024),
    (0.020, 0.042, 0.0245),
    (0.026, 0.0435, 0.0245),
    (0.032, 0.0445, 0.024),
    (0.038, 0.045, 0.024),
    (0.044, 0.045, 0.023),
    (0.050, 0.045, 0.022),
    (0.055, 0.045, 0.021),
    (0.060, 0.045, 0.020),
    (0.065, 0.045, 0.018),
    (0.070, 0.045, 0.016),
    (0.074, 0.045, 0.014),
]
# Dense rows at the bent wrist retain the broken, slanting creases in the silhouette.
WIDTH_CURVE = [(y, w) for y, w, _ in PALM_PROFILE]
DEPTH_CURVE = [(y, d) for y, _, d in PALM_PROFILE]
ROW_Y = sorted(
    {r[0] for r in PALM_PROFILE}
    | {
        round(y + 0.002 * i, 5)
        for (y, _, _), (y2, _, _) in zip(PALM_PROFILE, PALM_PROFILE[1:])
        for i in range(1, 4)
        if y + 0.002 * i < y2
    }
)


def palm_point(y, u, dorsal, pose):
    width = profile(y, WIDTH_CURVE)
    depth = profile(y, DEPTH_CURVE)
    arch = smooth((y - 0.031) / 0.043)
    x = width * u + 0.002 * math.sin((y + 0.005) * 32)
    x -= 0.004 * mound(y, 0.039, 0.024) * smooth((-0.60 - u) / 0.40)
    # Knuckles and finger webs follow an arch; the little finger leaves lower.
    y_off = arch * (0.003 - 0.011 * max(u, 0.0) ** 1.5 - 0.003 * max(-u, 0.0) ** 2)
    arches = 0.5 + 0.5 * math.cos(4 * PI * (u + 0.75))  # four metacarpal heads
    y_off += arch * (
        0.003 * arches + 0.0043 * mound(u, -0.25, 0.26) - 0.0049 * mound(u, 0.68, 0.34)
    )
    # Glove joins the four finger gussets above the knuckles.
    side = 0.36 + 0.64 * max(0.0, 1 - abs(u) ** 3.5) ** 0.6
    transition = smooth((y - 0.060) / 0.014)
    side = mix(side, 0.40 + 0.57 * arches, transition)
    if dorsal:
        # Leave the contact side full underneath. The back lies flatter along
        # the metacarpals and only rises over the heads of the joints.
        z = depth * side * (1.0 - 0.24 * smooth((y + 0.040) / 0.051))
        z += (0.0006 * mound(y, 0.035, 0.035) + 0.0027 * mound(y, 0.066, 0.010)) * arches
        # Broken oblique compressions where the hand flexes out of the cuff.
        for center, h, phase, start, spread in [
            (-0.033, 0.00135, 0.3, 0.14, 0.73),
            (-0.020, 0.0018, 1.5, -0.26, 0.68),
            (-0.006, 0.00115, 2.7, 0.51, 0.55),
        ]:
            shift = 0.0040 * math.sin(u * 2.7 + phase) + 0.005 * u
            w = mound(u, start, spread) * (0.70 + 0.25 * math.cos(3.1 * u + phase))
            z += (
                h
                * w
                * (
                    mound(y, center + shift, 0.0030)
                    - 0.89 * mound(y, center + 0.0035 + shift, 0.0025)
                )
            )
        # The extensor contours are low, broad ridges. Unequal starting points
        # and different impact on the silhouette keep the back from looking ribbed.
        for lane, y0, y1, height in [
            (-1, 0.007, 0.064, 0.0010),
            (0, -0.009, 0.055, 0.0011),
            (1, 0.019, 0.049, 0.00055),
        ]:
            f = (y - y0) / (y1 - y0)
            if 0 < f < 1:
                ridge = lane * (0.19 + 0.28 * f) + 0.059 * math.sin(PI * f + 0.26 * lane)
                d = (u - ridge) * width
                taper = smooth(f / 0.21) * smooth((1 - f) / 0.27)
                z += height * taper * (mound(d, 0, 0.0033) - 0.20 * mound(d, 0.0046, 0.0028))
        flex = (0.38, 1.0, 0.79)[pose]
        # Leather bunches behind each metacarpal head when the fingers close.
        fold_y = 0.052 + 0.009 * math.cos(PI * (u + 0.32)) - 0.007 * u + 0.002 * math.sin(u * 16)
        z += (
            flex
            * (0.0017 * mound(y, fold_y, 0.0033) - 0.0010 * mound(y, fold_y - 0.003, 0.0029))
            * mound(u, -0.09, 0.72)
        )
        z += 0.00035 * math.sin(56 * y + 2 * u) * math.sin(5.5 * u)
    else:
        z = -depth * side
        # The thenar and hypothenar pads leave a cupped hollow between them.
        z -= 0.0064 * mound(u, -0.54, 0.33) * mound(y, 0.021, 0.026)
        z -= 0.0032 * mound(u, 0.53, 0.30) * mound(y, 0.026, 0.041)
        z += 0.0037 * mound(u, 0.02, 0.37) * mound(y, 0.035, 0.025)
        z += 0.002 * mound(y, 0.044 + 0.010 * u - 0.005 * u * u, 0.002)
    curl = (0.0, 1.0, 0.74)[pose]
    z -= curl * 0.0045 * arch * u * u
    x -= curl * 0.002 * max(u, 0.0) * arch
    return Vector((x, y + y_off, z))


def palmar_index(i):
    return RING - 1 - EDGE - i


def palm_ring(pat, y):
    row = []

    # The side between the palmar pad and the back has its own rounded section.
    # It becomes part of the first web at the base of the opposed thumb.
    def edge(u, t):
        points = []
        for k in range(3):
            d = palm_point(y, u, True, k)
            v = palm_point(y, u, False, k)
            if u < 0:
                d, v = v, d
            p = d.lerp(v, t)
            p.x += u * 0.0026 * math.sin(PI * t)
            if u < 0:
                p.y += (
                    0.0048 * math.sin(PI * t) * (mound(y, 0.055, 0.018) - mound(y, -0.004, 0.021))
                )
            points.append(p)
        return tuple(points)

    for i in range(WIDTH + 1):
        u = i / WIDTH * 2 - 1
        row.append(pat.vertex(tuple(palm_point(y, u, True, k) for k in range(3))))
    for i in range(1, EDGE + 1):
        row.append(pat.vertex(edge(1.0, i / (EDGE + 1))))
    for i in range(WIDTH, -1, -1):
        u = i / WIDTH * 2 - 1
        row.append(pat.vertex(tuple(palm_point(y, u, False, k) for k in range(3))))
    for i in range(1, EDGE + 1):
        row.append(pat.vertex(edge(-1.0, i / (EDGE + 1))))
    return row


def make_palm(pat):
    rows = [palm_ring(pat, y) for y in ROW_Y]
    widest_row = rows[ROW_Y.index(0.026)]
    cut = [0.0]
    for a, b in zip(widest_row, widest_row[1:] + widest_row[:1]):
        cut.append(cut[-1] + (pat.forms[b][0] - pat.forms[a][0]).length * HIDE_UV_SCALE)
    # A single opening spans both the edge seam and the thenar side of the palm.
    thumb_lo, thumb_hi = ROW_Y.index(-0.004), ROW_Y.index(0.055)
    opening = [*range(palmar_index(3), RING), 0, 1, 2]
    for i, (a, b) in enumerate(zip(rows, rows[1:])):
        for j in range(RING):
            if thumb_lo <= i < thumb_hi and j in opening[:-1]:
                continue
            k = (j + 1) % RING
            mat = "palm" if WIDTH + EDGE < j < palmar_index(0) + 1 else "leather"
            pat.face(
                [a[j], a[k], b[k], b[j]],
                [
                    (cut[j], ROW_Y[i] * HIDE_UV_SCALE),
                    (cut[j + 1], ROW_Y[i] * HIDE_UV_SCALE),
                    (cut[j + 1], ROW_Y[i + 1] * HIDE_UV_SCALE),
                    (cut[j], ROW_Y[i + 1] * HIDE_UV_SCALE),
                ],
                mat,
                dorsal_cut=j < WIDTH,
            )
    loop = [rows[thumb_lo][j] for j in opening]
    loop.extend(rows[i][opening[-1]] for i in range(thumb_lo + 1, thumb_hi + 1))
    loop.extend(rows[thumb_hi][j] for j in reversed(opening[:-1]))
    loop.extend(rows[i][opening[0]] for i in range(thumb_hi - 1, thumb_lo, -1))
    # A turned rim around the wrist opening gives it thickness at extreme wrist angles.
    inset = []
    for idx in rows[0]:
        inset.append(
            pat.vertex(tuple(Vector((v.x * 0.86, v.y + 0.001, v.z * 0.82)) for v in pat.forms[idx]))
        )
    pat.strip(
        inset, rows[0], [2 * j / RING for j in range(RING + 1)], -0.52, -0.50, lambda _: "trim"
    )
    return rows[-1], loop


DIGITS = (
    # Length, half-width, neutral splay, PIP/DIP stations, power and pinch angles.
    # Joint stations follow the CC0 MakeHuman base's measured phalangeal ratios
    # (Data Collection AB, Joel Palmius, Jonas Hauquier); no mesh is embedded.
    (0.073, 0.0107, -0.105, (0.35, 0.67), (47, 115, 158), (23, 73, 114)),
    (0.080, 0.0112, -0.025, (0.39, 0.70), (58, 128, 175), (39, 93, 144)),
    (0.074, 0.0102, 0.063, (0.37, 0.68), (69, 140, 180), (50, 114, 159)),
    (0.057, 0.0087, 0.165, (0.40, 0.66), (76, 146, 186), (61, 128, 171)),
)


class Finger:
    def __init__(self, id, base):
        self.id = id
        self.length, self.width, self.splay, self.joints, self.grip, self.pinch = DIGITS[id]
        self.base = base

    def angle(self, t, pose):
        relaxed = (4 + self.id * 2.1, 12 + self.id * 3.7, 23 + self.id * 4.3)
        base, middle, tip = (relaxed, self.grip, self.pinch)[pose]
        pip, dip = self.joints
        return math.radians(
            base + (middle - base) * smooth((t - pip + 0.041) / 0.164)
            + (tip - middle) * smooth((t - dip + 0.022) / 0.132)
        )

    def direction(self, t, pose):
        angle = self.angle(t, pose)
        splay = self.splay * (1.0 if pose == 0 else 0.35) * (1.0 - 0.36 * t)
        if pose == 2 and self.id == 0:
            splay -= 0.11 * t
        return Vector((splay, math.cos(angle), -math.sin(angle))).normalized()

    def center(self, t, pose):
        # Integrate arc length, not linear tip positions, so that folded pads remain full.
        n = 18
        center = self.base[pose].copy()
        dt = t / n
        for i in range(n):
            center += self.direction((i + 0.5) * dt, pose) * (self.length * dt)
        return center

    def surface(self, t, theta, pose):
        center = self.center(t, pose)
        angle = self.angle(t, pose)
        back = Vector((0, math.sin(angle), math.cos(angle)))
        cross = self.direction(t, pose).cross(back).normalized()
        # The proximal segment tapers. The two knuckles make distinct low
        # bulges, and the pad below the nail is fuller than its back.
        pip, dip = self.joints
        width = self.width * (
            1 - 0.33 * t + 0.105 * mound(t, pip + 0.027, 0.062)
            + 0.062 * mound(t, dip + 0.016, 0.049) + 0.035 * mound(t, 0.88, 0.08)
        )
        round_tip = math.sqrt(max(0.0, 1 - ((max(0.0, t - 0.835)) / 0.165) ** 2))
        radial = math.cos(theta)
        dorsal = math.sin(theta)
        pad = max(-dorsal, 0)
        thickness = width * (0.76 + 0.10 * pad + 0.15 * pad * mound(t, 0.86, 0.14))
        # Folds follow compression on the insides and fade irregularly into
        # the fourchette. The stretched back has only a low knuckle mound.
        fold = 0.0
        for i, joint in enumerate(self.joints):
            phase = self.id * 0.87 + i * 1.7
            center_k = joint + 0.035 + 0.023 * radial + 0.011 * math.cos(2 * theta + phase)
            pinch_side = pad ** 0.7 * (0.67 + 0.27 * math.sin(theta - phase))
            fold += (
                pinch_side * (0.62 * mound(t, center_k - 0.025, 0.024)
                - mound(t, center_k, 0.016) + 0.32 * mound(t, center_k + 0.021, 0.016))
            )
        relief = (0.0010, 0.0018, 0.00155)[pose]
        knuckle = (0.00035, 0.00083, 0.00083)[pose]
        thickness += max(0, dorsal) * knuckle * mound(t, pip + 0.030, 0.067)
        side = math.copysign(abs(radial) ** 0.88, radial)
        top = math.copysign(abs(dorsal) ** 0.94, dorsal)
        return (
            center
            + cross * (width * side * round_tip)
            + back * ((thickness + relief * fold) * top * round_tip)
        )


def sewn_line(pat, points, thick=0.00065, stitch=False):
    pat.cord(points, thick, "trim", 5)
    if stitch:
        # Broken stitches follow the raised seam, with a little visible saddle between holes.
        for i in range(1, len(points) - 1, 3):
            a, b = points[i : i + 2]
            pat.cord([a, b], thick * 0.50, "thread", 5)


def make_finger(pat, i, top):
    start = i * CORNERS
    dorsal = list(range(start, start + CORNERS + 1))
    palmar = [palmar_index(j) for j in reversed(dorsal)]
    outer_right = list(range(WIDTH + 1, WIDTH + 1 + EDGE)) if i == 3 else []
    outer_left = list(range(palmar_index(0) + 1, RING)) if i == 0 else []
    row = [top[j] for j in dorsal + outer_right + palmar + outer_left]
    n = len(row)
    base_row = row
    center = tuple(sum((pat.forms[idx][pose] for idx in row), Vector()) / n for pose in range(3))
    finger = Finger(i, center)
    # The digit ring and its corresponding palm opening have the same vertex order.
    left_angle = PI - (0.39 if i == 0 else 0.075)
    right_angle = 0.39 if i == 3 else 0.075
    angles = [mix(left_angle, right_angle, j / CORNERS) for j in range(CORNERS + 1)]
    angles.extend(
        mix(right_angle, -right_angle, j / (EDGE + 1)) for j in range(1, len(outer_right) + 1)
    )
    angles.extend(mix(-right_angle, -left_angle, j / CORNERS) for j in range(CORNERS + 1))
    angles.extend(
        mix(-left_angle, left_angle - TAU, j / (EDGE + 1)) for j in range(1, len(outer_left) + 1)
    )
    unwrapped = [*angles, left_angle - TAU]
    uv = [(left_angle - angle) * finger.width * HIDE_UV_SCALE for angle in unwrapped]
    texture_offset = 0.09 * i
    samples = [
        0.025,
        0.05,
        0.09,
        0.14,
        0.2,
        0.28,
        0.34,
        0.385,
        0.41,
        0.43,
        0.455,
        0.48,
        0.52,
        0.59,
        0.65,
        0.69,
        0.715,
        0.735,
        0.758,
        0.79,
        0.84,
        0.88,
        0.92,
        0.955,
        0.980,
        0.993,
    ]
    prev_t = 0
    for t in samples:
        new = []
        for j, th in enumerate(angles):
            positions = []
            for pose in range(3):
                p = finger.surface(t, th, pose)
                weight = 1 - smooth(t / 0.14)
                p += (pat.forms[base_row[j]][pose] - finger.surface(0, th, pose)) * weight
                positions.append(p)
            new.append(pat.vertex(tuple(positions)))
        pat.strip(
            row,
            new,
            uv,
            texture_offset + prev_t * finger.length * HIDE_UV_SCALE,
            texture_offset + t * finger.length * HIDE_UV_SCALE,
            lambda j: "leather" if j < CORNERS else "palm",
            dorsal_cut=True,
        )
        row = new
        prev_t = t
    tip = pat.vertex(tuple(finger.center(1.0, pose) for pose in range(3)))
    last_v = texture_offset + prev_t * finger.length * HIDE_UV_SCALE
    tip_v = texture_offset + finger.length * HIDE_UV_SCALE
    for j in range(n):
        pat.face(
            [row[j], row[(j + 1) % n], tip],
            [(uv[j], last_v), (uv[j + 1], last_v), ((uv[j] + uv[j + 1]) * 0.5, tip_v)],
            "leather" if j < CORNERS else "palm",
            dorsal_cut=True,
        )
    # Fourchettes: run the turned leather seam up the sides, set just over the dorsal edge.
    for theta in (0.14, PI - 0.14):
        points = []
        for j in range(32):
            t = 0.17 + 0.75 * j / 31
            points.append(tuple(finger.surface(t, theta, pose) for pose in range(3)))
        sewn_line(pat, points, 0.00037)


def spline(knots, t):
    """Cubic through positions; repeated endpoints give the tip a stable tangent."""
    p = t * (len(knots) - 1)
    i = min(int(p), len(knots) - 2)
    f = p - i
    a, b, c, d = (knots[max(0, min(k, len(knots) - 1))] for k in (i - 1, i, i + 1, i + 2))
    return 0.5 * (
        (2 * b)
        + (-a + c) * f
        + (2 * a - 5 * b + 4 * c - d) * f**2
        + (-a + 3 * b - 3 * c + d) * f**3
    )


def make_thumb(pat, opening):
    origin = tuple(
        sum((pat.forms[idx][pose] for idx in opening), Vector()) / len(opening) for pose in range(3)
    )
    paths = [
        [
            (-0.051, 0.035, -0.006),
            (-0.061, 0.046, -0.009),
            (-0.068, 0.057, -0.012),
            (-0.071, 0.067, -0.017),
            (-0.069, 0.077, -0.019),
        ],
        [
            (-0.049, 0.031, -0.010),
            (-0.054, 0.038, -0.024),
            (-0.048, 0.047, -0.039),
            (-0.034, 0.053, -0.049),
            (-0.017, 0.060, -0.047),
        ],
        [
            (-0.050, 0.036, -0.010),
            (-0.058, 0.052, -0.023),
            (-0.058, 0.067, -0.036),
            (-0.052, 0.081, -0.046),
            (-0.043, 0.092, -0.051),
        ],
    ]
    paths = [[origin[pose], *(Vector(p) for p in line)] for pose, line in enumerate(paths)]

    def frame(t, pose):
        points = paths[pose]
        tangent = (
            spline(points, min(1.0, t + 0.001)) - spline(points, max(0.0, t - 0.001))
        ).normalized()
        # Opposition rolls the pad toward the index as the thumb comes across.
        ref = (Vector((0, 0, 1)) - tangent * tangent.z).normalized()
        across = tangent.cross(ref).normalized()
        turn = (0.10, 0.47, 0.63)[pose] * smooth((t - 0.20) / 0.74)
        return across * math.cos(turn) - ref * math.sin(turn), ref * math.cos(turn) + across * math.sin(turn)

    axis_u, axis_v = frame(0, 0)
    p = pat.forms[opening[0]][0] - origin[0]
    start_angle = math.atan2(p.dot(axis_v) / 0.015, p.dot(axis_u) / 0.024)

    def pos(t, a, pose):
        u, v = frame(t, pose)
        radius = profile(
            t,
            [
                (0, 0.0215),
                (0.23, 0.0165),
                (0.42, 0.0132),
                (0.57, 0.0118),
                (0.65, 0.0114),
                (0.77, 0.0098),
                (0.87, 0.0101),
                (1, 0.0092),
            ],
        )
        cap = math.sqrt(max(0.0, 1 - (max(0.0, t - 0.825) / 0.175) ** 2))
        pad = max(0.0, -math.sin(a))
        groove = (0.0007, 0.0014, 0.0011)[pose] * pad * (
            0.55 * mound(t, 0.62, 0.027) - mound(t, 0.65 + 0.014 * math.cos(a), 0.016)
        )
        return (
            spline(paths[pose], t)
            + u * math.cos(a) * radius * cap
            + v * math.sin(a) * (radius * (0.73 + 0.22 * pad * mound(t, 0.86, 0.14)) + groove) * cap
        )

    # Loft the thumb web into the proximal pad. A circular tube faded in at the
    # mouth of this asymmetric hole folds the high corner back into the palm.
    count = len(opening)
    angles = [start_angle - TAU * j / count for j in range(count)]
    join = 0.47

    def loft(t, j, pose):
        a = angles[j]
        if t >= join:
            return pos(t, a, pose)
        p0 = pat.forms[opening[j]][pose]
        p1 = pos(join, a, pose)
        v0 = (p1 - p0) * 0.92
        v1 = (pos(join + 0.002, a, pose) - pos(join - 0.002, a, pose)) * (join / 0.004)
        f = t / join
        return (
            (2 * f**3 - 3 * f * f + 1) * p0
            + (f**3 - 2 * f * f + f) * v0
            + (-2 * f**3 + 3 * f * f) * p1
            + (f**3 - f * f) * v1
        )

    def seam_point(t, a, pose):
        fraction = ((angles[0] - a) / TAU % 1) * count
        j = int(fraction)
        return loft(t, j, pose).lerp(loft(t, (j + 1) % count, pose), fraction - j)

    u = [i / count * TAU * 0.014 * HIDE_UV_SCALE for i in range(count + 1)]
    thumb_v_span = 0.076 * HIDE_UV_SCALE
    row = opening
    saddle = {idx: 0.75 for idx in opening}
    last = 0
    for t in (
        0.032,
        0.07,
        0.12,
        0.18,
        0.25,
        0.33,
        0.40,
        0.47,
        0.53,
        0.575,
        0.60,
        0.625,
        0.65,
        0.70,
        0.76,
        0.81,
        0.85,
        0.90,
        0.935,
        0.965,
        0.986,
        0.995,
    ):
        next_row = [pat.vertex(tuple(loft(t, j, pose) for pose in range(3))) for j in range(count)]
        pat.strip(
            row,
            next_row,
            u,
            last * thumb_v_span,
            t * thumb_v_span,
            lambda j: "palm" if math.sin(angles[j]) < -0.24 else "leather",
        )
        if t <= 0.25:
            saddle.update({idx: 0.68 * (1 - t / 0.30) for idx in next_row})
        last = t
        row = next_row
    tip = pat.vertex(tuple(path[-1] for path in paths))
    last_v = last * thumb_v_span
    for j in range(count):
        k = (j + 1) % count
        pat.face(
            [row[j], row[k], tip],
            [(u[j], last_v), (u[j + 1], last_v), ((u[j] + u[j + 1]) * 0.5, thumb_v_span)],
            "leather",
        )
    # Ease the saddle over its sewn insertion. A square transition there
    # leaves a shelf in silhouette when the thumb is brought across the palm.
    adjacency = {idx: set() for idx in saddle}
    for face in pat.faces:
        for j, idx in enumerate(face):
            if idx in adjacency:
                adjacency[idx].update((face[j - 1], face[(j + 1) % len(face)]))
    for _ in range(6):
        eased = {}
        for idx, others in adjacency.items():
            eased[idx] = tuple(
                pat.forms[idx][pose].lerp(
                    sum((pat.forms[o][pose] for o in others), Vector()) / len(others), saddle[idx]
                )
                for pose in range(3)
            )
        for idx, positions in eased.items():
            pat.forms[idx] = positions
    # The set-in thumb is cut as its own panel. Follow the saddle seam across the web.
    samples = []
    for i in range(54):
        a = TAU * i / 53
        t = 0.36 + 0.06 * math.cos(a + 0.55)
        samples.append(tuple(seam_point(t, a, pose) for pose in range(3)))
    sewn_line(pat, samples, 0.00055, True)
    for a in (0.10, PI - 0.15):
        samples = [tuple(seam_point(t / 40, a, pose) for pose in range(3)) for t in range(11, 39)]
        sewn_line(pat, samples, 0.00039)


def finish_panels(pat):
    """Palm heel overlay, raised back seams and the turned opening of the glove."""

    def surf(y, u, dorsal, raise_by):
        sign = 1 if dorsal else -1
        return tuple(
            palm_point(y, u, dorsal, k) + Vector((0, 0, sign * raise_by)) for k in range(3)
        )

    # A second thickness of hide spreads the load across the heel and the ball of the thumb.
    def overlay(r, a):
        across = math.cos(a)
        along = math.sin(a)
        u = 0.10 + 0.75 * r * math.copysign(abs(across) ** 0.80, across)
        y = 0.009 + 0.028 * r * along + 0.010 * u - 0.011 * u * u
        return surf(y, u, False, 0.00045 + 0.00035 * (1.0 - r))

    center = pat.vertex(overlay(0, 0))
    prev = None
    n = 44
    for i in range(1, 8):
        r = i / 7
        ring = [pat.vertex(overlay(r, TAU * j / n)) for j in range(n)]
        for j in range(n):
            k = (j + 1) % n
            face = (
                [center, ring[j], ring[k]] if prev is None else [prev[j], ring[j], ring[k], prev[k]]
            )
            uv = [(pat.forms[idx][0].x * HIDE_UV_SCALE, pat.forms[idx][0].y * HIDE_UV_SCALE) for idx in face]
            pat.face(face, uv, "leather")
        prev = ring
    # A single locking stitch around the heel reinforcement.
    for i in range(46):
        samples = [overlay(0.94, TAU * (i + t) / 46) for t in (0.1, 0.45, 0.78)]
        pat.cord(samples, 0.00030, "thread", 5)

    for dorsal in (True, False):
        # A folded opening is handstitched through both layers. Threads sit almost flush.
        for i in range(22):
            us = [-0.97 + 1.94 * (i + f) / 22 for f in (0.07, 0.43, 0.74)]
            samples = [surf(-0.045 + 0.0018 * math.sin(2.8 * u), u, dorsal, 0.00030) for u in us]
            pat.cord(samples, 0.00031, "thread", 5)


def main():
    common.reset_scene()
    mats = build_materials()
    scanned_hide(mats)
    worn_dye(mats)
    glove = bpy.data.objects.new("WorkGlove", None)
    bpy.context.collection.objects.link(glove)
    glove.empty_display_size = 0.025
    pattern = Pattern()
    top, thumb = make_palm(pattern)
    for i in range(4):
        make_finger(pattern, i, top)
    make_thumb(pattern, thumb)
    finish_panels(pattern)
    sewn = pattern.finish(mats, glove)
    build_sleeved_arm(mats)
    root = SOURCE.parents[1]
    # Show the glove seated in the open sleeve when an artist opens the Blend.
    # Its independent wrist pivot remains at the origin in the game asset.
    glove.location.z = .72
    bpy.context.view_layer.objects.active = sewn
    sewn.select_set(True)
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_distance = 1.08
            area.spaces.active.region_3d.view_location = (0, 0, .38)
            area.spaces.active.shading.color_type = "MATERIAL"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "loader-gloves.blend"), compress=True)
    glove.location.z = 0
    bpy.ops.export_scene.gltf(
        filepath=str(root / "public/assets/closeups/loader-gloves.glb"),
        export_format="GLB",
        export_yup=True,
        export_animations=False,
        export_apply=False,
        export_morph=True,
        export_morph_normal=True,
        export_morph_tangent=False,
        export_tangents=True,
        export_all_vertex_colors=False,
        export_image_format="WEBP",
        export_image_quality=90,
        export_cameras=False,
        export_lights=False,
    )
    print(
        f"Loader glove: {len(pattern.forms)} vertices, {len(pattern.faces)} faces; relaxed, power grip, pinch."
    )


if __name__ == "__main__":
    main()
