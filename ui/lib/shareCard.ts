import { changeExport, countExport, measureExport, numberExport, quoteText, rankExport, relateExport, spanExport, type CardExport, type Ctx } from "./cardExport";
import { stopsExport } from "./stopsText";
import { changeCardText, rankCardText, relateCardText } from "./tractCardText";
import { fireExport } from "./fireText";
import { turnoutExport } from "./turnoutText";
import { zipHealthExport } from "./zipHealthText";
import { nExport } from "./neighborhoodText";

// A share link's snapshot (spec 2026-10-14-share-link-design.md §5): the server re-runs the card's tool and builds
// the same export the card's CSV, text and PNG come from. Runs in Convex, so it imports only plain functions.
// Ask's fact-sheet card has no export (its answer lacks the sheet's source); it links to the public /n page instead.

export const SHAREABLE = ["getNumber", "countRecords", "timeSpan", "rankTracts", "compareYears", "relateTracts", "countStops", "countTurnout", "fireHistory", "readReport", "zipHealth"] as const;
export type ShareTool = (typeof SHAREABLE)[number];
export const isShareable = (t: string): t is ShareTool => (SHAREABLE as readonly string[]).includes(t);

export type Shared = { card: CardExport } | { quote: string };
export type ShareResult = { ok: true; id: string } | { ok: false; reason: "signed-out" | "not-shareable" | "limit" | "failed" };

// What the reporter reads after pressing Share link; null when the link is shown instead.
export const shareMessage = (r: ShareResult | null) =>
  r?.ok ? null : r?.reason === "limit" ? "You've made today's 30 links. Try again tomorrow." : "Couldn't make a link. Ask again and retry.";

// The snapshot's dataset links point here, never at an address the browser supplied.
export const SITE = "https://www.creamcityalmanac.app";
export const shareDate = (ms: number) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Chicago" }).format(ms);

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// ponytail: byte % 62 leans slightly toward the first 8 characters; ~59 bits either way, plenty for unguessable links.
export const newShareId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ALPHABET[b % 62]).join("");

type Passage = { quote: string; section: string; report: string; code: string };

export function shareCard(tool: ShareTool, result: unknown, ctx: Ctx): Shared | null {
  if (!result || typeof result !== "object") return null;
  const r = result as { status?: string; tool?: string; passages?: Passage[] };
  const ok = r.status === "ok";
  const card = (c: CardExport) => ({ card: c });
  switch (tool) {
    case "getNumber": return ok ? card(numberExport(r as never, ctx)) : null;
    case "countRecords": return ok ? card(countExport(r as never, ctx)) : r.status === "measured" ? card(measureExport(r as never, ctx)) : null;
    case "timeSpan": return ok ? card(spanExport(r as never, ctx)) : null;
    case "countStops": return ok ? card(stopsExport(r as never, ctx)) : null;
    case "countTurnout": return ok ? card(turnoutExport(r as never, ctx)) : null;
    case "fireHistory": return ok ? card(fireExport(r as never, ctx)) : null;
    case "zipHealth": return ok ? card(zipHealthExport(r as never, ctx)) : null;
    case "rankTracts": return ok && r.tool === "rank" ? card(rankExport(r as never, rankCardText(r as never), ctx)) : ok && r.tool === "rank-n" ? card(nExport(r as never, ctx)) : null;
    case "compareYears": return ok && r.tool === "change" ? card(changeExport(r as never, changeCardText(r as never), ctx)) : null;
    case "relateTracts": return ok && r.tool === "relate" ? card(relateExport(r as never, relateCardText(r as never), ctx)) : ok && r.tool === "relate-n" ? card(nExport(r as never, ctx)) : null;
    case "readReport": return ok && r.passages?.length ? { quote: r.passages.map((p) => quoteText(p, ctx)).join("\n\n") } : null;
  }
}
