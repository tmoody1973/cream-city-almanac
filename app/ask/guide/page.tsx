import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { AskGuide } from "@/ui/components/AskGuide";
import type { NumberResult } from "@/ui/components/AskCards";
import { loadSample } from "@/ui/lib/askGuide";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "How to use Ask — Cream City Almanac",
  description: "What Ask can do, how to read its answers, and example questions for journalists, nonprofits and residents.",
};

export default async function AskGuidePage() {
  // The page renders even when the lookup fails; the sample then says so.
  const sample = await loadSample((args) => fetchQuery(api.ask.getNumber, args));
  return <AskGuide sample={sample as NumberResult | null} />;
}
