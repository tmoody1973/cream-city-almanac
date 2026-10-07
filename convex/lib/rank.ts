import type { ResultRow, Snippet } from "./types";

export const MAX_QUERY_CHARS = 300;
// Convex full-text limits: 16 terms per query, 32-character terms, tokenized on whitespace and punctuation.
export const MAX_SEARCH_TERMS = 16;
export const MAX_TERM_CHARS = 32;

export interface Hit {
  familyKey: string;
  snippet?: Snippet;
}

export interface Ranked {
  familyKey: string;
  score: number;
  snippet: Snippet | null;
}

export function normalizeQuery(q: string): string {
  return q.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
}

export function keywordQuery(q: string): string {
  return q
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TERMS)
    .map((t) => t.slice(0, MAX_TERM_CHARS))
    .join(" ");
}

// Reciprocal rank fusion: robust to lists whose scores aren't comparable.
export function fuseRanks(lists: Hit[][], k = 60): Ranked[] {
  const acc = new Map<string, Ranked>();
  for (const list of lists) {
    const seen = new Set<string>();
    for (const hit of list) {
      if (seen.has(hit.familyKey)) continue;
      seen.add(hit.familyKey);
      const prev = acc.get(hit.familyKey) ?? { familyKey: hit.familyKey, score: 0, snippet: null };
      acc.set(hit.familyKey, {
        familyKey: hit.familyKey,
        score: prev.score + 1 / (k + seen.size),
        snippet: prev.snippet ?? hit.snippet ?? null,
      });
    }
  }
  return [...acc.values()].sort((a, b) => b.score - a.score || a.familyKey.localeCompare(b.familyKey));
}

export function applyFilters(rows: ResultRow[], f: { topic?: string; place?: string; year?: number }): ResultRow[] {
  const place = f.place?.toLowerCase();
  return rows.filter(
    (r) =>
      (!f.topic || r.topic === f.topic) &&
      (!place || r.places.some((p) => p.toLowerCase() === place)) &&
      (f.year === undefined || r.years.includes(f.year)),
  );
}

// Vector search always returns its nearest neighbours, however far. Measured on the live catalog
// (text-embedding-3-small, 2026-10-07): nonsense queries top out at 0.19; real reporter questions start at 0.23.
export const MIN_VECTOR_SCORE = 0.2;

// Fused score of a top-5 place in one list (1 / (60 + 5)). Any place in two lists scores higher, so a result
// survives only with a strong showing in one ranking or support from two; the off-topic tail is neither.
export const MIN_FUSED_SCORE = 1 / 65;

export function relevantRanks(ranked: Ranked[]): Ranked[] {
  return ranked.filter((r) => r.score >= MIN_FUSED_SCORE);
}
