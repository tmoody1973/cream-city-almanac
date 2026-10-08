// Runs ASK_QUESTIONS against the real model with Ask's own tools and prompt, against the Convex deployment
// in CONVEX_URL, acting as a test identity through `npx convex run --identity`. Stops at --cap dollars (default 1).
import { execFileSync } from "node:child_process";
import { generateText, gateway, stepCountIs, tool } from "ai";
import { ASK_PROMPT } from "../lib/ask/prompt";
import { askTools, type AskBackend } from "../lib/ask/tools";
import { proseSegments } from "../ui/lib/askProse";
import { ASK_QUESTIONS } from "./ask-questions";

const MODEL = process.env.ASK_MODEL ?? "anthropic/claude-sonnet-5.5";
const CAP = Number(process.argv.find((a) => a.startsWith("--cap="))?.slice(6) ?? 1);
const VERBOSE = process.argv.includes("--verbose");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").map(Number);
const PRICE = { in: 0.000002, out: 0.00001 };
const identity = JSON.stringify({ subject: "report-card", issuer: "report-card", email: "report-card@datayoucanuse.org", emailVerified: true });
const run = (fn: string, args: object, asUser = false) =>
  JSON.parse(execFileSync("npx", ["convex", "run", fn, JSON.stringify(args), ...(asUser ? ["--identity", identity] : [])], { encoding: "utf8" }));

const backend: AskBackend = {
  search: async (a) => run("search:searchCatalog", a),
  sheet: async (code) => run("catalog:familySheet", { code }),
  number: async (a) => run("ask:getNumber", a),
  report: async (a) => run("ask:readReport", a, true),
};
const tools = Object.fromEntries(askTools(backend).map((t) => [t.name, tool({ description: t.description, inputSchema: t.parameters, execute: t.execute })]));

let spent = 0;
let passed = 0;
for (const [i, item] of ASK_QUESTIONS.entries()) {
  if (ONLY && !ONLY.includes(i + 1)) continue;
  if (spent >= CAP) { console.log(`stopped at the $${CAP} cap`); break; }
  const r = await generateText({ model: gateway(MODEL), system: ASK_PROMPT, prompt: item.q, tools, stopWhen: stepCountIs(7), maxOutputTokens: 800 });
  spent += (r.totalUsage.inputTokens ?? 0) * PRICE.in + (r.totalUsage.outputTokens ?? 0) * PRICE.out;
  const calls = r.steps.flatMap((s) => s.toolResults);
  // A retry after a "pick from this list" reply is the tool working as designed: grade the best call.
  const tools = [item.tool].flat();
  const hits = calls.filter((c) => tools.includes(c.toolName as never));
  const hit = hits.find((c) => Object.values(item.expect).every((v) => JSON.stringify(c.output).includes(String(v))));
  const fieldsOk = Boolean(hit);
  const flaggedWords = proseSegments(r.text).filter((s) => s.unverified).map((s) => s.text);
  const unverified = flaggedWords.length;
  const ok = fieldsOk && unverified === 0;
  if (ok) passed++;
  if (VERBOSE) {
    for (const c of calls) console.log(`   ${c.toolName}(${JSON.stringify(c.input)}) → ${JSON.stringify(c.output).slice(0, 220)}`);
    console.log(`   TEXT: ${r.text}`);
  }
  console.log(`${ok ? "PASS" : "MISS"} ${item.q} → ${calls.map((c) => c.toolName).join(", ") || "no tools"}${unverified ? ` (${unverified} unverified: ${flaggedWords.join(" | ")})` : ""}`);
}
console.log(`\n${passed}/${ASK_QUESTIONS.length} passed · $${spent.toFixed(3)} spent · $${(spent / ASK_QUESTIONS.length).toFixed(4)} per question`);
