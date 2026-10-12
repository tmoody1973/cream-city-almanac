import { countCoverage } from "./askCount";
import { formatPortraitMargin, formatPortraitNumber } from "./portrait";
import type { CityShare } from "@/convex/lib/tractPlaces";
import type { ChangeDetail, Header, RankDetail, RelateDetail } from "@/convex/tracts";
import { cityList, dycuText } from "./placeNames";
import { changeText, plainMeaning, rangeText, unitOf, type Unit } from "./tractFormat";
import { EXACT, KIND, propertyCountSummary } from "./tractSummary";
import { cellTime, spanNotes, spanRows, spanSummary, spanTitle, type SpanOk } from "./spanText";
import { MEASURE_HIDDEN, measureNotes, measureSummary, measureTitle, money, type MeasureOk } from "./measureText";

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
  // CSV: every tract, clear matches first, then possible ones, then the rest.
  const points = [...d.points].sort((x, y) => (x.mark ? ORDER[x.mark] : 2) - (y.mark ? ORDER[y.mark] : 2));
  // Text and PNG copy the card's table: its clear matches, then possible ones, in the server's order. A card with no
  // table (plain relate mode) exports no text rows; the CSV has every tract.
  const pairs = [...d.fits.map((p) => ({ p, label: MATCH.fits })), ...d.close.map((p) => ({ p, label: MATCH.close }))];
  return {
    title: card.title,
    lines: [metaLine(a), metaLine(b, false), ...card.lines, ...(pairs.length ? [] : [`All ${d.points.length} tracts' figures are in the CSV.`])],
    csv: {
      head: ["Tract", "GEOID", "City neighborhoods", "DYCU areas", ...side(a), ...side(b), "Match", "Status"],
      rows: points.map((p) => [p.tract, p.geoid, cityCell(p.city), p.dycu.join(", "), ...p.a, ...p.b, p.mark ? MATCH[p.mark] : "", p.unreliable ? "too uncertain" : ""]),
    },
    text: pairs.length
      ? {
          head: ["Tract", "Neighborhood", "DYCU area", a.column, b.column, "Match"],
          rows: pairs.map(({ p, label }) => [p.a.tract, places(p.a.city), dycuText(p.a.dycu), shown(p.a, ua), shown(p.b, ub), label]),
        }
      : { head: [], rows: [] },
    notes: tractNotes([a, b], card.fine, ctx),
    filename: safeName([`${a.code}-${a.column}`, `${b.code}-${b.column}`, `${a.place}-${a.year}`, "relate"]),
  };
}

export type NumberCardData = {
  code: string; neighborhood: string; year: number | null; topic: string; tableIdText: string; definition: string | null; groups: string[];
  nearby: { label: string; values: ({ estimate: string; moe: string | null } | null)[]; marked: boolean }[];
};

// A Census cell is a number when it reads as one; "-", "**" and "(X)" stay text, as DYCU wrote them.
const census = (s: string | null | undefined): Cell => (s == null || s.trim() === "" ? null : Number.isFinite(Number(s)) ? Number(s) : s);

export function numberExport(r: NumberCardData, ctx: Ctx): CardExport {
  const name = (g: string) => (g ? `${g} estimate` : "Estimate");
  return {
    title: `${r.neighborhood}, ${r.year ?? "latest"} · ${r.topic}`,
    lines: r.definition ? [`${r.neighborhood} as DYCU defines it: ${r.definition}`] : [],
    csv: {
      head: ["Row", ...r.groups.flatMap((g) => [name(g), g ? `${g} margin` : "Margin"]), "Asked for"],
      rows: r.nearby.map((row) => [row.label, ...row.values.flatMap((v) => [census(v?.estimate), census(v?.moe)]), row.marked ? "yes" : ""]),
    },
    text: {
      head: ["", ...r.groups.flatMap((g) => [name(g), "± Margin"])],
      rows: r.nearby.map((row) => [row.marked ? `${row.label} (asked for)` : row.label, ...row.values.flatMap((v) => [v ? formatPortraitNumber(v.estimate) : "", v?.moe ? formatPortraitMargin(v.moe) : ""])]),
    },
    notes: [`Census table ${r.tableIdText}`, sourceNote("DYCU", r.code, null, ctx), exported(ctx)],
    filename: safeName([r.code, `${r.neighborhood}-${r.year ?? "latest"}`]),
  };
}

export type CountCardData = {
  code: string; name: string; count: number; groups: { label: string; count: number }[]; other: number; otherLabel: string | null; overlap: boolean;
  period: string; filters: string[]; futureExcluded: number; caveat: string | null; dateColumn: string | null; coverage: string | null;
  resourceName: string | null; area: string | null; noLocation: number; of?: { count: number; label: string }; tractMap?: { total: number };
};

