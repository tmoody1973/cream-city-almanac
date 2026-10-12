import { gateway, wrapLanguageModel, simulateReadableStream, type LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";

type Meter = (u: { inputTokens: number; outputTokens: number }) => Promise<void>;

// Roughly four characters a token; a little high for JSON, which errs toward charging more.
const estimateTokens = (prompt: unknown) => Math.ceil(JSON.stringify(prompt).length / 4);

// Metering never breaks an answer the person has already been charged a question for; it logs (no text) and moves on.
const safely = (meter: Meter) => (u: { inputTokens: number; outputTokens: number }) =>
  meter(u).catch((e: unknown) => console.warn(`Ask meter failed: ${e instanceof Error ? e.message : String(e)}`));

// Each step is charged its estimated input before the model runs, so an answer abandoned mid-stream still counts
// toward the site budget; the finish adds the output and any input beyond the estimate.
export function meteredModel(model: LanguageModel, meter: Meter): LanguageModel {
  const charge = safely(meter);
  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: {
      specificationVersion: "v3",
      wrapStream: async ({ doStream, params }) => {
        const estimate = estimateTokens(params.prompt);
        await charge({ inputTokens: estimate, outputTokens: 0 });
        const r = await doStream();
        const stream = r.stream.pipeThrough(
          new TransformStream({
            async transform(part, controller) {
              if (part.type === "finish") {
                const input = part.usage.inputTokens.total ?? 0;
                await charge({ inputTokens: Math.max(0, input - estimate), outputTokens: part.usage.outputTokens.total ?? 0 });
              }
              controller.enqueue(part);
            },
          }),
        );
        return { ...r, stream };
      },
    },
  });
}

// The real model, through the AI Gateway.
export function askModel(id: string, meter: Meter): LanguageModel {
  return meteredModel(gateway(id), meter);
}

// Browser tests send x-ask-fake: 1; production never honors it.
export function useFakeModel(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production" && request.headers.get("x-ask-fake") === "1";
}

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const finish = (reason: "tool-calls" | "stop") => ({ type: "finish" as const, finishReason: { unified: reason, raw: reason }, usage });
// Real models give every text block and tool call its own id; reused ids make the chat merge separate replies.
let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;
const text = (s: string) => {
  const id = nextId("text");
  return [{ type: "text-start" as const, id }, { type: "text-delta" as const, id, delta: s }, { type: "text-end" as const, id }];
};
const call = (toolName: string, input: object) => ({ type: "tool-call" as const, toolCallId: nextId(`call-${toolName}`), toolName, input: JSON.stringify(input) });

