import { describe, expect, it } from "vitest";
import { stopsChoices, stopsExport, stopsFollowUps, stopsTitle } from "../../ui/lib/stopsText";

const r = {
  status: "ok" as const, kind: "field-interview" as const, period: "2019 Q1–Q2 – 2024 Q4", total: 43, groupBy: "race" as const, rates: true, filters: [],
  groups: [{ label: "Black", n: 40, share: 93, frisked: 30, searched: 50, found: 60 }, { label: "White", n: 3, share: 7, frisked: null, searched: null, found: null }],
  source: "From MPD's quarterly stop-and-search data (2019 Q1–Q2 to 2024 Q4), counted by the Almanac from the City's files.",
  notes: ["People per stop as MPD recorded them: a person stopped twice counts twice.", "These are counts, not rates per resident."],
};
const ctx = { origin: "https://almanac.test", date: "October 13, 2026" };

describe("stops card text (K3)", () => {
  it("titles the card with kind, period and group", () => {
    expect(stopsTitle(r)).toBe("MPD stops · Field interviews · 2019 Q1–Q2 – 2024 Q4 · by race");
  });
  it("exports the rows, rates as too few to say, the notes and the source", () => {
    const e = stopsExport(r, ctx);
    expect(e.csv.head).toEqual(["race", "People", "Share (%)", "Frisked (%)", "Searched (%)", "Found something (of searched) (%)"]);
    expect(e.csv.rows[1]).toEqual(["White", 3, 7, null, null, null]);
    expect(e.text.rows[1]).toEqual(["White", "3", "7%", "too few to say", "too few to say", "too few to say"]);
    expect(e.notes).toEqual([...r.notes, r.source, "Exported from Cream City Almanac on October 13, 2026."]);
    expect(e.filename).toBe("almanac_MPD-stops_field-interview_race");
  });
  it("offers the next questions that keep the period, and the stored choices on a pick", () => {
    expect(stopsFollowUps(r).map((f) => f.label)).toEqual(["BY YEAR"]);
    expect(stopsFollowUps({ ...r, kind: "traffic", groupBy: "year", rates: false }).map((f) => f.label)).toEqual(["BY RACE", "FIELD INTERVIEWS: FRISKS AND SEARCHES BY RACE"]);
    expect(stopsFollowUps({ ...r, groupBy: null }).find((f) => f.label === "BY RACE")?.question).toBe("Who did MPD stop in field interviews, 2019 Q1–Q2 – 2024 Q4, by race?");
    // A pick keeps the asked kind, period and group, swapping in the chosen value (review 6).
    expect(stopsChoices({ kind: "field-interview", from: "2022", to: "2022", filters: { sex: ["Woman"] }, groupBy: "race" }, { column: "sex", choices: ["Female", "Male"] })[0])
      .toEqual({ label: "Female", question: "How many people did MPD stop in field interviews (Female), from 2022 to 2022, by race?" });
    expect(stopsChoices({}, { column: "race", choices: ["Black"] })).toEqual([{ label: "Black", question: "How many people did MPD stop (Black)?" }]);
  });
});
