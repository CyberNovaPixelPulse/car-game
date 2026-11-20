"""Build the project-authored uniform, gloves and full-body skeleton for #85.

Run Blender in background factory-startup mode with this script. Coordinates
are metres: +Y forward, +Z up in Blender, exported as Three.js -Z forward.
The authored armature is centred at the pelvis. Grip is a closed neutral pose;
the digit joints remain editable for other workstations.
"""
import math
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from loader_uniform import build_materials, make_material


ROOT = Path(__file__).resolve().parents[2]
RIGHT = Vector((1, 0, 0))
UP = Vector((0, 0, 1))
bones = {}


def joint(name, head, tail, parent=None):
    bones[name] = Vector(head), Vector(tail), parent


def blend(start, finish, weight):
    return [(start, 1 - weight), (finish, weight)]


class Garment:
    def __init__(self):
        self.points = []
        self.weights = []
        self.uvs = []
        self.faces = []
        self.faces_material = []

    def vertex(self, point, weights, uv):
        self.points.append(tuple(point))
        self.weights.append([(bone, weight) for bone, weight in weights if weight > 0])
        self.uvs.append(uv)
        return len(self.points) - 1

    def face(self, vertices, material):
        self.faces.append(tuple(vertices))
        self.faces_material.append(material)

    def tube(self, rings, material, side=RIGHT, steps=20, folds=0):
        """Loft elliptical cloth sections with varying creases and skin weights."""
        indices = []
        distance = 0.0
        for i, (centre, width, depth, weights) in enumerate(rings):
            centre = Vector(centre)
            tangent = (Vector(rings[min(len(rings) - 1, i + 1)][0])
                       - Vector(rings[max(0, i - 1)][0])).normalized()
            if i:
                distance += (centre - Vector(rings[i - 1][0])).length
            u = (side - tangent * side.dot(tangent)).normalized()
            if u.length_squared < .001:
                u = tangent.cross(UP).normalized()
            v = tangent.cross(u)
            ring = []
            for segment in range(steps):
                angle = segment * math.tau / steps
                crease = folds * (math.sin(distance * 57 + angle * 3.0)
                                  + .52 * math.cos(distance * 107 - angle * 5))
                offset = (u * ((width + crease) * math.cos(angle))
                          + v * ((depth + crease) * math.sin(angle)))
                ring.append(self.vertex(centre + offset, weights, (segment / steps, distance * 2.7)))
            indices.append(ring)
        self.face(reversed(indices[0]), material)
        for base, top in zip(indices, indices[1:]):
            for i in range(steps):
                j = (i + 1) % steps
                self.face((base[i], base[j], top[j], top[i]), material)
        self.face(indices[-1], material)

    def sphere(self, centre, sizes, weights, material):
        centre = Vector(centre)
        self.tube([
            (centre + UP * (math.sin(a) * sizes[2]),
             max(.0004, math.cos(a) * sizes[0]),
             max(.0004, math.cos(a) * sizes[1]), weights)
            for a in (math.pi * (i / 12 - .5) for i in range(13))
        ], material, steps=24)

    def patch(self, centre, half_width, half_height, weights, material):
        # The bevel is formed by inset corners to make raised welt edges.
        x, y, z = centre
        corners = ((-.78, -1), (.78, -1), (1, -.75), (1, .76),
                   (.79, 1), (-.79, 1), (-1, .76), (-1, -.75))
        base = [self.vertex((x + u * half_width, y, z + v * half_height), weights,
                            ((u + 1) * .1, (v + 1) * .1)) for u, v in corners]
        front = [self.vertex((x + u * half_width * .94, y + .004, z + v * half_height * .94), weights,
                             ((u + 1) * .1, (v + 1) * .1)) for u, v in corners]
        self.face(reversed(base), material)
        for i in range(len(base)):
            j = (i + 1) % len(base)
            self.face((base[i], base[j], front[j], front[i]), material)
        self.face(front, material)

    def bind(self, name, rig, materials):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.points, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = rig
        modifier = obj.modifiers.new("Uniform follows the crew bones", "ARMATURE")
        modifier.object = rig
        groups = {}
        for idx, weights in enumerate(self.weights):
            for bone, weight in weights:
                group = groups.get(bone)
                if group is None:
                    group = obj.vertex_groups.new(name=bone)
                    groups[bone] = group
                group.add([idx], weight, "REPLACE")
        slots = {}
        for material in dict.fromkeys(self.faces_material):
            slots[material] = len(mesh.materials)
            mesh.materials.append(materials[material])
        for poly, material in zip(mesh.polygons, self.faces_material):
            poly.material_index = slots[material]
            poly.use_smooth = len(poly.vertices) < 8
        # The profile along a limb can face any direction. Give each closed
        # island coherent outside normals before generating tangents.
        normals = bmesh.new()
        normals.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(normals, faces=list(normals.faces))
        bmesh.ops.triangulate(normals, faces=list(normals.faces))
        normals.to_mesh(mesh)
        normals.free()
        uv = mesh.uv_layers.new(name="Uniform weave")
        for poly in mesh.polygons:
            for index in poly.loop_indices:
                uv.data[index].uv = self.uvs[mesh.loops[index].vertex_index]
        return obj


