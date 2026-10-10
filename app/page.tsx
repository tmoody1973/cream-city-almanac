import { redirect } from "next/navigation";
import { isSearchAddress } from "@/ui/lib/selection";

export const metadata = {
  title: "Cream City Almanac — A guide to Milwaukee's public data.",
  description: "Find it. Understand it. Check where it came from. Milwaukee's public data from Data You Can Use and the City of Milwaukee, explained.",
};

type Params = Promise<Record<string, string | string[] | undefined>>;

// The front door. Links made before the landing page (/?q=…&open=…) go to /search with the same settings.
export default async function HomePage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  if (isSearchAddress(params)) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const one of [v].flat()) if (one !== undefined) q.append(k, one);
    redirect(`/search?${q}`);
  }
  return (
    <main>
      <h1>A guide to Milwaukee&apos;s public data.</h1>
      <form action="/search" method="get"><label>Topic: <input name="q" placeholder="What are you looking into?" /></label></form>
    </main>
  );
}
