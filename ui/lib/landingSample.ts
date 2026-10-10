import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

// What the public map action returns: a count, any of the refusals, or "bad-input" / "busy".
export type SampleResult = FunctionReturnType<typeof api.map.mapCells>;

// The landing page's sample answer: a real count, or a link — never a number that didn't come from the data.
export function sampleView(r: SampleResult | null): { kind: "figure"; count: string; caption: string } | { kind: "link" } {
  if (!r || r.status !== "ok") return { kind: "link" };
  return { kind: "figure", count: r.count.toLocaleString("en-US"), caption: [r.name, ...r.filters, r.period, r.area ? `In ${r.area}` : null].filter(Boolean).join(" · ") };
}