// A scripted model: the first step calls the tool the question's keyword names; the next step replies.
// "wrong column" → rankTracts E02 with a column that doesn't exist (choose-column); "rank tracts" → rankTracts, "despite" → relateTracts (mismatch), "grow most" → compareYears (all three before "poverty", which they may contain); "poverty" → getNumber (Harambee); "over 200000" → searchCatalog "Master Property File", then countRecords on the row named "Master Property File (MPROP)" over $200,000 by district; "home values" → the same search, then relateTracts median_value × H04 per_broadband (County 2023); "air" → previewData V02; "twice" → showDataset and previewData V02 in one step;
// "angles" → a reply with two paragraphs and three story angles; "report" → readReport; "unverified" → a reply with a figure; "thefts" and "robberies" → searchCatalog, then countRecords (robberies: a broad count, then robbery in Harambee); "how long" → searchCatalog "citizen complaints", then timeSpan on the complaints row by Department; "how much" → searchCatalog "delinquent real estate tax", then countRecords with measure tax-owed by "Ald Dist"; else searchCatalog.
export function fakeAskModel(): LanguageModel {
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      // This turn has a tool result once the newest message is one (earlier turns' results don't count).
      const answered = prompt.at(-1)?.role === "tool";
      const question = JSON.stringify(prompt.filter((m) => m.role === "user").at(-1) ?? "").toLowerCase();
      if (!answered && question.includes("fail")) throw new Error("fake failure");
      const last = prompt.at(-1);
      const searched = answered && last?.role === "tool"
        ? (last.content as { type: string; toolName?: string; output?: { type: string; value: unknown } }[]).find((p) => p.type === "tool-result" && p.toolName === "searchCatalog")
        : undefined;
      if (question.includes("thefts") && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const code = (v as { rows?: { code: string }[] }).rows?.[0]?.code ?? "P01";
        const stream = [call("countRecords", { code, filters: [{ column: "Offense_All", values: ["All Other Larceny"] }], groupBy: "month" }), finish("tool-calls")];
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, ...stream] }) };
      }
      // The property file's code is assigned by the build and differs by deployment, so (like the real model) find it by name.
      const property = question.includes("over 200000") || question.includes("home values");
      if (property && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const code = (v as { rows?: { code: string; name: string }[] }).rows?.find((r) => r.name === "Master Property File (MPROP)")?.code ?? "H28";
        const next = question.includes("over 200000")
          ? call("countRecords", { code, filters: [{ column: "C_A_TOTAL", over: 200000 }], groupBy: "GEO_ALDER" })
          : call("relateTracts", { a: { code, column: "median_value" }, b: { code: "H04", column: "per_broadband" }, place: "County", year: "2023", mode: "relate" });
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, next, finish("tool-calls")] }) };
      }
      // Like the real model on the live site: a broad count in one step, then the one that was asked in the next (the
      // first must fold away even though it arrived in an earlier message).
      const counted = answered && last?.role === "tool"
        ? (last.content as { type: string; toolName?: string; input?: unknown }[]).find((p) => p.type === "tool-result" && p.toolName === "countRecords")
        : undefined;
      if (question.includes("how long") && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const rows = (v as { rows?: { code: string; name: string }[] }).rows ?? [];
        const code = rows.find((r) => /complaint/i.test(r.name))?.code ?? rows[0]?.code ?? "P24";
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, call("timeSpan", { code, groupBy: "Department" }), finish("tool-calls")] }) };
      }
      if (question.includes("how much") && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const rows = (v as { rows?: { code: string; name: string }[] }).rows ?? [];
        const code = rows.find((r) => /delinquent real estate/i.test(r.name))?.code ?? rows[0]?.code ?? "H19";
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, call("countRecords", { code, measure: { id: "tax-owed" }, groupBy: "Ald Dist" }), finish("tool-calls")] }) };
      }
      if (question.includes("robberies") && searched?.output) {
        const v = searched.output.type === "json" ? searched.output.value : JSON.parse(String(searched.output.value));
        const code = (v as { rows?: { code: string }[] }).rows?.[0]?.code ?? "P01";
        const stream = [call("countRecords", { code, neighborhood: "Harambee" }), finish("tool-calls")];
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, ...stream] }) };
      }
      if (question.includes("robberies") && counted && !JSON.stringify(prompt).includes("Offense_All")) {
        const code = JSON.stringify(prompt).match(/"code":"(P\d+)"/)?.[1] ?? "P01";
        const stream = [call("countRecords", { code, filters: [{ column: "Offense_All", values: ["robbery"] }], neighborhood: "Harambee" }), finish("tool-calls")];
        return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, ...stream] }) };
      }
      const chunks = answered
        ? [...text(question.includes("angles") ? "The asthma sheets are listed.\n\nStory angles:\n- Where it is highest\n- How it changed\n- Who is working on it" : "Here is what the data shows."), finish("stop")]
        : question.includes("unverified")
          ? [...text("There are 608 children."), finish("stop")]
          : [
              ...[question.includes("how much")
                ? call("searchCatalog", { query: "delinquent real estate tax accounts" })
                : question.includes("how long")
                ? call("searchCatalog", { query: "citizen complaints against police and fire" })
                : question.includes("thefts") || question.includes("robberies")
                ? call("searchCatalog", { query: "NIBRS crime" })
                : property
                ? call("searchCatalog", { query: "Master Property File" })
                : question.includes("wrong column")
                ? call("rankTracts", { code: "E02", column: "nope", place: "County", year: "2023", direction: "high" })
                : question.includes("rank tracts")
                ? call("rankTracts", { code: "E02", column: "pov_rate", place: "County", year: "2023", direction: "high" })
                : question.includes("despite")
                ? call("relateTracts", { a: { code: "E02", column: "pov_rate" }, b: { code: "F02", column: "per_insecure" }, place: "County", year: "2023", mode: "mismatch", aSide: "high", bSide: "low" })
                : question.includes("grow most")
                ? call("compareYears", { code: "E02", column: "pov_rate", place: "County", from: "2022", to: "2023" })
                : question.includes("poverty")
                ? call("getNumber", { neighborhood: "Harambee", topic: "Poverty Status by Age", row: "Under 5 years" })
                : question.includes("twice")
                ? [call("showDataset", { code: "V02" }), call("previewData", { code: "V02" })]
                : question.includes("air")
                  ? call("previewData", { code: "V02" })
                  : question.includes("report")
                    ? call("readReport", { question: "Harambee housing" })
                    : call("searchCatalog", { query: "asthma" })].flat(),
              finish("tool-calls"),
            ];
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, ...chunks] }) };
    },
  });
}
