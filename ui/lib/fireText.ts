import type { FireAnswer } from "@/lib/ask/tools";
import type { FollowUp } from "@/ui/components/FollowUps";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";
import { durationText } from "./spanText";

// The fire-history card's words and export (spec 2026-10-14-fire-history §7), from the stored yearly totals.
export type FireOk = Extract<FireAnswer, { status: "ok" }>;
type Row = FireOk["rows"][number];
const NAME = { dispatch: "time to dispatch", arrive: "time to arrive" } as const;
const count = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"));
const isTime = (r: Pick<FireOk, "measure">) => r.measure !== "calls";
const typeQuestion = (t: string) => `How many ${t} calls did the Fire Department get each year, 2015 to 2023?`;

export const yearLabel = (x: Pick<Row, "year" | "partial">) => (x.partial ? `${x.year} (${x.partial})` : String(x.year));
export const fireHead = (r: FireOk) => (isTime(r) ? ["Year", "Calls measured", "Median", "9 in 10"] : ["Year", "Calls"]);
export const fireCells = (r: FireOk, x: Row) =>
  isTime(r) ? [yearLabel(x), count(x.n), durationText(x.median, "minutes"), durationText(x.p90, "minutes")] : [yearLabel(x), count(x.calls)];

export function fireExport(r: FireOk, ctx: Ctx): CardExport {
  const time = isTime(r);
  return {
    title: r.title,
    lines: [],
    csv: {
      head: time ? ["Year", "Partial year", "Calls", "Calls measured", "Median (minutes)", "9 in 10 (minutes)"] : ["Year", "Partial year", "Calls"],
      rows: r.rows.map((x) => (time ? [x.year, x.partial ?? "", x.calls, x.n, x.median, x.p90] : [x.year, x.partial ?? "", x.calls])),
    },
    text: { head: fireHead(r), rows: r.rows.map((x) => fireCells(r, x)) },
    notes: [...r.notes, r.source, exported(ctx)],
    filename: safeName(["fire", r.type ?? r.measure, r.group]),
  };
}

export function fireFollowUps(r: FireOk): FollowUp[] {
  if (r.measure === "calls") {
    const out: FollowUp[] = [];
    const t = r.type ? null : r.types.find((x) => x.toUpperCase() !== "EMS");
    if (t) out.push({ label: "BY CALL TYPE", question: typeQuestion(t) });
    out.push({ label: "TIME TO ARRIVE", question: "How has the Fire Department's time to arrive changed each year?" });
    return out;
  }
  const other = r.measure === "dispatch" ? "arrive" : "dispatch";
  return [
    r.group === "ems"
      ? { label: "ALL CALLS", question: `How has the Fire Department's ${NAME[r.measure]} changed each year?` }
      : { label: "EMS ONLY", question: `How has the Fire Department's ${NAME[r.measure]} for EMS calls changed each year?` },
    { label: other === "arrive" ? "TIME TO ARRIVE" : "TIME TO DISPATCH", question: `How has the Fire Department's ${NAME[other]} changed each year?` },
  ];
}

export const fireChoices = (r: Extract<FireAnswer, { status: "choose" }>): FollowUp[] => r.choices.map((c) => ({ label: c.toUpperCase(), question: typeQuestion(c) }));
