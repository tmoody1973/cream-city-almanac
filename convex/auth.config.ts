import type { AuthConfig } from "convex/server";

// Clerk issues the tokens. Production signs in on its live instance (creamcityalmanac.app); PR previews read the
// production database but can only use Clerk's development instance (live keys work on our own domain only),
// so every deployment trusts both. Each deployment sets both variables (dev sets the dev address in both).
export default {
  providers: [
    { domain: process.env.CLERK_FRONTEND_API_URL!, applicationID: "convex" },
    { domain: process.env.CLERK_PREVIEW_FRONTEND_API_URL!, applicationID: "convex" },
  ],
} satisfies AuthConfig;
