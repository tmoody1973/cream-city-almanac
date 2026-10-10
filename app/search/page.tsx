import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { SearchHome } from "@/ui/components/SearchHome";

export const revalidate = 300;

export const metadata = { title: "Search — Cream City Almanac" };

export default async function SearchPage() {
  const [rundown, status] = await Promise.all([fetchQuery(api.catalog.rundown, {}), fetchQuery(api.search.catalogStatus, {})]);
  return <SearchHome rundown={rundown} status={status} />;
}
