import { describe, expect, it } from "vitest";
import { countExport, measureExport, quoteText, rankExport } from "../../ui/lib/cardExport";
import { isShareable, newShareId, SHAREABLE, shareCard, shareDate, shareMessage } from "../../ui/lib/shareCard";
import { rankCardText } from "../../ui/lib/tractCardText";
import { turnoutExport } from "../../ui/lib/turnoutText";
import type { RankDetail } from "../../convex/tracts";

const ctx = { origin: "https://www.creamcityalmanac.app", date: "October 14, 2026" };
const turnout = { status: "ok" as const, title: "Milwaukee voter turnout · 1 general election · 2020", groupBy: "election" as const, rows: [{ label: "November 2020 general election", type: "general" as const, registered: 315483, ballots: 247695, turnout: 78.5 }], notes: ["Registered voters is the City's count on election day."], source: "From the City of Milwaukee's election results files (2016–2022), read by the Almanac." };
const count = { status: "ok", code: "P32", name: "NIBRS crimes", count: 1234, groups: [], other: 0, otherLabel: null, overlap: false, period: "2025-10-01 to 2026-09-30", filters: [], futureExcluded: 0, caveat: null, dateColumn: "ReportedDate", coverage: "2005 to 2026", resourceName: "wibr", area: null, noLocation: 0 };

describe("shareable tools", () => {
  it("lists exactly the nine tools with an exported Ask card, never fact sheet, place, boundary or dataset tools", () => {
    expect([...SHAREABLE].sort()).toEqual(["compareYears", "countRecords", "countStops", "countTurnout", "fireHistory", "getNumber", "rankTracts", "readReport", "relateTracts", "timeSpan", "zipHealth"]);
    for (const t of ["factSheet", "findPlace", "boundariesFor", "searchCatalog", "showDataset", "previewData", "nope"]) expect(isShareable(t)).toBe(false);
  });
});

describe("shareCard", () => {
  it("builds the same export the card's own CSV button builds", () => {
    expect(shareCard("countTurnout", turnout, ctx)).toEqual({ card: turnoutExport(turnout, ctx) });
    expect(shareCard("countRecords", count, ctx)).toEqual({ card: countExport(count as never, ctx) });
  });
  it("sends a measured count to the measure export", () => {
    const measured = {
      status: "measured", code: "H19", name: "Delinquent Real Estate Tax Accounts", groupBy: null, period: "all records", filters: [], averageAsked: false, splits: [],
      measure: { id: "tax-owed", name: "back tax owed", unit: "dollars", caveat: null, column: "Total Tax Principal", things: "accounts", summable: true, skipZero: false, namesPeople: true, date: null },
      groups: [], other: null, all: { n: 17500, total: 52000000, median: 2400, average: 3100, unreadable: 0, zeros: 0 },
    };
    expect(shareCard("countRecords", measured, ctx)).toEqual({ card: measureExport(measured as never, ctx) });
  });
  it("builds a tract card from its full detail and the moved card text", () => {
    const d = { status: "ok", tool: "rank", header: { code: "E02", name: "P", column: "pov_rate", meaning: "Percentage of households", kind: "rate", place: "County", year: "2023", n: 1, leftOut: 0, confidence: null, url: "u", caveats: [] }, direction: "high", top: [], ties: [], tieCount: 0, unreliable: [], unreliableCount: 0, highlighted: [], key: "k" } as unknown as RankDetail;
    expect(shareCard("rankTracts", d, ctx)).toEqual({ card: rankExport(d, rankCardText(d), ctx) });
    expect(shareCard("compareYears", d, ctx)).toBeNull(); // a rank detail is not a change answer
  });
  it("joins every report passage, and stores nothing for no passages or a busy search", () => {
    const p = (q: string) => ({ quote: q, section: "Housing", report: "Harambee 2023", code: "R05" });
    expect(shareCard("readReport", { status: "ok", passages: [p("A."), p("B.")] }, ctx)).toEqual({ quote: `${quoteText(p("A."), ctx)}\n\n${quoteText(p("B."), ctx)}` });
    expect(shareCard("readReport", { status: "ok", passages: [] }, ctx)).toBeNull();
    expect(shareCard("readReport", { status: "busy", passages: [] }, ctx)).toBeNull();
  });
  it("stores nothing for a refusal, a choice list or junk", () => {
    expect(shareCard("countTurnout", { status: "refused", reason: "Turnout hasn't been built yet." }, ctx)).toBeNull();
    expect(shareCard("countStops", { status: "choose", options: [] }, ctx)).toBeNull();
    expect(shareCard("getNumber", null, ctx)).toBeNull();
    expect(shareCard("timeSpan", "ok", ctx)).toBeNull();
  });
});

describe("ids and dates", () => {
  it("makes 10-character ids from 0-9A-Za-z with no clash in 10,000", () => {
    const ids = Array.from({ length: 10_000 }, newShareId);
    for (const id of ids.slice(0, 50)) expect(id).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(new Set(ids).size).toBe(10_000);
  });
  it("writes the share date in Milwaukee's time zone", () => {
    expect(shareDate(Date.UTC(2026, 9, 15, 3, 0))).toBe("October 14, 2026"); // 10pm on the 14th in Chicago
  });
});

describe("the reporter's message", () => {
  it("is silent on success, names the daily limit, and otherwise says to retry", () => {
    expect(shareMessage({ ok: true, id: "k3Xp9qL2mT" })).toBeNull();
    expect(shareMessage({ ok: false, reason: "limit" })).toBe("You've made today's 30 links. Try again tomorrow.");
    for (const r of [{ ok: false as const, reason: "failed" as const }, { ok: false as const, reason: "signed-out" as const }, null]) {
      expect(shareMessage(r)).toBe("Couldn't make a link. Ask again and retry.");
    }
  });
});
