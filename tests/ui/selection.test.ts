import { describe, expect, it } from "vitest";
import { LAPTOP_QUERY, parseSelection, selectionSearch } from "../../ui/lib/selection";

describe("selection in the address", () => {
  it("reads the query and a normalized code", () => {
    expect(parseSelection("?q=asthma&open=w01")).toEqual({ q: "asthma", open: "W01" });
    expect(parseSelection("")).toEqual({ q: "", open: null });
  });
  it("ignores anything that isn't a dataset code", () => {
    expect(parseSelection("?open=../etc").open).toBeNull();
    expect(parseSelection("?open=W0123").open).toBeNull();
  });
  it("writes the smallest address that restores the view", () => {
    expect(selectionSearch({ q: "kids who can't afford food", open: "F02" })).toBe("?q=kids+who+can%27t+afford+food&open=F02");
    expect(selectionSearch({ q: "  ", open: null })).toBe("");
    expect(parseSelection(selectionSearch({ q: "rent burden", open: "H08" }))).toEqual({ q: "rent burden", open: "H08" });
  });
  it("uses the same laptop breakpoint as the CSS", () => {
    expect(LAPTOP_QUERY).toBe("(min-width: 1100px) and (orientation: landscape)");
  });
});

describe("the Ask column in the address", () => {
  it("reads and writes ask=1 alongside the search and the open item", () => {
    expect(parseSelection("?ask=1&q=rent&open=n03")).toEqual({ q: "rent", open: "N03", ask: true });
    expect(parseSelection("?q=rent").ask).toBeFalsy();
    expect(selectionSearch({ q: "rent", open: "N03", ask: true })).toBe("?ask=1&q=rent&open=N03");
    expect(selectionSearch({ q: "", open: null, ask: false })).toBe("");
  });
});
