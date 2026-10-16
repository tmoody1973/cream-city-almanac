import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { About, type RiverwestRow } from "@/ui/components/About";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "What's in the Almanac · Cream City Almanac",
  description: "Milwaukee's public data, looked up and explained. Look up your address, read your neighborhood's figures, ask in plain English, and see who wrote every number.",
};

// What Cream City Almanac is, shown with its own working parts: the address box, a real fact-sheet row, a live City count.
export default async function Page() {
  const [stats, sheet] = await Promise.all([
    fetchQuery(api.catalog.landingStats, {}),
    fetchQuery(api.factSheet.sheet, { slug: "riverwest" }).catch(() => null),
  ]);
  const poverty = sheet?.status === "ok" ? sheet.headlines.find((h) => h.id === "poverty") : undefined;
  const riverwest: RiverwestRow | null = sheet?.status === "ok" && poverty?.hood?.rate && poverty.city?.rate
    ? { name: sheet.name, slug: sheet.slug, rate: poverty.hood.rate, city: poverty.city.rate, verdict: poverty.verdict }
    : null;
  return <About sampleCode={stats.sampleCode} cityLive={stats.cityLive} riverwest={riverwest} />;
}
