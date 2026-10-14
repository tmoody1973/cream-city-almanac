import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { SharedAnswer } from "@/ui/components/SharedAnswer";

type Props = { params: Promise<{ id: string }> };

// Only a well-formed id is looked up; anything else is simply not there.
const load = async (id: string) => (/^[0-9A-Za-z]{10}$/.test(id) ? fetchQuery(api.shares.get, { id }) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await load((await params).id);
  const title = `${s ? ("card" in s.shared ? s.shared.card.title : "A quote from a DYCU report") : "Shared answer"} · Cream City Almanac`;
  return { title, openGraph: { title }, robots: { index: false, follow: false } };
}

export default async function Page({ params }: Props) {
  const s = await load((await params).id);
  if (!s) notFound();
  return <SharedAnswer shared={s.shared} createdAt={s.createdAt} />;
}
