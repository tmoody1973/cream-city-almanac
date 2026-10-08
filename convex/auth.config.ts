import type { AuthConfig } from "convex/server";

// Clerk issues the tokens; each deployment names its Clerk instance in CLERK_FRONTEND_API_URL.
export default {
  providers: [{ domain: process.env.CLERK_FRONTEND_API_URL!, applicationID: "convex" }],
} satisfies AuthConfig;
