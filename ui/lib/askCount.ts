// What a City count covers, in words for its card: the date it's counted by, the data's range, and the file(s).
export function countCoverage(r: { dateColumn: string | null; coverage: string | null; resourceName: string | null; files?: "only" | "current" | "archive" | "both"; source?: string }): string | null {
  // A year question names the yearly property files it read (spec 2026-10-13-property-history-design §6).
  if (r.source) return [r.dateColumn ? `Counted by ${r.dateColumn}.` : null, r.source].filter(Boolean).join(" ");
  // A split dataset's range spans both files, so a count that read one of them says which, in its own sentence.
  const one = r.files === "archive" ? "the City's Historical file"
    : r.files === "current" ? `the City's Current file${r.resourceName ? ` ('${r.resourceName}')` : ""}` : null;
  const file = r.files === "both" ? "the City's Historical and Current files"
    : one ? null : r.resourceName ? `the City's '${r.resourceName}' file` : null;
  const parts = [
    r.dateColumn ? `Counted by ${r.dateColumn}.` : null,
    r.coverage ? `The City's data here covers ${r.coverage}${file ? `, from ${file}` : ""}.` : file ? `From ${file}.` : null,
    one ? `This count read only ${one}.` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export const outsideCoverage = (r: { name: string; coverage: string; note?: string }) =>
  `${r.name}: the City's data here covers ${r.coverage}, so there is nothing to count for that period.${r.note ? ` ${r.note}` : ""}`;
