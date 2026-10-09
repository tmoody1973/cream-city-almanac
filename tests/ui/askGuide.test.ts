import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../convex/settings";
import { limitLine, loadSample, SAMPLE_ARGS } from "../../ui/lib/askGuide";

describe("the guide's live sample", () => {
  it("asks for Harambee's under-5 poverty row, newest year", () => {
    expect(SAMPLE_ARGS).toEqual({ neighborhood: "Harambee", topic: "Poverty Status by Age", row: "Under 5 years" });
  });
  it("keeps an ok result", async () => {
    expect(await loadSample(async () => ({ status: "ok", label: "Under 5 years" }))).toEqual({ status: "ok", label: "Under 5 years" });
  });
  it("gives null when the lookup fails or isn't ok, so the page still renders", async () => {
    expect(await loadSample(async () => { throw new Error("offline"); })).toBeNull();
    expect(await loadSample(async () => ({ status: "choose-row" }))).toBeNull();
  });
  it("states the real daily limits: the everyone limit and the newsroom limit", () => {
    const line = limitLine({ askDailyLimit: 30, askNewsroomLimit: 200 });
    expect(line).toContain("30 questions a day");
    expect(line).toContain("200");
    expect(limitLine(DEFAULT_SETTINGS)).toContain(`${DEFAULT_SETTINGS.askDailyLimit} questions a day`);
  });
});
