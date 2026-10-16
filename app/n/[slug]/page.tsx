import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { FactSheet, FactSheetIndex, FactSheetSmall } from "@/ui/components/FactSheet";

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ year?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await fetchQuery(api.factSheet.sheet, { slug });
  return { title: s.status === "ok" || s.status === "small" ? `${s.name} fact sheet · Cream City Almanac` : "Fact sheets · Cream City Almanac" };
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { year } = await searchParams;
  const y = Number(year);
  const s = await fetchQuery(api.factSheet.sheet, { slug, ...(Number.isInteger(y) ? { year: y } : {}) });
  return s.status === "ok" ? <FactSheet s={s} /> : s.status === "small" ? <FactSheetSmall s={s} /> : <FactSheetIndex areas={s.areas} cityAreas={s.cityAreas} />;
}
