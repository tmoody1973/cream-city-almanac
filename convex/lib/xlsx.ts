import { strFromU8, unzipSync } from "fflate";
import { decodeEntities } from "./text";

export interface Sheet {
  name: string;
  rows: string[][];
  links: { row: number; target: string }[];
}

const attrs = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], decodeEntities(m[2])]));

const colIndex = (letters: string): number =>
  [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

const textRuns = (xml: string): string =>
  [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeEntities(t[1])).join("");

// ponytail: regex reader for the cell/link subset Google's xlsx export uses; swap for a real parser if we ever read arbitrary workbooks.
export function readWorkbook(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes);
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : "");
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) => textRuns(si[1]));
  const targets = new Map(
    [...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
      const a = attrs(m[0]);
      return [a.Id, a.Target] as const;
    }),
  );
  return [...text("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const a = attrs(m[0]);
    const target = (targets.get(a["r:id"]) ?? "").replace(/^\/?(xl\/)?/, "");
    return parseSheet(a.name, text(`xl/${target}`), shared);
  });
}

function parseSheet(name: string, xml: string, shared: string[]): Sheet {
  const sparse: string[][] = [];
  for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = attrs(c[1]);
    const ref = /^([A-Z]+)(\d+)$/.exec(a.r ?? "");
    if (!ref) continue;
    const body = c[2] ?? "";
    const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    const value =
      a.t === "s" ? (shared[Number(raw)] ?? "") : a.t === "inlineStr" ? textRuns(body) : decodeEntities(raw ?? "");
    const r = Number(ref[2]) - 1;
    sparse[r] ??= [];
    sparse[r][colIndex(ref[1])] = value;
  }
  const rows = Array.from(sparse, (row) => Array.from(row ?? [], (v) => v ?? ""));
  const links = [...xml.matchAll(/<hyperlink\b[^>]*>/g)]
    .map((m) => attrs(m[0]))
    .filter((h) => h.location && /^[A-Z]+\d+/.test(h.ref ?? ""))
    .map((h) => ({
      row: Number(/\d+/.exec(h.ref)![0]),
      target: h.location
        .replace(/!.*$/, "")
        .replace(/^'|'$/g, "")
        .replace(/''/g, "'"),
    }));
  return { name, rows, links };
}
