import { describe, expect, it } from "vitest";
import { askTools, measureSentence, spanDescription, type AskBackend } from "../../lib/ask/tools";
import { ASK_PROMPT } from "../../lib/ask/prompt";

const backend = (relateResult: unknown): AskBackend => ({
  search: async () => ({ results: [] }) as never, sheet: async () => null, number: async () => ({}) as never, report: async () => ({}) as never, count: async () => ({}) as never,
  rank: async () => ({ status: "busy" }) as never, change: async () => ({ status: "busy" }) as never, relate: async () => relateResult as never, span: async () => ({ status: "busy" }) as never,
  factSheet: async () => ({ status: "no-neighborhood", asked: "", nearest: [] }) as never,
  place: async () => ({ status: "no-match" }) as never,
  boundaries: async () => ({ status: "not-loaded" }) as never,
  stops: async () => ({ status: "refused", reason: "" }) as never,
  turnout: async () => ({ status: "refused", reason: "" }) as never,
  zip: async () => ({ status: "busy" }) as never,
  fire: async () => ({ status: "refused", reason: "" }) as never,
});

const row = (i: number) => ({ geoid: `5507910${String(i).padStart(4, "0")}`, tract: String(i), neighborhood: "Harambee", value: 41.2, lo: 35.1, hi: 47.3, unreliable: false });
const call = (b: AskBackend) =>
  askTools(b).find((t) => t.name === "relateTracts")!.execute({ a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "City", year: "2022", mode: "mismatch" } as never);

describe("tract tools", () => {
  it("offers rankTracts, compareYears and relateTracts", () => {
    expect(askTools(backend({})).map((t) => t.name)).toEqual(expect.arrayContaining(["rankTracts", "compareYears", "relateTracts"]));
  });
  it("passes each backend result through unchanged", async () => {
    const answer = { status: "choose-year", dataset: "b", available: { a: [], b: [] } };
    expect(await call(backend(answer))).toBe(answer);
  });
  it("describes aSide and bSide as sides of dataset a and dataset b", () => {
    const shape = (askTools(backend({})).find((t) => t.name === "relateTracts")!.parameters as { shape: Record<string, { description?: string }> }).shape;
    expect(shape.aSide.description).toMatch(/dataset a/);
    expect(shape.bSide.description).toMatch(/dataset b/);
    // Rows name the City's neighborhoods and DYCU's areas; the model must not call DYCU's areas neighborhoods.
    const rank = askTools(backend({})).find((t) => t.name === "rankTracts")!;
    expect(rank.description).toContain("City neighborhoods and DYCU areas");
    expect(rank.description).not.toContain("DYCU neighborhood names");
  });
  it("keeps a 300-tract relate answer under 8 KB in the conversation", async () => {
    const head = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Share of households below the poverty line.", kind: "rate", place: "City", year: "2022", n: 300, leftOut: 4, confidence: "90% confidence (Census)", url: "https://services.arcgis.com/x/FeatureServer/0", caveats: ["Survey estimates pool five years."] };
    const answer = { status: "ok", tool: "relate", mode: "mismatch", a: head, b: { ...head, code: "F02" }, n: 300, rho: 0.71, strength: "strong", direction: "higher", fits: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), close: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), highlighted: [], closeIds: [], key: "tracts:abc" };
    expect(JSON.stringify(await call(backend(answer))).length).toBeLessThan(8_000);
  });
  it("keeps the slim relate return (headers without caveats or url, 10 fits, 10 close, totals) under 8 KB", async () => {
    const { caveats: _c, url: _u, ...head } = { code: "E02", name: "Households Living in Poverty", column: "pov_rate", meaning: "Share of households below the poverty line.", kind: "rate", place: "City", year: "2022", n: 300, leftOut: 4, confidence: "90% confidence (Census)", url: "x", caveats: ["c"] };
    const answer = { status: "ok", tool: "relate", mode: "mismatch", a: head, b: { ...head, code: "F02" }, n: 300, rho: 0.71, strength: "strong", direction: "higher", fits: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), fitsCount: 57, close: Array.from({ length: 10 }, (_, i) => ({ a: row(i), b: row(i) })), closeCount: 31, unreliableCount: 12, key: "tracts:abc", aSide: "high", bSide: "low", cutA: 20.5, cutB: 8.1 };
    expect(JSON.stringify(await call(backend(answer))).length).toBeLessThan(8_000);
  });
});