def sleeve(garment, side, label, shoulder, elbow, wrist):
    upper, fore, hand = (f"{key}.{label}" for key in ("UpperArm", "Forearm", "Hand"))
    along = (elbow - shoulder).normalized()
    joint(upper, shoulder, elbow, "Chest")
    joint(fore, elbow, wrist, upper)
    # Hand local Y follows this rest direction. Its rest roll remains editable.
    hand_axis = (wrist - elbow).normalized()
    joint(hand, wrist, wrist + hand_axis * .16, fore)
    garment.tube([
        (shoulder - along * .04, .075, .083, blend("Chest", upper, .72)),
        (shoulder + along * .008, .086, .093, blend("Chest", upper, .85)),
        (shoulder.lerp(elbow, .25), .081, .076, [(upper, 1)]),
        (shoulder.lerp(elbow, .6), .065, .065, [(upper, 1)]),
        (shoulder.lerp(elbow, .85), .063, .060, blend(upper, fore, .15)),
        (elbow, .066, .063, blend(upper, fore, .5)),
        (elbow.lerp(wrist, .15), .061, .055, blend(upper, fore, .89)),
        (elbow.lerp(wrist, .4), .052, .050, [(fore, 1)]),
        (elbow.lerp(wrist, .72), .048, .042, [(fore, 1)]),
        (wrist, .043, .036, blend(fore, hand, .65)),
    ], "cloth", side=Vector((0, 1, 0)), steps=24, folds=.0036)
    garment.tube([
        (elbow.lerp(wrist, .81), .052, .046, [(fore, 1)]),
        (elbow.lerp(wrist, .83), .052, .046, [(fore, 1)]),
        (elbow.lerp(wrist, .97), .046, .041, blend(fore, hand, .57)),
        (wrist + hand_axis * .008, .043, .039, blend(fore, hand, .72)),
    ], "cuff", side=Vector((0, 1, 0)), steps=24)
    # Bones created without roll transmit Blender's local hand basis to glTF.
    basis = Vector((0, 1, 0)).rotation_difference(hand_axis)
    glove(garment, side, label, wrist, basis)


def glove(garment, side, label, wrist, basis):
    hand = f"Hand.{label}"

    def at(p):
        return wrist + basis @ Vector(p)

    def rings(values, material, steps=14):
        garment.tube([(at(point), radius, depth, weights)
                      for point, radius, depth, weights in values], material,
                     side=basis @ RIGHT, steps=steps)

    palm = [(hand, 1)]
    rings([
        ((0, -.009, 0), .040, .028, palm),
        ((0, .016, 0), .037, .025, palm),
        ((0, .045, .002), .041, .025, palm),
        ((side * .001, .071, -.006), .046, .024, palm),
        ((side * .006, .086, -.011), .044, .021, palm),
        ((side * .009, .093, -.013), .038, .016, palm),
    ], "leather", 24)
    for index, (digit, length) in enumerate((("Index", 1.0), ("Middle", 1.03),
                                            ("Ring", .94), ("Pinky", .77))):
        x = side * (-.026 + index * .022)
        base = (x, .079 - index * .002, -.004)
        knuckle = (x, .112 * length, -.011)
        bend = (x, .114 * length, -.036)
        tip = (x - side * .002, .092 * length, -.053)
        first, last = f"{digit}Base.{label}", f"{digit}Tip.{label}"
        joint(first, at(base), at(knuckle), hand)
        joint(last, at(knuckle), at(tip), first)
        radius = .0117 - index * .0009
        rings([
            (base, radius, radius * .92, blend(hand, first, .36)),
            (knuckle, radius, radius * .91, blend(first, last, .46)),
            (bend, radius * .87, radius * .87, [(last, 1)]),
            (tip, radius * .71, radius * .73, [(last, 1)]),
        ], "leather", 12)
    thumb = f"Thumb.{label}"
    base = (-side * .031, .042, -.008)
    bend = (-side * .050, .066, -.022)
    tip = (-side * .033, .085, -.043)
    joint(thumb, at(base), at(tip), hand)
    rings([(base, .015, .016, blend(hand, thumb, .37)),
           (bend, .016, .013, [(thumb, 1)]),
           (tip, .012, .010, [(thumb, 1)])], "leather", 14)


