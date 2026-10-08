/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { chicagoDay, costUsd, dailyLimit } from "./lib/ask";
import { DEFAULT_SETTINGS } from "./settings";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const reader = { email: "pat@example.com", emailVerified: true };
const reporter = { email: "lee@radiomilwaukee.org", emailVerified: true };

beforeEach(() => vi.stubEnv("ASK_METER_SECRET", "meter-test"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("ask helpers", () => {
  it("counts by the America/Chicago day", () => {
    // 2026-10-09 04:59 UTC is 23:59 on Oct 8 in Chicago (CDT, UTC-5); 05:01 UTC is 00:01 on Oct 9.
    expect(chicagoDay(Date.UTC(2026, 9, 9, 4, 59))).toBe("2026-10-08");
    expect(chicagoDay(Date.UTC(2026, 9, 9, 5, 1))).toBe("2026-10-09");
  });
  it("gives verified newsroom emails the newsroom limit", () => {
    expect(dailyLimit(reader, DEFAULT_SETTINGS)).toBe(30);
    expect(dailyLimit(reporter, DEFAULT_SETTINGS)).toBe(200);
    expect(dailyLimit({ ...reporter, emailVerified: false }, DEFAULT_SETTINGS)).toBe(30);
    expect(dailyLimit({ email: "x@RadioMilwaukee.org", emailVerified: true }, DEFAULT_SETTINGS)).toBe(200);
  });
  it("prices usage from settings", () => {
    expect(costUsd({ inputTokens: 10_000, outputTokens: 500 }, DEFAULT_SETTINGS)).toBeCloseTo(0.025);
  });
});

describe("gatekeeper", () => {
  it("is null when signed out and refuses to begin", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.ask.status, {})).toBeNull();
    expect(await t.mutation(api.ask.begin, {})).toEqual({ ok: false, reason: "signed-out" });
  });
  it("counts questions down to the limit, then refuses", async () => {
    const t = convexTest(schema, modules);
    const me = t.withIdentity(reader);
    for (let i = 0; i < 30; i++) expect(await me.mutation(api.ask.begin, {})).toEqual({ ok: true });
    expect(await me.mutation(api.ask.begin, {})).toEqual({ ok: false, reason: "limit" });
    expect(await me.query(api.ask.status, {})).toMatchObject({ limit: 30, left: 0, paused: false, newsroom: false });
    // Another account is unaffected.
    expect(await t.withIdentity({ ...reader, email: "sam@example.com", subject: "sam" }).mutation(api.ask.begin, {})).toEqual({ ok: true });
  });
  it("pauses everyone once today's spend reaches the cap", async () => {
    const t = convexTest(schema, modules);
    const me = t.withIdentity(reader);
    await me.mutation(api.ask.recordUsage, { secret: "meter-test", inputTokens: 4_000_000, outputTokens: 200_000 }); // $10
    expect(await me.mutation(api.ask.begin, {})).toEqual({ ok: false, reason: "paused" });
    expect(await me.query(api.ask.status, {})).toMatchObject({ paused: true });
  });
  it("refuses usage without the meter secret", async () => {
    const t = convexTest(schema, modules);
    await expect(t.withIdentity(reader).mutation(api.ask.recordUsage, { secret: "guess", inputTokens: 1e6, outputTokens: 1e6 })).rejects.toThrow();
  });
  it("starts a fresh count on the next Chicago day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 9, 4, 59));
    const t = convexTest(schema, modules);
    const me = t.withIdentity(reader);
    for (let i = 0; i < 30; i++) await me.mutation(api.ask.begin, {});
    expect(await me.mutation(api.ask.begin, {})).toEqual({ ok: false, reason: "limit" });
    vi.setSystemTime(Date.UTC(2026, 9, 9, 5, 1));
    expect(await me.mutation(api.ask.begin, {})).toEqual({ ok: true });
  });
});
