import { describe, expect, it } from "vitest";
import { circledCodes, readOpened, safeStorage, withOpened } from "../../ui/lib/marks";

const rows = [
  { code: "V02", latestModified: "2026-07-28T00:00:00Z" },
  { code: "S01", latestModified: "2026-07-16T00:00:00Z" },
  { code: "A04", latestModified: "2026-06-25T00:00:00Z" },
];

describe("grease-pencil marks", () => {
  it("circles only the newest row on a first visit", () => {
    expect([...circledCodes(rows, null)]).toEqual(["V02"]);
  });
  it("circles everything updated since the last visit", () => {
    expect([...circledCodes(rows, "2026-07-01T00:00:00Z")].sort()).toEqual(["S01", "V02"]);
    expect([...circledCodes(rows, "2026-08-01T00:00:00Z")]).toEqual([]);
  });
  it("records opened codes, deduplicated, newest last", () => {
    const raw = withOpened(withOpened(null, "F02"), "W01");
    expect([...readOpened(withOpened(raw, "F02"))]).toEqual(["W01", "F02"]);
    expect([...readOpened("not json")]).toEqual([]);
  });
  it("safeStorage never throws when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } } as unknown as Storage;
    const store = safeStorage(blocked);
    expect(store.get("x")).toBeNull();
    expect(() => store.set("x", "1")).not.toThrow();
  });
});
