import { describe, expect, it } from "vitest";
import { proseSegments } from "../../ui/lib/askProse";
import { countCoverage, outsideCoverage } from "../../ui/lib/askCount";
import { askTools, withoutCells, type AskBackend, type CountResult } from "../../lib/ask/tools";
import { ASK_PROMPT } from "../../lib/ask/prompt";
import { fakeAskModel, meteredModel, useFakeModel } from "../../lib/ask/model";
import { MockLanguageModelV3 } from "ai/test";
import { simulateReadableStream } from "ai";

const flagged = (t: string) => proseSegments(t).filter((s) => s.unverified).map((s) => s.text);

describe("proseSegments", () => {
  it("flags figures in the model's words", () => {
    expect(flagged("About 6,520 people, or 18% of residents.")).toEqual(["6,520", "18%"]);
    expect(flagged("A rate of 12.5 per 1000.")).toEqual(["12.5", "1000"]);
  });
  it("allows years and dataset codes", () => {
    expect(flagged("Harambee's 2024 table in N03, and W01 for 2021.")).toEqual([]);
  });
  it("flags years outside 1900–2099 and numbers glued to codes", () => {
    expect(flagged("In 1850 there were 3 mills.")).toEqual(["1850", "3"]);
  });
  it("reads a year followed by a comma as a year", () => {
    expect(flagged("It covers 2023, 2024 and 2025.")).toEqual([]);
    expect(flagged("About 6,520 people.")).toEqual(["6,520"]);
  });
  it("allows numbers inside a quoted row label the data returned, not a quoted figure", () => {
    const data = JSON.stringify(["Under 5 years", "Income in the past 12 months"]);
    const check = (t: string) => proseSegments(t, data).filter((s) => s.unverified).map((s) => s.text);
    expect(check('Harambee\'s "Under 5 years" row is below.')).toEqual([]);
    expect(check("The \u201cIncome in the past 12 months\u201d row.")).toEqual([]);
    expect(check('The estimate is "608".')).toEqual(["608"]);
  });
  it("allows places and dates the person named: districts, wards, ZIPs, street addresses, calendar dates", () => {
    expect(flagged("Police district 6, aldermanic District 12 and ward 12.")).toEqual([]);
    expect(flagged("Everything in ZIP 53212 and ZIP code 53206.")).toEqual([]);
    expect(flagged("I can't look up 2263 N Lake Dr, or 410 E. Wells St.")).toEqual([]);
    expect(flagged("The data ends December 31, 2023, and Dec 31 is the last day. Sep. 5 and Mar 3, 2025 too.")).toEqual([]);
  });
  it("allows a tract number the tract tools returned, and flags one they didn't", () => {
    const data = JSON.stringify({ top: [{ tract: "1860", neighborhood: "Harambee" }, { tract: "78" }, { tract: "1601.01" }] });
    const check = (t: string) => proseSegments(t, data).filter((s) => s.unverified).map((s) => s.text);
    expect(check("Tract 1860 tops the list.")).toEqual([]);
    expect(check("Tracts 78 and 1601.01 come next, then tract 1860.")).toEqual([]);
    expect(check("Tract 4242 is close.")).toEqual(["4242"]);
    expect(check("Tracts 78 and 4242.")).toEqual(["4242"]);
    expect(flagged("Tract 1860 tops the list.")).toEqual(["1860"]);
  });
  it("a district or ward number can't swallow a count that follows it", () => {
    expect(flagged("In the district 1,200 homes were vacant.")).toEqual(["1,200"]);
    expect(flagged("Ward 6,520 voters")).toEqual(["6,520"]);
    expect(flagged("district 6.5% of homes")).toEqual(["6.5%"]);
    expect(flagged("Police district 6, District 3 had fewer, and ward 12.")).toEqual([]);
  });
  it("a month-day, district or ward can't swallow a count that follows it (m6)", () => {
    expect(flagged("In March 31 robberies were reported.")).toEqual(["31"]);
    expect(flagged("In ward 120 requests were filed.")).toEqual(["120"]);
    expect(flagged("District 412 robberies were reported.")).toEqual(["412"]);
    expect(flagged("Police district 6 calls rose.")).toEqual(["6"]);
    expect(flagged("March 31, 2025 is the last day; on March 31 the file closed, and Mar 3 2024 too.")).toEqual([]);
    expect(flagged("Ward 12 has fewer; district 5 and district 7 were busier than district 3.")).toEqual([]);
  });
  it("still flags a bare count next to those words", () => {
    expect(flagged("There were 31 robberies.")).toEqual(["31"]);
    expect(flagged("There were 31 robberies in district 6.")).toEqual(["31"]);
    expect(flagged("About 94 incidents in ward 12 on Dec 31.")).toEqual(["94"]);
    expect(flagged("53212 people lived there.")).toEqual(["53212"]);
    expect(flagged("There were 12 North Side shootings.")).toEqual(["12"]);
  });
  it("allows a duration only when the data itself says that duration (a rule or lag the dataset documents)", () => {
    const data = JSON.stringify({ caveat: "A property can take up to 72 hours to appear.", period: "Oct 9, 2025 \u2013 Oct 9, 2026 (last 12 months)", explainer: "left vacant for 30 days or more" });
    const check = (t: string) => proseSegments(t, data).filter((s) => s.unverified).map((s) => s.text);
    expect(check("New cases can take up to 72 hours; the card covers the last 12 months; vacant for 30 days or more.")).toEqual([]);
    expect(check("Cases take 48 hours, and 12 days later.")).toEqual(["48", "12"]);
    expect(flagged("New cases can take up to 72 hours.")).toEqual(["72"]);
  });
  it("treats digits glued to letters as identifiers, not figures", () => {
    expect(flagged("Census tables B17001, S1501 and DP04 cover it, with PM2.5 readings.")).toEqual([]);
    expect(flagged("Adults over 18.")).toEqual(["18"]);
  });
  it("allows definitions: age bands, survey periods and table numbers", () => {
    expect(flagged("Adults 18 and older, ages 20 to 64, people aged 65 and over.")).toEqual([]);
    expect(flagged("Ages 20\u201364 and ages 5-17.")).toEqual([]);
    expect(flagged("American Community Survey 5-year estimates, a 12-month window.")).toEqual([]);
    expect(flagged("See Table 11 and table 3.")).toEqual([]);
  });
  it("still flags figures that sit near those words", () => {
    expect(flagged("18% of adults and 6,520 people aged 20 to 64.")).toEqual(["18%", "6,520"]);
    expect(flagged("608 children under 5 years.")).toEqual(["608", "5"]);
  });
  it("trusts a quoted label only when the data returned it word for word", () => {
    const data = JSON.stringify({ label: "Under 5 years", rows: ["Income in the past 12 months below poverty level"] });
    const check = (t: string) => proseSegments(t, data).filter((s) => s.unverified).map((s) => s.text);
    expect(check('The "Under 5 years" row is open.')).toEqual([]);
    expect(check('Harambee has "608 children under 5" in poverty.')).toEqual(["608", "5"]);
    expect(check('A 5" sign and 42% are poor in "Under 5 years".')).toEqual(["5", "42%"]);
  });
  it("keeps the text intact", () => {
    const t = "Between 2021 and 2023 it rose by 4 points.";
    expect(proseSegments(t).map((s) => s.text).join("")).toBe(t);
  });
});

