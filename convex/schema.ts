import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vDictionaryField, vGlossaryEntry, vKind, vMember, vMismatch, vProvenance } from "./validators";

export default defineSchema({
  families: defineTable({
    key: v.string(),
    code: v.string(),
    name: v.string(),
    kind: vKind,
    topic: v.string(),
    keywords: v.array(v.string()),
    places: v.array(v.string()),
    years: v.array(v.number()),
    latestModified: v.string(),
    baseSearchText: v.string(),
    searchText: v.string(),
    dictionaryTab: v.union(v.string(), v.null()),
  })
    .index("by_key", ["key"])
    .index("by_code", ["code"])
    .index("by_latestModified", ["latestModified"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["topic", "kind"] }),

  members: defineTable({ familyKey: v.string(), ...vMember.fields })
    .index("by_family", ["familyKey"])
    .index("by_hubId", ["hubId"]),

  cards: defineTable({
    familyKey: v.string(),
    inputHash: v.string(),
    explainer: v.string(),
    explainerProvenance: vProvenance,
    hubSummary: v.string(),
    glossary: v.array(vGlossaryEntry),
    caveats: v.array(v.string()),
    storyAngles: v.array(v.string()),
    basic: v.boolean(),
    embedding: v.array(v.float64()),
  })
    .index("by_family", ["familyKey"])
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1536 }),

  docChunks: defineTable({
    hubId: v.string(),
    modified: v.string(),
    section: v.string(),
    text: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_hubId", ["hubId"])
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1536 }),

  dictionaries: defineTable({
    tab: v.string(),
    dataSource: v.string(),
    fields: v.array(vDictionaryField),
  }).index("by_tab", ["tab"]),

  sources: defineTable({
    name: v.string(),
    url: v.string(),
    summary: v.string(),
    limits: v.string(),
    fetchedAt: v.number(),
  }).index("by_name", ["name"]),

  codes: defineTable({
    code: v.string(),
    letter: v.string(),
    number: v.number(),
    familyKey: v.string(),
    name: v.string(),
    retiredAt: v.union(v.number(), v.null()),
  })
    .index("by_familyKey", ["familyKey"])
    .index("by_letter", ["letter"]),

  builds: defineTable({
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    startedAt: v.number(),
    finishedAt: v.union(v.number(), v.null()),
    pending: v.number(),
    done: v.number(),
    skipped: v.number(),
    failed: v.number(),
    costUsd: v.number(),
    firecrawlCalls: v.number(),
    notes: v.array(v.string()),
    mismatch: v.union(vMismatch, v.null()),
    orphanChunksDeleted: v.number(),
    report: v.union(v.string(), v.null()),
    // familyCount / reportCount: written by early Phase 2 builds only; kept so those rows still validate.
    familyCount: v.optional(v.number()),
    reportCount: v.optional(v.number()),
    hubCounts: v.optional(v.object({ rawData: v.number(), reports: v.number(), visualizations: v.number() })),
  }).index("by_status", ["status"]),

  itemOverrides: defineTable({
    hubId: v.string(),
    measure: v.union(v.string(), v.null()),
    place: v.union(v.string(), v.null()),
    years: v.union(v.array(v.number()), v.null()),
  }).index("by_hubId", ["hubId"]),

  dictionaryOverrides: defineTable({
    familyKey: v.string(),
    tab: v.string(),
  }).index("by_familyKey", ["familyKey"]),

  settings: defineTable({
    buildCapUsd: v.number(),
    maxFirecrawlCallsPerRun: v.number(),
    firecrawlSpacingMs: v.number(),
    sourceRefreshDays: v.number(),
    cardModel: v.string(),
    embedModel: v.string(),
    cardInputUsdPerToken: v.number(),
    cardOutputUsdPerToken: v.number(),
    embedUsdPerToken: v.number(),
  }),
});
