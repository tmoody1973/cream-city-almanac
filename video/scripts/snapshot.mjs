// Reads the two figures the video shows from production's public endpoints (the same calls /about makes)
// and writes src/data.json. Writes nothing if any answer isn't showable.
// Run: CONVEX_URL=https://spotted-tern-278.convex.cloud node scripts/snapshot.mjs
import { writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { toData } from "./snapshot-lib.mjs";

const url = process.env.CONVEX_URL;
if (!url) throw new Error("Set CONVEX_URL to production's address");
const client = new ConvexHttpClient(url);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const [sheet, stats] = await Promise.all([client.query(anyApi.factSheet.sheet, { slug: "riverwest" }), client.query(anyApi.catalog.landingStats, {})]);
if (!stats.sampleCode) throw new Error("No crime dataset code from landingStats");
// Same arguments as useRobberySample in ui/components/LandingAskSample.tsx.
const robbery = await client.action(anyApi.map.mapCells, { code: stats.sampleCode, from: `${today.slice(0, 4)}-01-01`, filters: [{ column: "Offense_All", values: ["120"] }], neighborhood: "Harambee" });
const data = toData({ sheet, robbery, asOf: today });
writeFileSync(new URL("../src/data.json", import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log(data);