const backend: AskBackend = {
  search: async () => ({ mode: "search", degraded: false, results: Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, code: `W0${i}`, name: `Set ${i}`, kind: "dataset", topic: "Health", places: ["City"], years: [2023], latestModified: "", snippet: null })) }) as never,
  sheet: async (code) =>
    code === "V02"
      ? ({ family: { code: "V02", name: "Daily Air Quality", places: ["City"], years: [2023] }, members: [{ place: "City", yearLabel: "2023", featureServerUrl: "https://feed" }, { place: "City", yearLabel: "2022", featureServerUrl: null }], card: { explainer: "e", caveats: ["c"], glossary: [{ field: "Day" }, { field: "AvgAQI" }] } } as never)
      : null,
  number: async () => ({ status: "no-topic", topics: ["Rent Paid"] }) as never,
  report: async () => ({ status: "ok", passages: [] }),
  count: async () => ({ status: "not-found" }) as never,
  rank: async () => ({ status: "busy" }) as never,
  change: async () => ({ status: "busy" }) as never,
  relate: async () => ({ status: "busy" }) as never,
};
const tool = (name: string) => askTools(backend).find((t) => t.name === name)!;

describe("Ask tools", () => {
  it("returns at most five search rows, IDs and names only", async () => {
    const r = (await tool("searchCatalog").execute({ query: "asthma" })) as { rows: unknown[] };
    expect(r.rows).toHaveLength(5);
    expect(r.rows[0]).toEqual({ code: "W00", name: "Set 0", places: ["City"], years: [2023] });
  });
  it("gives the model a dataset's caveats and its sheet's story angles to ground new angles", async () => {
    const angles = { ...backend, sheet: async () => ({ family: { code: "H05", name: "Housing Built Before 1950", places: ["County"], years: [2024] }, members: [], card: { explainer: "e", caveats: ["County only."], storyAngles: ["Which tracts have the oldest housing?"], glossary: [] } }) as never };
    const r = await askTools(angles).find((t) => t.name === "showDataset")!.execute({ code: "h05" });
    expect(r).toMatchObject({ status: "ok", code: "H05", caveats: ["County only."], storyAngles: ["Which tracts have the oldest housing?"] });
  });
  it("says when a dataset code is unknown", async () => {
    expect(await tool("showDataset").execute({ code: "zz9" })).toEqual({ status: "not-found", code: "ZZ9" });
  });
  it("hands the preview card only live feeds and the glossary's columns", async () => {
    expect(await tool("previewData").execute({ code: "V02" })).toEqual({ status: "ok", code: "V02", name: "Daily Air Quality", members: [{ place: "City", yearLabel: "2023", featureServerUrl: "https://feed" }], fields: ["Day", "AvgAQI"] });
  });
  it("passes number and report lookups straight through", async () => {
    expect(await tool("getNumber").execute({ neighborhood: "Harambee", topic: "x", row: "Total" })).toEqual({ status: "no-topic", topics: ["Rent Paid"] });
  });
});

