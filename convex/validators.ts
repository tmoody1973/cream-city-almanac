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
  datastoreName: v.optional(v.union(v.string(), v.null())),
  files: v.optional(v.array(v.object({ name: v.string(), format: v.string(), url: v.string() }))),
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

export const vBbox = v.object({ minLat: v.number(), maxLat: v.number(), minLon: v.number(), maxLon: v.number() });
export const vBoundaryKind = v.union(v.literal("district"), v.literal("ward"), v.literal("tin"), v.literal("nrsa"), v.literal("nsp"), v.literal("tid"), v.literal("bid"), v.literal("oz"));
export const vPlaceType = v.union(v.literal("tract"), v.literal("city"), v.literal("dycu"), v.literal("district"));
export const vCover = v.object({ kind: vBoundaryKind, name: v.string(), share: v.number(), details: v.optional(v.record(v.string(), v.string())) });

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
    v.object({ column: v.string(), values: v.array(v.object({ value: v.string(), count: v.number() })), multi: v.optional(v.boolean()) }),
  ),
  rowCount: v.number(),
  minDate: v.union(v.string(), v.null()),
  maxDate: v.union(v.string(), v.null()),
  namesPeople: v.boolean(),
  resourceName: v.optional(v.union(v.string(), v.null())),
  archive: v.optional(v.union(v.object({ resourceId: v.string(), before: v.string() }), v.null())),
  years: v.optional(v.union(v.array(v.object({ year: v.number(), resourceId: v.string(), layout: v.union(v.literal("classic"), v.literal("short"), v.literal("long")) })), v.null())),
  latColumn: v.optional(v.union(v.string(), v.null())),
  lonColumn: v.optional(v.union(v.string(), v.null())),
  signature: v.string(),
  updatedAt: v.number(),
});

const vYesNo = v.union(v.literal("yes"), v.literal("no"), v.literal("unknown"));
// One stored stop count (spec 2026-10-13-stop-search-design §4): people per combination, never a person.
export const vStopKind = v.union(v.literal("traffic"), v.literal("field-interview"), v.literal("no-action"));
export const vStopRow = v.object({
  kind: vStopKind,
  race: v.string(), sex: v.string(), frisked: v.union(vYesNo, v.null()), searched: v.union(vYesNo, v.null()), found: v.union(v.string(), v.null()), n: v.number(),
});

// Fire Department history (spec 2026-10-14-fire-history §5).
export const vFireSpan = v.union(v.object({ median: v.number(), p90: v.number(), n: v.number() }), v.null());
export const vFireGroup = v.union(v.literal("all"), v.literal("ems"), v.literal("other"));
export const vFireRow = v.object({
  year: v.number(), group: vFireGroup, calls: v.number(), dispatch: vFireSpan, arrive: vFireSpan, unreadable: v.number(), backwards: v.number(),
  source: v.union(v.literal("incident"), v.literal("mfd")), partial: v.union(v.string(), v.null()), toMinute: v.boolean(),
});
export const vFireType = v.object({ type: v.string(), calls: v.number() });

// Health Compass Milwaukee (spec 2026-10-15-zip-health §3.1).
export const vHealthLayer = v.union(v.literal("zip"), v.literal("county"), v.literal("place"));
export const vHealthTopic = v.object({ key: v.string(), name: v.string(), description: v.string(), units: v.string(), decimals: v.number(), isCount: v.boolean(), keywords: v.string(), team: v.union(v.string(), v.null()), sources: v.array(v.string()) });
export const vHealthFigure = v.object({ topic: v.string(), period: v.string(), value: v.number(), se: v.union(v.number(), v.null()) });

// 311 counts (spec 2026-10-20-311-by-neighborhood): place is "city", a City neighborhood name, a tract GEOID, or for
// "unplaced" the reason (noAddress, noMatch, outside). days is { whole days to close: requests }.
export const vRequests311Kind = v.union(v.literal("city"), v.literal("hood"), v.literal("tract"), v.literal("unplaced"));
export const vRequests311Tally = v.object({
  kind: vRequests311Kind, place: v.string(), year: v.number(), type: v.string(),
  requests: v.number(), closed: v.number(), days: v.record(v.string(), v.number()),
});
export const vRequests311Row = v.object({ runId: v.string(), ...vRequests311Tally.fields });
export const vRequests311File = v.union(v.literal("current"), v.literal("historical"));
export const vRequests311Run = v.object({
  file: vRequests311File, runId: v.string(),
  status: v.union(v.literal("running"), v.literal("live"), v.literal("failed"), v.literal("retired")),
  modified: v.union(v.string(), v.null()), started: v.number(), finished: v.union(v.number(), v.null()), note: v.union(v.string(), v.null()),
  matched: v.number(), noMatch: v.number(), noAddress: v.number(),
});
