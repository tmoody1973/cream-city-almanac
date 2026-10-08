import { TOPICS } from "./portrait";

// Ask's day, limits and prices. Days are Milwaukee's (America/Chicago), so limits reset at local midnight.
export function chicagoDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function dailyLimit(
  identity: { email?: string; emailVerified?: boolean },
  s: { askDailyLimit: number; askNewsroomLimit: number; askNewsroomDomains: string[] },
): number {
  const domain = identity.email?.split("@")[1]?.toLowerCase();
  return identity.emailVerified === true && domain && s.askNewsroomDomains.includes(domain) ? s.askNewsroomLimit : s.askDailyLimit;
}

export function costUsd(u: { inputTokens: number; outputTokens: number }, s: { askInputUsdPerToken: number; askOutputUsdPerToken: number }): number {
  return u.inputTokens * s.askInputUsdPerToken + u.outputTokens * s.askOutputUsdPerToken;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");

export function matchTopic(name: string): (typeof TOPICS)[number] | null {
  const n = norm(name);
  return TOPICS.find((t) => [t.topic, t.slug, ...(t.aliases ?? [])].some((x) => norm(x) === n)) ?? null;
}

// An exact label wins; otherwise one partial match; several partial matches are returned for the model to choose from.
export function pickRow<R extends { label: string }>(rows: R[], wanted: string): { row: R } | { choose: string[] } {
  const w = norm(wanted);
  const exact = rows.find((r) => norm(r.label) === w);
  if (exact) return { row: exact };
  const partial = rows.filter((r) => norm(r.label).includes(w));
  if (partial.length === 1) return { row: partial[0] };
  return { choose: (partial.length ? partial : rows).map((r) => r.label) };
}
