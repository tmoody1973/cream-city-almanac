import { fetchWithTimeout } from "./http";

export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";
const EMBED_TIMEOUT_MS = 60_000;
const CHAT_TIMEOUT_MS = 120_000;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export function gatewayKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not set (run: npx convex env set AI_GATEWAY_API_KEY <key>)");
  return key;
}

async function post(path: string, body: unknown, key: string, timeoutMs: number): Promise<any> {
  const res = await fetchWithTimeout(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);
  if (!res.ok) throw new Error(`AI Gateway ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function embed(texts: string[], model: string, key: string): Promise<{ vectors: number[][]; tokens: number }> {
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += 64) {
    const body = await post("/embeddings", { model, input: texts.slice(i, i + 64) }, key, EMBED_TIMEOUT_MS);
    const data: { index: number; embedding: number[] }[] = [...(body.data ?? [])].sort((a, b) => a.index - b.index);
    vectors.push(...data.map((d) => d.embedding));
    tokens += body.usage?.prompt_tokens ?? 0;
  }
  if (vectors.length !== texts.length) throw new Error(`Expected ${texts.length} embeddings, got ${vectors.length}`);
  return { vectors, tokens };
}

export async function chatJson(
  args: { model: string; system: string; user: string; schemaName: string; schema: object; maxTokens: number },
  key: string,
): Promise<{ value: unknown; usage: Usage }> {
  const body = await post(
    "/chat/completions",
    {
      model: args.model,
      max_tokens: args.maxTokens,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: args.schemaName, schema: args.schema, strict: true } },
    },
    key,
    CHAT_TIMEOUT_MS,
  );
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI Gateway returned no message content");
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`AI returned invalid JSON: ${content.slice(0, 200)}`);
  }
  return {
    value,
    usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
  };
}

export function costUsd(u: Usage, inPrice: number, outPrice: number): number {
  return u.inputTokens * inPrice + u.outputTokens * outPrice;
}

// ponytail: 4 chars/token estimate, used only to reserve budget before a call; settled with real usage after.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
