"""Retarget the CC0 anatomical hand to the crew grip and bake its skin maps."""
from dataclasses import dataclass
from math import cos, radians, sin
from pathlib import Path
import tempfile

import bpy
import numpy as np
from mathutils import Vector

from loader_uniform import make_material, packed_png


SOURCE = Path(__file__).parent / "sources/anatomical-right-hand.glb"
DIGITS = ("index", "middle", "ring", "pinky", "thumb")
SCALE = .88
WRIST_OFFSET = Vector((0, -.016, .004))
ATLAS_SIZE = 768
ATLAS_PAD = 12


def digit_name(digit, number):
    return f"{digit}_{number:02d}_r"


@dataclass
class GripHand:
    points: list
    weights: list
    faces: list
    uvs: np.ndarray
    joints: dict
    material: bpy.types.Material

    def add_to(self, garment, joint, side, label, wrist, basis):
        """Mirror the right skin and all its joint weights with coherent winding."""
        def place(point):
            return wrist + basis @ Vector((point[0] * side, point[1], point[2]))

        hand = f"Hand.{label}"
        keys = {"hand_r": hand}
        for digit in DIGITS:
            for number, suffix in enumerate(("Base", "Middle", "Tip"), 1):
                keys[digit_name(digit, number)] = f"{digit.title()}{suffix}.{label}"
        for name, (head, tail, parent) in self.joints.items():
            joint(keys[name], place(head), place(tail), keys[parent])
        first = len(garment.points)
        for point, weights in zip(self.points, self.weights):
            garment.vertex(place(point), [(keys[key], weight) for key, weight in weights], (0, 0))
        winding = slice(None, None, side)
        for face, coords in zip(self.faces, self.uvs):
            garment.face(tuple(first + i for i in face[winding]), "hand_skin", coords[winding])


def _fit_joint(arm, name, end, direction):
    bone = arm.pose.bones[name]
    frame = bone.matrix.to_quaternion()
    current = (end - bone.head).normalized()
    rotation = current.rotation_difference(direction.normalized())
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = frame.inverted() @ rotation @ frame
    bpy.context.view_layer.update()


def _pose_grip(arm, axes, tips):
    """Oppose the thumb and curl each finger around the shared grip axis."""
    x, y, z = axes
    # Cumulative flexion from each proximal, middle and distal phalanx.
    flexion = {
        "index": (32, 71, 126),
        "middle": (27, 66, 124),
        "ring": (27, 61, 114),
        "pinky": (14, 39, 92),
    }
    thumb = (
        Vector((-.68, .41, -.42)),
        Vector((-.13, .88, -.29)),
        Vector((.48, .83, -.27)),
    )
    for digit in DIGITS:
        for j in range(1, 4):
            name = digit_name(digit, j)
            bone = arm.pose.bones[name]
            if j < 3:
                end = arm.pose.bones[digit_name(digit, j + 1)].head
            else:
                source = arm.data.bones[name]
                local_tip = source.matrix_local.inverted() @ tips[digit]
                end = bone.matrix @ local_tip
            if digit == "thumb":
                direction = thumb[j - 1]
            else:
                angle = radians(flexion[digit][j - 1])
                # Small fan across the handle, where the little finger has less reach.
                spread = (-.11, -.01, .05, .11)[DIGITS.index(digit)]
                direction = Vector((spread, cos(angle), -sin(angle)))
            desired = x * direction.x + y * direction.y + z * direction.z
            _fit_joint(arm, name, end, desired)


def _rasterize(values, faces, uv):
    """Interpolate anatomical coordinates into the source UV islands."""
    size = ATLAS_SIZE
    pixels = uv * size - .5
    pixels[:, :, 1] = (1 - uv[:, :, 1]) * size - .5
    data = np.zeros((size, size, values.shape[1]), np.float32)
    mask = np.zeros((size, size), bool)
    for indices, triangle in zip(faces, pixels):
        low = np.maximum(0, np.floor(triangle.min(axis=0)).astype(int))
        high = np.minimum(size, np.ceil(triangle.max(axis=0)).astype(int) + 1)
        a, b, c = triangle
        ab, ac = b - a, c - a
        det = ab[0] * ac[1] - ab[1] * ac[0]
        if abs(det) < 1e-7:
            continue
        yy, xx = np.mgrid[low[1]:high[1], low[0]:high[0]]
        dx, dy = xx - a[0], yy - a[1]
        w = (ac[1] * dx - ac[0] * dy) / det
        v = (ab[0] * dy - ab[1] * dx) / det
        u = 1 - w - v
        inside = (u >= 0) & (v >= 0) & (w >= 0)
        xx, yy = xx[inside], yy[inside]
        v0, v1, v2 = values[list(indices)]
        data[yy, xx] = u[inside, None] * v0 + w[inside, None] * v1 + v[inside, None] * v2
        mask[yy, xx] = True
    return data, mask


