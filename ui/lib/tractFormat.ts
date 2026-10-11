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
const matches = (n: number, kind: "clear" | "possible") => `${n} ${kind} ${n === 1 ? "match" : "matches"}`;
// Across and up name the axes for a screen reader the way the plot's own labels do.
export const scatterLabel = (n: number, a: Col, b: Col, counts?: { fits: number; close: number }) =>
  `Scatter of ${n} census tracts, ${a.column} (${a.code}) across, ${b.column} (${b.code}) up${counts ? `; ${matches(counts.fits, "clear")}, ${matches(counts.close, "possible")}` : ""}.`;

// The columns with no margin of error found (spec §5 rule 7), or null when every column has one. "found", not
// "published": the pairing of a column with its margin can miss.
export function noMargin(heads: { column: string; confidence: string | null }[]): string | null {
  const bare = [...new Set(heads.filter((h) => !h.confidence).map((h) => h.column))];
  return bare.length ? `${bare.join(" and ")} ${bare.length === 1 ? "has" : "have"} no margin of error` : null;
}

// "fewer than 20 matched" only when that is why; a constant column is too few to say as well.
export const tooFew = (n: number) => (n < 20 ? "Too few tracts to say (fewer than 20 matched)." : "Too few tracts to say.");

export function mismatchVerdict({ fitsCount, closeCount, n, gated, bare }: { fitsCount: number; closeCount: number; n: number; gated: boolean; bare: string | null }) {
  if (gated) return tooFew(n);
  if (bare) return `Can't tell which tracts are clear matches: ${bare}.`;
  const possible = closeCount ? `; ${matches(closeCount, "possible")}` : "";
  return `${fitsCount === 0 ? "No clear match" : matches(fitsCount, "clear")}${possible}.`;
}
