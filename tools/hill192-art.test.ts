import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  HILL_192_SURVEY_TERRAIN,
  HILL_192_TERRAIN,
} from "../web/hill192-level.ts";
import { terrainHeightAt } from "../web/tank-terrain.ts";

const folder = new URL("../public/art/hill192/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, folder));

test("the Hill 192 Blender exports cover every instanced landscape part", () => {
  const guide = JSON.parse(read("layout.json").toString());
  const glb = read("vegetation.glb");
  assert.equal(glb.toString("utf8", 0, 4), "glTF");
  const { nodes } = JSON.parse(
    glb.toString("utf8", 20, 20 + glb.readUInt32LE(12)),
  ) as { nodes: { name: string }[] };
  const names = new Set(nodes.map((node) => node.name));
  for (const kind of [
    "OakTrunk",
    "OakCrown",
    "OakLeafMasses",
    "Bocage",
    "Flint",
    "Verge",
    "Stubble",
  ])
    assert.ok(names.has(kind), `missing Blender prototype ${kind}`);
  assert.equal(guide.stride, 6);
  for (const [kind, placements] of Object.entries(guide.placements) as [
    string,
    number[],
  ][]) {
    assert.ok(placements.length > 0 && placements.length % guide.stride === 0);
    for (let i = 0; i < placements.length; i += guide.stride) {
      const [x, y, z, , size] = placements.slice(i, i + guide.stride);
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
      assert.ok(size > 0);
      assert.ok(
        Math.abs(y - terrainHeightAt(HILL_192_SURVEY_TERRAIN, x, z)) < 0.23,
      );
      // The designated long approach runs along X = -110. No tree canopy or
      // full hedge placement may cross the shared open corridor.
      if (z > -87 && z < 145 && kind === "oak")
        assert.ok(Math.abs(x + 110) >= 14.49);
      if (z > -87 && z < 145 && kind === "bocage")
        assert.ok(Math.abs(x + 110) >= 5.79);
    }
  }
  const direction: number[] = guide.light.sun;
  assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-5);
  assert.ok(
    direction[1] > 0.65,
    "summer-afternoon light must sit over the field",
  );
});

test("the authored field and flint masks use opaque PNG channels", () => {
  const ground = read("ground-weights.png");
  const flint = read("flint-weights.png");
  assert.equal(ground.readUInt32BE(16), 1536);
  assert.equal(flint.readUInt32BE(16), 768);
  // Non-colour masks must survive native browser image upload without RGB
  // values being impacted by an alpha channel and premultiplied decoding.
  assert.equal(ground.readUInt8(25), 2);
  assert.equal(flint.readUInt8(25), 0);
});

test("the Unreal world ships every prototype without an extra texture decoder", () => {
  const glb = read("pasture-blend/world.glb");
  assert.equal(glb.toString("utf8", 0, 4), "glTF");
  const model = JSON.parse(
    glb.toString("utf8", 20, 20 + glb.readUInt32LE(12)),
  ) as {
    extensionsRequired: string[];
    nodes: { name: string }[];
  };
  assert.ok(!model.extensionsRequired.includes("KHR_texture_basisu"));
  const names = new Set(model.nodes.map((node) => node.name));
  const layout = JSON.parse(read("pasture-blend/world.json").toString()) as {
    sourceMap: string;
    meshes: Record<string, { far?: boolean; instances: number[][] }>;
  };
  assert.equal(
    layout.sourceMap,
    "/Game/Hill192PastureBlend/Hill192PastureBlend",
  );
  for (const [name, part] of Object.entries(layout.meshes)) {
    assert.ok(names.has(name), name);
    assert.ok(!part.far || names.has(name + "_far"), name);
    assert.ok(part.instances.length > 0);
    assert.ok(
      part.instances.every(
        (pose) => pose.length === 12 && pose.every(Number.isFinite),
      ),
    );
  }

  // Loose flint was placed on the native collision surface. The browser's
  // north-up height field must stay under those same meshes after conversion.
  const flint = layout.meshes.SM_Flint.instances;
  assert.ok(flint.length > 1000);
  for (const pose of flint) {
    const [x, y, z] = pose.slice(9);
    assert.ok(Math.abs(terrainHeightAt(HILL_192_TERRAIN, x, z) - y) < 0.015);
  }
});
