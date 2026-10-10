// Runs every SQL shape buildCount and profileSql produce against the real City datastore, to prove the server allows
// each construct (free, read-only). npx tsx scripts/city-sql-smoke.ts
import { buildCount } from "../convex/lib/citySql";
import { datastoreSql } from "../convex/lib/ckan";
import { planProfile, profileSql, type CityProfile } from "../convex/lib/cityProfile";

const RID = process.env.CRIME_RID ?? "87843297-a6fa-46d4-ba5d-cb342fb2d3bb";
const today = new Date().toISOString().slice(0, 10);
const P = {
  familyKey: "x", resourceId: RID, columns: [], dateColumn: "Incident_Date", districtColumns: ["Police_District"],
  categories: [
    { column: "Police_District", values: [{ value: "6", count: 1 }] },
    { column: "Offense_All", values: [{ value: "240", count: 1 }, { value: "120", count: 1 }], multi: true },
  ],
  rowCount: 1, minDate: "2024-01-01", maxDate: today, namesPeople: false, signature: "", updatedAt: Date.now(),
} satisfies CityProfile;

const shapes = [
  {},
  { filters: [{ column: "Police_District", values: ["6"] }, { column: "Offense_All", values: ["robbery"] }], groupBy: "month" },
  { groupBy: "Offense_All" }, // multi-valued: unnest grouping
  { groupBy: "year" },
  { from: "2023-01-01", to: "2024-06-30" }, // clamped to the data's range
];
for (const args of shapes) {
  const b = buildCount(P, args, today);
  if (!b.ok) throw new Error(JSON.stringify(b));
  for (const sql of [b.totalSql, b.groupSql, b.futureSql].filter((s): s is string => !!s)) {
    const rows = await datastoreSql<Record<string, unknown>>(sql);
    console.log("OK", rows.length, "rows ·", sql.slice(0, 110));
  }
  console.log("   period:", b.period, "· coverage:", b.coverage);
}

// The multi-offense check: every robbery (120 anywhere in Offense_All), against robbery-only rows.
const robbery = buildCount(P, { from: "2024-01-01", filters: [{ column: "Offense_All", values: ["robbery"] }] }, today);
if (!robbery.ok) throw new Error(JSON.stringify(robbery));
const [all] = await datastoreSql<{ n: string }>(robbery.totalSql);
const [only] = await datastoreSql<{ n: string }>(`SELECT COUNT(*) AS n FROM "${RID}" WHERE "Offense_All" IN ('120')`);
console.log(`Robbery since 2024-01-01: ${all.n} incidents with 120 anywhere (robbery-only rows: ${only.n})`);

// Neighborhood counts: the guarded rectangle with an offense and a date, and the no-location count.
const located = { ...P, latColumn: "Address_Latitude", lonColumn: "Address_Longitude" };
const area = { minLat: 43.05, maxLat: 43.08, minLon: -87.93, maxLon: -87.9 };
for (const args of [{ from: "2026-01-01", filters: [{ column: "Offense_All", values: ["robbery"] }] }, { from: "2026-01-01", groupBy: "month" }, { from: "2026-01-01", groupBy: "Offense_All" }]) {
  const b = buildCount(located, args, today, area);
  if (!b.ok || !b.points) throw new Error(JSON.stringify(b));
  const rows = await datastoreSql<Record<string, unknown>>(b.points.sql);
  const [missing] = await datastoreSql<{ n: string }>(b.points.missingSql);
  console.log("OK", rows.length, "points ·", missing.n, "unplaced ·", b.points.sql.slice(0, 90));
}

// The profile's queries, including the unnest form for ';'-separated columns.
const fields = [{ id: "Incident_Date", type: "text" }, { id: "Police_District", type: "text" }, { id: "Offense_All", type: "text" }, { id: "Weapon_Used_All", type: "text" }];
const q = profileSql(RID, planProfile(fields));
for (const sql of [q.count, q.range, ...q.tops.flatMap((t) => [t.sql, t.multiSql])].filter((s): s is string => !!s)) {
  const rows = await datastoreSql<Record<string, unknown>>(sql);
  console.log("OK", rows.length, "rows ·", sql.slice(0, 110));
}
