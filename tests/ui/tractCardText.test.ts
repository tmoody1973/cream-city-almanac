import { describe, expect, it } from "vitest";
import type { ChangeDetail, Header, RankDetail, RelateDetail, TractRow } from "../../convex/tracts";
import { BARE_RANK, changeCardText, changeHead, rankCardText, rankHead, relateCardText, relateHead } from "../../ui/lib/tractCardText";

const pov: Header = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Percentage of households with income below the poverty line", kind: "rate", place: "County", year: "2023", n: 210, leftOut: 0, confidence: "90% confidence (Census)", url: "https://x.test/0", caveats: ["Five-year estimates."] };
const inc: Header = { ...pov, column: "inc", name: "Median income", meaning: "Median household income in dollars", kind: "value" };
const row = (geoid: string, value: number): TractRow => ({ geoid, tract: geoid.slice(-4), city: [], dycu: [], value, lo: value - 2, hi: value + 2, unreliable: false });
const FINE = "Ranges are margins of error: 90% confidence (Census). Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into.";

const rank: RankDetail = { status: "ok", tool: "rank", header: pov, direction: "high", top: [row("55079186000", 41)], ties: [row("55079009300", 40)], tieCount: 1, unreliable: [row("55079000101", 39)], unreliableCount: 1, highlighted: [], key: "k" };

describe("tract card text (C2: shared by the card and the share link)", () => {
  it("writes the rank card's title, summary and fine print", () => {
    const t = rankHead(rank);
    expect(t.title).toBe("Highest pov_rate · County 2023");
    expect(t.summary).toBe("This is the census tract in Milwaukee County with the highest percentage of households with income below the poverty line (2023 data). 1 more is within the margin of error of #1, so read the top as a group, not an exact order. 1 tract is left out because its estimate is too uncertain.");
    expect(t.lines).toEqual([t.summary]);
    expect(rankCardText(rank)).toEqual({ title: t.title, lines: [t.summary], fine: FINE });
  });
  it("adds the no-margin line to a bare rank and zeroes its ties", () => {
    const t = rankHead({ ...rank, direction: "low", header: { ...pov, confidence: null } });
    expect(t.bare).toBe(true);
    expect(t.summary).toBe("This is the census tract in Milwaukee County with the lowest percentage of households with income below the poverty line (2023 data). There's no margin of error for this column, so tracts close in rank may really be tied.");
    expect(t.lines).toEqual([t.summary, BARE_RANK]);
  });
  it("writes the change card's title, summary and counts", () => {
    const d: ChangeDetail = { status: "ok", tool: "change", header: pov, note: null, from: "2022", to: "2023", increases: 2, decreases: 1, none: 7, unreliableCount: 3, changeCount: 3, changes: [], highlighted: [], key: "k" };
    const t = changeHead(d);
    expect(t.title).toBe("pov_rate · County 2022 → 2023");
    expect(t.summary).toBe("From 2022 to 2023 in Milwaukee County, the percentage of households with income below the poverty line clearly rose in 2 census tracts and clearly fell in 1. In the other 7 compared, the change is smaller than the survey's margin of error.");
    expect(t.counts).toBe("2 clear increases · 1 clear decreases · 7 no clear change · 3 not compared (too uncertain)");
    expect(changeCardText(d)).toEqual({ title: t.title, lines: [t.summary, t.counts], fine: FINE });
    expect(changeHead({ ...d, header: { ...pov, confidence: null } }).counts).toBe("Can't tell which tracts changed clearly: pov_rate has no margin of error.");
  });
  it("writes the relate card's verdict, cutoff lead and causal fine print", () => {
    const d = { status: "ok", tool: "relate", mode: "mismatch", a: pov, b: inc, n: 200, strength: "moderate", cutA: 20, cutB: 30000, aSide: "high", bSide: "high", fitsCount: 4, closeCount: 2, unreliableCount: 0, fits: [], close: [], points: [], highlighted: [], closeIds: [], key: "k" } as unknown as RelateDetail;
    const t = relateHead(d);
    expect(t.title).toBe("Households Living in Poverty vs. Median income");
    expect(t.summary).toBe("We looked for census tracts in Milwaukee County (2023 data) in the top third for the percentage of households with income below the poverty line and the top third for the median household income in dollars. 4 are clear matches, even at the edges of the margin of error, and 2 more are possible matches.");
    expect(t.verdict).toBe("4 clear matches; 2 possible matches.");
    expect(t.lead).toBe("Cutoffs: top third on pov_rate, top third on inc.");
    expect(relateCardText(d).fine).toBe("Cutoffs: top third on pov_rate, top third on inc. Ranges are margins of error: 90% confidence (Census). Related doesn't mean one causes the other. Neighborhood: the City's official neighborhoods covering at least 10% of the tract, biggest first. DYCU area: the areas DYCU's reports group the tract into.");
    const few = relateHead({ ...d, mode: "relate", strength: "too-few", n: 12, unreliableCount: 3 } as RelateDetail);
    expect(few.verdict).toBe("Too few tracts to say (fewer than 20 matched).");
    expect(few.lines.at(-1)).toBe("3 tracts are too uncertain to count (shown faint).");
  });
});