// The City count card's lines under its table, in the card's order (CountCard in AskCards.tsx).
export function countNotes(r: CountCardData): string[] {
  return [
    r.overlap && r.groups.length > 0 ? "An incident can count in more than one group." : null,
    countCoverage(r),
    r.area ? `In ${r.area}` : null,
    r.noLocation > 0 ? `${r.noLocation.toLocaleString("en-US")} matching records citywide have no location and aren't included.` : null,
    r.tractMap ? `Census tracts where more than half of the properties are ${r.filters.join(", ")}: ${r.tractMap.total}.` : null,
    r.futureExcluded > 0 ? `${r.futureExcluded.toLocaleString("en-US")} records dated in the future were left out.` : null,
    r.caveat ? `${r.caveat} (written by AI)` : null,
  ].filter((n): n is string => n !== null);
}

export function countExport(r: CountCardData, ctx: Ctx): CardExport {
  const rows: [string, number][] = [["Total", r.count], ...r.groups.map((g): [string, number] => [g.label, g.count]), ...(r.other > 0 ? [[r.otherLabel ?? "Other", r.other] as [string, number]] : [])];
  return {
    title: [r.name, ...r.filters, r.period].join(" · "),
    lines: r.of ? [propertyCountSummary({ ...r, of: r.of })] : [],
    csv: { head: ["Group", "Count"], rows },
    text: { head: ["", "Count"], rows: rows.map(([label, n]) => [label, n.toLocaleString("en-US")]) },
    notes: [...countNotes(r), sourceNote("City of Milwaukee", r.code, r.name, ctx), exported(ctx)],
    filename: safeName([r.code, "count"]),
  };
}

export const quoteText = (p: { quote: string; section: string; report: string; code: string }, ctx: Ctx) =>
  [`“${p.quote}”`, `${p.report}, ${p.section}`, sourceNote("DYCU", p.code, null, ctx), exported(ctx)].join("\n");

export function spanExport(r: SpanOk, ctx: Ctx): CardExport {
  const u = r.pair.unit;
  const rows = [...spanRows(r), { ...r.all, rest: false }];
  const { warning, notes } = spanNotes(r);
  return {
    title: spanTitle(r),
    lines: [...(warning ? [warning] : []), spanSummary(r)],
    csv: {
      head: [r.groupBy === "year" ? "Year" : r.groupBy ?? "Group", "Cases", `Median (${u})`, `9 in 10 within (${u})`, "Still open"],
      rows: rows.map((g) => [g.label, g.cases, g.median, g.p90, g.open]),
    },
    text: {
      head: [r.groupBy === "year" ? "Year" : r.groupBy ?? "", "Cases", "Median", "9 in 10 within", "Still open"],
      rows: rows.map((g) => [g.label, g.cases.toLocaleString("en-US"), g.rest ? "" : cellTime(g, g.median, u), g.rest ? "" : cellTime(g, g.p90, u), g.open === null ? "" : g.open.toLocaleString("en-US")]),
    },
    notes: [...notes, sourceNote("City of Milwaukee", r.code, r.name, ctx), exported(ctx)],
    filename: safeName([r.code, r.pair.id, ...(r.groupBy ? [r.groupBy] : [])]),
  };
}

export function measureExport(r: MeasureOk, ctx: Ctx): CardExport {
  const m = r.measure, u = m.unit, avg = r.averageAsked;
  type Row = { label: string; n: number; total: number | null; median: number | null; average: number | null; hidden: boolean };
  const rows: Row[] = [
    ...r.groups,
    ...(r.other ? [{ label: "All other groups", n: r.other.n, total: r.other.total, median: null, average: null, hidden: r.other.hidden }] : []),
    { label: "All", n: r.all.n, total: r.all.total, median: r.all.median, average: r.all.average, hidden: false },
  ];
  const label = (g: Row) => (g.hidden ? `${g.label} (${MEASURE_HIDDEN})` : g.label);
  const t = (v: number | null, hidden: boolean) => (hidden ? MEASURE_HIDDEN : money(v, u, "table"));
  return {
    title: measureTitle(r),
    lines: [measureSummary(r)],
    csv: {
      head: [r.groupBy ?? "Group", "Records", ...(m.summable ? [`Total (${u})`] : []), `Median (${u})`, ...(avg ? [`Average (${u})`] : [])],
      rows: rows.map((g) => [label(g), g.n, ...(m.summable ? [g.total] : []), g.median, ...(avg ? [g.average] : [])]),
    },
    text: {
      head: [r.groupBy ?? "", "Records", ...(m.summable ? ["Total"] : []), "Median", ...(avg ? ["Average"] : [])],
      rows: rows.map((g) => [g.label, g.n.toLocaleString("en-US"), ...(m.summable ? [t(g.total, g.hidden)] : []), g.label === "All other groups" ? "" : t(g.median, g.hidden), ...(avg ? [g.label === "All other groups" ? "" : t(g.average, g.hidden)] : [])]),
    },
    notes: [...measureNotes(r), sourceNote("City of Milwaukee", r.code, r.name, ctx), exported(ctx)],
    filename: safeName([r.code, m.id, ...(r.groupBy ? [r.groupBy] : [])]),
  };
}
