import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeBatch } from "./censusBatch";
import { addDays, cleanAddress, daysToClose, medianOf, mergeHist, parseBatchReply, resolveTypes, toBatchCsv, yearOf, yearRange } from "./requests311";

describe("311 helpers", () => {
  it("cleans an address, dropping a unit and keeping Milwaukee as a street", () => {
    expect(cleanAddress("2613 W CAPITOL DR, 3, MILWAUKEE, WI, 53206-1413")).toEqual({ street: "2613 W CAPITOL DR", city: "MILWAUKEE", state: "WI", zip: "53206" });
    expect(cleanAddress("1 N MILWAUKEE ST, MILWAUKEE, WI, 53202-0000")).toEqual({ street: "1 N MILWAUKEE ST", city: "MILWAUKEE", state: "WI", zip: "53202" });
    expect(cleanAddress("3814 W KAUL AV")).toBeNull();
    expect(cleanAddress("W WELLS ST, MILWAUKEE, WI, 53202")).toBeNull();
    expect(cleanAddress(null)).toBeNull();
  });
  it("round-trips a batch: CSV out, Census reply in", () => {
    expect(toBatchCsv([{ key: "a1", street: "200 E WELLS ST", city: "MILWAUKEE", state: "WI", zip: "53202" }])).toBe('"a1","200 E WELLS ST","MILWAUKEE","WI","53202"\n');
    const reply = '"a1","200 E WELLS ST, MILWAUKEE, WI, 53202","Match","Exact","200 E WELLS ST, MILWAUKEE, WI, 53202","-87.909,43.041","1","L","55","079","187000","1000"\n"a2","9 NOWHERE, MILWAUKEE, WI, 53202","No_Match"\n';
    expect(parseBatchReply(reply)).toEqual(new Map([["a1", { lat: 43.041, lon: -87.909, geoid: "55079187000" }], ["a2", null]]));
  });
  it("counts days only for readable, non-negative spans", () => {
    expect(daysToClose("2026-01-01 00:00:00", "2026-01-04 00:00:00")).toEqual({ closed: true, days: 3 });
    expect(daysToClose("2026-01-04 00:00:00", "2026-01-01 00:00:00")).toEqual({ closed: true, days: null });
    expect(daysToClose("2026-01-01 00:00:00", null)).toEqual({ closed: false, days: null });
    expect(daysToClose("2026-01-01 00:00:00", "soon")).toEqual({ closed: false, days: null });
    expect(yearOf("2026-10-19 00:00:00")).toBe(2026);
    expect(yearOf("")).toBeNull();
  });
  it("merges histograms exactly and takes the middle", () => {
    const h = mergeHist(addDays(addDays({}, 0), 2), { "2": 1, "10": 1 });
    expect(h).toEqual({ "0": 1, "2": 2, "10": 1 });
    expect(medianOf(h)).toBe(2);
    expect(medianOf({ "1": 1, "4": 1 })).toBe(2.5);
    expect(medianOf({})).toBeNull();
  });
  it("resolves type words and groups, or offers choices", () => {
    const known = ["Potholes", "Pothole in Alley", "Street Light Out", "Area Dark", "Dead Animal"];
    expect(resolveTypes("potholes", known)).toEqual({ types: ["Potholes", "Pothole in Alley"] });
    expect(resolveTypes("streetlights", known)).toEqual({ types: ["Street Light Out", "Area Dark"] });
    expect(resolveTypes("dead animal", known)).toEqual({ types: ["Dead Animal"] });
    expect(resolveTypes(undefined, known)).toEqual({ types: known });
    expect(resolveTypes("snow", known)).toMatchObject({ choices: expect.any(Array) });
  });
  it("counts the City's older pothole titles in the group (review: Critical 1)", () => {
    const known = ["Pothole", "Pothole Alley Request", "Pothole in Alley", "Potholes", "Dead Animal"];
    expect(resolveTypes("potholes", known)).toEqual({ types: ["Potholes", "Pothole", "Pothole in Alley", "Pothole Alley Request"] });
  });
  it("defaults years to the newest, runs 'from' up to now, and never invents years (review: Important 2, 3)", () => {
    const counted = [2020, 2021, 2025, 2026];
    expect(yearRange({}, counted)).toEqual({ from: 2026, to: 2026, missing: [] });
    expect(yearRange({ from: 2021 }, counted)).toEqual({ from: 2021, to: 2026, missing: [2022, 2023, 2024] });
    expect(yearRange({ to: 2021 }, counted)).toEqual({ from: 2020, to: 2021, missing: [] });
    expect(yearRange({ from: 2015, to: 2020 }, counted)).toEqual({ from: 2020, to: 2020, missing: [] });
    expect(yearRange({ from: 2015, to: 2019 }, counted)).toEqual({ outside: true, first: 2020, last: 2026 });
  });
});

describe("the Census batch call", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("retries once, then succeeds", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const p = geocodeBatch('"a","1 X ST","MILWAUKEE","WI","53202"\n');
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("gives up on a call that hangs, so a chunk can still fail cleanly (review: Important 4)", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Response("ok"); }));
    await geocodeBatch("x\n");
    expect(signal).toBeInstanceOf(AbortSignal);
  });
  it("throws after two failures", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 500 })));
    const p = geocodeBatch("x\n");
    const caught = p.catch((e: Error) => e);
    await vi.runAllTimersAsync();
    expect(String(await caught)).toMatch(/Census geocoder failed: 500/);
  });
});
