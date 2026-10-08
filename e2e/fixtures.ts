import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const VERCEL_TOOLBAR_ORIGIN = "https://vercel.live";

// Vercel preview access, scoped by origin. The preview gets the bypass secret and skip-toolbar; Vercel's toolbar
// origin gets skip-toolbar only (without it, the toolbar's login check keeps reloading the page). Nothing goes to
// DYCU's ArcGIS server, whose CORS allows no custom headers, or to Convex.
export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    if (bypass && baseURL) {
      const preview = new URL(baseURL).origin;
      const add = (extra: Record<string, string>) => (route: import("@playwright/test").Route) =>
        route.continue({ headers: { ...route.request().headers(), ...extra } });
      await context.route((url) => url.origin === preview, add({ "x-vercel-protection-bypass": bypass, "x-vercel-skip-toolbar": "1" }));
      await context.route((url) => url.origin === VERCEL_TOOLBAR_ORIGIN, add({ "x-vercel-skip-toolbar": "1" }));
    }
    await use(context);
  },
});
