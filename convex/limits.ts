import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

// Public search spends one embedding call per non-blank query. About 10 a minute sustained, bursts to 100.
export const SEARCH_EMBEDS = { kind: "token bucket" as const, rate: 600, period: HOUR, capacity: 100 };

// Report reads from Ask spend one embedding each; 20 at once, refilling 60 an hour, per account.
export const ASK_EMBEDS = { kind: "token bucket" as const, rate: 60, period: HOUR, capacity: 20 };

// Live City counts from Ask; each is up to three SQL calls to the City, so same shape as report reads.
export const ASK_CITY = { kind: "token bucket" as const, rate: 60, period: HOUR, capacity: 20 };

// Questions starting at once. The site budget only counts spend already recorded, so parallel questions could
// overshoot it; these bound the overshoot: 5 at once per account (2 a minute after), 20 at once site-wide.
export const ASK_RUNS = { kind: "token bucket" as const, rate: 120, period: HOUR, capacity: 5 };
export const ASK_RUNS_ALL = { kind: "token bucket" as const, rate: 1200, period: HOUR, capacity: 20 };

// Sheet maps are public: identical requests come from a 10-minute cache; this caps live City queries site-wide.
export const MAP_CITY = { kind: "token bucket" as const, rate: 60, period: 60_000, capacity: 20 };

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  searchEmbeds: SEARCH_EMBEDS,
  askEmbeds: ASK_EMBEDS,
  askCity: ASK_CITY,
  askRuns: ASK_RUNS,
  askRunsAll: ASK_RUNS_ALL,
  mapCity: MAP_CITY,
});