def leg(garment, side, label):
    thigh, shin, foot = (f"{key}.{label}" for key in ("Thigh", "Shin", "Foot"))
    hip = Vector((side * .102, 0, -.017))
    knee = Vector((side * .122, .023, -.437))
    ankle = Vector((side * .137, -.007, -.845))
    joint(thigh, hip, knee, "Pelvis")
    joint(shin, knee, ankle, thigh)
    joint(foot, ankle, ankle + Vector((0, .153, -.022)), shin)
    garment.tube([
        (hip + UP * .045, .105, .109, blend("Pelvis", thigh, .56)),
        (hip, .106, .108, blend("Pelvis", thigh, .78)),
        (hip.lerp(knee, .37), .098, .097, [(thigh, 1)]),
        (hip.lerp(knee, .74), .075, .079, [(thigh, 1)]),
        (knee, .070, .073, blend(thigh, shin, .52)),
        (knee.lerp(ankle, .16), .067, .075, blend(thigh, shin, .89)),
        (knee.lerp(ankle, .42), .063, .068, [(shin, 1)]),
        (knee.lerp(ankle, .63), .060, .056, [(shin, 1)]),
        (knee.lerp(ankle, .72), .061, .055, [(shin, 1)]),
    ], "cloth", steps=24, folds=.004)
    garment.tube([
        (ankle + UP * .18, .068, .071, [(shin, 1)]),
        (ankle + UP * .156, .071, .072, [(shin, 1)]),
        (ankle + UP * .107, .061, .061, blend(shin, foot, .12)),
        (ankle + UP * .053, .057, .061, blend(shin, foot, .51)),
        (ankle + UP * .017, .055, .066, [(foot, 1)]),
    ], "boot", steps=22)
    def sole(v, z):
        return ankle + Vector((0, v, z))

    garment.tube([
        (sole(-.053, -.028), .046, .027, [(foot, 1)]),
        (sole(-.032, -.025), .057, .045, [(foot, 1)]),
        (sole(.044, -.029), .059, .040, [(foot, 1)]),
        (sole(.096, -.035), .063, .031, [(foot, 1)]),
        (sole(.15, -.041), .059, .024, [(foot, 1)]),
        (sole(.179, -.049), .029, .015, [(foot, 1)]),
    ], "boot", steps=26)
    garment.tube([
        (sole(-.054, -.071), .045, .011, [(foot, 1)]),
        (sole(-.032, -.072), .057, .011, [(foot, 1)]),
        (sole(.05, -.071), .059, .011, [(foot, 1)]),
        (sole(.124, -.068), .063, .011, [(foot, 1)]),
        (sole(.176, -.063), .028, .009, [(foot, 1)]),
    ], "sole", steps=20)
    for index in range(4):
        f = index / 3
        y, z = .014 + f * .109, .014 - f * .031
        for facing in (-1, 1):
            p = sole(y, z)
            garment.tube([
                (p + Vector((facing * -.030, 0, -.005)), .0026, .0023, [(foot, 1)]),
                (p + Vector((0, .011, 0)), .0030, .0023, [(foot, 1)]),
                (p + Vector((facing * .030, 0, .013)), .0026, .0023, [(foot, 1)]),
            ], "lace", side=Vector((0, 1, 0)), steps=8)


