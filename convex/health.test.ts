/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HC_ROWS, HC_TOPICS_PAGE } from "../tests/fixtures/healthCompass";
import { api } from "./_generated/api";
import { healthTargets } from "./lib/healthCompass";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
beforeEach(() => vi.stubEnv("HEALTH_PUSH_SECRET", SECRET));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const auth = { authorization: `Bearer ${SECRET}` };
// What the Hetzner script posts: Health Compass's own answers, whole-population rows only, for every place asked for.
const upload = (extra: (geo: string) => unknown[] = () => []) => ({
  topics: [HC_TOPICS_PAGE],
  places: healthTargets().map(({ layer, geo }) => ({ layer, geo, data: { results: [...HC_ROWS.filter((r) => r.g === geo), ...extra(geo)] } })),
});
const post = (t: ReturnType<typeof convexTest>, body: unknown, headers: Record<string, string> = auth) =>
  t.fetch("/health-compass", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const places = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("healthPlaces").collect());
const status = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("healthRefresh").first());

describe("the Health Compass upload (the download runs on Hetzner; decision 050)", () => {
  it("refuses anyone without the secret, and works only when a secret is set", async () => {
    const t = convexTest(schema, modules);
    expect((await t.fetch("/health-compass/targets")).status).toBe(401);
    expect((await post(t, upload(), { authorization: "Bearer wrong" })).status).toBe(401);
    vi.stubEnv("HEALTH_PUSH_SECRET", "");
    expect((await post(t, upload(), { authorization: "Bearer " })).status).toBe(401);
    expect(await places(t)).toHaveLength(0);
  });
  it("tells the script which places to fetch", async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch("/health-compass/targets", { headers: auth });
    const body = (await res.json()) as { places: { layer: string; geo: string }[] };
    expect(body.places).toHaveLength(39);
    expect(body.places).toContainEqual({ layer: "county", geo: "55079" });
    expect(body.places).toContainEqual({ layer: "place", geo: "5553000" });
  });
  it("stores one row per place and only topics with a ZIP figure", async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, upload());
    expect(await res.json()).toEqual({ ok: true, places: 39, topics: 2 });
    const all = await places(t);
    expect(all).toHaveLength(39);
    expect(all.find((p) => p.geo === "53208")!.figures.find((f: { topic: string }) => f.topic === "MQ35")).toMatchObject({ period: "2024", se: expect.any(Number) });
    expect((await t.run((ctx) => ctx.db.query("healthTopics").collect())).map((x) => x.key).sort()).toEqual(["MQ35", "POV"]);
    expect(await status(t)).toMatchObject({ status: "read", places: 39 });
  });
  it("picks the county's figure from the ZIPs' own period when it has one (review I1)", async () => {
    const t = convexTest(schema, modules);
    await post(t, upload((geo) => (geo === "55079" ? [{ g: "55079", l: "county", a: "POV", p: "", d: "2021-2025", v: 99, se: 1 }] : [])));
    const county = (await places(t)).find((p) => p.geo === "55079")!;
    expect(county.figures.find((f: { topic: string }) => f.topic === "POV")).toMatchObject({ period: "2020-2024" });
  });
  it("refuses a changed shape, keeps last week's copy and says why (review focus 1)", async () => {
    const t = convexTest(schema, modules);
    await post(t, upload());
    const bad = upload();
    bad.places[0].data = { results: [{ g: "53208", v: "9.7" }] } as never;
    const res = await post(t, bad);
    expect(res.status).toBe(400);
    expect(await places(t)).toHaveLength(39);
    expect(await status(t)).toMatchObject({ status: "failed", note: "Health Compass figures changed shape", places: 39 });
  });
  it("refuses an upload missing a place, rather than storing a partial week", async () => {
    const t = convexTest(schema, modules);
    const partial = upload();
    partial.places = partial.places.filter((p) => p.geo !== "53208");
    expect((await post(t, partial)).status).toBe(400);
    expect(await status(t)).toMatchObject({ status: "failed", note: "Health Compass upload is missing 53208" });
  });
  it("records the script's own failure, keeping last week's copy", async () => {
    const t = convexTest(schema, modules);
    await post(t, upload());
    const res = await post(t, { error: "Health Compass request failed: 403" });
    expect(await res.json()).toEqual({ ok: false, stored: false });
    expect(await places(t)).toHaveLength(39);
    expect(await status(t)).toMatchObject({ status: "failed", note: "Health Compass download failed: Health Compass request failed: 403" });
  });
});

describe("zipHealth", () => {
  it("answers from the stored copy, with no outside request", async () => {
    const t = convexTest(schema, modules);
    await post(t, upload());
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => { seen.push(String(u)); return new Response("{}", { status: 500 }); });
    const r = await t.query(api.health.zipHealth, { mode: "one", measure: "Poverty rate", zip: "53208" });
    expect(r).toMatchObject({ status: "ok", mode: "one", zip: { zip: "53208" } });
    expect(seen).toEqual([]);
  });
  it("says the figures aren't loaded yet before the first upload", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.health.zipHealth, { mode: "rank", measure: "Poverty rate" })).toEqual({ status: "unavailable" });
  });
});
