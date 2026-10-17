import { test } from "node:test";
import assert from "node:assert/strict";
import { toData } from "../scripts/snapshot-lib.mjs";

const sheet = {
  status: "ok", name: "Riverwest", period: "2019–2023",
  headlines: [{ id: "poverty", label: "Poverty", verdict: "higher", hood: { rate: { estimate: 0.31, moe: 0.04 } }, city: { rate: { estimate: 0.24, moe: 0.01 } } }],
};
const robbery = { status: "ok", name: "Crime (NIBRS)", filters: ["Robbery"], period: "2026 so far", area: "Harambee", count: 42 };

test("keeps only what the video shows", () => {
  assert.deepEqual(toData({ sheet, robbery, asOf: "2026-10-16" }), {
    asOf: "2026-10-16",
    riverwest: { name: "Riverwest", label: "Poverty", period: "2019–2023", rate: { estimate: 0.31, moe: 0.04 }, city: { estimate: 0.24, moe: 0.01 }, verdict: "clearly higher than the city" },
    robbery: { count: 42, caption: "Crime (NIBRS) · Robbery · 2026 so far · In Harambee" },
  });
});

test("a zero count is a real answer", () => {
  assert.equal(toData({ sheet, robbery: { ...robbery, count: 0 }, asOf: "2026-10-16" }).robbery.count, 0);
});

test("refuses when the City is busy", () => {
  assert.throws(() => toData({ sheet, robbery: { status: "busy" }, asOf: "2026-10-16" }), /Robbery count not ok: busy/);
});

test("refuses a small or missing sheet", () => {
  assert.throws(() => toData({ sheet: { status: "small" }, robbery, asOf: "2026-10-16" }), /sheet not ok/);
  assert.throws(() => toData({ sheet: { ...sheet, headlines: [] }, robbery, asOf: "2026-10-16" }), /poverty rate missing/);
});

test("refuses a verdict it has no words for", () => {
  assert.throws(() => toData({ sheet: { ...sheet, headlines: [{ ...sheet.headlines[0], verdict: "unknown" }] }, robbery, asOf: "2026-10-16" }), /No verdict/);
});