def _smoothstep(start, end, value):
    x = np.clip((value - start) / (end - start), 0, 1)
    return x * x * (3 - 2 * x)


def _skin_maps(rest, normals, weights, faces, uv, joints, tips):
    # Use the source normal and three-dimensional coordinates for continuous
    # pigment across UV splits and across the five connected fingers.
    values = np.column_stack((rest, normals, weights))
    atlas, mask = _rasterize(values, faces, uv)
    point, normal, dominance = np.split(atlas[mask], (3, 6), axis=1)
    x, y, z = point.T
    dorsal = _smoothstep(-.55, .35, normal[:, 2])
    color = np.array([190., 141., 118.]) + dorsal[:, None] * [-16, -13, -9]
    knuckle = np.zeros_like(x)
    crease = np.zeros_like(x)
    nail = np.zeros_like(x)
    half_moon = np.zeros_like(x)
    free_edge = np.zeros_like(x)
    for d, digit in enumerate(DIGITS):
        finger = dominance[:, d]
        for j in (1, 2, 3):
            pivot = joints[digit_name(digit, j)]
            out = joints[digit_name(digit, j + 1)] if j < 3 else tips[digit]
            delta = point - pivot
            axis = out - pivot
            axis /= np.linalg.norm(axis)
            longitudinal = np.einsum("ij,j->i", delta, axis)
            side = np.cross(axis, (0, 0, 1))
            side /= np.linalg.norm(side)
            cross = np.einsum("ij,j->i", delta, side)
            rounded = np.exp(-.5 * ((longitudinal / .007) ** 2 + (cross / .010) ** 2))
            knuckle = np.maximum(knuckle, rounded * finger * dorsal)
            bend = longitudinal + 9 * cross * cross
            wrinkle = .65 * np.exp(-((bend + .0013) / .00060) ** 2)
            wrinkle += .35 * np.exp(-((bend - .0016) / .00065) ** 2)
            crease = np.maximum(crease, wrinkle * rounded * finger * dorsal)
            if j != 3:
                continue
            length = float(np.linalg.norm(tips[digit] - pivot))
            width = (.0069, .0073, .0065, .0056, .0082)[d]
            # The dorsal side of the curved distal phalanx defines the nail bed.
            up = np.cross(side, axis)
            normal_up = np.einsum("ij,j->i", normal, up)
            transverse = np.abs(cross) / width
            along = longitudinal / length
            shape = transverse ** 4 + ((along - .67) / .27) ** 4
            bed = (1 - _smoothstep(.80, 1.10, shape)) * _smoothstep(.47, .77, normal_up)
            bed *= _smoothstep(.49, .78, finger)
            nail = np.maximum(nail, bed)
            half_moon = np.maximum(half_moon, bed * (1 - _smoothstep(.45, .58, along + .10 * transverse)))
            free_edge = np.maximum(free_edge, bed * _smoothstep(.84, .94, along))

    # Warm joint tissue, subtle blue-grey under the skin of the back, and a
    # restrained amount of fine mottling. Hands and cuffs use separate textures.
    color += knuckle[:, None] * [12, -7, -5]
    color -= crease[:, None] * [12, 11, 8]
    vein_x = -.012 + .010 * np.sin(y * 43)
    vein = dorsal * np.exp(-((x - vein_x) / .0024) ** 2) * np.exp(-((y - .057) / .024) ** 2)
    color += vein[:, None] * [-8, 1, 3]
    mottle = np.sin(312 * x + 185 * y - 248 * z) * np.sin(252 * y + 185 * z)
    fleck = np.sin(1460 * x + 466 * y) * np.sin(1683 * y - 81 * z) * np.sin(1011 * z + 183 * x)
    pores = .48 * fleck + .42 * np.sin(2832 * x - 3313 * y + 1932 * z) * np.cos(3192 * y + 899 * z)
    color += (3.4 * mottle + 2.9 * fleck - 1.6 * pores)[:, None]
    color = color * (1 - nail[:, None]) + nail[:, None] * [192, 143, 133]
    color += half_moon[:, None] * [17, 17, 13] + free_edge[:, None] * [27, 29, 24]
    rough = .57 + .055 * mottle - .20 * nail + .075 * crease
    relief = .19 * pores - .24 * crease + .12 * nail
    maps = np.zeros((ATLAS_SIZE, ATLAS_SIZE, 5), np.float32)
    maps[mask] = np.column_stack((color, rough, relief))
    # Pad UV islands for both texture filtering and the derived tangent normal.
    for _ in range(ATLAS_PAD):
        covered = mask.copy()
        for axis, step in ((0, 1), (0, -1), (1, 1), (1, -1)):
            take = np.roll(mask, step, axis=axis) & ~covered
            maps[take] = np.roll(maps, step, axis=axis)[take]
            covered |= take
        mask = covered
    maps[~mask] = (178, 131, 110, .58, 0)
    height = maps[:, :, 4]
    dx = .21 * (np.roll(height, -1, 1) - np.roll(height, 1, 1))
    dy = -.21 * (np.roll(height, -1, 0) - np.roll(height, 1, 0))
    tangent = np.dstack((-dx, -dy, np.ones_like(height)))
    tangent /= np.linalg.norm(tangent, axis=2, keepdims=True)
    finish = np.dstack((np.ones_like(height) * 255, maps[:, :, 3] * 255, np.zeros_like(height)))
    with tempfile.TemporaryDirectory() as tmp:
        directory = Path(tmp)
        base = packed_png("Crew-hand-skin", maps[:, :, :3], directory, "sRGB")
        normal_map = packed_png("Crew-hand-pore-detail", (tangent * .5 + .5) * 255, directory, "Non-Color")
        rough_map = packed_png("Crew-hand-surface", finish, directory, "Non-Color")
    return make_material("Crew skin and natural nails", (178, 131, 110), .57, (base, normal_map, rough_map))


