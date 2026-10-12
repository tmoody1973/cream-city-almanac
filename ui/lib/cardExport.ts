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
