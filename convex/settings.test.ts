/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_SETTINGS } from "./settings";

const modules = import.meta.glob("./**/*.*s");

describe("settings", () => {
  it("returns defaults when no settings row exists", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(internal.settings.get, {})).toEqual(DEFAULT_SETTINGS);
  });

  it("ensureDefaults inserts exactly one row and keeps later edits", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.settings.ensureDefaults, {});
    await t.run(async (ctx) => {
      const row = await ctx.db.query("settings").first();
      await ctx.db.patch(row!._id, { buildCapUsd: 2 });
    });
    await t.mutation(internal.settings.ensureDefaults, {});
    const rows = await t.run((ctx) => ctx.db.query("settings").collect());
    expect(rows).toHaveLength(1);
    expect((await t.query(internal.settings.get, {})).buildCapUsd).toBe(2);
  });
});
