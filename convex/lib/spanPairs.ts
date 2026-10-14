// The City files whose "from → to" dates Ask may measure (spec 2026-10-12-time-spans-design.md §4). Checked by hand:
// each pair's dates, unit and caveat. Found by family key, never by dataset code (codes differ between databases).
type PairText = { id: string; familyKey: string; file: string; from: string; name: string; things: string; toWhat: string; caveat: string };
// A between pair measures from one date to another; an age (L2) measures the cases still open up to an as-of date.
export type BetweenPair = PairText & { kind: "between"; to: string; unit: "days" | "minutes"; missing: string };
export type AgePair = PairText & { kind: "age"; openWhen?: string; asOf: "today" | "file"; unit: "days"; asOfNote: string };
export type SpanPair = BetweenPair | AgePair;

const COMPLAINTS = "city:citizen-complaints-against-police-and-fire-departments-the-department-of-emergency-communication";
const FIRE = "city:fire-incident-detail";
const FIRE_2021 = "This file covers 2021 only.";

export const SPAN_PAIRS: SpanPair[] = [
  { kind: "between", id: "complaint-close", familyKey: COMPLAINTS, file: "citizen complaints against the Police and Fire Departments", from: "DateReported", to: "Date Closed", name: "time to close", things: "complaints", toWhat: "to close", unit: "days", missing: "{n} complaints aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "Dates are typed by hand in more than one format; a few can't be read." },
  { kind: "between", id: "311-close", familyKey: "city:call-center-data", file: "311 call center requests", from: "CREATIONDATE", to: "CLOSEDDATETIME", name: "time to close", things: "requests", toWhat: "to close", unit: "days", missing: "{n} requests aren't closed yet and aren't counted, so slow cases are under-counted.", caveat: "311 dates have no time of day, so a request closed the same day counts as 0 days." },
  { kind: "between", id: "permit-issue", familyKey: "city:residential-and-commercial-permit-work-data", file: "residential and commercial permits", from: "Date Opened", to: "Date Issued", name: "time to issue", things: "permits", toWhat: "to be issued", unit: "days", missing: "{n} permits aren't issued yet and aren't counted, so slow cases are under-counted.", caveat: "A permit can wait on the applicant as well as the City." },
  { kind: "between", id: "fire-dispatch", familyKey: FIRE, file: "fire incidents", from: "Date_Received", to: "Date_Dispatched", name: "time to dispatch", things: "calls", toWhat: "to be dispatched", unit: "minutes", missing: "{n} calls have no dispatch time and aren't counted.", caveat: FIRE_2021 },
  { kind: "between", id: "fire-arrive", familyKey: FIRE, file: "fire incidents", from: "Date_Received", to: "Date_Arrived", name: "time to arrive", things: "calls", toWhat: "for a unit to arrive", unit: "minutes", missing: "{n} calls have no arrival time (often cancelled calls) and aren't counted.", caveat: FIRE_2021 },
  { kind: "between", id: "fire-clear", familyKey: FIRE, file: "fire incidents", from: "Date_Arrived", to: "Date_Cleared", name: "time on scene", things: "calls", toWhat: "to clear after a unit arrived", unit: "minutes", missing: "{n} calls have no clear time and aren't counted.", caveat: FIRE_2021 },
  { kind: "between", id: "mfd-arrive", familyKey: "city:mfd-calls-for-service-detail", file: "Fire Department calls for service", from: "IncidentStarted", to: "FirstUnitArrived", name: "time to arrive", things: "calls", toWhat: "for a unit to arrive", unit: "minutes", missing: "{n} calls have no arrival time (often cancelled calls) and aren't counted.", caveat: "Times come from the Fire Department's dispatch records." },
  // L1 (2026-10-14): checked on the live file, 350,530 calls Feb 2024 – Sep 2026; 96% have a dispatch time, all but 6 a close time.
  { kind: "between", id: "mfd-dispatch", familyKey: "city:mfd-calls-for-service-detail", file: "Fire Department calls for service", from: "IncidentStarted", to: "FirstUnitDispatched", name: "time to dispatch", things: "calls", toWhat: "to be dispatched", unit: "minutes", missing: "{n} calls have no dispatch time (no unit was sent) and aren't counted.", caveat: "Times come from the Fire Department's dispatch records." },
  { kind: "between", id: "mfd-close", familyKey: "city:mfd-calls-for-service-detail", file: "Fire Department calls for service", from: "FirstUnitArrived", to: "IncidentClosed", name: "time on scene", things: "calls", toWhat: "to close after a unit arrived", unit: "minutes", missing: "{n} calls have no close time and aren't counted.", caveat: "Closed is when the call's record was closed, which can be after the last unit leaves." },
  // L2 (2026-10-14): "still open" ages, measured to an as-of date (spec 2026-10-14-open-age-design.md §4).
  { kind: "age", id: "vacant-age", familyKey: "city:vacant-buildings", file: "vacant buildings", from: "DATEOPENED", asOf: "today", name: "time vacant so far", things: "buildings", toWhat: "on the vacant list", unit: "days", caveat: "The City adds a building when it registers it as vacant and removes it when it is no longer vacant.", asOfNote: "As of {date}: buildings still on the City's vacant-building list. The date is when the City registered the building as vacant, not when it emptied. Buildings taken off the list aren't counted." },
  { kind: "age", id: "complaint-open-age", familyKey: COMPLAINTS, file: "citizen complaints against the Police and Fire Departments", from: "DateReported", openWhen: "Date Closed", asOf: "file", name: "time open so far", things: "open complaints", toWhat: "open", unit: "days", caveat: "Dates are typed by hand in more than one format; a few can't be read.", asOfNote: "As of {date}, when the City last updated this file. Complaints with no close date then are counted; some may have closed since." },
];

export const pairsFor = (familyKey: string) => SPAN_PAIRS.filter((p) => p.familyKey === familyKey);

// Where a pair's time ends, in words for Ask's list and the pair choices.
export const pairEnd = (p: SpanPair) => (p.kind === "between" ? p.to : p.asOf === "today" ? "as of today" : "as of the file's last update");
