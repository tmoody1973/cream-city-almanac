import { gateway, wrapLanguageModel, simulateReadableStream, type LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";

type Meter = (u: { inputTokens: number; outputTokens: number }) => Promise<void>;

// The real model, through the AI Gateway, metered after every step.
export function askModel(id: string, meter: Meter): LanguageModel {
  return wrapLanguageModel({
    model: gateway(id),
    middleware: {
      specificationVersion: "v3",
      wrapStream: async ({ doStream }) => {
        const r = await doStream();
        const stream = r.stream.pipeThrough(
          new TransformStream({
            async transform(part, controller) {
              if (part.type === "finish") await meter({ inputTokens: part.usage.inputTokens.total ?? 0, outputTokens: part.usage.outputTokens.total ?? 0 });
              controller.enqueue(part);
            },
          }),
        );
        return { ...r, stream };
      },
    },
  });
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
// "poverty" → getNumber (Harambee); "air" → previewData V02; "report" → readReport; "unverified" → a reply with a figure; else searchCatalog.
export function fakeAskModel(): LanguageModel {
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      // This turn has a tool result once the newest message is one (earlier turns' results don't count).
      const answered = prompt.at(-1)?.role === "tool";
      const question = JSON.stringify(prompt.filter((m) => m.role === "user").at(-1) ?? "").toLowerCase();
      if (!answered && question.includes("fail")) throw new Error("fake failure");
      const chunks = answered
        ? [...text("Here is what the data shows."), finish("stop")]
        : question.includes("unverified")
          ? [...text("There are 608 children."), finish("stop")]
          : [
              question.includes("poverty")
                ? call("getNumber", { neighborhood: "Harambee", topic: "Poverty Status by Age", row: "Under 5 years" })
                : question.includes("air")
                  ? call("previewData", { code: "V02" })
                  : question.includes("report")
                    ? call("readReport", { question: "Harambee housing" })
                    : call("searchCatalog", { query: "asthma" }),
              finish("tool-calls"),
            ];
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, ...chunks] }) };
    },
  });
}
