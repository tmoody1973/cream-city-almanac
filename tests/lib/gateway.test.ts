import { afterEach, describe, expect, it, vi } from "vitest";
import { chatJson, costUsd, embed } from "../../convex/lib/gateway";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("embed", () => {
  it("batches 64 inputs per call, restores order and sums tokens", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const input: string[] = JSON.parse(String(init.body)).input;
      const data = input.map((t, index) => ({ index, embedding: [t.length] })).reverse();
      return json(200, { data, usage: { prompt_tokens: input.length } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const texts = Array.from({ length: 70 }, (_, i) => "x".repeat(i + 1));
    const { vectors, tokens } = await embed(texts, "openai/text-embedding-3-small", "key");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vectors.map((v) => v[0])).toEqual(texts.map((t) => t.length));
    expect(tokens).toBe(70);
    expect(fetchMock.mock.calls[0][0]).toBe("https://ai-gateway.vercel.sh/v1/embeddings");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer key");
  });

  it("reports the HTTP status on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(429, { error: "slow down" })));
    await expect(embed(["a"], "m", "key")).rejects.toThrow("AI Gateway /embeddings 429");
  });
});

describe("timeouts", () => {
  it("gives up on a hung embeddings request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const assertion = expect(embed(["a"], "m", "key")).rejects.toThrow("Timed out");
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
  });
});

describe("chatJson", () => {
  it("requests strict JSON-schema output and parses the reply", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      json(200, { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await chatJson({ model: "anthropic/claude-sonnet-5.5", system: "s", user: "u", schemaName: "x", schema: { type: "object" }, maxTokens: 50 }, "key");
    expect(out).toEqual({ value: { ok: true }, usage: { inputTokens: 10, outputTokens: 5 } });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "x", schema: { type: "object" }, strict: true } });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  });

  it("says plainly when the reply was cut off by the token limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(200, { choices: [{ finish_reason: "length", message: { content: '{"explainer":"This dataset' } }] })),
    );
    await expect(chatJson({ model: "m", system: "s", user: "u", schemaName: "x", schema: {}, maxTokens: 5 }, "k")).rejects.toThrow(
      "AI reply was cut off at the 5-token limit",
    );
  });

  it("throws on non-JSON content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { choices: [{ message: { content: "not json" } }] })));
    await expect(chatJson({ model: "m", system: "s", user: "u", schemaName: "x", schema: {}, maxTokens: 5 }, "k")).rejects.toThrow("invalid JSON");
  });
});

describe("costUsd", () => {
  it("prices input and output tokens", () => {
    expect(costUsd({ inputTokens: 1_000_000, outputTokens: 100_000 }, 0.000002, 0.00001)).toBeCloseTo(3);
  });
});
