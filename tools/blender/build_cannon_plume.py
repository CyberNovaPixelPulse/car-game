"""Bake one rolling gas puff to a 4 x 4 transparent texture for the exterior cannon.

Run Blender in background with --python-exit-code 1 --python this_file.
The .blend stores the editable simulation. Bake data lives in a temporary cache.
"""
import tempfile
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name("cannon-plume.blend")
ATLAS = ROOT / "public/art/effects/cannon-plume.png"
RES = 96
TILE = RES
FRAMES = range(3, 34, 2)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_end = max(FRAMES)
scene.gravity = (0, 0, -1.2)
scene.render.fps = 36

bpy.ops.mesh.primitive_cube_add(size=3.4)
domain = bpy.context.object
domain.name = "Rolling puff - gas domain"
fluid = domain.modifiers.new("Gas simulation", "FLUID")
fluid.fluid_type = "DOMAIN"
settings = fluid.domain_settings
settings.domain_type = "GAS"
settings.resolution_max = RES
settings.use_adaptive_domain = False
settings.vorticity = 0.8
settings.cache_type = "MODULAR"
settings.cache_frame_end = scene.frame_end
settings.cache_data_format = "UNI"
settings.cache_directory = "//cannon-plume-cache"

# An uneven cluster gives the leading and trailing edges different silhouettes.
for index, (x, y, z, radius, vx, vz) in enumerate([
    (-0.40, 0.03, -0.36, 0.36, -0.8, 0.75),
    (-0.08, -0.05, -0.29, 0.43, 0.25, 0.82),
    (0.27, 0.09, -0.22, 0.32, 0.65, 1.08),
    (0.48, -0.06, -0.34, 0.21, 1.05, 0.63),
]):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=(x, y, z))
    flow = bpy.context.object
    flow.name = f"Smoke pulse {index + 1}"
    mod = flow.modifiers.new("Brief emission", "FLUID")
    mod.fluid_type = "FLOW"
    fs = mod.flow_settings
    fs.flow_type = "SMOKE"
    fs.flow_behavior = "INFLOW"
    fs.use_initial_velocity = True
    fs.velocity_coord = (vx, index * 0.08, vz)
    fs.temperature = 0.65
    fs.density = 1
    fs.keyframe_insert(data_path="use_inflow", frame=3)
    fs.use_inflow = False
    fs.keyframe_insert(data_path="use_inflow", frame=4)
    flow.display_type = "WIRE"
    flow.hide_render = True

bpy.ops.object.effector_add(type="TURBULENCE", location=(0.2, 0.0, 0.05))
field = bpy.context.object
field.name = "Edge breakup"
field.field.strength = 2.8
field.field.size = 0.63
scene.frame_set(1)
bpy.ops.object.select_all(action="DESELECT")
domain.select_set(True)
bpy.context.view_layer.objects.active = domain
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)

def shade(grid):
    """Composite density front to back, with a soft directional shadow in each slice."""
    extinction = 0.22
    shadow = np.zeros_like(grid)
    for step in range(1, 12):
        # Light comes from above and left, slightly towards the camera.
        shadow[:-step, :, step:] += np.roll(grid[step:, :, :-step], -(step // 2), axis=1)
    light = 0.38 + 0.62 * np.exp(-shadow * 0.23)
    opacity = 1 - np.exp(-extinction * grid)
    transmission = np.exp(-extinction * (np.cumsum(grid, axis=1) - grid))
    weights = opacity * transmission
    alpha = weights.sum(axis=1)
    luminance = (weights * light).sum(axis=1) / np.maximum(alpha, 1e-6)
    rgba = np.empty((RES, RES, 4), dtype=np.float32)
    rgba[:, :, :3] = luminance[:, :, None] * np.array([0.77, 0.77, 0.73])
    # Leave a transparent gutter at tile edges for bilinear sampling.
    edge = np.minimum(np.arange(RES), np.arange(RES)[::-1])
    feather = np.clip((edge - 1) / 4, 0, 1)
    rgba[:, :, 3] = alpha * feather[:, None] * feather[None, :]
    return rgba

with tempfile.TemporaryDirectory(prefix="blender-cannon-plume-") as cache:
    settings.cache_directory = cache
    if "FINISHED" not in bpy.ops.fluid.bake_data():
        raise RuntimeError("Blender gas bake failed")
    atlas = np.zeros((4 * TILE, 4 * TILE, 4), dtype=np.float32)
    for i, frame in enumerate(FRAMES):
        scene.frame_set(frame)
        evaluated = domain.evaluated_get(bpy.context.evaluated_depsgraph_get())
        density = evaluated.modifiers[fluid.name].domain_settings.density_grid
        values = np.empty(len(density), dtype=np.float32)
        density.foreach_get(values)
        if values.size != RES**3 or values.max() <= 0:
            raise RuntimeError(f"Missing smoke density at frame {frame}")
        tile = shade(values.reshape(RES, RES, RES))
        row, col = divmod(i, 4)
        atlas[row*TILE:(row+1)*TILE, col*TILE:(col+1)*TILE] = tile
        print("Plume frame", frame, "peak opacity", round(float(tile[:, :, 3].max()), 3), flush=True)
    image = bpy.data.images.new("Cannon smoke - bottom row first", 4*TILE, 4*TILE, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.pixels.foreach_set(atlas.ravel())
    ATLAS.parent.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(ATLAS)
    image.file_format = "PNG"
    image.save()
