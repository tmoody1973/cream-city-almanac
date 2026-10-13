import { describe, expect, it } from "vitest";
import { layoutOf, yearFiles } from "../../convex/lib/propertyYears";

const ids = (...names: string[]) => names.map((id) => ({ id }));
const link = (rid: string, file: string) => `https://data.milwaukee.gov/dataset/79e9d55a-c1ed-457c-ab63-cb8e36235ba8/resource/${rid}/download/${file}`;

describe("layoutOf (K2)", () => {
  it("recognizes each layout by its columns", () => {
    expect(layoutOf(ids("TAXKEY", "C_A_TOTAL", "GEO_ALDER", "OWN_OCPD", "C_A_CLASS"))).toBe("classic");
    expect(layoutOf(ids("Taxkey", "AssessValu", "DistrictNa", "IsOwnerOcc", "PrevNonExemptClass"))).toBe("short");
    expect(layoutOf(ids("Taxkey", "TotalAssessedValue", "DistrictName", "IsOwnerOccupied", "PrevNonExemptClass"))).toBe("long");
  });
  it("gives no layout when a carried column is missing or nothing matches", () => {
    expect(layoutOf(ids("C_A_TOTAL", "GEO_ALDER", "OWN_OCPD"))).toBeNull(); // no class column
    expect(layoutOf(ids("CATOTAL", "GEOALDER", "OWNOCPD", "CACLASS"))).toBeNull(); // the 1990s layout isn't read
  });
});

describe("yearFiles (K2)", () => {
  it("takes each 'MPROP <year>' file from 2005 on, with the id from its link, sorted by year", () => {
    expect(yearFiles([
      { name: "Parcel Tax - MPROP 2025", url: link("9e512b1d-2c64-448f-9e7a-5c2022d5948a", "parcel-tax-mprop-2025.csv") },
      { name: "MPROP 2021", url: link("d1b65182-fff9-4400-9476-0aff30a6e0ea", "mprop-2021.csv") },
      { name: "MPROP 1995", url: link("bd5f561d-d5e6-42f4-b4d9-87f287867e7c", "mprop-1995.csv") },
      { name: "MPROP Reference 2009-now", url: link("c88986d6-5624-4154-860a-13f901c90905", "ref.pdf") },
      { name: "MPROP 2010", url: "https://data.milwaukee.gov/x/no-id.csv" },
    ], 2005)).toEqual([
      { year: 2021, resourceId: "d1b65182-fff9-4400-9476-0aff30a6e0ea" },
      { year: 2025, resourceId: "9e512b1d-2c64-448f-9e7a-5c2022d5948a" },
    ]);
  });
});
