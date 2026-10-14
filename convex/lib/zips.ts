// The ZIP code tabulation areas (the Census Bureau's ZIP-shaped areas) that touch Milwaukee County, with the share of
// each one's LAND inside the City of Milwaukee and the place holding the largest part (spec 2026-10-14-zip-profile §4).
// Built once from the Census 2020 relationship files tab20_zcta520_county20_natl.txt (county GEOID 55079) and
// tab20_zcta520_place20_natl.txt: cityShare = AREALAND_PART in "Milwaukee city" ÷ AREALAND_ZCTA5_20, to 2 places.
// Land, not people. Rebuild after the 2030 census. PO-box ZIPs (53201 …) have no area and aren't here.
export type ZipArea = { cityShare: number; mainPlace: string };
export const COUNTY_ZIPS: Record<string, ZipArea> = {
  "53110": { cityShare: 0, mainPlace: "Cudahy" },
  "53126": { cityShare: 0, mainPlace: "Raymond" },
  "53129": { cityShare: 0, mainPlace: "Greendale" },
  "53130": { cityShare: 0, mainPlace: "Hales Corners" },
  "53132": { cityShare: 0, mainPlace: "Franklin" },
  "53154": { cityShare: 0, mainPlace: "Oak Creek" },
  "53172": { cityShare: 0, mainPlace: "South Milwaukee" },
  "53202": { cityShare: 1, mainPlace: "Milwaukee" },
  "53203": { cityShare: 1, mainPlace: "Milwaukee" },
  "53204": { cityShare: 1, mainPlace: "Milwaukee" },
  "53205": { cityShare: 1, mainPlace: "Milwaukee" },
  "53206": { cityShare: 1, mainPlace: "Milwaukee" },
  "53207": { cityShare: 1, mainPlace: "Milwaukee" },
  "53208": { cityShare: 0.99, mainPlace: "Milwaukee" },
  "53209": { cityShare: 0.61, mainPlace: "Milwaukee" },
  "53210": { cityShare: 0.99, mainPlace: "Milwaukee" },
  "53211": { cityShare: 0.5, mainPlace: "Milwaukee" },
  "53212": { cityShare: 0.89, mainPlace: "Milwaukee" },
  "53213": { cityShare: 0.15, mainPlace: "Wauwatosa" },
  "53214": { cityShare: 0.26, mainPlace: "West Allis" },
  "53215": { cityShare: 0.93, mainPlace: "Milwaukee" },
  "53216": { cityShare: 1, mainPlace: "Milwaukee" },
  "53217": { cityShare: 0, mainPlace: "River Hills" },
  "53218": { cityShare: 1, mainPlace: "Milwaukee" },
  "53219": { cityShare: 0.52, mainPlace: "Milwaukee" },
  "53220": { cityShare: 0.3, mainPlace: "Greenfield" },
  "53221": { cityShare: 0.69, mainPlace: "Milwaukee" },
  "53222": { cityShare: 0.58, mainPlace: "Milwaukee" },
  "53223": { cityShare: 0.64, mainPlace: "Milwaukee" },
  "53224": { cityShare: 1, mainPlace: "Milwaukee" },
  "53225": { cityShare: 0.8, mainPlace: "Milwaukee" },
  "53226": { cityShare: 0.1, mainPlace: "Wauwatosa" },
  "53227": { cityShare: 0.1, mainPlace: "West Allis" },
  "53228": { cityShare: 0.1, mainPlace: "Greenfield" },
  "53233": { cityShare: 1, mainPlace: "Milwaukee" },
  "53235": { cityShare: 0, mainPlace: "St. Francis" },
  "53295": { cityShare: 1, mainPlace: "Milwaukee" },
};

// A 5-digit ZIP, or a ZIP+4 (its first 5 digits), trimmed; anything else is null.
export function checkZip(raw: string): string | null {
  const m = /^(\d{5})(?:-\d{4})?$/.exec(raw.trim());
  return m ? m[1] : null;
}
