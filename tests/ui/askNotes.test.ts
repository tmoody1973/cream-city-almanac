import { describe, expect, it } from "vitest";
import { earlierCountIds, earlierSheetIds, lookupIds, sheetView, lastCountId, newestTurnCallIds, noteNumbers, retriedCallIds, noteOrder } from "../../ui/lib/askNotes";

const u = (id: string) => ({ id, role: "user", content: "q" });
const call = (id: string) => ({ id, role: "assistant", content: "", toolCalls: [{ id: `c-${id}` }] });
const tool = (id: string) => ({ id, role: "tool", content: "{}" });
const say = (id: string) => ({ id, role: "assistant", content: "Here it is." });

describe("margin notes order", () => {
  it("puts each turn's note text right under its question, results after", () => {
    const ms = [u("u1"), call("a1"), tool("t1"), say("a2"), u("u2"), call("a3"), tool("t2"), say("a4")];
    expect(noteOrder(ms).map((m) => m.id)).toEqual(["u1", "a2", "a1", "t1", "u2", "a4", "a3", "t2"]);
  });
  it("leaves a turn still waiting for its text in arrival order", () => {
    const ms = [u("u1"), call("a1"), tool("t1")];
    expect(noteOrder(ms).map((m) => m.id)).toEqual(["u1", "a1", "t1"]);
  });
  it("numbers only replies with text, in order", () => {
    const ms = [u("u1"), call("a1"), say("a2"), u("u2"), say("a3")];
    expect(Object.fromEntries(noteNumbers(ms))).toEqual({ a2: 1, a3: 2 });
  });
});

const counts = (id: string, ...callIds: string[]) => ({ id, role: "assistant", content: "", toolCalls: callIds.map((c) => ({ id: c, function: { name: c.startsWith("s") ? "searchCatalog" : "countRecords" } })) });

describe("earlier counts", () => {
  it("folds every count in a question except its last, and starts fresh at the next question", () => {
    const ms = [u("u1"), counts("a1", "s1", "k1"), tool("t1"), counts("a2", "k2", "k3"), tool("t2"), say("a3"), u("u2"), counts("a4", "k4"), tool("t3")];
    expect([...earlierCountIds(ms)].sort()).toEqual(["k1", "k2"]);
  });
  it("folds nothing when a question has one count or none", () => {
    expect(earlierCountIds([u("u1"), counts("a1", "s1"), u("u2"), counts("a2", "k1")]).size).toBe(0);
  });
});

describe("newest count", () => {
  it("is the last count call in the whole conversation", () => {
    const ms = [u("u1"), counts("a1", "k1"), u("u2"), counts("a2", "s1", "k2", "k3")];
    expect(lastCountId(ms)).toBe("k3");
    expect(lastCountId([u("u1")])).toBeNull();
  });
});

describe("repeated sheet cards", () => {
  const opens = (id: string, ...calls: [string, string, string][]) => ({
    id,
    role: "assistant",
    content: "",
    toolCalls: calls.map(([cid, name, code]) => ({ id: cid, function: { name, arguments: JSON.stringify({ code }) } })),
  });
  it("keeps one card per dataset in a question, the last call, case-insensitively", () => {
    const ms = [u("u1"), opens("a1", ["s1", "showDataset", "F02"], ["p1", "previewData", "f02"], ["s2", "showDataset", "N03"])];
    expect([...earlierSheetIds(ms)]).toEqual(["s1"]);
  });
  it("starts fresh at the next question", () => {
    const ms = [u("u1"), opens("a1", ["s1", "showDataset", "F02"]), u("u2"), opens("a2", ["s2", "showDataset", "F02"])];
    expect(earlierSheetIds(ms).size).toBe(0);
  });
  it("ignores other tools and unreadable arguments", () => {
    const ms = [u("u1"), { id: "a1", role: "assistant", content: "", toolCalls: [{ id: "c1", function: { name: "countRecords", arguments: '{"code":"P08"}' } }, { id: "s1", function: { name: "showDataset", arguments: "{" } }] }];
    expect(earlierSheetIds(ms).size).toBe(0);
  });
});

