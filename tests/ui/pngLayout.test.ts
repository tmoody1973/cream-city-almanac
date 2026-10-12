import { describe, expect, it } from "vitest";
import type { CardExport } from "../../ui/lib/cardExport";
import { PNG_PAD, PNG_ROWS, PNG_WIDTH, pngLayout, type Font } from "../../ui/lib/pngLayout";

// A stand-in for the canvas: every character is 10px wide (15px in the title).
const measure = (t: string, f: Font) => t.length * (f === "title" ? 15 : 10);
const e = (rows: number, note = "Source: DYCU."): CardExport => ({
  title: "Highest pov_rate · County 2023",
  lines: ["Summary."],
  csv: { head: [], rows: [] },
  text: { head: ["Tract", "Neighborhood"], rows: Array.from({ length: rows }, (_, i) => [`T${i}`, `Place ${i}`]) },
  notes: [note],
  filename: "x",
});

describe("PNG layout", () => {
  it("draws at most 15 rows and says how many more are in the CSV", () => {
    const l = pngLayout(e(20), measure);
    const texts = l.items.map((i) => i.text);
    expect(texts).toContain(`T${PNG_ROWS - 1}`);
    expect(texts).not.toContain(`T${PNG_ROWS}`);
    expect(texts).toContain("5 more rows in the CSV");
    expect(l.rules).toHaveLength(1);
  });
  it("adds no 'more rows' line when every row fits", () => {
    expect(pngLayout(e(3), measure).items.map((i) => i.text).join(" ")).not.toContain("more rows");
  });
  it("wraps a long note and cuts a long cell to its column, never past the right edge", () => {
    const long = e(1, "word ".repeat(80).trim());
    long.text.rows[0][1] = "x".repeat(400);
    const l = pngLayout(long, measure);
    expect(l.items.filter((i) => i.font === "small").length).toBeGreaterThanOrEqual(3);
    expect(l.items.some((i) => i.text.endsWith("…"))).toBe(true);
    for (const i of l.items) expect(i.x + measure(i.text, i.font)).toBeLessThanOrEqual(PNG_WIDTH - PNG_PAD + 0.001);
  });
  it("is 1,200px wide and tall enough for everything", () => {
    const l = pngLayout(e(3), measure);
    expect(l.width).toBe(1200);
    expect(l.height).toBeGreaterThan(Math.max(...l.items.map((i) => i.y)));
  });
});

describe("PNG columns", () => {
  it("shrinks the long text column, never the rank or the figures", () => {
    const wide: CardExport = {
      ...e(1),
      text: {
        head: ["#", "Tract", "Neighborhood", "DYCU area", "pov_rate", "Status"],
        rows: [["1", "1860", "Hillside 51% · Halyard Park 27% · Triangle North 13% · Harambee 9% · Brewers Hill 8%", "Harambee, Hillside, Lindsay Heights", "34.5% (28.1–40.9%)", "ranked"]],
      },
    };
    const l = pngLayout(wide, measure);
    const texts = l.items.map((i) => i.text);
    for (const kept of ["#", "1", "1860", "34.5% (28.1–40.9%)", "Status", "ranked"]) expect(texts).toContain(kept);
    expect(texts.some((t) => t.startsWith("Hillside") && t.endsWith("…"))).toBe(true);
    for (const i of l.items) expect(i.x + measure(i.text, i.font)).toBeLessThanOrEqual(PNG_WIDTH - PNG_PAD + 0.001);
  });
});
