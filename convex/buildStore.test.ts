/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { internal } from "./_generated/api";
import { toFamilyInput } from "./lib/families";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const inputs = () => fixtureFamilies().map((f) => toFamilyInput(f, null));

async function swap(t: TestConvex<typeof schema>, families = inputs(), dictionaries: { tab: string; dataSource: string; fields: never[] }[] = []) {
  const buildId = await t.run((ctx) =>
    ctx.db.insert("builds", {
      status: "running", startedAt: Date.now(), finishedAt: null, pending: 0, done: 0, skipped: 0, failed: 0,
      costUsd: 0, firecrawlCalls: 0, notes: [], mismatch: null, orphanChunksDeleted: 0, report: null,
    }),
  );
  return t.mutation(internal.buildStore.swapCatalog, { buildId, families, dictionaries });
}

describe("beginBuild", () => {
  it("refuses a second build while one is running", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.buildStore.beginBuild, {});
    await expect(t.mutation(internal.buildStore.beginBuild, {})).rejects.toThrow(/already running/);
  });

  it("marks a build older than two hours as failed and starts a new one", async () => {
    const t = convexTest(schema, modules);
    const stale = await t.run((ctx) =>
      ctx.db.insert("builds", {
        status: "running", startedAt: Date.now() - 3 * 3600_000, finishedAt: null, pending: 0, done: 0, skipped: 0,
        failed: 0, costUsd: 0, firecrawlCalls: 0, notes: [], mismatch: null, orphanChunksDeleted: 0, report: null,
      }),
    );
    await t.mutation(internal.buildStore.beginBuild, {});
    const old = await t.run((ctx) => ctx.db.get(stale));
    expect(old!.status).toBe("failed");
  });
});

describe("swapCatalog", () => {
  it("writes 46 families, 379 members and unique permanent codes", async () => {
    const t = convexTest(schema, modules);
    expect(await swap(t)).toEqual({ ok: true });
    const families = await t.run((ctx) => ctx.db.query("families").collect());
    const members = await t.run((ctx) => ctx.db.query("members").collect());
    expect(families).toHaveLength(46);
    expect(members).toHaveLength(379);
    const codes = families.map((f) => f.code);
    expect(new Set(codes).size).toBe(46);
    expect(codes.every((c) => /^[A-Z]\d{2,}$/.test(c))).toBe(true);
    expect(families.find((f) => f.key === "document:neighborhood-portrait")!.code).toMatch(/^N/);
  });

  it("refuses to shrink the catalog by more than 10%", async () => {
    const t = convexTest(schema, modules);
    await swap(t);
    const result = await swap(t, inputs().slice(0, 30));
    expect(result.ok).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("families").collect())).toHaveLength(46);
  });

  it("refuses a feed that keeps every family but drops many items", async () => {
    const t = convexTest(schema, modules);
    await swap(t);
    const trimmed = inputs().map((f) =>
      f.key === "document:neighborhood-portrait"
        ? { ...f, members: f.members.slice(0, 20) }
        : f.key === "document:neighborhood-change-over-time-report"
          ? { ...f, members: f.members.slice(0, 10) }
          : f,
    );
    const result = await swap(t, trimmed);
    expect(result.ok).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("members").collect())).toHaveLength(379);
  });

  it("keeps a retired family's name with its code", async () => {
    const t = convexTest(schema, modules);
    await swap(t);
    await swap(t, inputs().filter((f) => f.key !== "dataset:access-to-parks"));
    const code = (await t.run((ctx) => ctx.db.query("codes").collect())).find((c) => c.familyKey === "dataset:access-to-parks")!;
    expect(code.retiredAt).not.toBeNull();
    expect(code.name).toBe("Access to Parks");
  });

  it("retires removed families and never reissues their code", async () => {
    const t = convexTest(schema, modules);
    await swap(t);
    const parks = (await t.run((ctx) => ctx.db.query("families").collect())).find((f) => f.key === "dataset:access-to-parks")!;
    const withoutParks = inputs().filter((f) => f.key !== "dataset:access-to-parks");
    expect(await swap(t, withoutParks)).toEqual({ ok: true });
    const retired = await t.run((ctx) => ctx.db.query("codes").collect());
    expect(retired.find((c) => c.code === parks.code)!.retiredAt).not.toBeNull();

    const parksInput = inputs().find((f) => f.key === "dataset:access-to-parks")!;
    const newcomer = { ...parksInput, key: "dataset:brand-new-measure", name: "Brand New Measure" };
    await swap(t, [...withoutParks, newcomer]);
    const newcomerCode = (await t.run((ctx) => ctx.db.query("families").collect())).find((f) => f.key === newcomer.key)!.code;
    expect(newcomerCode).not.toBe(parks.code);
    expect(newcomerCode[0]).toBe(parks.code[0]);

    await swap(t, [...withoutParks, newcomer, parksInput]);
    const back = (await t.run((ctx) => ctx.db.query("families").collect())).find((f) => f.key === "dataset:access-to-parks")!;
    expect(back.code).toBe(parks.code);
  });

  it("replaces the dictionaries table", async () => {
    const t = convexTest(schema, modules);
    await swap(t, inputs(), [{ tab: "A", dataSource: "x", fields: [] }]);
    await swap(t, inputs(), [{ tab: "B", dataSource: "y", fields: [] }]);
    const tabs = (await t.run((ctx) => ctx.db.query("dictionaries").collect())).map((d) => d.tab);
    expect(tabs).toEqual(["B"]);
  });
});

describe("failBuild and latestReport", () => {
  it("does not mark a completed build as failed", async () => {
    const t = convexTest(schema, modules);
    const buildId = await t.mutation(internal.buildStore.beginBuild, {});
    await t.mutation(internal.buildStore.completeBuild, { buildId, orphanChunksDeleted: 0 });
    await t.mutation(internal.buildStore.failBuild, { buildId, reason: "watchdog" });
    expect((await t.run((ctx) => ctx.db.get(buildId)))!.status).toBe("completed");
  });

  it("records the reason and renders a report", async () => {
    const t = convexTest(schema, modules);
    const buildId = await t.mutation(internal.buildStore.beginBuild, {});
    await t.mutation(internal.buildStore.failBuild, { buildId, reason: "Hub feed request failed: 500" });
    expect(await t.query(internal.buildStore.latestReport, {})).toContain("Hub feed request failed: 500");
  });
});
