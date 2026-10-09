// Runs every SQL shape buildCount produces against the real City datastore, to prove the server allows each construct.
// npx tsx scripts/city-sql-smoke.ts
import { buildCount } from "../convex/lib/citySql";
import { datastoreSql } from "../convex/lib/ckan";
import type { CityProfile } from "../convex/lib/cityProfile";

const RID = process.env.CRIME_RID ?? "87843297-a6fa-46d4-ba5d-cb342fb2d3bb";
const P = { familyKey: "x", resourceId: RID, columns: [], dateColumn: "Incident_Date", districtColumns: ["Police_District"], categories: [{ column: "Police_District", values: [{ value: "6", count: 1 }] }, { column: "Offense_All", values: [{ value: "240", count: 1 }, { value: "120", count: 1 }] }], rowCount: 1, minDate: null, maxDate: null, namesPeople: false, signature: "", updatedAt: 0 } satisfies CityProfile;
const today = new Date().toISOString().slice(0, 10);
for (const args of [{}, { filters: [{ column: "Police_District", values: ["6"] }, { column: "Offense_All", values: ["robbery"] }], groupBy: "month" }, { groupBy: "Offense_All" }, { groupBy: "year" }]) {
  const b = buildCount(P, args, today);
  if (!b.ok) throw new Error(JSON.stringify(b));
  for (const sql of [b.totalSql, b.groupSql, b.futureSql].filter((s): s is string => !!s)) {
    const rows = await datastoreSql<Record<string, unknown>>(sql);
    console.log("OK", rows.length, "rows ·", sql.slice(0, 90));
  }
}
