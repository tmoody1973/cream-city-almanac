import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { SearchHome } from "@/ui/components/SearchHome";

export const revalidate = 300;

export default async function HomePage() {
  const [rundown, status] = await Promise.all([fetchQuery(api.catalog.rundown, {}), fetchQuery(api.search.catalogStatus, {})]);
  return <SearchHome rundown={rundown} status={status} />;
}