def build():
    materials = build_materials()
    materials.update({
        "boot": make_material("Scuffed russet service leather", (76, 52, 35), .66),
        "sole": make_material("Black rubber outsole", (38, 34, 28), .87),
        "lace": make_material("Waxed boot lace", (111, 81, 51), .80),
        "skin": make_material("Crew warm skin", (164, 110, 76), .64),
        "helmet": make_material("Olive tanker helmet", (84, 87, 52), .88),
    })
    body = Garment()
    joint("Pelvis", (0, 0, 0), (0, 0, .164))
    joint("Chest", (0, 0, .164), (0, .005, .462), "Pelvis")
    joint("Neck", (0, .005, .462), (0, .008, .545), "Chest")
    joint("Head", (0, .008, .545), (0, .012, .753), "Neck")
    body.tube([
        ((0, 0, -.055), .147, .100, [("Pelvis", 1)]),
        ((0, -.007, .005), .187, .114, [("Pelvis", 1)]),
        ((0, -.002, .070), .166, .105, [("Pelvis", 1)]),
        ((0, .004, .142), .148, .099, blend("Pelvis", "Chest", .36)),
        ((0, .011, .217), .160, .107, blend("Pelvis", "Chest", .78)),
        ((0, .014, .293), .182, .116, [("Chest", 1)]),
        ((0, .011, .368), .189, .115, [("Chest", 1)]),
        ((0, -.001, .411), .208, .101, [("Chest", 1)]),
        ((0, -.001, .451), .163, .082, [("Chest", 1)]),
        ((0, .004, .470), .067, .066, blend("Chest", "Neck", .18)),
    ], "cloth", steps=32, folds=.0045)
    body.tube([
        ((0, -.006, .059), .174, .114, [("Pelvis", 1)]),
        ((0, -.004, .089), .164, .110, [("Pelvis", 1)]),
    ], "cuff", steps=28)
    body.tube([
        ((0, -.001, .447), .080, .064, [("Chest", 1)]),
        ((0, .004, .481), .064, .060, blend("Chest", "Neck", .31)),
        ((0, .006, .495), .059, .055, blend("Chest", "Neck", .42)),
    ], "cuff", steps=24)
    body.patch((0, .113, .073), .028, .015, [("Pelvis", 1)], "button")
    for side, label in ((-1, "L"), (1, "R")):
        shoulder = Vector((side * .184, .001, .410))
        elbow = Vector((side * .402, .008, .259))
        wrist = Vector((side * .543, .024, .065))
        sleeve(body, side, label, shoulder, elbow, wrist)
        leg(body, side, label)
        body.patch((side * .100, .111, .315), .058, .055, [("Chest", 1)], "cuff")
        body.patch((side * .100, .119, .354), .062, .015, [("Chest", 1)], "cloth")
        body.sphere((side * .096, .125, .343), (.007, .004, .007), [("Chest", 1)], "button")

    face = Garment()
    face.tube([
        ((0, .006, .470), .053, .053, [("Neck", 1)]),
        ((0, .009, .520), .048, .050, blend("Neck", "Head", .4)),
        ((0, .019, .555), .050, .052, blend("Neck", "Head", .89)),
    ], "skin")
    face.sphere((0, .032, .627), (.077, .084, .112), [("Head", 1)], "skin")
    face.sphere((0, .103, .619), (.017, .023, .025), [("Head", 1)], "skin")
    face.sphere((0, .015, .682), (.095, .103, .071), [("Head", 1)], "helmet")
    for side in (-1, 1):
        face.sphere((side * .084, .008, .638), (.019, .047, .063), [("Head", 1)], "helmet")

    data = bpy.data.armatures.new("Crew armature")
    rig = bpy.data.objects.new("CrewRig", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in bones.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    body.bind("CrewUniform", rig, materials)
    face.bind("CrewHeadMesh", rig, materials)
    rig["source"] = "Project original, CC0-1.0"
    rig.show_in_front = True
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "tools/blender/crew-body.blend"), compress=True)
    bpy.ops.export_scene.gltf(
        filepath=str(ROOT / "public/assets/closeups/crew-body.glb"),
        export_format="GLB",
        export_yup=True,
        export_animations=False,
        export_skins=True,
        export_tangents=True,
        export_image_format="WEBP",
        export_image_quality=90,
    )


if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build()
