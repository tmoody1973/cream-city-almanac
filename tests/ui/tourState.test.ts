import { describe, expect, it } from "vitest";
import { clearDone, endAskStage, markDone, nextAskStage, pickTarget, replayKeys, shouldRun, tooltipFooter, type KeyStore } from "../../ui/lib/tourState";
import { ASK_CARD_STEPS, ASK_STEPS, FRONT_STEPS } from "../../ui/lib/tourSteps";

const store = (init: Record<string, string> = {}): KeyStore & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
};
const broken: KeyStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };

describe("tour state", () => {
  it("runs a tour once: not done → run; done → not", () => {
    const s = store();
    expect(shouldRun("front", s, false)).toBe(true);
    markDone("front", s);
    expect(s.data["almanac:tour:front"]).toBe("done");
    expect(shouldRun("front", s, false)).toBe(false);
  });
  it("never runs, and never throws, when storage is missing or blocked, unless forced (review focus 4)", () => {
    expect(shouldRun("front", null, false)).toBe(false);
    expect(shouldRun("front", broken, false)).toBe(false);
    expect(() => markDone("front", broken)).not.toThrow();
    expect(() => clearDone("front", broken)).not.toThrow();
    expect(shouldRun("front", broken, true)).toBe(true);
  });
  it("replays a page's tours by clearing their keys", () => {
    expect(replayKeys("front")).toEqual(["front"]);
    expect(replayKeys("ask")).toEqual(["ask", "ask-card"]);
    const s = store({ "almanac:tour:ask": "done" });
    clearDone("ask", s);
    expect(shouldRun("ask", s, false)).toBe(true);
  });
  it("runs Ask's card stage only after stage 1, and only once (review focus 5)", () => {
    expect(nextAskStage(store(), false)).toBe("ask");
    expect(nextAskStage(store({ "almanac:tour:ask": "done" }), false)).toBe("ask-card");
    expect(nextAskStage(store({ "almanac:tour:ask": "done", "almanac:tour:ask-card": "done" }), false)).toBeNull();
    expect(nextAskStage(store({ "almanac:tour:ask": "done", "almanac:tour:ask-card": "done" }), true)).toBe("ask");
    expect(nextAskStage(null, false)).toBeNull();
  });
  it("skipping Ask's first stage skips the card stage too; finishing it leads on to the card stage (review I3)", () => {
    const skipped = store({ "almanac:tour:ask": "done" });
    expect(endAskStage(true, skipped)).toBeNull();
    expect(skipped.data["almanac:tour:ask-card"]).toBe("done");
    expect(endAskStage(false, store({ "almanac:tour:ask": "done" }))).toBe("ask-card");
  });
  it("words the tooltip footer: counter, back from step 2, done on the last", () => {
    expect(tooltipFooter(0, 5)).toEqual({ counter: "1 OF 5", back: false, primary: "NEXT" });
    expect(tooltipFooter(4, 5)).toEqual({ counter: "5 OF 5", back: true, primary: "DONE" });
  });
  it("points a step at its first visible target, or drops it (review focus 3)", () => {
    expect(pickTarget(["a", "b"], (s) => s === "b")).toBe("b");
    expect(pickTarget(["a"], () => false)).toBeNull();
  });
});

describe("tour steps", () => {
  it("has 5 front steps, 2 Ask steps and 4 card steps, with capital titles and no figures in the text", () => {
    expect([FRONT_STEPS.length, ASK_STEPS.length, ASK_CARD_STEPS.length]).toEqual([5, 2, 4]);
    for (const s of [...FRONT_STEPS, ...ASK_STEPS, ...ASK_CARD_STEPS]) {
      expect(s.targets.length).toBeGreaterThan(0);
      expect(s.title).toBe(s.title.toUpperCase());
      expect(s.content).not.toMatch(/\d/);
    }
    expect(FRONT_STEPS[0]).toMatchObject({ targets: ['[data-tour="search"]'], title: "START WITH A WORD" });
    expect(ASK_STEPS[0].targets).toEqual(['section[aria-label="Ask"] textarea', '[data-tour="ask-signin"]']);
    expect(ASK_CARD_STEPS.map((s) => s.targets[0])).toEqual(['[data-tour-card="tag"]', '[data-tour-card="export"]', '[data-tour-card="share"]', '[data-tour-card="next"]']);
  });
});