describe("newestTurnCallIds", () => {
  const call = (id: string, name = "rankTracts") => ({ id, function: { name } });
  it("returns the tool calls after the last question, never an earlier answer's", () => {
    const messages = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant", toolCalls: [call("c1"), call("c2", "countRecords")] },
      { id: "u2", role: "user" },
      { id: "a2", role: "assistant", toolCalls: [call("c3")] },
      { id: "a3", role: "assistant", toolCalls: [call("c4", "showDataset")] },
    ];
    expect([...newestTurnCallIds(messages)]).toEqual(["c3", "c4"]);
  });
  it("is empty before any tool call and right after a new question", () => {
    expect(newestTurnCallIds([]).size).toBe(0);
    expect(newestTurnCallIds([{ id: "u1", role: "user" }, { id: "a1", role: "assistant", toolCalls: [call("c1")] }, { id: "u2", role: "user" }]).size).toBe(0);
  });
});

describe("retriedCallIds", () => {
  const call = (id: string, name: string) => ({ id, function: { name } });
  it("marks a call the model repeated later in the same answer (it fixed its own refusal), never across questions", () => {
    const messages = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant", toolCalls: [call("c1", "rankTracts")] },
      { id: "a2", role: "assistant", toolCalls: [call("c2", "rankTracts"), call("c3", "showDataset")] },
      { id: "u2", role: "user" },
      { id: "a3", role: "assistant", toolCalls: [call("c4", "rankTracts")] },
    ];
    expect([...retriedCallIds(messages)]).toEqual(["c1"]);
  });
});

describe("lookups fold when an answer reaches an analysis card (plain replies §3)", () => {
  const calls = (id: string, ...named: [string, string][]) => ({ id, role: "assistant", content: "", toolCalls: named.map(([cid, name]) => ({ id: cid, function: { name } })) });
  const result = (callId: string, status: string) => ({ id: `t-${callId}`, role: "tool", toolCallId: callId, content: JSON.stringify({ status }) });
  it("folds the answer's searches and sheets once it has an analysis call", () => {
    const m = [u("1"), calls("a", ["s1", "searchCatalog"], ["d1", "showDataset"]), calls("b", ["r1", "relateTracts"]), result("r1", "ok")];
    expect([...lookupIds(m as never)].sort()).toEqual(["d1", "s1"]);
  });
  it("leaves a search-only answer alone (review focus 1)", () => {
    expect(lookupIds([u("1"), calls("a", ["s1", "searchCatalog"])] as never).size).toBe(0);
  });
  it("never folds a preview", () => {
    expect([...lookupIds([u("1"), calls("a", ["p1", "previewData"], ["c1", "countRecords"]), result("c1", "ok")] as never)]).toEqual([]);
  });
  it("folds only when the analysis answered: a refusal, a failure or a call still running keeps the search (review I4)", () => {
    const base = [u("1"), calls("a", ["s1", "searchCatalog"], ["c1", "countRecords"])];
    expect(lookupIds([...base, result("c1", "no-locations")] as never).size).toBe(0);
    expect(lookupIds([...base, result("c1", "not-found")] as never).size).toBe(0);
    expect(lookupIds(base as never).size).toBe(0);
    expect([...lookupIds([...base, result("c1", "ok")] as never)]).toEqual(["s1"]);
  });
  it("shows a sheet once: a repeat hides, a folded one is a line, otherwise the card (review I1)", () => {
    expect(sheetView("d1", new Set(["d1"]), new Set(["d1"]))).toBe("hidden");
    expect(sheetView("d1", new Set(), new Set(["d1"]))).toBe("line");
    expect(sheetView("d1", new Set(), new Set())).toBe("card");
    expect(sheetView(undefined, new Set(), new Set())).toBe("card");
  });
  it("judges each answer on its own (review focus 2)", () => {
    const m = [u("1"), calls("a", ["s1", "searchCatalog"]), u("2"), calls("b", ["s2", "searchCatalog"], ["c2", "countRecords"]), result("c2", "measured")];
    expect([...lookupIds(m as never)]).toEqual(["s2"]);
  });
});
