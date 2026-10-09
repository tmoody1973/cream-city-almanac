import { v } from "convex/values";

export const vKind = v.union(
  v.literal("dataset"),
  v.literal("document"),
  v.literal("app"),
  v.literal("page"),
);

export const vProvenance = v.union(
  v.literal("HUB"),
  v.literal("DYCU"),
  v.literal("SOURCE_SITE"),
  v.literal("AI"),
);

export const vMember = v.object({
  hubId: v.string(),
  kind: vKind,
  title: v.string(),
  landingPage: v.string(),
  place: v.union(v.string(), v.null()),
  years: v.array(v.number()),
  yearLabel: v.union(v.string(), v.null()),
  modified: v.string(),
  featureServerUrl: v.union(v.string(), v.null()),
  downloads: v.record(v.string(), v.string()),
  description: v.string(),
  keywords: v.array(v.string()),
  source: v.optional(v.literal("city")),
  datastoreId: v.optional(v.union(v.string(), v.null())),
});

export const vFamilyInput = v.object({
  key: v.string(),
  name: v.string(),
  kind: vKind,
  topic: v.string(),
  keywords: v.array(v.string()),
  places: v.array(v.string()),
  years: v.array(v.number()),
  latestModified: v.string(),
  baseSearchText: v.string(),
  dictionaryTab: v.union(v.string(), v.null()),
  members: v.array(vMember),
  source: v.optional(v.literal("city")),
  live: v.optional(v.boolean()),
});

export const vDictionaryField = v.object({
  label: v.string(),
  description: v.string(),
  source: v.string(),
  calculation: v.string(),
});

export const vDictionary = v.object({
  tab: v.string(),
  dataSource: v.string(),
  fields: v.array(vDictionaryField),
});

export const vGlossaryEntry = v.object({
  field: v.string(),
  meaning: v.string(),
  provenance: vProvenance,
});

export const vCard = v.object({
  familyKey: v.string(),
  explainer: v.string(),
  explainerProvenance: vProvenance,
  hubSummary: v.string(),
  glossary: v.array(vGlossaryEntry),
  caveats: v.array(v.string()),
  storyAngles: v.array(v.string()),
  basic: v.boolean(),
});

export const vMismatch = v.object({
  unlinkedTabs: v.array(v.string()),
  suspectLinks: v.array(v.object({ title: v.string(), tab: v.string() })),
  unmatchedHomeTitles: v.array(v.string()),
  typoFixes: v.array(v.string()),
});

export const vOutcome = v.union(v.literal("done"), v.literal("skipped"), v.literal("failed"));

export const vPortraitTable = v.object({
  slug: v.string(),
  topic: v.string(),
  tab: v.string(),
  order: v.number(),
  tableIds: v.array(v.string()),
  tableIdText: v.string(),
  vintage: v.union(v.string(), v.null()),
  groups: v.array(v.string()),
  rows: v.array(
    v.object({
      label: v.string(),
      heading: v.boolean(),
      values: v.array(v.union(v.null(), v.object({ estimate: v.string(), moe: v.union(v.string(), v.null()) }))),
    }),
  ),
  issues: v.array(v.string()),
});

// A live City dataset's counting menu (see lib/cityProfile.ts).
export const vCityProfile = v.object({
  familyKey: v.string(),
  resourceId: v.string(),
  columns: v.array(v.object({ name: v.string(), type: v.string() })),
  dateColumn: v.union(v.string(), v.null()),
  districtColumns: v.array(v.string()),
  categories: v.array(
    v.object({ column: v.string(), values: v.array(v.object({ value: v.string(), count: v.number() })) }),
  ),
  rowCount: v.number(),
  minDate: v.union(v.string(), v.null()),
  maxDate: v.union(v.string(), v.null()),
  namesPeople: v.boolean(),
  signature: v.string(),
  updatedAt: v.number(),
});
