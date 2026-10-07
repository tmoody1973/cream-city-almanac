import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

// Public search spends one embedding call per non-blank query. About 10 a minute sustained, bursts to 100.
export const SEARCH_EMBEDS = { kind: "token bucket" as const, rate: 600, period: HOUR, capacity: 100 };

export const rateLimiter = new RateLimiter(components.rateLimiter, { searchEmbeds: SEARCH_EMBEDS });
