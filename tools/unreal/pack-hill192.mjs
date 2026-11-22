/** Package the read-only Unreal export for the browser. See docs/hill192-unreal.md. */
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { join, resolve } from "node:path";

const [staging, project] = process.argv.slice(2).map((path) => resolve(path));
if (!staging || !project)
  throw new Error(
    "Pass the export staging directory and the Unreal project directory.",
  );
const require = createRequire(join(staging, "package.json"));
const { Document, NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const {
  dedup,
  mergeDocuments,
  meshopt,
  prune,
  simplify,
  textureCompress,
  unpartition,
  weld,
} = require("@gltf-transform/functions");
const {
  MeshoptDecoder,
  MeshoptEncoder,
  MeshoptSimplifier,
} = require("meshoptimizer");
const sharp = require("sharp");
const sources = join(project, "SourceData");
const native = join(staging, "mesh-export");
const art = resolve("public/art/hill192/pasture-blend");
const masks = join(project, "Saved/Verification/PastureBlend");
await mkdir(art, { recursive: true });
const world = JSON.parse(await readFile(join(native, "world.json"), "utf8"));

const terrain = await readFile(join(staging, "terrain-export/landscape.r16"));
const side = 505;
if (terrain.length !== side * side * 2)
  throw new Error("Invalid Landscape size");
const heights = Buffer.alloc(terrain.length);
for (let south = 0; south < side; south++) {
  for (let east = 0; east < side; east++) {
    const source = ((side - 1 - east) * side + south) * 2;
    const target = (south * side + east) * 2;
    heights.writeUInt16LE(terrain.readUInt16LE(source), target);
  }
}
await writeFile(
  "web/levels/hill192-pasture-height.json",
  JSON.stringify({ side, data: heights.toString("base64") }) + "\n",
);

async function rotatedPixels(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .rotate(90)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== info.height || info.channels !== 4)
    throw new Error("Expected a square Landscape mask: " + file);
  return { data, side: info.width };
}

const [ground, fields, conditions] = await Promise.all([
  rotatedPixels(join(masks, "T_GroundMargins.png")),
  rotatedPixels(join(masks, "T_FieldMargins.png")),
  rotatedPixels(join(masks, "T_PastureConditions.png")),
]);
if (new Set([ground.side, fields.side, conditions.side]).size !== 1)
  throw new Error("Landscape masks disagree on resolution");

async function packMask(filename, pixels) {
  const { side } = ground;
  const rgb = Buffer.alloc(side * side * 3);
  for (let i = 0; i < side * side; i++) {
    const [r, g, b] = pixels(i * 4);
    rgb.set([r, g, b], i * 3);
  }
  await sharp(rgb, { raw: { width: side, height: side, channels: 3 } })
    .png({ adaptiveFiltering: true })
    .toFile(join(art, filename));
}

await Promise.all([
  packMask("ground.png", (i) => [
    ground.data[i],
    ground.data[i + 1],
    ground.data[i + 3],
  ]),
  packMask("conditions.png", (i) => [
    Math.max(ground.data[i + 2], conditions.data[i]),
    conditions.data[i + 1],
    conditions.data[i + 2],
  ]),
  packMask("parcels.png", (i) => [
    fields.data[i + 1],
    fields.data[i + 2],
    conditions.data[i + 3],
  ]),
  sharp(join(masks, "T_DistantFieldMargins.png"))
    .resize({ width: 2048, withoutEnlargement: true })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(join(art, "distant.jpg")),
  sharp(join(masks, "T_MeadowDetail.png"))
    .resize(1024, 1024)
    .jpeg({ quality: 88 })
    .toFile(join(art, "meadow.jpg")),
]);

const flora = join(sources, "BocageEcology/Plants/Import");
const variants = new Map();
for (const folder of await readdir(flora)) {
  for (const entry of await readdir(join(flora, folder))) {
    if (entry.endsWith(".glb"))
      variants.set(entry.slice(0, -4), join(flora, folder, entry));
  }
}

await Promise.all([
  MeshoptDecoder.ready,
  MeshoptEncoder.ready,
  MeshoptSimplifier.ready,
]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });
const gate = await io.read(
  join(sources, "BocagePilot/Downloads/farm-gate.glb"),
);
const hazel = await io.read(
  join(sources, "BocagePilot/Downloads/hazel-lod1.glb"),
);