describe("fake model switch", () => {
  const req = (h: Record<string, string>) => new Request("https://x.test/api/copilotkit", { headers: h });
  it("uses the fake model only when asked and not in production", () => {
    expect(useFakeModel(req({ "x-ask-fake": "1" }), { VERCEL_ENV: "preview" })).toBe(true);
    expect(useFakeModel(req({}), { VERCEL_ENV: "preview" })).toBe(false);
  });
  it("ignores the fake header in production", () => {
    expect(useFakeModel(req({ "x-ask-fake": "1" }), { VERCEL_ENV: "production" })).toBe(false);
  });
});

describe("metering", () => {
  const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: output, text: output, reasoning: 0 } });
  const inner = (input: number, output: number) =>
    new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            { type: "text-start" as const, id: "a" },
            { type: "text-delta" as const, id: "a", delta: "Hi." },
            { type: "text-end" as const, id: "a" },
            { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage: usage(input, output) },
          ],
        }),
      }),
    });
  const prompt = [{ role: "user" as const, content: [{ type: "text" as const, text: "x".repeat(4000) }] }];
  const drain = async (stream: ReadableStream<{ type: string }>) => {
    const parts: string[] = [];
    for await (const p of stream as unknown as AsyncIterable<{ type: string }>) parts.push(p.type);
    return parts;
  };

  it("charges the estimated input before any reply, so an abandoned answer is still counted", async () => {
    const calls: { inputTokens: number; outputTokens: number }[] = [];
    const model = meteredModel(inner(500, 20), async (u) => void calls.push(u)) as unknown as { doStream: (o: object) => Promise<{ stream: ReadableStream<{ type: string }> }> };
    await model.doStream({ prompt });
    expect(calls).toHaveLength(1);
    expect(calls[0].outputTokens).toBe(0);
    expect(calls[0].inputTokens).toBeGreaterThanOrEqual(1000); // 4,000+ characters of prompt
  });
  it("charges output at the finish, plus any input beyond the estimate", async () => {
    const calls: { inputTokens: number; outputTokens: number }[] = [];
    const model = meteredModel(inner(5000, 20), async (u) => void calls.push(u)) as unknown as { doStream: (o: object) => Promise<{ stream: ReadableStream<{ type: string }> }> };
    const { stream } = await model.doStream({ prompt });
    await drain(stream);
    const estimate = calls[0].inputTokens;
    expect(calls[1]).toEqual({ inputTokens: 5000 - estimate, outputTokens: 20 });
  });
  it("lets the answer through when the meter fails", async () => {
    const model = meteredModel(inner(10, 5), async () => { throw new Error("convex down"); }) as unknown as { doStream: (o: object) => Promise<{ stream: ReadableStream<{ type: string }> }> };
    const { stream } = await model.doStream({ prompt });
    expect(await drain(stream)).toContain("finish");
  });
});

