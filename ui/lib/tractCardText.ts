import type { ChangeAnswer, ChangeDetail, RankDetail, RelateAnswer, RelateDetail } from "@/convex/tracts";
import type { TractCardText } from "./cardExport";
import { mismatchVerdict, noMargin, tooFew } from "./tractFormat";
import { changeSummary, fineText, rankSummary, relateSummary } from "./tractSummary";

// The three tract cards' title, summary and lines, written once: the card shows them, its export copies them, and a
// share link (spec 2026-10-14-share-link-design.md §5) builds them on the server from the same full answer.

export const TIES_INLINE = 5;
export const BARE_RANK = "No margin of error found for this column, so ranks may be ties.";
const STRENGTH = { little: "Little relationship", weak: "Weakly related", moderate: "Moderately related", strong: "Strongly related" } as const;

export function rankHead(r: RankDetail) {
  const h = r.header;
  const title = `${r.direction === "high" ? "Highest" : "Lowest"} ${h.column} · ${h.place} ${h.year}`;
  const bare = !h.confidence; // no ranges: no ties or unreliable tracts can be found (spec §5 rule 7)
  const summary = rankSummary({ header: h, direction: r.direction, top: r.top.length, tieCount: bare ? 0 : r.tieCount, unreliableCount: bare ? 0 : r.unreliableCount, inline: TIES_INLINE, area: r.area });
  return { title, summary, bare, lines: bare ? [summary, BARE_RANK] : [summary] };
}

export function changeHead(r: ChangeAnswer) {
  const h = r.header;
  const title = `${h.column} · ${h.place} ${r.from} → ${r.to}`;
  const bare = noMargin([h]);
  const summary = changeSummary({ header: h, from: r.from, to: r.to, increases: r.increases, decreases: r.decreases, none: r.none, area: r.area });
  const counts = bare
    ? `Can't tell which tracts changed clearly: ${bare}.`
    : `${r.increases} clear increases · ${r.decreases} clear decreases · ${r.none} no clear change${r.unreliableCount > 0 ? ` · ${r.unreliableCount} not compared (too uncertain)` : ""}`;
  return { title, summary, counts, bare, lines: [summary, counts] };
}

export function relateHead(r: RelateAnswer) {
  const { a, b } = r;
  const mismatch = r.mode === "mismatch";
  const gated = mismatch && r.cutA === undefined; // fewer than 20 reliable pairs: no cutoffs were drawn
  const side = (s?: "high" | "low") => (s === "low" ? "bottom" : "top");
  const bare = noMargin([a, b]);
  const summary = relateSummary(r);
  const verdict = mismatch ? mismatchVerdict({ fitsCount: r.fitsCount, closeCount: r.closeCount, n: r.n, gated, bare }) : r.strength === "too-few" ? tooFew(r.n) : STRENGTH[r.strength];
  const lead = mismatch && !gated ? `Cutoffs: ${side(r.aSide)} third on ${a.column}, ${side(r.bSide)} third on ${b.column}.` : undefined;
  const lines = [summary, verdict, ...(r.unreliableCount > 0 ? [`${r.unreliableCount} tracts are too uncertain to count (shown faint).`] : [])];
  return { title: `${a.name} vs. ${b.name}`, summary, verdict, lead, mismatch, gated, bare, lines };
}

export const rankCardText = (d: RankDetail): TractCardText => { const t = rankHead(d); return { title: t.title, lines: t.lines, fine: fineText([d.header]) }; };
export const changeCardText = (d: ChangeDetail): TractCardText => { const t = changeHead(d); return { title: t.title, lines: t.lines, fine: fineText([d.header]) }; };
export const relateCardText = (d: RelateDetail): TractCardText => { const t = relateHead(d); return { title: t.title, lines: t.lines, fine: fineText([d.a, d.b], { causal: true, lead: t.lead }) }; };
