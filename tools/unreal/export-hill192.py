"""Read the PastureBlend map in Unreal Editor and export browser world assets.

Set HILL192_EXPORT_OUTPUT to an empty staging directory. Run this script with
UnrealEditor-Cmd -run=pythonscript -script=<absolute path> -nullRHI.
"""

import json
import math
import os
from collections import defaultdict
from pathlib import Path

import unreal as ue


MAP = "/Game/Hill192PastureBlend/Hill192PastureBlend"
OUTPUT = Path(os.environ["HILL192_EXPORT_OUTPUT"])
OUTPUT.mkdir(parents=True, exist_ok=True)


def game_vector(vector, scale=1):
    return [-vector.y * scale, vector.z * scale, vector.x * scale]


def game_transform(transform):
    """Convert glTF's Unreal mesh-local axes to browser east/up/south."""
    scale = transform.scale3d
    rotation = transform.rotation
    columns = [
        rotation.rotate_vector(ue.Vector(scale.x, 0, 0)),
        rotation.rotate_vector(ue.Vector(0, 0, scale.z)),
        rotation.rotate_vector(ue.Vector(0, scale.y, 0)),
    ]
    return [round(value, 6) for column in
            [*(game_vector(axis) for axis in columns), game_vector(transform.translation, .01)]
            for value in column]


def is_ground(name, materials):
    return ("Relief" in name or name.startswith("SM_SeatedTalus") or
            any("Pasture" in material or material == "M_BankFoot" for material in materials))


def export_world():
    world = ue.EditorLoadingAndSavingUtils.load_map(MAP)
    assert world and world.get_path_name().split(".")[0] == MAP
    actors = ue.get_editor_subsystem(ue.EditorActorSubsystem).get_all_level_actors()
    placements = defaultdict(list)
    meshes = {}
    light = None
    for actor in actors:
        if isinstance(actor, ue.DirectionalLight):
            sun = actor.get_actor_forward_vector()
            light = game_vector(sun, -1)
        for component in actor.get_components_by_class(ue.StaticMeshComponent):
            mesh = component.get_editor_property("static_mesh")
            if not mesh or mesh.get_name() == "Sphere":
                continue
            name = mesh.get_name()
            if name in meshes:
                assert mesh.get_path_name() == meshes[name][0].get_path_name(), name
            materials = [component.get_material(i).get_name() for i in range(component.get_num_materials())]
            meshes[name] = (mesh, is_ground(name, materials))
            if isinstance(component, ue.InstancedStaticMeshComponent):
                poses = (component.get_instance_transform(i, world_space=True)
                         for i in range(component.get_instance_count()))
            else:
                poses = (component.get_world_transform(),)
            for pose in poses:
                matrix = game_transform(pose)
                assert all(math.isfinite(value) for value in matrix), name
                placements[name].append(matrix)

    options = ue.GLTFExportOptions()
    options.set_editor_properties(dict(
        bake_material_inputs=ue.GLTFMaterialBakeMode.DISABLED,
        texture_image_format=ue.GLTFTextureImageFormat.JPEG,
        texture_image_quality=85,
        export_vertex_colors=True,
    ))
    for name, (mesh, ground) in sorted(meshes.items()):
        if name.startswith("SM_Eco_"):
            # The import files retain the authored leaf masks and PBR maps. The
            # browser uses them with the locations read above from the map.
            continue
        options.set_editor_property("default_level_of_detail", 1 if name == "SM_CommonHazel" else 0)
        target = OUTPUT / (name + ".glb")
        ue.GLTFExporter.export_to_gltf(mesh, str(target), options, set())
        assert target.is_file() and target.stat().st_size > 100, name
    assert light and len(placements) >= 50
    manifest = {
        "sourceMap": MAP,
        "sun": light,
        "meshes": {name: {"ground": meshes[name][1], "instances": sorted(matrices)}
                   for name, matrices in sorted(placements.items())},
    }
    (OUTPUT / "world.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    ue.log("HILL192_BROWSER_WORLD_EXPORTED")


export_world()
