export const LAST_VISIT_KEY = "cca:lastVisit";
export const OPENED_KEY = "cca:opened";
const MAX_OPENED = 200;

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

// Marks are a convenience: when storage is blocked (private mode), the page simply shows no marks.
export function safeStorage(storage?: Storage): Store {
  const target = () => storage ?? globalThis.localStorage;
  return {
    get: (key) => {
      try {
        return target()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        target()?.setItem(key, value);
      } catch {
        // storage blocked: skip the mark, never break the page
      }
    },
  };
}

export function circledCodes(rows: { code: string; latestModified: string }[], lastVisitIso: string | null): Set<string> {
  if (!lastVisitIso) {
    const newest = [...rows].sort((a, b) => b.latestModified.localeCompare(a.latestModified))[0];
    return new Set(newest ? [newest.code] : []);
  }
  return new Set(rows.filter((r) => r.latestModified > lastVisitIso).map((r) => r.code));
}

export function readOpened(raw: string | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : []);
  } catch {
    return new Set();
  }
}

export function withOpened(raw: string | null, code: string): string {
  const codes = [...readOpened(raw)].filter((c) => c !== code);
  return JSON.stringify([...codes, code].slice(-MAX_OPENED));
}
