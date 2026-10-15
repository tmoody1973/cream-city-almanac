import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const VERCEL_TOOLBAR_ORIGIN = "https://vercel.live";

// No test meets a first-visit tour unless it asks for one: every context marks the tours done, unless the page's
// storage carries almanac:tour:e2e-keep (set by the tour tests themselves).
const TOURS_OFF = () => {
  try {
    if (localStorage.getItem("almanac:tour:e2e-keep")) return;
    for (const k of ["front", "ask", "ask-card"]) localStorage.setItem(`almanac:tour:${k}`, "done");
  } catch { /* storage blocked: tours don't run then anyway */ }
};

// Vercel preview access, scoped by origin. The preview gets the bypass secret and skip-toolbar; Vercel's toolbar
// origin gets skip-toolbar only (without it, the toolbar's login check keeps reloading the page). Nothing goes to
// DYCU's ArcGIS server, whose CORS allows no custom headers, or to Convex.
// Exported for tests that open a second browser context of their own (a signed-out visitor), which the fixture
// below doesn't reach.
export async function previewAccess(context: import("@playwright/test").BrowserContext, baseURL: string | undefined, opts: { tours?: boolean } = {}) {
  if (!opts.tours) await context.addInitScript(TOURS_OFF);
  if (!bypass || !baseURL) return;
  const preview = new URL(baseURL).origin;
  const add = (extra: Record<string, string>) => (route: import("@playwright/test").Route) =>
    route.continue({ headers: { ...route.request().headers(), ...extra } });
  await context.route((url) => url.origin === preview, add({ "x-vercel-protection-bypass": bypass, "x-vercel-skip-toolbar": "1" }));
  await context.route((url) => url.origin === VERCEL_TOOLBAR_ORIGIN, add({ "x-vercel-skip-toolbar": "1" }));
}

// test.use({ tours: true }) lets a file meet the first-visit tours (e2e/tour.spec.ts).
export const test = base.extend<{ tours: boolean }>({
  tours: [false, { option: true }],
  context: async ({ context, baseURL, tours }, use) => {
    await previewAccess(context, baseURL, { tours });
    await use(context);
  },
});
