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
