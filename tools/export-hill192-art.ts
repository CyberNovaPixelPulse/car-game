import { writeFileSync } from "node:fs";
import {
  HILL_192_FIELDS,
  HILL_192_LEVEL,
  HILL_192_ROADS,
  HILL_192_TERRAIN,
} from "../web/hill192-level.ts";
import dem from "../web/levels/hill192-dem.json" with { type: "json" };

const output = process.argv[2];
if (!output) throw new Error("Supply a path for the Hill 192 art layout");
writeFileSync(
  output,
  JSON.stringify({
    origin: dem.origin,
    terrain: HILL_192_TERRAIN,
    fields: HILL_192_FIELDS,
    roads: HILL_192_ROADS,
    cover: HILL_192_LEVEL.battlefield.cover,
    spawn: HILL_192_LEVEL.spawn,
    zone: HILL_192_LEVEL.zone,
  }),
);
