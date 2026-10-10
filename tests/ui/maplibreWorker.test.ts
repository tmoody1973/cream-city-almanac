import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// MapLibre 6 finds its worker next to its own bundle, which Next moves; so CityMap points it at copies in public/maplibre.
// If this fails after upgrading maplibre-gl: cp node_modules/maplibre-gl/dist/maplibre-gl-{worker,shared}.mjs public/maplibre/
describe("MapLibre worker copies", () => {
  for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])
    it(`${f} matches the installed maplibre-gl`, () => {
      const same = readFileSync(`public/maplibre/${f}`).equals(readFileSync(`node_modules/maplibre-gl/dist/${f}`));
      expect(same, `public/maplibre/${f} differs from node_modules/maplibre-gl/dist/${f}; copy it again`).toBe(true);
    });
});
