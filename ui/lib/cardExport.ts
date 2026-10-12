import type { CityShare } from "@/convex/lib/tractPlaces";
import type { ChangeDetail, Header, RankDetail, RelateDetail } from "@/convex/tracts";
import { cityList, dycuText } from "./placeNames";
import { changeText, plainMeaning, rangeText, unitOf, type Unit } from "./tractFormat";
import { EXACT, KIND } from "./tractSummary";

// One export per card (spec 2026-10-12-card-export-design.md): CSV, text and PNG are all written from it, so they
// never disagree. It copies the card: its figures, its title and lines, its fine print, caveats and source.

export type Cell = string | number | null;
export type CardExport = {
  title: string;
  lines: string[]; // the card's lines under its title: dataset line, summary, verdict
  csv: { head: string[]; rows: Cell[][] }; // stored values, unrounded
  text: { head: string[]; rows: string[][] }; // the card's rounding, for text and PNG
  notes: string[];
  filename: string; // without the extension
};
export type Ctx = { origin: string; date: string };

const RISKY = /^[=+\-@\t\r]/; // a spreadsheet runs a cell starting with these as a formula

export function csvCell(c: Cell): string {
  if (c === null) return "";
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  const s = RISKY.test(c) ? `'${c}` : c;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The table, one blank row, then the words; the byte-order mark lets Excel read "±" and "—".
export function toCsv(e: CardExport): string {
  const line = (cells: Cell[]) => cells.map(csvCell).join(",");
  const words = [e.title, ...e.lines, ...e.notes].map((w) => line([w]));
  return `﻿${[line(e.csv.head), ...e.csv.rows.map(line), "", ...words].join("\r\n")}\r\n`;
}

export const toText = (e: CardExport): string =>
  [e.title, ...e.lines, "", e.text.head.join(" · "), ...e.text.rows.map((r) => r.join(" · ")), "", ...e.notes].join("\n");

export const safeName = (parts: string[]) => `almanac_${parts.map((p) => p.replace(/[^A-Za-z0-9_-]+/g, "-")).join("_")}`;

export const exported = (ctx: Ctx) => `Exported from Cream City Almanac on ${ctx.date}.`;

export const sourceNote = (who: "DYCU" | "City of Milwaukee", code: string, name: string | null, ctx: Ctx) =>
  `Source: ${who}, ${code}${name ? ` ${name}` : ""}: ${ctx.origin}/d/${code}`;

// A tract card exports from its full answer only; the trimmed copy it shows first would mislead under the full title.
export const exportState = (ready: boolean, expired: boolean): "ready" | "loading" | "expired" =>
  ready ? "ready" : expired ? "expired" : "loading";

// What the tract card itself says, passed in so the export never rewords it.
export type TractCardText = { title: string; lines: string[]; fine: string };

const UNIT_HEAD: Record<Unit, string> = { percent: " (percent)", dollars: " (dollars)", year: " (year)", plain: "" };
const colHead = (h: Header) => `${h.column}${UNIT_HEAD[unitOf(h.meaning)]}`;
const cityCell = (city: CityShare[]) => city.map((c) => `${c.name} ${c.share}%`).join("; ");
const places = (city: CityShare[]) => (city.length ? cityList(city) : "—");
const shown = (r: { value: number; lo: number | null; hi: number | null }, u: Unit) => {
  const t = rangeText(r, u);
  return t.span ? `${t.value} ${t.span}` : t.value;
};
const who = (h: Header) => (h.confidence === EXACT ? "City of Milwaukee" : "DYCU");

// The card's dataset line, as Head shows it.
export const metaLine = (h: Header, withCount = true) =>
  `${h.code} ${h.column} (${plainMeaning(h.meaning) || "no definition in the column guide"}, ${KIND[h.kind]}) · ${h.place} ${h.year}${withCount ? ` · ${h.n} census tracts${h.leftOut ? `, ${h.leftOut} left out (${h.leftOutWhy ?? "no data"})` : ""}` : ""}`;

// Fine print, each dataset's caveats, each source once, then the export date.
function tractNotes(heads: Header[], fine: string, ctx: Ctx, extra: string[] = []): string[] {
  const once = heads.filter((h, i) => heads.findIndex((x) => x.code === h.code) === i);
  return [
    fine.trim(),
    ...extra,
    ...once.flatMap((h) => h.caveats.map((c) => `Caveat (${h.code}): ${c}`)),
    ...once.map((h) => sourceNote(who(h), h.code, h.name, ctx)),
    exported(ctx),
  ];
}

export function rankExport(d: RankDetail, card: TractCardText, ctx: Ctx): CardExport {
  const h = d.header, u = unitOf(h.meaning);
  const all = [
    ...d.top.map((t, i) => ({ t, rank: i + 1 as number | null, status: "ranked" })),
    ...d.ties.map((t) => ({ t, rank: null, status: "tied" })),
    ...d.unreliable.map((t) => ({ t, rank: null, status: "too uncertain" })),
  ];
  return {
    title: card.title,
    lines: [metaLine(h), ...card.lines],
    csv: {
      head: ["Rank", "Tract", "GEOID", "City neighborhoods", "DYCU areas", colHead(h), "Low", "High", "Status"],
      rows: all.map(({ t, rank, status }) => [rank, t.tract, t.geoid, cityCell(t.city), t.dycu.join(", "), t.value, t.lo, t.hi, status]),
    },
    text: {
      head: ["#", "Tract", "Neighborhood", "DYCU area", h.column, "Status"],
      rows: all.map(({ t, rank, status }) => [rank !== null ? String(rank) : status === "tied" ? "=" : "–", t.tract, places(t.city), dycuText(t.dycu), shown(t, u), status]),
    },
    notes: tractNotes([h], card.fine, ctx),
    filename: safeName([`${h.code}-${h.column}`, `${h.place}-${h.year}`, "rank"]),
  };
}

export function changeExport(d: ChangeDetail, card: TractCardText, ctx: Ctx): CardExport {
  const h = d.header, u = unitOf(h.meaning);
  const year = (y: string) => [`${y} ${colHead(h)}`, `${y} low`, `${y} high`];
  return {
    title: card.title,
    lines: [metaLine(h), ...card.lines],
    csv: {
      head: ["Tract", "GEOID", "City neighborhoods", "DYCU areas", ...year(d.from), ...year(d.to), "Change", "Direction"],
      rows: d.changes.map((c) => [c.tract, c.geoid, cityCell(c.city), c.dycu.join(", "), c.from.value, c.from.lo, c.from.hi, c.to.value, c.to.lo, c.to.hi, c.change, c.direction]),
    },
    text: {
      head: ["Tract", "Neighborhood", "DYCU area", d.from, d.to, "Change"],
      rows: d.changes.map((c) => [c.tract, places(c.city), dycuText(c.dycu), shown(c.from, u), shown(c.to, u), changeText(c.change, c.direction, u)]),
    },
    notes: tractNotes([h], card.fine, ctx, d.note ? [d.note] : []),
    filename: safeName([`${h.code}-${h.column}`, `${h.place}-${d.from}-${d.to}`, "change"]),
  };
}

const MATCH = { fits: "clear match", close: "possible match" } as const;
const ORDER = { fits: 0, close: 1 } as const;

export function relateExport(d: RelateDetail, card: TractCardText, ctx: Ctx): CardExport {
  const { a, b } = d, ua = unitOf(a.meaning), ub = unitOf(b.meaning);
  const side = (h: Header) => [`${h.code} ${colHead(h)}`, `${h.code} low`, `${h.code} high`];
  const range = ([value, lo, hi]: [number, number | null, number | null]) => ({ value, lo, hi });
  // Clear matches, then possible ones, then the rest, each in the server's order.
  const points = [...d.points].sort((x, y) => (x.mark ? ORDER[x.mark] : 2) - (y.mark ? ORDER[y.mark] : 2));
  return {
    title: card.title,
    lines: [metaLine(a), metaLine(b, false), ...card.lines],
    csv: {
      head: ["Tract", "GEOID", "City neighborhoods", "DYCU areas", ...side(a), ...side(b), "Match", "Status"],
      rows: points.map((p) => [p.tract, p.geoid, cityCell(p.city), p.dycu.join(", "), ...p.a, ...p.b, p.mark ? MATCH[p.mark] : "", p.unreliable ? "too uncertain" : ""]),
    },
    text: {
      head: ["Tract", "Neighborhood", "DYCU area", a.column, b.column, "Match"],
      rows: points.map((p) => [p.tract, places(p.city), dycuText(p.dycu), shown(range(p.a), ua), shown(range(p.b), ub), [p.mark ? MATCH[p.mark] : "", p.unreliable ? "(too uncertain)" : ""].filter(Boolean).join(" ")]),
    },
    notes: tractNotes([a, b], card.fine, ctx),
    filename: safeName([`${a.code}-${a.column}`, `${b.code}-${b.column}`, `${a.place}-${a.year}`, "relate"]),
  };
}
