import { describe, expect, it } from "vitest";
import { proseSegments } from "../../ui/lib/askProse";

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
  it("keeps the text intact", () => {
    const t = "Between 2021 and 2023 it rose by 4 points.";
    expect(proseSegments(t).map((s) => s.text).join("")).toBe(t);
  });
});
