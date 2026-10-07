// Downloads the two pinned fixtures. Counts in the tests were pinned on 2026-10-07;
// regenerating changes them, so only rerun this deliberately and update the counts.
import { mkdir, writeFile } from "node:fs/promises";

const FEED = "https://getdata-dycu.hub.arcgis.com/api/feed/dcat-us/1.1.json";
const XLSX =
  "https://docs.google.com/spreadsheets/d/1HoxLU8dRQmQegM3RMk1GFaJIenKBJCtkvaCi4_Jbosc/export?format=xlsx";

await mkdir("tests/fixtures", { recursive: true });

const feedRes = await fetch(FEED);
if (!feedRes.ok) throw new Error(`Hub feed ${feedRes.status}`);
const feed = await feedRes.json();
const slim = {
  dataset: feed.dataset.map((d) => ({
    title: d.title,
    identifier: d.identifier,
    landingPage: d.landingPage,
    description: d.description,
    keyword: d.keyword,
    modified: d.modified,
    distribution: (d.distribution ?? []).map((x) => ({
      format: x.format,
      accessURL: x.accessURL,
      downloadURL: x.downloadURL,
    })),
  })),
};
await writeFile("tests/fixtures/hub-catalog.json", JSON.stringify(slim));

const xlsxRes = await fetch(XLSX);
if (!xlsxRes.ok) throw new Error(`Inventory export ${xlsxRes.status}`);
const bytes = Buffer.from(await xlsxRes.arrayBuffer());
await writeFile("tests/fixtures/dycu-inventory.xlsx.json", JSON.stringify({ base64: bytes.toString("base64") }));

console.log(`hub items: ${slim.dataset.length}; inventory bytes: ${bytes.length}`);
