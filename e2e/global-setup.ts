import { clerkSetup } from "@clerk/testing/playwright";

// Clerk's testing token lets Playwright sign in without bot checks; only when Clerk keys are present.
export default async function globalSetup() {
  if (process.env.CLERK_SECRET_KEY) await clerkSetup();
}
