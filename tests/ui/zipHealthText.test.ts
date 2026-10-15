import { describe, expect, it } from "vitest";
import { parseDataPage, parseTopicsPage, pickFigures, HC_CREDIT } from "../../convex/lib/healthCompass";
import { answer, type HealthData, type HealthOk } from "../../convex/lib/healthAnswer";
import { toCsv } from "../../ui/lib/cardExport";
import { shareCard } from "../../ui/lib/shareCard";
import { creditsOf, label, leadOf, mapOf, notesOf, tableOf, zipHealthChoices, zipHealthExport, zipHealthFollowUps, zipHealthRefusal } from "../../ui/lib/zipHealthText";
import { HC_ROWS, HC_TOPICS_PAGE } from "../fixtures/healthCompass";

const geos = [...new Set(HC_ROWS.map((r) => r.g))];
const data: HealthData = {
  topics: parseTopicsPage(HC_TOPICS_PAGE).topics,
  places: geos.map((geo) => ({ layer: geo === "55079" ? "county" : "zip", geo, figures: pickFigures(parseDataPage({ results: HC_ROWS.filter((r) => r.g === geo) })) })),
  hoods: { "53208": ["Washington Park", "Sherman Park"] },
  asOf: Date.UTC(2026, 9, 12, 17),
};
const ok = (a: Parameters<typeof answer>[0]) => answer(a, data) as HealthOk;
const FI = "Food Insecurity (2024 Food Insecurity)";
const mismatch = ok({ mode: "mismatch", measure: FI, side: "low", other: "Poverty rate", otherSide: "high" });
const ctx = { origin: "https://www.creamcityalmanac.app", date: "October 15, 2026" };

describe("ZIP health words", () => {
  it("names a measure plainly", () => {
    expect(label(data.topics.find((t) => t.key === "MQ35")!)).toBe("food insecurity");
    expect(label(data.topics.find((t) => t.key === "ALI")!)).toBe("households below ALICE threshold");
  });
  it("leads with what was found, written by code", () => {
    expect(leadOf(mismatch)).toEqual({ strong: "No ZIP clearly has high poverty rate with low food insecurity. Possible: 53208.", rest: "Its figures point that way, but its ranges overlap the cutoffs." });
    expect(leadOf(ok({ mode: "rank", measure: FI })).strong).toBe("Highest food insecurity: 53205, 53218, 53235.");
    expect(leadOf(ok({ mode: "one", measure: FI, zip: "53208" })).strong).toBe("53208 is about the same as Milwaukee County on food insecurity.");
  });
  it("rows name each ZIP's neighborhoods, or its town", () => {
    const t = tableOf(mismatch);
    expect(t.head).toEqual(["ZIP", "Where", "Food insecurity", "Poverty rate", "Match"]);
    expect(t.rows[0].slice(0, 2)).toEqual(["53208", "Washington Park, Sherman Park"]);
    expect(t.rows[0][4]).toBe("possible match");
  });
  it("states the cutoff, the ranges, the measure's own words and as-of date", () => {
    const n = notesOf(mismatch).join("\n");
    expect(n).toContain("In the last 12 months, did you ever eat less than you felt you should because there wasn’t enough money for food?");
    expect(n).toMatch(/High poverty rate: the third of ZIP codes with the most \(at or above 21\.6%\)/);
    expect(n).toMatch(/Low food insecurity: below Milwaukee County's 13\.85%/);
    expect(n).toContain("Too uncertain to use: 53203.");
    expect(n).toContain("Health Compass figures as of October 12, 2026.");
  });
  it("keeps the credit, source and link on every export path (review focus 4)", () => {
    const e = zipHealthExport(mismatch, ctx);
    const csv = toCsv(e);
    for (const s of [HC_CREDIT, "Source: U.S. Census Bureau · American Community Survey (ACS) · Table B17001", "https://healthcompassmilwaukee.org/topics/MQ35", "https://healthcompassmilwaukee.org/topics/POV"]) {
      expect(e.notes.join("\n")).toContain(s);
      expect(csv).toContain(s);
    }
    const shared = shareCard("zipHealth", mismatch, ctx);
    expect(shared && "card" in shared && shared.card.notes.join("\n")).toContain(HC_CREDIT);
  });
  it("gives every measure its period, even when no ZIP matches (review I2)", () => {
    const two = { ...data, places: data.places.filter((pl) => pl.geo === "55079" || pl.geo === "53205") };
    const none = answer({ mode: "mismatch", measure: FI, side: "low", other: "Poverty rate", otherSide: "high" }, two) as HealthOk;
    expect(none.status === "ok" && none.mode === "mismatch" && none.close.length + none.fits.length).toBe(0);
    for (const block of creditsOf(none)) expect(block).toContainEqual(expect.stringMatching(/^Period: \d{4}/));
    expect(none.periods).toEqual({ MQ35: "2024", POV: "2020-2024" });
  });
  it("says when the county's figure is from a different period than the ZIPs' (review I1)", () => {
    const shifted = { ...data, places: data.places.map((pl) => (pl.geo === "55079" ? { ...pl, figures: pl.figures.map((f) => (f.topic === "MQ35" ? { ...f, period: "2023" } : f)) } : pl)) };
    const r = answer({ mode: "rank", measure: FI }, shifted) as HealthOk;
    expect(notesOf(r)).toContain("Milwaukee County's food insecurity figure is from 2023; the ZIPs' are from 2024.");
    expect(notesOf(mismatch).join("\n")).not.toContain("is from");
  });
  it("maps clear matches hatched and possible ones outlined, as ZIPs", () => {
    expect(mapOf(mismatch)).toMatchObject({ fits: [], close: ["53208"], noun: "ZIP" });
  });
  it("offers plain next questions, choices and refusals", () => {
    expect(zipHealthFollowUps(mismatch)[0]).toEqual({ label: "EVERY ZIP", question: `Which ZIP codes have the highest ${FI}?` });
    const choose = answer({ mode: "rank", measure: "food insecurity" }, data);
    if (choose.status !== "choose") throw new Error("expected choices");
    expect(zipHealthChoices(choose)[0].question).toMatch(/^Answer that with Health Compass's "/);
    expect(zipHealthRefusal({ status: "unavailable" })).toBe("Health figures aren't loaded yet; try again later.");
  });
});
