import "@/lib/ask/telemetry-off"; // first: before CopilotKit's runtime builds its telemetry client
import { auth } from "@clerk/nextjs/server";
import { BuiltInAgent, CopilotRuntime, createCopilotRuntimeHandler, defineTool } from "@copilotkit/runtime/v2";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { convexBackend } from "@/lib/ask/backend";
import { askModel, fakeAskModel, useFakeModel } from "@/lib/ask/model";
import { ASK_PROMPT } from "@/lib/ask/prompt";
import { askTools } from "@/lib/ask/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const RUN_ROUTE = "agent/run"; // confirmed in node_modules/@copilotkit/runtime/dist/v2/runtime/core/hooks.d.mts
const MAX_QUESTION_CHARS = 500;
// The whole conversation is re-sent with every question; this bounds what one question can cost (~16k tokens).
const MAX_BODY_BYTES = 64_000;

async function convexToken(): Promise<string | null> {
  const { getToken, sessionClaims, userId } = await auth();
  if (!userId) return null;
  return (sessionClaims?.aud === "convex" ? await getToken() : await getToken({ template: "convex" })) ?? null;
}

const copilotRuntime = new CopilotRuntime({
  agents: async ({ request }) => {
    const token = await convexToken();
    if (!token) throw new Response("Sign in to ask", { status: 401 });
    const settings = await fetchQuery(api.ask.askSettings, {});
    const secret = process.env.ASK_METER_SECRET ?? "";
    const meter = (u: { inputTokens: number; outputTokens: number }) => fetchMutation(api.ask.recordUsage, { secret, ...u }).then(() => undefined);
    const model = useFakeModel(request) ? fakeAskModel() : askModel(settings.askModel, meter);
    const tools = askTools(convexBackend(token)).map((t) => defineTool({ name: t.name, description: t.description, parameters: t.parameters, execute: t.execute }));
    return { default: new BuiltInAgent({ model, prompt: ASK_PROMPT, tools, maxSteps: 7, maxOutputTokens: 800, temperature: 0.2 }) };
  },
});

const handler = createCopilotRuntimeHandler({
  runtime: copilotRuntime,
  basePath: "/api/copilotkit",
  hooks: {
    onBeforeHandler: async ({ request, route }) => {
      // Suggestions would call the model outside the gate; Ask doesn't use them.
      if (route.method === "agent/suggest") throw new Response("Not found", { status: 404 });
      if (route.method !== RUN_ROUTE) return;
      const body = await request.clone().text();
      if (body.length > MAX_BODY_BYTES) throw new Response(JSON.stringify({ reason: "too-long" }), { status: 413 });
      const token = await convexToken();
      if (!token) throw new Response(JSON.stringify({ reason: "signed-out" }), { status: 401 });
      const messages: { role?: string; content?: unknown }[] = JSON.parse(body).messages ?? [];
      const asked = messages.filter((m) => m.role === "user");
      // Questions are plain text only: a document, image or file link would be fetched and read by the model.
      if (asked.some((m) => typeof m.content !== "string")) throw new Response(JSON.stringify({ reason: "text-only" }), { status: 400 });
      const lastUser = asked.at(-1);
      if (typeof lastUser?.content === "string" && lastUser.content.length > MAX_QUESTION_CHARS) throw new Response(JSON.stringify({ reason: "too-long" }), { status: 413 });
      // The scripted test model costs nothing, so its runs don't spend a test account's daily questions.
      if (useFakeModel(request)) return;
      const gate = await fetchMutation(api.ask.begin, {}, { token });
      if (!gate.ok) throw new Response(JSON.stringify(gate), { status: 429 });
    },
  },
});

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
