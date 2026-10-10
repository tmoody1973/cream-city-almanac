import type { HubKind } from "./types";

// Priority order: specific topics first, so ties go to the more specific one.
export const TOPICS: { name: string; letter: string }[] = [
  { name: "Food Access", letter: "F" },
  { name: "Health", letter: "W" },
  { name: "Education", letter: "S" },
  { name: "Environment", letter: "V" },
  { name: "Housing", letter: "H" },
  { name: "Economic", letter: "E" },
  { name: "Demographics", letter: "D" },
  { name: "Public Safety", letter: "P" },
  { name: "Elections", letter: "B" },
  { name: "City Services", letter: "C" },
  { name: "Maps", letter: "G" },
];

export function topicOf(members: { keywords: string[] }[]): string {
  const counts = new Map<string, number>();
  for (const m of members) {
    const first = m.keywords.find((k) => TOPICS.some((t) => t.name === k));
    if (first) counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  let best = "Other";
  let bestCount = 0;
  for (const t of TOPICS) {
    const c = counts.get(t.name) ?? 0;
    if (c > bestCount) {
      best = t.name;
      bestCount = c;
    }
  }
  return best;
}

export function codeLetter(kind: HubKind, topic: string): string {
  if (kind === "document") return "N";
  if (kind === "app") return "A";
  return TOPICS.find((t) => t.name === topic)?.letter ?? "X";
}

export function nextCode(letter: string, issued: number[]): { code: string; number: number } {
  const number = issued.reduce((max, n) => Math.max(max, n), 0) + 1;
  return { code: `${letter}${String(number).padStart(2, "0")}`, number };
}
