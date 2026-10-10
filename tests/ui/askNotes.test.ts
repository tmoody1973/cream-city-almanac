import { describe, expect, it } from "vitest";
import { earlierCountIds, lastCountId, noteNumbers, noteOrder } from "../../ui/lib/askNotes";

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