describe("timeSpan", () => {
  it("is offered, and its description names every approved file and pair id", () => {
    const tool = askTools(backend({})).find((t) => t.name === "timeSpan");
    expect(tool).toBeDefined();
    for (const id of ["complaint-close", "311-close", "permit-issue", "fire-dispatch", "fire-arrive", "fire-clear", "mfd-arrive"]) expect(spanDescription()).toContain(id);
    expect(spanDescription()).toContain("citizen complaints against the Police and Fire Departments");
    // L2 graded run: the model read an age's "backwards" count as "dates that run backwards" and repeated "9 in 10".
    expect(spanDescription()).toContain("For an age entry, all.backwards counts records dated after the as-of date");
    expect(spanDescription()).toContain("Every case an age counts is still open, so ignore its all.open"); // review fix: not "none are open"
    expect(spanDescription()).toContain("age vacant-age: DATEOPENED → as of today");
    expect(ASK_PROMPT).toContain("don't restate its times or counts (not even \"9 in 10\")");
  });
});

describe("City measures", () => {
  it("lets countRecords take a measure, and its description lists every approved measure", () => {
    const tool = askTools(backend({})).find((t) => t.name === "countRecords")!;
    const shape = (tool.parameters as { shape: Record<string, unknown> }).shape;
    expect(shape.measure).toBeDefined();
    for (const id of ["tax-owed", "pp-tax-owed", "gross-pay", "hourly-rate", "sale-price", "assessed-value"]) expect(tool.description).toContain(id);
    expect(measureSentence()).toContain("Never sum");
  });
});

describe("tract questions by neighborhood", () => {
  it("gives all three tract tools a neighborhood and a map, and says what their refusals mean", () => {
    for (const name of ["rankTracts", "compareYears", "relateTracts"]) {
      const tool = askTools(backend({})).find((t) => t.name === name)!;
      const shape = (tool.parameters as { shape: Record<string, unknown> }).shape;
      expect(shape).toHaveProperty("neighborhood");
      expect(shape).toHaveProperty("map");
      expect(tool.description).toContain("neighborhood");
      expect(tool.description).toContain("no-neighborhood");
    }
    expect(askTools(backend({})).find((t) => t.name === "relateTracts")!.description).toContain("too-few-tracts");
  });
  it("keeps one figure for a DYCU neighborhood on getNumber, and sends its tracts to the tract tools", () => {
    expect(ASK_PROMPT).toContain("For a neighborhood's tracts");
    expect(ASK_PROMPT).toContain("one figure for a neighborhood DYCU profiles, use getNumber");
  });
});

describe("DYCU areas with no tracts", () => {
  it("tells the model a DYCU area's no-tracts means its year isn't defined, not that it's small", () => {
    expect(askTools(backend({})).find((t) => t.name === "rankTracts")!.description).toContain("for DYCU's area, that DYCU doesn't define it for that year");
  });
});

describe("fact sheets", () => {
  it("offers a factSheet tool that takes a neighborhood name, and the prompt sends fact-sheet questions to it", () => {
    const tool = askTools(backend({})).find((t) => t.name === "factSheet")!;
    expect(tool).toBeDefined();
    expect((tool.parameters as { shape: Record<string, unknown> }).shape).toHaveProperty("neighborhood");
    expect(ASK_PROMPT).toContain("factSheet");
  });
});

