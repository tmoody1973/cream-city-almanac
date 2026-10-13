// convex/lib/boundaries.ts
import { bboxOf, inBbox, inShape, type Bbox, type Geometry, type Point } from "./geo";
import { insidePoints } from "./tractPlaces";

// The City of Milwaukee's boundary files (docs/superpowers/specs/2026-10-12-boundaries-design.md §2, §4). Pure: no I/O.
export const BOUNDARY_KINDS = ["district", "ward", "tin", "nrsa", "nsp", "tid", "bid", "oz"] as const;
export type BoundaryKind = (typeof BOUNDARY_KINDS)[number];
export type BoundaryRow = { name: string; details: Record<string, string>; geometry: string; bbox: Bbox };
export type BoundaryShape = { kind: BoundaryKind; name: string; details?: Record<string, string>; geometry: Geometry; bbox: Bbox };
export type Cover = { kind: BoundaryKind; name: string; share: number; details?: Record<string, string> };

const BASE = "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services";
export const BOUNDARY_LAYERS: Record<BoundaryKind, { label: string; path: string }> = {
  district: { label: "Aldermanic district", path: "election/election_geography/MapServer/1" },
  ward: { label: "Voting ward", path: "election/election_wards/MapServer/1" },
  tin: { label: "Targeted Investment Neighborhood", path: "planning/special_districts/MapServer/13" },
  nrsa: { label: "Neighborhood Revitalization Strategy Area", path: "planning/special_districts/MapServer/21" },
  nsp: { label: "Neighborhood Strategic Planning area", path: "planning/special_districts/MapServer/22" },
  tid: { label: "Tax Incremental District", path: "planning/special_districts/MapServer/8" },
  bid: { label: "Business Improvement District", path: "planning/special_districts/MapServer/3" },
  oz: { label: "Opportunity Zone", path: "planning/special_districts/MapServer/9" },
};
export const layerUrl = (kind: BoundaryKind) => `${BASE}/${BOUNDARY_LAYERS[kind].path}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;

const text = (x: unknown) => (x === null || x === undefined ? "" : String(x).replace(/\s+/g, " ").trim());
const kept = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).filter(([, x]) => x !== ""));

// A feature's display name and details; null when it has no name.
function describe(kind: BoundaryKind, p: Record<string, unknown>): { name: string; details: Record<string, string> } | null {
  const t = (k: string) => text(p[k]);
  const both = (a: string, b: string) => (t(a) && t(b) ? `${t(a)}: ${t(b)}` : "");
  const named = (name: string, details: Record<string, string> = {}) => (name ? { name, details: kept(details) } : null);
  switch (kind) {
    case "district": return named(t("DISTRICT") && `District ${t("DISTRICT")}`, { alder: t("ALDERPERSON") });
    case "ward": return named(t("WARD") && `Ward ${t("WARD")}`, {
      pollingPlace: t("POLLING_PL"), pollingAddress: t("ADDRESS"), mainEntrance: t("MAIN_ENTR"),
      accessibleEntrance: t("ACSBL_ENTR"), mainParking: t("MAIN_PKNG"), accessibleParking: t("ACSBL_PKNG"),
    });
    case "tin": return named(t("TIN") && `${t("TIN")} TIN`, { opened: typeof p.OPEN_DATE === "number" ? new Date(p.OPEN_DATE).toISOString().slice(0, 10) : "" });
    case "nrsa": return named(t("NRSA") && `NRSA ${t("NRSA")}`);
    case "nsp": return named(both("NSP", "AGENCY") && `NSP ${both("NSP", "AGENCY")}`, { agency: t("AGENCY") });
    case "tid": return named(both("TID", "NAME") && `TID ${both("TID", "NAME")}`);
    case "bid": return named(both("BID", "BIDNAME") && `BID ${both("BID", "BIDNAME")}`);
    case "oz": return named(t("TRACTTEXT") && `Opportunity Zone (2010 tract ${t("TRACTTEXT")})`);
  }
}

type Feature = { properties?: Record<string, unknown> | null; geometry?: { type?: unknown; coordinates?: unknown } | null };

// One layer's shapes. A truncated layer is refused (a partial list would drop boundaries without saying so), and so is
// one with no usable shape: the caller keeps last week's rows.
export function parseBoundaryLayer(kind: BoundaryKind, geojson: unknown): { rows: BoundaryRow[]; skipped: string[] } {
  const fc = geojson as { features?: Feature[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } } | null;
  if (fc?.exceededTransferLimit || fc?.properties?.exceededTransferLimit) throw new Error("the layer was truncated");
  if (!Array.isArray(fc?.features)) throw new Error("the layer returned no features");
  const rows: BoundaryRow[] = [];
  const skipped: string[] = [];
  for (const f of fc.features) {
    const d = describe(kind, f.properties ?? {});
    const g = f.geometry;
    if (!d || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) {
      skipped.push(d?.name ?? "(unnamed)");
      continue;
    }
    const geometry = { type: g.type, coordinates: g.coordinates } as Geometry;
    const bbox = bboxOf(geometry);
    if (![bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon].every(Number.isFinite)) {
      skipped.push(d.name);
      continue;
    }
    rows.push({ name: d.name, details: d.details, geometry: JSON.stringify(geometry), bbox });
  }
  if (rows.length === 0) throw new Error("the layer had no usable shapes");
  return { rows, skipped };
}

const MIN_COVER = 1; // percent of the place; G's neighborhood match keeps 10, but a TID is often a small part of a tract
const touches = (a: Bbox, b: Bbox) => a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLon <= b.maxLon && a.maxLon >= b.minLon;

// Which boundaries cover a place, and how much of it: G's grid of points (insidePoints, about ±2%), where a point
// counts for every boundary containing it (TIDs and BIDs can overlap one another).
export function boundaryShares(place: Geometry, shapes: BoundaryShape[]): Cover[] {
  const inside = insidePoints(place);
  if (!inside.length) return [];
  const box = bboxOf(place);
  const near = shapes.filter((s) => touches(s.bbox, box));
  const counts = new Map<BoundaryShape, number>();
  for (const p of inside) for (const s of near) if (inBbox(p, s.bbox) && inShape(p, s.geometry)) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts]
    .map(([s, c]) => ({ s, c, share: Math.round((100 * c) / inside.length) }))
    .filter((x) => x.share >= MIN_COVER)
    .sort((x, y) => BOUNDARY_KINDS.indexOf(x.s.kind) - BOUNDARY_KINDS.indexOf(y.s.kind) || y.c - x.c || x.s.name.localeCompare(y.s.name))
    .map(({ s, share }) => ({ kind: s.kind, name: s.name, share, ...((s.kind === "district" || s.kind === "ward") && s.details ? { details: s.details } : {}) }));
}

// A DYCU area as one shape: its tracts' polygons together (tracts don't overlap, so even-odd stays correct).
export const unionOf = (gs: Geometry[]): Geometry => ({ type: "MultiPolygon", coordinates: gs.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates)) });

// An area's tracts in its newest definition year.
export function newestTracts(entries?: { years: number[]; tracts: string[] }[]): string[] {
  const list = entries ?? [];
  const year = Math.max(-Infinity, ...list.flatMap((e) => e.years));
  return [...new Set(list.filter((e) => e.years.includes(year)).flatMap((e) => e.tracts))];
}

// "88", "tract 88.01", "Census tract 1857" or a County GEOID → the 11-digit GEOID; anything else → null.
export function tractGeoid(asked: string): string | null {
  const s = asked.trim().replace(/^(census\s+)?tract\s+/i, "");
  if (/^55079\d{6}$/.test(s)) return s;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  return `55079${String(Math.round(Number(s) * 100)).padStart(6, "0")}`;
}

export type WardDetails = { pollingPlace: string; pollingAddress: string; mainEntrance: string; accessibleEntrance: string; mainParking: string; accessibleParking: string };
export type AddressBoundaries = { asOf: number | null; district: { name: string; alder: string } | null; ward: ({ name: string } & WardDetails) | null; investment: string[]; development: string[] };
type StoredBoundary = { kind: BoundaryKind; name: string; details: Record<string, string>; geometry: string; bbox: Bbox; fetchedAt: number };

const INVESTMENT: BoundaryKind[] = ["tin", "nrsa", "nsp"];
const DEVELOPMENT: BoundaryKind[] = ["tid", "bid", "oz"];
const WARD_KEYS: (keyof WardDetails)[] = ["pollingPlace", "pollingAddress", "mainEntrance", "accessibleEntrance", "mainParking", "accessibleParking"];

// The stored boundaries containing a point. On a shared ward or district edge, inShape's half-open rule puts the point
// in one shape; the first match is kept. asOf is the oldest file the answer rests on ("None" answers included).
export function boundariesAt(p: Point, rows: StoredBoundary[]): AddressBoundaries {
  if (rows.length === 0) return { asOf: null, district: null, ward: null, investment: [], development: [] };
  const hits = rows.filter((r) => inBbox(p, r.bbox) && inShape(p, JSON.parse(r.geometry) as Geometry));
  const d = hits.find((h) => h.kind === "district");
  const w = hits.find((h) => h.kind === "ward");
  const names = (kinds: BoundaryKind[]) => hits.filter((h) => kinds.includes(h.kind)).map((h) => h.name);
  return {
    asOf: Math.min(...rows.map((r) => r.fetchedAt)),
    district: d ? { name: d.name, alder: d.details.alder ?? "" } : null,
    ward: w ? { name: w.name, ...(Object.fromEntries(WARD_KEYS.map((k) => [k, w.details[k] ?? ""])) as WardDetails) } : null,
    investment: names(INVESTMENT),
    development: names(DEVELOPMENT),
  };
}
