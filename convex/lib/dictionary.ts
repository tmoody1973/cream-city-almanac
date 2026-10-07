import { parseTitle } from "./titles";
import type { Dictionary } from "./types";
import { readWorkbook } from "./xlsx";

export const INVENTORY_XLSX_URL =
  "https://docs.google.com/spreadsheets/d/1HoxLU8dRQmQegM3RMk1GFaJIenKBJCtkvaCi4_Jbosc/export?format=xlsx";

export interface HomeLink {
  title: string;
  tab: string;
}

export interface Inventory {
  dictionaries: Dictionary[];
  links: HomeLink[];
  tabs: string[];
}

const cell = (row: string[] | undefined, i: number) => (row?.[i] ?? "").trim();

export function parseDictionaryTab(tab: string, rows: string[][]): Dictionary | null {
  const header = rows.findIndex((r) => cell(r, 0).toLowerCase() === "label");
  if (header < 0) return null;
  const sourceRow = rows.find((r) => /^data source:/i.test(cell(r, 0)));
  const fields = rows
    .slice(header + 1)
    .filter((r) => cell(r, 0))
    .map((r) => ({ label: cell(r, 0), description: cell(r, 1), source: cell(r, 2), calculation: cell(r, 3) }));
  return { tab, dataSource: sourceRow ? cell(sourceRow, 0).replace(/^data source:\s*/i, "") : "", fields };
}

export function readInventory(bytes: Uint8Array): Inventory {
  const sheets = readWorkbook(bytes);
  const home = sheets.find((s) => s.name === "Home");
  if (!home) throw new Error("Inventory workbook has no Home tab");
  const links = home.links
    .map((l) => ({ title: cell(home.rows[l.row - 1], 0), tab: l.target }))
    .filter((l) => l.title && l.tab);
  const others = sheets.filter((s) => s.name !== "Home");
  const dictionaries = others
    .map((s) => parseDictionaryTab(s.name, s.rows))
    .filter((d): d is Dictionary => d !== null);
  return { dictionaries, links, tabs: others.map((s) => s.name) };
}

export function homeFamilyKey(title: string): string {
  return `dataset:${parseTitle(title).measureKey}`;
}

export function mapDictionaries(
  families: { key: string }[],
  links: HomeLink[],
  overrides: { familyKey: string; tab: string }[],
): { byFamily: Record<string, string>; unmatchedHomeTitles: string[] } {
  const keys = new Set(families.map((f) => f.key));
  const byFamily: Record<string, string> = {};
  const unmatchedHomeTitles: string[] = [];
  for (const o of overrides) if (keys.has(o.familyKey)) byFamily[o.familyKey] = o.tab;
  for (const link of links) {
    const key = homeFamilyKey(link.title);
    if (!keys.has(key)) unmatchedHomeTitles.push(link.title);
    else byFamily[key] ??= link.tab;
  }
  return { byFamily, unmatchedHomeTitles };
}

export function unlinkedTabs(tabs: string[], links: HomeLink[]): string[] {
  const linked = new Set(links.map((l) => l.tab));
  return tabs.filter((t) => !linked.has(t)).sort();
}

const STOP = new Set(["and", "the", "with", "who", "have", "for"]);

// ponytail: token heuristic; flags renamed tabs for a human to check, with some false positives (e.g. "Dentist Visits").
export function isSuspectLink(link: HomeLink): boolean {
  const core = link.tab
    .replace(/^Milwaukee County\s*/i, "")
    .replace(/^Milwaukee\s*/i, "")
    .toLowerCase();
  const tabTokens = core.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
  const measureTokens = parseTitle(link.title).measure.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tabTokens.some((t) => !measureTokens.some((m) => m.startsWith(t) || t.startsWith(m)));
}
