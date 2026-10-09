import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { chicagoDay } from "./lib/ask";
import { datastoreSql } from "./lib/ckan";
import { buildCount, groupLabelFor, MAX_GROUPS } from "./lib/citySql";
import { rateLimiter } from "./limits";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const vFilter = v.object({ column: v.string(), values: v.array(v.string()) });

// Named so the action below can type what it gets back (a function can't infer its own reference's result).
type CountContext = { code: string; name: string; profile: Doc<"cityProfiles"> | null; caveat: string | null } | null;

export const countContext = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<CountContext> => {
    const family = await ctx.db.query("families").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!family || family.source !== "city") return null;
    const profile = await ctx.db.query("cityProfiles").withIndex("by_family", (q) => q.eq("familyKey", family.key)).first();
    const card = await ctx.db.query("cards").withIndex("by_family", (q) => q.eq("familyKey", family.key)).first();
    return { code: family.code, name: family.name, profile, caveat: card?.caveats[0] ?? null };
  },
});

export type CountResult =
  | {
      status: "ok"; code: string; name: string; count: number; groups: { label: string; count: number }[]; other: number; otherLabel: "Earlier" | "Other" | null;
      overlap: boolean; period: string; filters: string[]; futureExcluded: number; caveat: string | null;
      dateColumn: string | null; coverage: string | null; resourceName: string | null;
    }
  | { status: "outside-coverage"; code: string; name: string; coverage: string }
  | { status: "choose"; code: string; name: string; column: string; asked: string; choices: string[] }
  | { status: "bad-column"; code: string; name: string; column: string; columns: string[] }
  | { status: "bad-dates"; code: string; name: string; from: string; to: string }
  | { status: "not-found"; code: string }
  | { status: "not-live"; code: string; name: string }
  | { status: "unavailable"; code: string; name: string }
  | { status: "busy" };

// Date groups arrive as "2026-08" (month) or "2026" (year) text; column groups are named like the profile names them.
const groupName = (label: string | null, g: unknown) => {
  const s = String(g ?? "");
  if (label === "year") return s.slice(0, 4);
  if (label === "month") return `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  return label ? groupLabelFor(label, s) : s;
};

// Counts City records live. Arguments are checked against the dataset's profile (convex/lib/citySql.ts); returns
// counts only, never rows.
export const countRecords = action({
  args: { code: v.string(), from: v.optional(v.string()), to: v.optional(v.string()), filters: v.optional(v.array(vFilter)), groupBy: v.optional(v.string()) },
  handler: async (ctx, { code, ...args }): Promise<CountResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to ask");
    if (!(await rateLimiter.limit(ctx, "askCity", { key: identity.tokenIdentifier })).ok) return { status: "busy" as const };
    const wanted = code.trim().toUpperCase();
    const data: CountContext = await ctx.runQuery(internal.city.countContext, { code: wanted });
    if (!data) return { status: "not-found" as const, code: wanted };
    const { name, profile } = data;
    if (!profile || profile.rowCount === 0) return { status: "not-live" as const, code: data.code, name };
    const built = buildCount(profile, args, chicagoDay(Date.now()));
    if (!built.ok) {
      const { ok: _ok, ...refusal } = built;
      return { ...refusal, code: data.code, name };
    }
    try {
      const [total] = await datastoreSql<{ n: string }>(built.totalSql);
      const rows = built.groupSql ? await datastoreSql<{ g: unknown; n: string }>(built.groupSql) : [];
      const byDate = built.groupLabel === "month" || built.groupLabel === "year";
      // Date groups come newest first (so a cap keeps the recent months); show them oldest to newest.
      const groups = (byDate ? [...rows].reverse() : rows).map((r) => ({ label: groupName(built.groupLabel, r.g), count: Number(r.n) }));
      const [future] = built.futureSql ? await datastoreSql<{ n: string }>(built.futureSql) : [{ n: "0" }];
      const count = Number(total?.n ?? 0);
      const shown = groups.reduce((s, g) => s + g.count, 0);
      // Overlapping groups (an incident with two offenses is in both) can't be summed, so no remainder is shown.
      const capped = rows.length === MAX_GROUPS && !built.overlap;
      return {
        status: "ok" as const, code: data.code, name, count, groups,
        other: capped ? Math.max(0, count - shown) : 0,
        otherLabel: capped ? (byDate ? "Earlier" : "Other") : null, overlap: built.overlap,
        period: built.period, filters: built.filterLabels, futureExcluded: Number(future?.n ?? 0),
        caveat: data.caveat, dateColumn: built.dateColumn, coverage: built.coverage, resourceName: profile.resourceName ?? null,
      };
    } catch (e) {
      console.error(`City count failed for ${data.code}: ${e instanceof Error ? e.message : String(e)}`);
      return { status: "unavailable" as const, code: data.code, name };
    }
  },
});
