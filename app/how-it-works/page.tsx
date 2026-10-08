import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { HowItWorks } from "@/ui/components/HowItWorks";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "How it works — Cream City Almanac",
  description: "How Cream City Almanac finds, explains and links Milwaukee's public data from Data You Can Use, in plain English.",
};

const EXAMPLE_CODE = "W01";

export default async function HowItWorksPage() {
  // The explanation must render even when the catalog can't be reached; it then omits the numbers.
  const [status, example] = await Promise.all([
    fetchQuery(api.search.catalogStatus, {}).catch(() => null),
    fetchQuery(api.catalog.familySheet, { code: EXAMPLE_CODE }).catch(() => null),
  ]);
  return <HowItWorks status={status} example={example} />;
}
