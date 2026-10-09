// What a City count covers, in words for its card: the date it's counted by, the data's range, and the file.
export function countCoverage(r: { dateColumn: string | null; coverage: string | null; resourceName: string | null }): string | null {
  const file = r.resourceName ? `the City's '${r.resourceName}' file` : null;
  const parts = [
    r.dateColumn ? `Counted by ${r.dateColumn}.` : null,
    r.coverage ? `The City's data here covers ${r.coverage}${file ? `, from ${file}` : ""}.` : file ? `From ${file}.` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export const outsideCoverage = (r: { name: string; coverage: string }) =>
  `${r.name}: the City's data here covers ${r.coverage}, so there is nothing to count for that period.`;
