"""Render review stills of an exported tank glTF, with tracks laid along the
exported path exactly as the game does it.

Blender --background --factory-startup --python tools/blender/render_preview.py -- \
    --glb public/art/vehicles/sherman.glb --out /tmp/review [--samples 96]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402

import common as C  # noqa: E402


def lay_tracks(root, link):
    path = list(root["track_path"])
    pts = list(zip(path[::2], path[1::2]))
    count = int(root["track_links"])
    seg = [math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    total = sum(seg)

    def sample(s):
        s %= total
        i, acc = 0, 0.0
        while acc + seg[i] < s:
            acc += seg[i]
            i += 1
        a, b = pts[i], pts[(i + 1) % len(pts)]
        t = (s - acc) / seg[i]
        z, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        dz, dy = b[0] - a[0], b[1] - a[1]
        return z, y, math.atan2(-dy, dz)

    for side in (-1, 1):
        for n in range(count):
            z, y, ang = sample(n * total / count)
            ob = link.copy()
            bpy.context.scene.collection.objects.link(ob)
            ob.parent = None
            ob.location = (side * root["track_x"], -z, y)
            ob.rotation_euler = (ang, 0, 0)
    link.hide_render = True


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    args = dict(zip(argv[::2], argv[1::2]))
    glb, out = os.path.abspath(args["--glb"]), os.path.abspath(args["--out"])
    os.makedirs(out, exist_ok=True)
    C.reset_scene()
    bpy.ops.import_scene.gltf(filepath=glb)
    root = next(o for o in bpy.data.objects if "track_path" in o.keys())
    link = next(o for o in bpy.data.objects if o.name.startswith("track_link"))
    lay_tracks(root, link)

    scene = bpy.context.scene
    C.use_gpu(scene, int(args.get("--samples", 96)))
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
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(2.5)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    scene.collection.objects.link(sun)

    bpy.ops.mesh.primitive_plane_add(size=60)
    ground = bpy.context.active_object
    mat = bpy.data.materials.new("ground")
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    g = mat.node_tree
    bsdf = g.nodes["Principled BSDF"]
    coord = g.nodes.new("ShaderNodeTexCoord")
    mapping = g.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (12, 12, 12)
    g.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    for key, sock, colour in (("diff", "Base Color", "sRGB"), ("rough", "Roughness", "Non-Color")):
        tex = g.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(os.path.join(C.SOURCES, f"brown_mud_02_{key}_2k.jpg"))
        tex.image.colorspace_settings.name = colour
        g.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        g.links.new(tex.outputs["Color"], bsdf.inputs[sock])
    ground.data.materials.append(mat)

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    # (name, azimuth deg from front, elevation deg, distance, target z)
    views = [("front34", 35, 12, 11.5, 1.2), ("rear34", 215, 16, 11.5, 1.2), ("side", 90, 4, 12.5, 1.1), ("closeup", 20, 24, 6.2, 1.6)]
    for name, az, el, dist, tz in views:
        a, e = math.radians(az), math.radians(el)
        target = (0, 0, tz)
        cam.location = (math.sin(a) * math.cos(e) * dist, math.cos(a) * math.cos(e) * dist, tz + math.sin(e) * dist)
        d = [target[i] - cam.location[i] for i in range(3)]
        cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
        scene.render.filepath = os.path.join(out, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[tank-art] rendered {scene.render.filepath}")


main()
