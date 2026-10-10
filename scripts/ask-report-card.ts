// Runs ASK_QUESTIONS against the real model with Ask's own tools and prompt, against the Convex deployment
// in CONVEX_URL, acting as a test identity through `npx convex run --identity`. Stops at --cap dollars (default 1).
import { execFileSync } from "node:child_process";
import { generateText, gateway, stepCountIs, tool } from "ai";
import { ASK_PROMPT } from "../lib/ask/prompt";
import { askTools, type AskBackend } from "../lib/ask/tools";
import { proseSegments, replyProblems } from "../ui/lib/askProse";
import { ASK_EXAMPLES } from "../lib/ask/examples";
import { ASK_QUESTIONS } from "./ask-questions";

const MODEL = process.env.ASK_MODEL ?? "anthropic/claude-sonnet-5.5";
const CAP = Number(process.argv.find((a) => a.startsWith("--cap="))?.slice(6) ?? 1);
const VERBOSE = process.argv.includes("--verbose");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").map(Number);
// --examples grades only the guide's example questions (lib/ask/examples.ts).
const EXAMPLES = process.argv.includes("--examples") ? new Set(ASK_EXAMPLES.map((e) => e.question)) : null;
const PRICE = { in: 0.000002, out: 0.00001 };
const identity = JSON.stringify({ subject: "report-card", issuer: "report-card", email: "report-card@datayoucanuse.org", emailVerified: true });
const run = (fn: string, args: object, asUser = false) =>
  JSON.parse(execFileSync("npx", ["convex", "run", fn, JSON.stringify(args), ...(asUser ? ["--identity", identity] : [])], { encoding: "utf8" }));

const backend: AskBackend = {
  search: async (a) => run("search:searchCatalog", a),
  sheet: async (code) => run("catalog:familySheet", { code }),
  number: async (a) => run("ask:getNumber", a),
  report: async (a) => run("ask:readReport", a, true),
  count: async (a) => run("city:countRecords", a, true),
  rank: async (a) => run("tracts:rankTracts", a, true),
  change: async (a) => run("tracts:compareYears", a, true),
  relate: async (a) => run("tracts:relateTracts", a, true),
};
const tools = Object.fromEntries(askTools(backend).map((t) => [t.name, tool({ description: t.description, inputSchema: t.parameters, execute: t.execute })]));

let spent = 0;
let passed = 0;
let graded = 0;
for (const [i, item] of ASK_QUESTIONS.entries()) {
  if (ONLY && !ONLY.includes(i + 1)) continue;
  if (EXAMPLES && !EXAMPLES.has(item.q)) continue;
  if (spent >= CAP) { console.log(`stopped at the $${CAP} cap`); break; }
  const r = await generateText({ model: gateway(MODEL), system: ASK_PROMPT, prompt: item.q, tools, stopWhen: stepCountIs(7), maxOutputTokens: 800 });
  spent += (r.totalUsage.inputTokens ?? 0) * PRICE.in + (r.totalUsage.outputTokens ?? 0) * PRICE.out;
  const calls = r.steps.flatMap((s) => s.toolResults);
  // A retry after a "pick from this list" reply is the tool working as designed: grade the best call.
  const expectedTools = [item.tool].flat();
  const hits = calls.filter((c) => expectedTools.includes(c.toolName as never));
  const hit = (item.final ? hits.slice(-1) : hits).find((c) => Object.values(item.expect).every((v) => JSON.stringify(c.output).includes(String(v))));
  const fieldsOk = Boolean(hit);
  // The map can only ever show part of the count (records without a location are left out), never more.
  const mapMismatch = calls.some((c) => c.toolName === "countRecords" && (c.output as { status?: string; count?: number; map?: { summary: { total: number } } | null })?.status === "ok" && ((c.output as { map?: { summary: { total: number } } | null }).map?.summary.total ?? 0) > ((c.output as { count?: number }).count ?? 0));
  const flaggedWords = proseSegments(r.text, JSON.stringify(calls.map((c) => c.output))).filter((s) => s.unverified).map((s) => s.text);
  const unverified = flaggedWords.length;
  // Reply shape (lib/ask/prompt.ts: one to three sentences, at most three angles) is a warning, not a miss: the model
  // runs long, mostly restating the card's caveats (Tarik, 2026-10-10: track it, don't fail on it).
  const shape = replyProblems(r.text);
  const ok = fieldsOk && unverified === 0 && !mapMismatch;
  graded++;
  if (ok) passed++;
  if (VERBOSE) {
    for (const c of calls) console.log(`   ${c.toolName}(${JSON.stringify(c.input)}) → ${JSON.stringify(c.output).slice(0, 220)}`);
    console.log(`   TEXT: ${r.text}`);
  }
  console.log(`${ok ? "PASS" : "MISS"} ${item.q} → ${calls.map((c) => c.toolName).join(", ") || "no tools"}${unverified ? ` (${unverified} unverified: ${flaggedWords.join(" | ")})` : ""}${mapMismatch ? " (MAP>COUNT)" : ""}${shape.length ? ` (shape warning: ${shape.join(", ")})` : ""}`);
}
console.log(`\n${passed}/${graded} passed · $${spent.toFixed(3)} spent · $${(spent / Math.max(graded, 1)).toFixed(4)} per question`);