const fakeBackend = () => backend;
describe("countRecords tool", () => {
  it("is offered and passes its arguments through", async () => {
    const seen: unknown[] = [];
    const b = { ...fakeBackend(), count: async (a: unknown) => (seen.push(a), { status: "ok", count: 3 }) } as never;
    const t = askTools(b).find((x) => x.name === "countRecords")!;
    expect(await t.execute({ code: "P01", groupBy: "month" } as never)).toEqual({ status: "ok", count: 3 });
    expect(seen).toEqual([{ code: "P01", groupBy: "month" }]);
  });
  it("keeps the map's cells out of the conversation: a citywide count stays small (C1)", async () => {
    const cells = Array.from({ length: 1500 }, (_, k) => ({ i: 11900 + (k % 60), j: -17990 + Math.floor(k / 60), band: 3 as const, n: 120 + k }));
    const big = { status: "ok", code: "P01", name: "NIBRS Crime Data", count: 99999, groups: [], other: 0, otherLabel: null, overlap: false, period: "Oct 10, 2025 – Oct 9, 2026", filters: [], futureExcluded: 0, caveat: "These are reported incidents, not all crime.", dateColumn: "Incident_Date", coverage: "Jan 1, 2024 – Oct 9, 2026", resourceName: "2025", namesPeople: false, area: null, noLocation: 0, map: { size: { dLat: 0.0036, dLon: 0.0049 }, cells, summary: { total: 99999, areas: 1500, fivePlus: 1500, busiest: 1619 }, area: null } } as CountResult;
    expect(JSON.stringify(big).length).toBeGreaterThan(40_000);
    const small = withoutCells(big);
    expect(JSON.stringify(small).length).toBeLessThan(4096);
    expect(small).toMatchObject({ status: "ok", count: 99999, map: { summary: { areas: 1500 }, area: null } });
    expect(JSON.stringify(small)).not.toContain('"cells"');
    const t = askTools({ ...fakeBackend(), count: async () => big }).find((x) => x.name === "countRecords")!;
    expect(JSON.stringify(await t.execute({ code: "P01" } as never)).length).toBeLessThan(4096);
  });
  it("previewData answers for a live City dataset instead of 'no-feed'", async () => {
    const b = { ...fakeBackend(), sheet: async () => ({ family: { code: "P01", name: "NIBRS Crime Data", source: "city" }, members: [], card: null, city: { columns: ["Incident_Date"], namesPeople: false, coverage: { min: "2024-01-01", max: "2026-10-08" }, datastoreId: "rid" } }) } as never;
    expect(await askTools(b).find((x) => x.name === "previewData")!.execute({ code: "P01" } as never)).toMatchObject({ status: "ok", city: true, fields: ["Incident_Date"] });
  });
  it("tells the model a City dataset names people, on its sheet and its preview (m1)", async () => {
    const mprop = { family: { code: "H09", name: "Master Property File", places: ["City"], years: [], source: "city" }, members: [], card: { explainer: "e", caveats: [], storyAngles: [], glossary: [] }, city: { columns: ["OWNER_NAME_1"], namesPeople: true, coverage: { min: null, max: null }, datastoreId: "rid" } };
    const b = { ...fakeBackend(), sheet: async () => mprop } as never;
    expect(await askTools(b).find((x) => x.name === "showDataset")!.execute({ code: "H09" } as never)).toMatchObject({ status: "ok", namesPeople: true });
    expect(await askTools(b).find((x) => x.name === "previewData")!.execute({ code: "H09" } as never)).toMatchObject({ status: "ok", city: true, namesPeople: true });
    expect(await tool("showDataset").execute({ code: "V02" })).not.toHaveProperty("namesPeople");
  });
  it("tells the model to count only through countRecords and never repeat a person's record", () => {
    expect(ASK_PROMPT).toContain("countRecords");
    expect(ASK_PROMPT).toMatch(/never repeat or look up an individual/i);
  });
  it("the fake model searches then counts for 'thefts'", async () => {
    const model = fakeAskModel() as unknown as { doStream(o: unknown): Promise<{ stream: ReadableStream<{ type: string }> }> };
    const run = async (prompt: unknown[]) => {
      const { stream } = await model.doStream({ prompt });
      const calls: { toolName: string; input: string }[] = [];
      const r = stream.getReader();
      for (;;) { const { done, value } = await r.read(); if (done) break; if (value.type === "tool-call") calls.push(value as never); }
      return calls;
    };
    const user = { role: "user", content: [{ type: "text", text: "How many thefts?" }] };
    expect((await run([user]))[0].toolName).toBe("searchCatalog");
    const tool = { role: "tool", content: [{ type: "tool-result", toolCallId: "c", toolName: "searchCatalog", output: { type: "json", value: { rows: [{ code: "P07" }] } } }] };
    const second = await run([user, tool]);
    expect(second[0].toolName).toBe("countRecords");
    expect(JSON.parse(second[0].input)).toMatchObject({ code: "P07", groupBy: "month" });
  });
});

