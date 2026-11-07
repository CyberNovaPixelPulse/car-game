# Exterior art sources

Original procedural vehicle and environment geometry in `web/tank-vehicle-model.ts` and `web/tank-environment.ts`; no downloaded tank models. Dimensions are visually proportioned for game authority bounds, not a museum-quality measurement survey. No national insignia or claimed real unit identity. This compressed Caen-area battlefield is not an exact historical engagement.

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
