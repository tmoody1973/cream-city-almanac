export type HubKind = "dataset" | "document" | "app" | "page";
export type Provenance = "HUB" | "DYCU" | "SOURCE_SITE" | "AI";

export type Source = "city";

export interface HubItem {
  hubId: string;
  kind: HubKind;
  title: string;
  description: string;
  keywords: string[];
  modified: string;
  landingPage: string;
  featureServerUrl: string | null;
  downloads: Record<string, string>;
  source?: Source; // absent: Data You Can Use
  datastoreId?: string | null; // City: the CKAN resource that can be queried live
  datastoreName?: string | null; // City: that resource's name, when the package has several live files
  created?: string;
  groups?: string[];
  organization?: string; // City: the publishing department
}

export interface ParsedTitle {
  measure: string;
  measureKey: string;
  place: string | null;
  years: number[];
  yearLabel: string | null;
}

export interface Member {
  hubId: string;
  kind: HubKind;
  title: string;
  landingPage: string;
  place: string | null;
  years: number[];
  yearLabel: string | null;
  modified: string;
  featureServerUrl: string | null;
  downloads: Record<string, string>;
  description: string;
  keywords: string[];
  source?: Source; // absent: Data You Can Use
  datastoreId?: string | null; // City: the CKAN resource that can be queried live
  datastoreName?: string | null; // City: that resource's name, when the package has several live files
}

export interface Family {
  key: string;
  name: string;
  kind: HubKind;
  topic: string;
  keywords: string[];
  places: string[];
  years: number[];
  latestModified: string;
  baseSearchText: string;
  members: Member[];
  source?: Source;
  live?: boolean;
}

export interface FamilyInput extends Family {
  dictionaryTab: string | null;
}

export interface DictionaryField {
  label: string;
  description: string;
  source: string;
  calculation: string;
}

export interface Dictionary {
  tab: string;
  dataSource: string;
  fields: DictionaryField[];
}

export interface Column {
  name: string;
  alias: string;
  type: string;
}

export interface GlossaryEntry {
  field: string;
  meaning: string;
  provenance: Provenance;
}

export interface Card {
  familyKey: string;
  explainer: string;
  explainerProvenance: Provenance;
  hubSummary: string;
  glossary: GlossaryEntry[];
  caveats: string[];
  storyAngles: string[];
  basic: boolean;
}

export interface Mismatch {
  unlinkedTabs: string[];
  suspectLinks: { title: string; tab: string }[];
  unmatchedHomeTitles: string[];
  typoFixes: string[];
}

export interface Snippet {
  hubId: string;
  title: string;
  section: string;
  text: string;
  // Spreadsheet passages only: which neighborhood table to open.
  focus?: { place: string; year: number | null; topic: string };
}

export interface ResultRow {
  key: string;
  code: string;
  name: string;
  kind: HubKind;
  topic: string;
  places: string[];
  years: number[];
  latestModified: string;
  snippet: Snippet | null;
  source: "city" | null;
  live: boolean;
}

export interface SearchResponse {
  mode: "rundown" | "search";
  degraded: boolean;
  results: ResultRow[];
}
