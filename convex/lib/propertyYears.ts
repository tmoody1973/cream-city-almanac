// The City's yearly property files (spec 2026-10-13-property-history-design §4–5): which columns each layout uses for
// the four facts that carry across years. A layout is recognized only when all four of its columns are there.
export type Layout = "classic" | "short" | "long";
export type YearFile = { year: number; resourceId: string; layout: Layout };

export const LAYOUTS: Record<Layout, { value: string; district: string; owner: string; ownerYes: string; cls: string }> = {
  classic: { value: "C_A_TOTAL", district: "GEO_ALDER", owner: "OWN_OCPD", ownerYes: "O", cls: "C_A_CLASS" },
  short: { value: "AssessValu", district: "DistrictNa", owner: "IsOwnerOcc", ownerYes: "1", cls: "PrevNonExemptClass" }, // 2022–23: names cut to 10 letters
  long: { value: "TotalAssessedValue", district: "DistrictName", owner: "IsOwnerOccupied", ownerYes: "1", cls: "PrevNonExemptClass" },
};

export function layoutOf(fields: { id: string }[]): Layout | null {
  const have = new Set(fields.map((f) => f.id));
  return (Object.keys(LAYOUTS) as Layout[]).find((l) => {
    const c = LAYOUTS[l];
    return [c.value, c.district, c.owner, c.cls].every((x) => have.has(x));
  }) ?? null;
}

const YEAR_NAME = /MPROP (\d{4})$/;
const RESOURCE = /\/resource\/([0-9a-f-]{36})\//;
// The catalog keeps each file's name and download link; the link carries the file's id.
// ponytail: a second file with the same year is ignored (first wins); the City has never published two.
export function yearFiles(files: { name: string; url: string }[], from: number): { year: number; resourceId: string }[] {
  const byYear = new Map<number, string>();
  for (const f of files) {
    const y = YEAR_NAME.exec(f.name.trim())?.[1];
    const id = RESOURCE.exec(f.url)?.[1];
    if (!y || !id || Number(y) < from || byYear.has(Number(y))) continue;
    byYear.set(Number(y), id);
  }
  return [...byYear].map(([year, resourceId]) => ({ year, resourceId })).sort((a, b) => a.year - b.year);
}
