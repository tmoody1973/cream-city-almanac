import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { DatasetSheet } from "@/ui/components/DatasetSheet";

export const revalidate = 300;

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const sheet = await fetchQuery(api.catalog.familySheet, { code });
  return { title: sheet ? `${sheet.family.code} · ${sheet.family.name} — Cream City Almanac` : "Not found — Cream City Almanac" };
}

export default async function SheetPage({ params }: Props) {
  const { code } = await params;
  const sheet = await fetchQuery(api.catalog.familySheet, { code });
  if (!sheet) notFound();
  return <DatasetSheet sheet={sheet} />;
}
