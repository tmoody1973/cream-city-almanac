import { describe, expect, it } from "vitest";
import { sampleView } from "../../ui/lib/landingSample";

describe("landing sample answer", () => {
  it("shows the figure and its caption only for an ok count", () => {
    const ok = { status: "ok", count: 1234, name: "NIBRS Crime Data", filters: ["Robbery"], period: "Jan 1, 2026 – Oct 10, 2026", area: "Harambee (City of Milwaukee boundary)" } as never;
    expect(sampleView(ok)).toEqual({ kind: "figure", count: "1,234", caption: "NIBRS Crime Data · Robbery · Jan 1, 2026 – Oct 10, 2026 · In Harambee (City of Milwaukee boundary)" });
  });
  it("leaves out an area the City did not name", () => {
    const ok = { status: "ok", count: 26, name: "X", filters: [], period: "2026", area: null } as never;
    expect(sampleView(ok)).toEqual({ kind: "figure", count: "26", caption: "X · 2026" });
  });
  it("never shows a number when the City is down, busy, refuses, or the code is missing", () => {
    for (const r of [null, { status: "unavailable" }, { status: "busy" }, { status: "bad-input" }, { status: "not-found" }, { status: "too-broad" }] as never[]) expect(sampleView(r)).toEqual({ kind: "link" });
  });
});
