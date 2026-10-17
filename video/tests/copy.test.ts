import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { COPY } from "../src/copy.ts";

const spec = readFileSync(new URL("../../docs/superpowers/specs/2026-10-16-explainer-video-design.md", import.meta.url), "utf8");
const rows = new Map([...spec.matchAll(/^\| ([A-Z]\d+a?) \| (.+?) \| (.+?) \|$/gm)].map((m) => [m[1], m[2]]));

test("on-screen copy is exactly the spec's claims table", () => {
  assert.deepEqual(Object.keys(COPY).sort(), [...rows.keys()].sort());
  for (const [id, c] of Object.entries(COPY)) assert.equal(c.text, rows.get(id), id);
});

test("no number in the copy except the years the site states", () => {
  for (const [id, c] of Object.entries(COPY)) for (const d of c.text.match(/\d+/g) ?? []) assert.ok(["2005", "2015"].includes(d), `${id}: ${d}`);
});

test("scenes put no literal text on screen", () => {
  const dir = new URL("../src/scenes/", import.meta.url);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
    assert.doesNotMatch(readFileSync(new URL(f, dir), "utf8"), />[^<>{}\n]*[A-Za-z][^<>{}\n]*</, f);
  }
});
