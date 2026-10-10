// Words and numbers for Ask's tract cards. Units come from DYCU's own meaning of the column, never guessed:
// "rates" can be per 1,000 as well as percents.

const MINUS = "−";
const sign = (s: string) => s.replace(/^-/, MINUS);

// DYCU's meanings run on into a formula ("... Calculation: (a / b) x 100"); the card shows the plain part.
export const plainMeaning = (meaning: string) => meaning.split(/\s+Calculation:/i)[0].trim();

export const isPercent = (meaning: string) => /percent/i.test(meaning); // also matches "percentage"

const plain = (v: number) => sign(Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 10) / 10));
const fixed = (v: number) => sign((Math.round(v * 10) / 10).toFixed(1));
const num = (v: number, pct: boolean) => (pct ? fixed(v) : plain(v));

export const valueText = (v: number, pct: boolean) => `${num(v, pct)}${pct ? "%" : ""}`;

// The % closes the range ("(64.2–82.8%)"), as it does the value.
export function rangeText(r: { value: number; lo: number | null; hi: number | null }, pct: boolean) {
  return {
    value: valueText(r.value, pct),
    span: r.lo === null || r.hi === null ? null : `(${num(r.lo, pct)}–${num(r.hi, pct)}${pct ? "%" : ""})`,
  };
}

export function changeText(change: number, direction: "increase" | "decrease", pct: boolean) {
  const n = num(Math.abs(change), pct);
  return `${change < 0 ? MINUS : "+"}${n}${pct ? " points" : ""} (clear ${direction})`;
}

type Col = { code: string; column: string };
export const scatterLabel = (n: number, a: Col, b: Col, counts?: { fits: number; close: number }) =>
  `Scatter of ${n} tracts, ${a.column} (${a.code}) against ${b.column} (${b.code})${counts ? `; ${counts.fits} clearly fit, ${counts.close} close` : ""}.`;
