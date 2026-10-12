// The City money columns Ask may total, take the median of, or average (spec 2026-10-12-city-measures-design.md §4).
// Hand-checked: column, unit, splits that make sense, caveat, and whether the file names people. Found by family key,
// never by dataset code. A column not here is never totaled.
export type CityMeasure = {
  id: string; familyKey: string; file: string; column: string; name: string; things: string;
  unit: "dollars" | "dollars per hour"; summable: boolean; splits: string[]; date: string | null;
  namesPeople: boolean; skipZero: boolean; caveat: string;
};

const MAILING_ZIP = "ZIP in this file is the owner's mailing ZIP, not the property's";

export const CITY_MEASURES: CityMeasure[] = [
  { id: "tax-owed", familyKey: "city:delinquent-real-estate-tax-accounts", file: "delinquent real estate tax accounts", column: "Total Tax Principal", name: "back tax owed", things: "accounts", unit: "dollars", summable: true, splits: ["Ald Dist", "Levy Year"], date: null, namesPeople: true, skipZero: false, caveat: `${MAILING_ZIP}; aldermanic district is where the property is.` },
  { id: "pp-tax-owed", familyKey: "city:delinquent-personal-property-tax-accounts", file: "delinquent personal property tax accounts", column: "Total Tax Principal", name: "back personal property tax owed", things: "accounts", unit: "dollars", summable: true, splits: ["Levy Year"], date: null, namesPeople: true, skipZero: false, caveat: `${MAILING_ZIP}.` },
  { id: "gross-pay", familyKey: "city:city-employee-salary-data", file: "City employee pay", column: "Total Gross", name: "gross pay", things: "employees", unit: "dollars", summable: true, splits: ["Department", "Job Title", "Full/Part"], date: null, namesPeople: true, skipZero: true, caveat: "Gross pay is what each employee was paid in the file's period; part-time and partial-year employees are included unless filtered out." },
  { id: "hourly-rate", familyKey: "city:city-employee-salary-data", file: "City employee pay", column: "Hourly Rate", name: "hourly pay rate", things: "employees", unit: "dollars per hour", summable: false, splits: ["Department", "Job Title", "Full/Part"], date: null, namesPeople: true, skipZero: true, caveat: "Hourly rate is each employee's rate of pay, not their total earnings." },
  { id: "sale-price", familyKey: "city:property-sales-data", file: "property sales", column: "Sale_price", name: "sale price", things: "sales", unit: "dollars", summable: true, splits: ["District", "PropType"], date: "Sale_date", namesPeople: false, skipZero: true, caveat: "Sale prices cover the sales in the City's file; property type and district come from the City's records." },
  { id: "assessed-value", familyKey: "city:master-property-file-mprop", file: "Master Property File (assessed values)", column: "C_A_TOTAL", name: "total assessed value", things: "properties", unit: "dollars", summable: true, splits: ["GEO_ALDER"], date: null, namesPeople: false, skipZero: false, caveat: "Assessed value is the City's figure for property taxes, not what a property would sell for." },
];

export const measuresFor = (familyKey: string) => CITY_MEASURES.filter((m) => m.familyKey === familyKey);
export const MEASURE_FILES = [...new Set(CITY_MEASURES.map((m) => m.file))];
