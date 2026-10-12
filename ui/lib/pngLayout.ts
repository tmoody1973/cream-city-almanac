import type { CardExport } from "./cardExport";

// Where each line of an exported card's image goes; cardPng.ts only paints it. Kept apart so it can be tested
// without a canvas (measure stands in for the canvas's text width).
export type Font = "title" | "bold" | "body" | "small";
export type Measure = (text: string, font: Font) => number;
export type Layout = { width: number; height: number; items: { text: string; x: number; y: number; font: Font; color: "ink" | "muted" }[]; rules: number[] };

export const PNG_WIDTH = 1200;
export const PNG_PAD = 48;
export const PNG_ROWS = 15; // a 200-row image isn't usable in a story; the CSV has them all
export const SIZE: Record<Font, number> = { title: 30, bold: 20, body: 20, small: 17 };
const GAP = 24;
const LEADING = 1.45;

function wrap(text: string, font: Font, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next, font) > width) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  return cur ? [...lines, cur] : lines;
}

// ponytail: trims a character at a time; cells are short, so the loop is a few dozen measures at most.
function fit(text: string, font: Font, width: number, measure: Measure): string {
  if (measure(text, font) <= width) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}…`, font) > width) t = t.slice(0, -1);
  return `${t}…`;
}

export function pngLayout(e: CardExport, measure: Measure): Layout {
  const avail = PNG_WIDTH - 2 * PNG_PAD;
  const items: Layout["items"] = [];
  const rules: number[] = [];
  let y = PNG_PAD;
  const para = (text: string, font: Font, color: "ink" | "muted" = "ink") => {
    for (const line of wrap(text, font, avail, measure)) {
      y += SIZE[font] * LEADING;
      items.push({ text: fit(line, font, avail, measure), x: PNG_PAD, y, font, color });
    }
  };
  para(e.title, "title");
  for (const l of e.lines) para(l, "body");
  y += GAP;

  const { head, rows } = e.text;
  const drawn = rows.slice(0, PNG_ROWS);
  // Each column as wide as its widest cell; when the table is wider than the page, every column shrinks in proportion.
  const natural = head.map((h, i) => Math.max(measure(h, "bold"), ...drawn.map((r) => measure(r[i] ?? "", "body"))));
  const room = avail - GAP * (head.length - 1);
  const total = natural.reduce((a, b) => a + b, 0);
  const widths = natural.map((w) => (total > room ? (w * room) / total : w));
  const xs = widths.map((_, i) => PNG_PAD + widths.slice(0, i).reduce((a, b) => a + b, 0) + GAP * i);
  const row = (cells: string[], font: Font) => {
    y += SIZE[font] * LEADING;
    cells.forEach((c, i) => items.push({ text: fit(c, font, widths[i], measure), x: xs[i], y, font, color: "ink" }));
  };
  if (head.length) {
    row(head, "bold");
    rules.push(y + 8);
    y += 8;
    drawn.forEach((r) => row(r, "body"));
  }
  if (rows.length > PNG_ROWS) para(`${rows.length - PNG_ROWS} more rows in the CSV`, "body", "muted");
  y += GAP;
  for (const n of e.notes) para(n, "small", "muted");
  return { width: PNG_WIDTH, height: Math.ceil(y + PNG_PAD), items, rules };
}
