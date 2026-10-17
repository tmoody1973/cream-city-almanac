// The fact sheet's plain-language verdicts, copied from VERDICT in ui/lib/factText.ts ("unknown" has no words, so it isn't shown).
const VERDICT = { higher: "clearly higher than the city", lower: "clearly lower than the city", same: "about the same as the city (within the margin of error)" };

// What the video shows, from production's own answers. Throws rather than ever showing a guessed number.
export function toData({ sheet, robbery, asOf }) {
  if (sheet?.status !== "ok") throw new Error(`Riverwest sheet not ok: ${sheet?.status}`);
  const h = sheet.headlines.find((x) => x.id === "poverty");
  if (!h?.hood?.rate || !h.city?.rate) throw new Error("Riverwest poverty rate missing");
  if (!VERDICT[h.verdict]) throw new Error(`No verdict to show: ${h.verdict}`);
  if (robbery?.status !== "ok") throw new Error(`Robbery count not ok: ${robbery?.status}`);
  // Same caption as the site's sample card (sampleView in ui/lib/landingSample.ts).
  const caption = [robbery.name, ...robbery.filters, robbery.period, robbery.area ? `In ${robbery.area}` : null].filter(Boolean).join(" · ");
  return {
    asOf,
    riverwest: { name: sheet.name, label: h.label, period: sheet.period, rate: h.hood.rate, city: h.city.rate, verdict: VERDICT[h.verdict] },
    robbery: { count: robbery.count, caption },
  };
}
