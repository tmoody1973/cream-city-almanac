// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
const convex = vi.hoisted(() => ({ begin: vi.fn(), calls: [] as string[] }));
const models = vi.hoisted(() => ({ built: 0 }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId, sessionClaims: { aud: "convex" }, getToken: async () => (clerk.userId ? "token" : null) }),
}));
vi.mock("convex/nextjs", () => ({
  fetchMutation: async (_ref: unknown, args: unknown) => {
    convex.calls.push("mutation");
    return convex.begin(args);
  },
  fetchQuery: async () => ({ askModel: "anthropic/claude-sonnet-5.5" }),
  fetchAction: async () => ({}),
}));
vi.mock("@/lib/ask/model", async (original) => {
  const real = await original<typeof import("@/lib/ask/model")>();
  return { ...real, askModel: (...a: Parameters<typeof real.askModel>) => (models.built++, real.fakeAskModel()) };
});

const { POST } = await import("../../app/api/copilotkit/[[...slug]]/route");
const run = (body: unknown, path = "agent/default/run") =>
  POST(new Request(`http://localhost/api/copilotkit/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
let n = 0;
const question = (content: unknown) => ({ threadId: `t${++n}`, runId: `r${n}`, messages: [{ id: "m1", role: "user", content }], tools: [], context: [], state: {}, forwardedProps: {} });

beforeEach(() => {
  clerk.userId = "user_1";
  convex.begin.mockReset().mockResolvedValue({ ok: true });
  convex.calls = [];
  models.built = 0;
});

describe("Ask route gate", () => {
  it("refuses a signed-out run without asking the gatekeeper", async () => {
    clerk.userId = null;
    const res = await run(question("How many kids?"));
    expect(res.status).toBe(401);
    expect(convex.begin).not.toHaveBeenCalled();
  });
  it("refuses a run over the limit before any model is built", async () => {
    convex.begin.mockResolvedValue({ ok: false, reason: "limit" });
    const res = await run(question("How many kids?"));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ reason: "limit" });
    expect(models.built).toBe(0);
  });
  it("blocks the suggestions route, which would call the model outside the gate", async () => {
    expect((await run(question("x"), "agent/default/suggest")).status).toBe(404);
  });
  it("refuses a question that isn't plain text (a document or image link)", async () => {
    const res = await run(question([{ type: "document", source: { type: "url", value: "https://example.com/huge.pdf" } }]));
    expect(res.status).toBe(400);
    expect(convex.begin).not.toHaveBeenCalled();
  });
  it("refuses an oversized request before the gatekeeper", async () => {
    const long = { ...question("x"), messages: Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user", content: "word ".repeat(100) })) };
    expect((await run(long)).status).toBe(413);
    expect(convex.begin).not.toHaveBeenCalled();
  });
  it("turns CopilotKit's telemetry off before its runtime loads", () => {
    expect(process.env.COPILOTKIT_TELEMETRY_DISABLED).toBe("true");
  });
  it("answers a malformed request with 400, not a server error", async () => {
    expect((await run("{not json")).status).toBe(400);
    expect(convex.begin).not.toHaveBeenCalled();
  });
  it("measures the size cap in bytes, so multi-byte text can't slip past it", async () => {
    // 22k three-byte characters in an earlier reply: ~22k characters, ~66 KB on the wire; the question itself is short.
    const body = { ...question("hi"), messages: [{ id: "a0", role: "assistant", content: "€".repeat(22_000) }, { id: "m1", role: "user", content: "hi" }] };
    expect((await run(body)).status).toBe(413);
  });
  it("refuses a question over 500 characters", async () => {
    expect((await run(question("x".repeat(501)))).status).toBe(413);
  });
});
