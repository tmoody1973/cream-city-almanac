import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

// Public search spends one embedding call per non-blank query. About 10 a minute sustained, bursts to 100.
export const SEARCH_EMBEDS = { kind: "token bucket" as const, rate: 600, period: HOUR, capacity: 100 };

// Report reads from Ask spend one embedding each; 20 at once, refilling 60 an hour, per account.
export const ASK_EMBEDS = { kind: "token bucket" as const, rate: 60, period: HOUR, capacity: 20 };

export const rateLimiter = new RateLimiter(components.rateLimiter, { searchEmbeds: SEARCH_EMBEDS, askEmbeds: ASK_EMBEDS });