// The native hazel uses KTX2. Decode its four source maps before packaging so
// the final GLB needs only the same browser image decoders as the other meshes.
const basisDirectory = resolve("node_modules/three/examples/jsm/libs/basis");
const basisSource = await readFile(
  join(basisDirectory, "basis_transcoder.js"),
  "utf8",
);
const basisFactory = runInNewContext(basisSource + "\nBASIS", {
  require,
  __dirname: basisDirectory,
  process,
  console,
  Buffer,
  setTimeout,
  WebAssembly,
  Uint8Array,
});
const basis = await basisFactory({
  wasmBinary: await readFile(join(basisDirectory, "basis_transcoder.wasm")),
});
basis.initializeBasis();
for (const texture of hazel.getRoot().listTextures()) {
  const ktx = new basis.KTX2File(new Uint8Array(texture.getImage()));
  try {
    if (!ktx.isValid() || !ktx.startTranscoding())
      throw new Error(texture.getName());
    const rgba32 = 13;
    const pixels = new Uint8Array(
      ktx.getImageTranscodedSizeInBytes(0, 0, 0, rgba32),
    );
    if (!ktx.transcodeImage(pixels, 0, 0, 0, rgba32, 0, -1, -1))
      throw new Error("KTX2 conversion failed: " + texture.getName());
    texture
      .setImage(
        await sharp(pixels, {
          raw: { width: ktx.getWidth(), height: ktx.getHeight(), channels: 4 },
        })
          .png()
          .toBuffer(),
      )
      .setMimeType("image/png");
  } finally {
    ktx.close();
    ktx.delete();
  }
}
hazel
  .getRoot()
  .listExtensionsUsed()
  .find((extension) => extension.extensionName === "KHR_texture_basisu")
  ?.dispose();

function paintGate(model, name) {
  const finish = gate
    .getRoot()
    .listMaterials()
    .find((material) =>
      material.getName().includes(name.endsWith("Leaf") ? "_swing_" : "_body_"),
    );
  const textures = new Map();
  for (const get of [
    "getBaseColorTexture",
    "getNormalTexture",
    "getMetallicRoughnessTexture",
  ]) {
    const source = finish[get]();
    if (source)
      textures.set(
        get,
        model
          .createTexture(source.getName())
          .setImage(source.getImage())
          .setMimeType(source.getMimeType()),
      );
  }
  const material = model
    .createMaterial("Weathered gate")
    .setBaseColorFactor([0.59, 0.58, 0.53, 1])
    .setMetallicFactor(0.5)
    .setRoughnessFactor(1);
  material
    .setBaseColorTexture(textures.get("getBaseColorTexture"))
    .setNormalTexture(textures.get("getNormalTexture"))
    .setMetallicRoughnessTexture(textures.get("getMetallicRoughnessTexture"));
  for (const mesh of model.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives())
      primitive.setMaterial(material);
}

function useHazelMaterials(model) {
  const materials = hazel.getRoot().listMaterials();
  const keep = mergeDocuments(model, hazel);
  for (const mesh of model.getRoot().listMeshes()) {
    if ([...keep.values()].includes(mesh)) continue;
    mesh
      .listPrimitives()
      .forEach((primitive, i) => primitive.setMaterial(keep.get(materials[i])));
  }
  for (const scene of hazel.getRoot().listScenes()) keep.get(scene).dispose();
}

function addPrototype(bundle, gallery, model, name) {
  const oldScenes = model.getRoot().listScenes();
  const copied = mergeDocuments(bundle, model);
  const prototype = bundle.createNode(name);
  for (const scene of oldScenes) {
    const clone = copied.get(scene);
    for (const child of clone.listChildren()) prototype.addChild(child);
    clone.dispose();
  }
  gallery.addChild(prototype);
}

const bundle = new Document();
const gallery = bundle.createScene().setName("Hill192PastureBlend");
bundle.getRoot().setDefaultScene(gallery);
for (const [name, entry] of Object.entries(world.meshes)) {
  if (name.startsWith("SM_Eco_")) {
    const near = variants.get(name + "_LOD1") ?? variants.get(name);
    const far = variants.get(name + "_LOD2");
    if (!near) throw new Error("Missing authored plant: " + name);
    addPrototype(bundle, gallery, await io.read(near), name);
    if (far) {
      addPrototype(bundle, gallery, await io.read(far), name + "_far");
      entry.far = true;
    }
  } else {
    const model = await io.read(join(native, name + ".glb"));
    if (name.startsWith("SM_FieldGate")) paintGate(model, name);
    if (name === "SM_CommonHazel") useHazelMaterials(model);
    if (
      [
        "SM_OakLeaves",
        "SM_OakTrunk",
        "SM_OakLeafMasses",
        "SM_FieldEdgeStone",
        "SM_RoadGrass",
      ].includes(name)
    )
      await model.transform(
        weld(),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: name === "SM_OakLeaves" ? 0.13 : 0.32,
          error: 0.012,
        }),
      );
    addPrototype(bundle, gallery, model, name);
  }
  // The UE roadside clusters are dense enough to retain their grouping with a
  // sparser grass and loose-flint budget on WebGL.
  if (name === "SM_RoadGrass" || name === "SM_Flint")
    entry.instances = entry.instances.filter((_, index) => index % 2 === 0);
}

await bundle.transform(
  prune(),
  dedup(),
  weld(),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [768, 768],
    quality: 84,
    formats: /^(image\/jpeg|image\/png)$/,
  }),
  unpartition(),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(join(art, "world.glb"), bundle);
await writeFile(join(art, "world.json"), JSON.stringify(world) + "\n");
console.log(
  `${Object.keys(world.meshes).length} prototypes, ${Object.values(
    world.meshes,
  ).reduce((sum, entry) => sum + entry.instances.length, 0)} placements`,
);
