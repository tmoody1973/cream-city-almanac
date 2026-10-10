import { fetchAction, fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import type { AskBackend } from "./tools";

// The tools' view of Convex, as the signed-in person.
export function convexBackend(token: string): AskBackend {
  return {
    search: (a) => fetchAction(api.search.searchCatalog, a),
    sheet: (code) => fetchQuery(api.catalog.familySheet, { code }),
    number: (a) => fetchQuery(api.ask.getNumber, a),
    report: (a) => fetchAction(api.ask.readReport, a, { token }),
    count: (a) => fetchAction(api.city.countRecords, a, { token }),
    rank: (a) => fetchAction(api.tracts.rankTracts, a, { token }),
    change: (a) => fetchAction(api.tracts.compareYears, a, { token }),
    relate: (a) => fetchAction(api.tracts.relateTracts, a, { token }),
  };
}
