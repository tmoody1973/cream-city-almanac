// The City files whose "from → to" dates Ask may measure (spec 2026-10-12-time-spans-design.md §4). Checked by hand:
// each pair's dates, unit and caveat. Found by family key, never by dataset code (codes differ between databases).
export type SpanPair = {
  id: string; familyKey: string; file: string; from: string; to: string;
  name: string; things: string; toWhat: string; unit: "days" | "minutes"; missing: string; caveat: string;
};

const COMPLAINTS = "city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication";
const FIRE = "city:fire-incident-detail";
const FIRE_2021 = "This file covers 2021 only.";

export const SPAN_PAIRS: SpanPair[] = [
  { id: "complaint-close", familyKey: COMPLAINTS, file: "citizen complaints against the Police and Fire Departments", from: "DateReported", to: "Date Closed", name: "time to close", things: "complaints", toWhat: "to close", unit: "days", missing: "{n} complaints aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "Dates are typed by hand in more than one format; a few can't be read." },
  { id: "311-close", familyKey: "city:call-center-data", file: "311 call center requests", from: "CREATIONDATE", to: "CLOSEDDATETIME", name: "time to close", things: "requests", toWhat: "to close", unit: "days", missing: "{n} requests aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "311 dates have no time of day, so a request closed the same day counts as 0 days." },
  { id: "permit-issue", familyKey: "city:residential-and-commercial-permit-work-data", file: "residential and commercial permits", from: "Date Opened", to: "Date Issued", name: "time to issue", things: "permits", toWhat: "to be issued", unit: "days", missing: "{n} permits aren't issued yet and aren't counted, so slow cases are under-counted.", caveat: "A permit can wait on the applicant as well as the City." },
  { id: "fire-dispatch", familyKey: FIRE, file: "fire incidents", from: "Date_Received", to: "Date_Dispatched", name: "time to dispatch", things: "calls", toWhat: "to be dispatched", unit: "minutes", missing: "{n} calls have no dispatch time and aren't counted.", caveat: FIRE_2021 },
  { id: "fire-arrive", familyKey: FIRE, file: "fire incidents", from: "Date_Received", to: "Date_Arrived", name: "time to arrive", things: "calls", toWhat: "for a unit to arrive", unit: "minutes", missing: "{n} calls have no arrival time (often cancelled calls) and aren't counted.", caveat: FIRE_2021 },
  { id: "fire-clear", familyKey: FIRE, file: "fire incidents", from: "Date_Arrived", to: "Date_Cleared", name: "time on scene", things: "calls", toWhat: "to clear after a unit arrived", unit: "minutes", missing: "{n} calls have no clear time and aren't counted.", caveat: FIRE_2021 },
  { id: "mfd-arrive", familyKey: "city:mfd-calls-for-service-detail", file: "Fire Department calls for service", from: "IncidentStarted", to: "FirstUnitArrived", name: "time to arrive", things: "calls", toWhat: "for a unit to arrive", unit: "minutes", missing: "{n} calls have no arrival time (often cancelled calls) and aren't counted.", caveat: "Times come from the Fire Department's dispatch records." },
];

export const pairsFor = (familyKey: string) => SPAN_PAIRS.filter((p) => p.familyKey === familyKey);