describe("count card coverage (C2, I2)", () => {
  it("says which date the count is by, what the data covers, and which file", () => {
    expect(countCoverage({ dateColumn: "EXP_DATE", coverage: "Jan 1, 2024 – Oct 9, 2026", resourceName: "2025" })).toBe("Counted by EXP_DATE. The City's data here covers Jan 1, 2024 – Oct 9, 2026, from the City's '2025' file.");
    expect(countCoverage({ dateColumn: "Incident_Date", coverage: "Jan 1, 2024 – Oct 9, 2026", resourceName: null })).toBe("Counted by Incident_Date. The City's data here covers Jan 1, 2024 – Oct 9, 2026.");
    expect(countCoverage({ dateColumn: null, coverage: null, resourceName: "2025" })).toBe("From the City's '2025' file.");
    expect(countCoverage({ dateColumn: null, coverage: null, resourceName: null })).toBeNull();
  });
  it("says a period outside the coverage has nothing to count, with no number", () => {
    const t = outsideCoverage({ name: "NIBRS Crime Data", coverage: "Jan 1, 2024 – Oct 9, 2026" });
    expect(t).toBe("NIBRS Crime Data: the City's data here covers Jan 1, 2024 – Oct 9, 2026, so there is nothing to count for that period.");
  });
});
