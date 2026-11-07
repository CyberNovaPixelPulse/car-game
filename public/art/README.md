# Exterior art sources

Original environment geometry in `web/tank-environment.ts`. The three tanks are original models built by our own Blender scripts, not downloaded models (see **Vehicles** below). The older primitive tanks in `web/tank-vehicle-procedural.ts` remain only as a fallback if a model fails to load. Dimensions are visually proportioned for game authority bounds, not a museum-quality measurement survey. No national insignia or claimed real unit identity. Tank markings are fictional turret numbers (21, 524, 317), a crew-painted name (BRAMBLE) and generic bridge-class discs. This compressed Caen-area battlefield is not an exact historical engagement.

Local texture assets from [Poly Haven](https://polyhaven.com/license), CC0-1.0. No paid APIs or runtime provider requests. `asset-manifest.json` retains each author, exact official asset/map URLs, color space, original checksums and the shipping SHA256 after embedding source metadata. Normal maps use OpenGL +Y; only diffuse maps use sRGB. Green Metal Rust is shared with the loader interior at `public/assets/interior/`, with no second copy under `art/metal`. Embedded provenance changes container metadata but not texture pixels.

- Charlotte Baglioni: [Old Stone Wall 02](https://polyhaven.com/a/old_stone_wall_02), masonry cover and stone buildings.
- Amal Kumar: [Farm Soil](https://polyhaven.com/a/farm_soil), farm ground, fields and road variation.
- Rob Tuytel: [Green Metal Rust](https://polyhaven.com/a/green_metal_rust), subdued painted steel roughness/normal variation. This is not an asserted British historical paint specification.
- Greg Zaal / Jarod Guest: [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), 1K HDR sky/environment. See `sky/asset-manifest.json` for exact URL, authors, CC0, bytes, MD5 and SHA256. It is a lighting asset, not a Normandy photograph.

Research references (not shipped image/film assets):

- [The Tank Museum: M4 Sherman](https://tankmuseum.org/tank-nuts/tank-collection/m4-sherman): M4A4 is British Sherman V; welded hull distinct from M4A1 cast hull. We use a normal 75mm barrel and rounded turret, not Firefly's 17-pounder, rear radio extension or later M4A3E8 suspension.
- [IWM A70 107-5, 31 July 1944](https://film.iwmcollections.org.uk/record/404/media_id/7847): M4A4 and Browning roof machine-gun reference. Not proof of a specific Goodwood tank.
- [IWM A70 96-4, 25 July 1944](https://film.iwmcollections.org.uk/record/1493): Panzer IV Ausf H (7.5cm L/48) and Tiger I Ausf E (8.8cm L/56) around Emieville after Goodwood. IWM media is © IWM; no frames were copied into this repository.
- [The Tank Museum: Panzer IV](https://tankmuseum.org/tank-nuts/tank-collection/panzer-iv) distinguishes the museum's D/D-H instructional conversion with L/43. That vehicle's footer is not used as an H/L48 blueprint.

The visible solid stone cover occupies the original authoritative cover boxes. Low plants do not become phantom blockers. Tall trees and distant pitched-roof farms stay outside the playable boundary. The in-bounds farm store has a slate roof enclosed by its stone parapet so there is no roof geometry above the authoritative box. No destructible scenery or extra combat rules were introduced.

## Vehicles

`vehicles/{sherman,panzer,tiger}.glb` are generated, not hand-edited. `npm run art:tanks` runs `tools/blender/build_all.sh`, which:

1. Fetches and checksums the source textures listed in `tools/blender/sources/manifest.tsv`.
2. Runs Blender 5.4 in the background on `tools/blender/build_tank.py`.

Each model:

- Is built from parametric primitives.
- Has its paint, camouflage, chipping, streaks, dust, mud and zimmerit baked into one 2K atlas: base colour, ORM and normal maps, stored as WebP.
- Ships as one GLB of about 6.8–7 MB, including a decimated `_lod1` copy of each mesh for distant enemies.

The node contract (`turret`, `elevation`, `muzzle`, `wheel_*`, `track_link` and the root track-path extras) is documented at the top of `build_tank.py` and read by `web/tank-vehicle-model.ts`. Overall dimensions follow the game's authority hit boxes. To check a model, render review stills with `tools/blender/render_preview.py`.

Bake inputs are not shipped; they are only Blender inputs. All are [Poly Haven](https://polyhaven.com/license) CC0-1.0 2K maps (diffuse, roughness, OpenGL normal):

- Rob Tuytel:
  - [Green Metal Rust](https://polyhaven.com/a/green_metal_rust): paint grain.
  - [Blue Metal Plate](https://polyhaven.com/a/blue_metal_plate): scratches.
  - [Brown Mud 02](https://polyhaven.com/a/brown_mud_02): mud.
- Amal Kumar: [Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal): rust streaks and bare steel.

The SHA-256 of each file is in `manifest.tsv`. Only the photographs' luminance and the rust tones reach the bake; paint colours are our own.
