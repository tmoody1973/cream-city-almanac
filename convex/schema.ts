import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vBbox, vBoundaryKind, vCityProfile, vCover, vPlaceType, vDictionaryField, vGlossaryEntry, vKind, vMember, vMismatch, vProvenance, vPortraitTable, vStopKind, vStopRow } from "./validators";

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
    source: v.optional(v.literal("city")),
    live: v.optional(v.boolean()),
  })
    .index("by_key", ["key"])
    .index("by_code", ["code"])
    .index("by_latestModified", ["latestModified"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["topic", "kind"] }),

  portraitTables: defineTable({ hubId: v.string(), modified: v.string(), ...vPortraitTable.fields }).index("by_hubId", ["hubId"]),

  members: defineTable({ familyKey: v.string(), ...vMember.fields })
    .index("by_family", ["familyKey"])
    .index("by_hubId", ["hubId"]),

  cityProfiles: defineTable(vCityProfile.fields).index("by_family", ["familyKey"]),

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
    pdfReports: v.optional(v.number()),
  }).index("by_status", ["status"]),

  // Neighborhoods by definition: the City's official boundaries (shape + rectangle), DYCU's tract lists.
  neighborhoods: defineTable({
    definition: v.union(v.literal("city"), v.literal("dycu")),
    name: v.string(),
    matchKey: v.string(),
    geometry: v.optional(v.string()),
    bbox: v.optional(vBbox),
    tracts: v.optional(v.array(v.object({ years: v.array(v.number()), tracts: v.array(v.string()) }))),
  }).index("by_definition_matchKey", ["definition", "matchKey"]),

  // Each census tract's City neighborhoods (≥10% of its area, biggest first), matched weekly from the City's shapes
  // and DYCU's tract outlines (convex/lib/tractPlaces.ts). Tracts outside the City aren't stored.
  // The City of Milwaukee's ACS figures for the fact sheet, by portrait period (vintage), raw by variable code.
  stopCounts: defineTable({ period: v.string(), year: v.number(), ...vStopRow.fields }).index("by_period", ["period"]),
  stopPeriods: defineTable({ period: v.string(), familyKey: v.string(), modified: v.string(), status: v.union(v.literal("counted"), v.literal("failed")), note: v.optional(v.string()), missing: v.optional(v.array(vStopKind)) }).index("by_period", ["period"]),
  cityFigures: defineTable({
    period: v.number(),
    values: v.record(v.string(), v.object({ estimate: v.number(), moe: v.union(v.number(), v.null()) })),
    fetchedAt: v.number(),
  }).index("by_period", ["period"]),

  tractNeighborhoods: defineTable({
    geoid: v.string(),
    city: v.array(v.object({ name: v.string(), share: v.number() })),
  }).index("by_geoid", ["geoid"]),

  // The City's boundary files (districts, wards, investment and development areas), replaced weekly per kind
  // (docs/superpowers/specs/2026-10-12-boundaries-design.md §4).
  boundaries: defineTable({
    kind: vBoundaryKind,
    name: v.string(),
    details: v.record(v.string(), v.string()),
    geometry: v.string(),
    bbox: vBbox,
    fetchedAt: v.number(),
  }).index("by_kind", ["kind"]),

  // Each boundary without its outline: an address lookup reads these (≈100 KB) and opens only the shapes whose bbox
  // holds the point, instead of the whole 1.75 MB table. Replaced with its boundary.
  boundaryBoxes: defineTable({
    kind: vBoundaryKind,
    name: v.string(),
    details: v.record(v.string(), v.string()),
    bbox: vBbox,
    fetchedAt: v.number(),
    boundaryId: v.id("boundaries"),
  }).index("by_kind", ["kind"]),

  // For each tract, City neighborhood, DYCU area and district: the boundaries covering it, with their share (percent,
  // ≥1). City and DYCU places are keyed by their stored name, tracts by GEOID, districts by number.
  boundaryOverlaps: defineTable({
    placeType: vPlaceType,
    place: v.string(),
    covers: v.array(vCover),
    builtAt: v.number(),
    asOf: v.optional(v.number()), // the oldest copy of the City's files these shares rest on; rows built before it existed fall back to builtAt
  }).index("by_place", ["placeType", "place"]),

  // Public sheet maps: an answer by its normalized arguments, kept 10 minutes.
  mapCache: defineTable({ key: v.string(), result: v.string(), expiresAt: v.number() })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),

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
    // Ask's settings arrived after the first settings row; readSettings fills missing ones from defaults.
    askModel: v.optional(v.string()),
    askInputUsdPerToken: v.optional(v.number()),
    askOutputUsdPerToken: v.optional(v.number()),
    askDailyCapUsd: v.optional(v.number()),
    askDailyLimit: v.optional(v.number()),
    askNewsroomLimit: v.optional(v.number()),
    askNewsroomDomains: v.optional(v.array(v.string())),
  }),

  // Ask keeps only counts: questions per account per day, and the site's spend per day (America/Chicago).
  askCounts: defineTable({ day: v.string(), user: v.string(), questions: v.number() }).index("by_day_user", ["day", "user"]),
  askSpend: defineTable({ day: v.string(), usd: v.number() }).index("by_day", ["day"]),
});
