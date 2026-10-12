import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { FactSheetIndex } from "@/ui/components/FactSheet";

export const revalidate = 300;
export const metadata: Metadata = { title: "Neighborhood fact sheets · Cream City Almanac" };

export default async function Page() {
  const s = await fetchQuery(api.factSheet.sheet, { slug: "" });
  return <FactSheetIndex areas={s.status === "not-found" ? s.areas : []} />;
}
