import { MPROP_RID } from "../../convex/lib/cityProfile";

// Three real-shaped CKAN packages: a Current/Historical pair (one family) and an election file.
export const CRIME_CURRENT_RID = "87843297-a6fa-46d4-ba5d-cb342fb2d3bb";
export function cityPackages() {
  const pkg = (id: string, name: string, title: string, groups: string[], resources: unknown[], modified = "2026-10-08T03:00:00.000000", created = "2023-01-05T00:00:00.000000") => ({
    id, name, title, notes: `<p>${title} from the City of Milwaukee.</p>`, metadata_modified: modified, metadata_created: created,
    tags: [{ name: "crime" }], groups: groups.map((t) => ({ title: t })), organization: { title: "Milwaukee Police Department" }, resources,
  });
  return [
    pkg("a1", "wibr", "NIBRS Crime Data (Current)", ["Public Safety"], [{ id: CRIME_CURRENT_RID, format: "CSV", url: "https://data.milwaukee.gov/x/current.csv", datastore_active: true }]),
    pkg("a2", "wibrarchive", "NIBRS Crime Data (Historical)", ["Public Safety"], [{ id: "11111111-2222-3333-4444-555555555555", format: "CSV", url: "https://data.milwaukee.gov/x/hist.csv", datastore_active: true }], "2026-10-08T03:00:00.000000", "2020-01-01T00:00:00.000000"),
    pkg("b1", "2016-nov-8-county-clerk", "2016 Nov 8, County Clerk", ["Elections & Campaign"], [{ id: "c0c0c0c0-0000-0000-0000-000000000000", format: "XLSX", url: "https://data.milwaukee.gov/x/clerk.xlsx", datastore_active: false }], "2019-03-01T00:00:00.000000"),
  ];
}
export const cityCatalog = (packages = cityPackages()) => ({ success: true, result: { count: packages.length, results: packages } });

// The property file and its yearly history, shaped like the City's catalog (links carry each file's id).
export const YEAR_RIDS = { 1995: "bd5f561d-d5e6-42f4-b4d9-87f287867e7c", 2005: "6370d019-f21b-4957-aa86-d38f5e82e138", 2022: "a368cfd5-5504-4311-b394-df850da76367", 2025: "9e512b1d-2c64-448f-9e7a-5c2022d5948a" } as const;
const yearLink = (rid: string) => `https://data.milwaukee.gov/dataset/79e9d55a-c1ed-457c-ab63-cb8e36235ba8/resource/${rid}/download/mprop.csv`;
export function propertyPackages() {
  const pkg = (id: string, name: string, title: string, resources: unknown[]) => ({
    id, name, title, notes: `<p>${title} from the City of Milwaukee.</p>`, metadata_modified: "2026-10-13T09:00:00.000000", metadata_created: "2018-01-01T00:00:00.000000",
    tags: [{ name: "property" }], groups: [{ title: "Housing" }], organization: { title: "Assessor's Office" }, resources,
  });
  return [
    pkg("p1", "mprop", "Master Property File (MPROP)", [{ id: MPROP_RID, name: "CSV", format: "CSV", url: `https://data.milwaukee.gov/dataset/p1/resource/${MPROP_RID}/download/mprop.csv`, datastore_active: true }]),
    pkg("p2", "historical-master-property-file", "Master Property List (MPROP) Historical", [
      { id: YEAR_RIDS[2025], name: "Parcel Tax - MPROP 2025", format: "CSV", url: yearLink(YEAR_RIDS[2025]), datastore_active: true },
      { id: YEAR_RIDS[2022], name: "Parcel Tax - MPROP 2022", format: "CSV", url: yearLink(YEAR_RIDS[2022]), datastore_active: true },
      { id: YEAR_RIDS[2005], name: "MPROP 2005", format: "CSV", url: yearLink(YEAR_RIDS[2005]), datastore_active: true },
      { id: YEAR_RIDS[1995], name: "MPROP 1995", format: "CSV", url: yearLink(YEAR_RIDS[1995]), datastore_active: true },
      { id: "c88986d6-5624-4154-860a-13f901c90905", name: "MPROP Reference 2009-now", format: "PDF", url: yearLink("c88986d6-5624-4154-860a-13f901c90905"), datastore_active: false },
    ]),
  ];
}
