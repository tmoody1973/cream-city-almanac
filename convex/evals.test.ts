/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { installFakeFetch } from "../tests/helpers/fakeFetch";
import { fixtureFamilies } from "../tests/helpers/fixtures";
import { internal } from "./_generated/api";
import { toFamilyInput } from "./lib/families";
import { QUESTIONS } from "./lib/evalQuestions";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

beforeEach(() => vi.stubEnv("AI_GATEWAY_API_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("searchReportCard", () => {
  it("grades every question and lists misses", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    installFakeFetch({ embeddingsStatus: 500 });
    const buildId = await t.mutation(internal.buildStore.beginBuild, {});
    await t.mutation(internal.buildStore.swapCatalog, {
      buildId,
      families: fixtureFamilies().map((f) => toFamilyInput(f, null)),
      dictionaries: [],
    });
    const report = await t.action(internal.evals.searchReportCard, {});
    expect(report.total).toBe(QUESTIONS.length);
    expect(report.passed + report.misses.length).toBe(report.total);
    expect(report.rate).toBeCloseTo(report.passed / report.total);
  });

  it("never spends the public search cap and reports any keyword-only answers", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const fake = installFakeFetch();
    const buildId = await t.mutation(internal.buildStore.beginBuild, {});
    await t.mutation(internal.buildStore.swapCatalog, {
      buildId,
      families: fixtureFamilies().map((f) => toFamilyInput(f, null)),
      dictionaries: [],
    });
    // Four runs need 104 searches, more than the public burst of 100.
    for (let run = 0; run < 4; run++) {
      const report = await t.action(internal.evals.searchReportCard, {});
      expect(report.degraded).toBe(0);
    }
    expect(fake.count("/v1/embeddings")).toBe(4 * QUESTIONS.length);
  }, 60_000);
});
