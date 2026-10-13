import type { TurnoutAnswer } from "@/lib/ask/tools";
import type { FollowUp } from "@/ui/components/FollowUps";
import { exported, safeName, type CardExport, type Ctx } from "./cardExport";

// The turnout card's words and export (spec 2026-10-13-turnout-design §6), from the stored totals.
export type TurnoutOk = Extract<TurnoutAnswer, { status: "ok" }>;
export const turnoutText = (x: number | null) => (x === null ? "—" : `${x}%`);
const firstHead = (r: TurnoutOk) => (r.groupBy === "ward" ? "Ward" : "Election");

export function turnoutExport(r: TurnoutOk, ctx: Ctx): CardExport {
  return {
    title: r.title,
    lines: [],
    csv: { head: [firstHead(r), "Registered voters", "Ballots cast", "Turnout (%)"], rows: r.rows.map((x) => [x.label, x.registered, x.ballots, x.turnout]) },
    text: { head: [firstHead(r), "Registered voters", "Ballots cast", "Turnout"], rows: r.rows.map((x) => [x.label, x.registered.toLocaleString("en-US"), x.ballots.toLocaleString("en-US"), turnoutText(x.turnout)]) },
    notes: [...r.notes, r.source, exported(ctx)],
    filename: safeName(["turnout", r.groupBy]),
  };
}

type Args = { type?: string; from?: number; to?: number; ward?: number; groupBy?: string };
export function turnoutFollowUps(a: Args, r: TurnoutOk): FollowUp[] {
  const out: FollowUp[] = [];
  const types = new Set(r.rows.map((x) => x.type).filter(Boolean));
  const years = a.from !== undefined || a.to !== undefined ? ` from ${a.from ?? 2016} to ${a.to ?? 2022}` : "";
  if (r.groupBy === "election" && types.size > 1) out.push({ label: "ONLY NOVEMBER ELECTIONS", question: `How did turnout change across November general elections${a.ward !== undefined ? ` in ward ${a.ward}` : ""}${years}?` });
  const newest = r.groupBy === "election" ? r.rows.at(-1)?.label.replace(/ \(wards.*\)$/, "") : undefined;
  if (newest && a.ward === undefined) out.push({ label: "LOWEST-TURNOUT WARDS", question: `Which wards had the lowest turnout in the ${newest}?` });
  if (r.groupBy === "ward" && r.rows[0]) out.push({ label: "THIS WARD OVER TIME", question: `How has turnout changed in ${r.rows[0].label} across elections?` });
  return out.slice(0, 3);
}
