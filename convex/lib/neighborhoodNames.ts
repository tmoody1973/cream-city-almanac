// How a typed neighborhood name finds its row: one exact match is used; close ones ask which; nothing is never a count.
export function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/\bst\b\.?/g, "saint")
    .replace(/\bneighbou?rhoods?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());

export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export type NameMatch<T> = { kind: "one"; row: T } | { kind: "choose"; names: string[] } | { kind: "none"; nearest: string[] };

export function matchName<T extends { name: string; matchKey: string }>(asked: string, rows: T[]): NameMatch<T> {
  const key = nameKey(asked);
  const nearest = () => [...rows].sort((a, b) => editDistance(a.matchKey, key) - editDistance(b.matchKey, key)).slice(0, 3).map((r) => r.name);
  if (!key) return { kind: "none", nearest: nearest() };
  const exact = rows.find((r) => r.matchKey === key);
  if (exact) return { kind: "one", row: exact };
  const close = rows.filter((r) => r.matchKey.includes(key) || key.includes(r.matchKey) || editDistance(r.matchKey, key) <= 2);
  if (close.length) return { kind: "choose", names: close.slice(0, 5).map((r) => r.name) };
  return { kind: "none", nearest: nearest() };
}
