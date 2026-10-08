import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { StartHere } from "@/ui/components/StartHere";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Start here — Cream City Almanac",
  description: "How a reporter, a nonprofit and a resident use Cream City Almanac, with live examples from Milwaukee's public data.",
};

export default async function StartHerePage() {
  // The walkthroughs must render even when the catalog can't be reached; the excerpts then say so.
  const data = await fetchQuery(api.catalog.startHere, {}).catch(() => null);
  return <StartHere data={data} />;
}