describe("address lookup", () => {
  it("offers a findPlace tool that takes an address, and the prompt sends where-is questions to it", () => {
    const tool = askTools(backend({})).find((t) => t.name === "findPlace")!;
    expect((tool.parameters as { shape: Record<string, unknown> }).shape).toHaveProperty("address");
    expect(tool.description).toContain("U.S. Census Bureau");
    expect(ASK_PROMPT).toContain("findPlace");
  });
});

describe("boundaries", () => {
  it("offers boundariesFor for one place, and the prompt sends boundary questions to it", () => {
    const tool = askTools(backend({})).find((t) => t.name === "boundariesFor")!;
    const shape = (tool.parameters as { shape: Record<string, unknown> }).shape;
    expect(Object.keys(shape)).toEqual(expect.arrayContaining(["neighborhood", "map", "tract", "district", "kinds"]));
    expect(tool.description).toContain("polling place");
    expect(ASK_PROMPT).toContain("boundariesFor");
  });
});

describe("address tool and polling places (review fix)", () => {
  it("says findPlace also gives the ward, polling place and alder, and to confirm polling places at myvote.wi.gov", () => {
    const d = askTools(backend({})).find((t) => t.name === "findPlace")!.description;
    expect(d).toContain("polling place");
    expect(d).toContain("myvote.wi.gov");
  });
});

describe("countStops (K3)", () => {
  it("offers countStops for who MPD stops, with field-interview rates, and no location argument", () => {
    const tool = askTools(backend({})).find((t) => t.name === "countStops")!;
    expect(tool.description).toMatch(/field interview/i);
    expect(Object.keys(tool.parameters.shape).sort()).toEqual(["filters", "from", "groupBy", "kind", "to"]);
  });
});

describe("countTurnout (K4)", () => {
  it("offers countTurnout with no district argument", () => {
    const tool = askTools(backend({})).find((t) => t.name === "countTurnout")!;
    expect(tool.description).toMatch(/turnout/i);
    expect(tool.description).toMatch(/district/i); // says districts aren't available
    expect(Object.keys(tool.parameters.shape).sort()).toEqual(["from", "groupBy", "order", "to", "type", "ward"]);
  });
});

describe("zipProfile (Z1)", () => {
  it("offers zipProfile for ZIP questions and never adding up tracts", async () => {
    let asked: unknown;
    const tool = askTools({ ...backend({}), zip: async (a) => { asked = a; return { status: "busy" } as never; } }).find((t) => t.name === "zipProfile")!;
    expect(tool.description).toMatch(/ZIP/);
    expect(tool.description).toMatch(/never .*add(ing)? up tracts/i);
    await tool.execute({ zip: "53228" } as never);
    expect(asked).toEqual({ zip: "53228" });
  });
});

describe("zipProfile steering (Z1 review)", () => {
  it("tells the model when to lead with the ZIP being mostly outside the City, in the fields it sees", () => {
    const tool = askTools(backend({})).find((t) => t.name === "zipProfile")!;
    expect(tool.description).toMatch(/cityShare is below 0\.5/);
    expect(tool.description).toMatch(/mainPlace/);
    expect(ASK_PROMPT).toMatch(/zipProfile[^\n]*cityShare is below 0\.5/);
  });
});

describe("fireHistory (L3)", () => {
  it("offers fireHistory for Fire Department years, passing the asked measure", async () => {
    let asked: unknown;
    const tool = askTools({ ...backend({}), fire: async (a) => { asked = a; return { status: "refused", reason: "" } as never; } }).find((t) => t.name === "fireHistory")!;
    expect(tool.description).toMatch(/2015/);
    expect(tool.description).toMatch(/types run 2015–2023 only/i);
    await tool.execute({ measure: "arrive", group: "ems" } as never);
    expect(asked).toEqual({ measure: "arrive", group: "ems" });
    expect(ASK_PROMPT).toMatch(/fireHistory/);
  });
});