def load_grip_hand():
    bpy.ops.import_scene.gltf(filepath=str(SOURCE), merge_vertices=True, bone_heuristic="TEMPERANCE")
    arm = next(o for o in bpy.context.selected_objects if o.type == "ARMATURE")
    obj = next(o for o in bpy.context.selected_objects if o.type == "MESH")
    source_bones = arm.data.bones
    wrist = source_bones["hand_r"].head_local.copy()

    def head(digit, j):
        return source_bones[digit_name(digit, j)].head_local

    y = (head("middle", 1) - wrist).normalized()
    x = head("pinky", 1) - head("index", 1)
    x = (x - y * x.dot(y)).normalized()
    axes = (x, y, x.cross(y))

    def local(point, origin):
        return Vector(tuple((point - origin).dot(axis) for axis in axes))

    groups = [group.name for group in obj.vertex_groups]
    weights = [[(groups[g.group], g.weight) for g in v.groups] for v in obj.data.vertices]
    rest = [local(v.co, wrist) for v in obj.data.vertices]
    normals = [local(v.normal, Vector((0, 0, 0))) for v in obj.data.vertices]
    classes = np.zeros((len(rest), len(DIGITS)), np.float32)
    tips = {}
    for col, digit in enumerate(DIGITS):
        for i, values in enumerate(weights):
            classes[i, col] = sum(w for name, w in values if name.startswith(digit + "_"))
        origin = head(digit, 3)
        axis = (origin - head(digit, 2)).normalized()
        extend = max((v.co - origin).dot(axis) for v, values in zip(obj.data.vertices, weights)
                     if any(n == digit_name(digit, 3) and w > .75 for n, w in values))
        tips[digit] = origin + axis * extend

    obj.data.calc_loop_triangles()
    faces = [tuple(t.vertices) for t in obj.data.loop_triangles]
    active_uv = obj.data.uv_layers.active.uv
    uvs = np.array([[tuple(active_uv[i].vector) for i in t.loops] for t in obj.data.loop_triangles])
    # The original body atlas only allocates a corner to the hand.
    lo, hi = np.min(uvs, axis=(0, 1)), np.max(uvs, axis=(0, 1))
    uvs = .03 + .94 * (uvs - lo) / (hi - lo)
    joints = {bone.name: np.array(local(bone.head_local, wrist)) for bone in source_bones}
    local_tips = {digit: np.array(local(tip, wrist)) for digit, tip in tips.items()}
    material = _skin_maps(rest, normals, classes, faces, uvs, joints, local_tips)
    _pose_grip(arm, axes, tips)

    def fitted(p):
        return local(p, wrist) * SCALE + WRIST_OFFSET

    posed_joints = {}
    for digit in DIGITS:
        for j in range(1, 4):
            name = digit_name(digit, j)
            bone = arm.pose.bones[name]
            if j < 3:
                end = arm.pose.bones[digit_name(digit, j + 1)].head
            else:
                rest_frame = source_bones[name].matrix_local
                end = bone.matrix @ (rest_frame.inverted() @ tips[digit])
            posed_joints[name] = fitted(bone.head), fitted(end), bone.parent.name

    skinned = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    points = [fitted(v.co) for v in skinned.vertices]
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.objects.remove(arm, do_unlink=True)
    return GripHand(points, weights, faces, uvs, posed_joints, material)
