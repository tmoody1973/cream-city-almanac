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
