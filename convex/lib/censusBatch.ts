// The Census Bureau's batch geocoder: up to 10,000 addresses per request (we send at most 5,000), free, no key.
// One HTTP call, retried once; the caller keeps one request in flight at a time.
const BATCH = "https://geocoding.geo.census.gov/geocoder/geographies/addressbatch";
const RETRY_MS = 2000;

async function once(csv: string): Promise<{ ok: true; text: string } | { ok: false; why: string }> {
  try {
    const form = new FormData();
    form.append("addressFile", new Blob([csv], { type: "text/csv" }), "batch.csv");
    form.append("benchmark", "Public_AR_Current");
    form.append("vintage", "Current_Current");
    const res = await fetch(BATCH, { method: "POST", body: form });
    return res.ok ? { ok: true, text: await res.text() } : { ok: false, why: String(res.status) };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  }
}

export async function geocodeBatch(csv: string): Promise<string> {
  const first = await once(csv);
  if (first.ok) return first.text;
  await new Promise((r) => setTimeout(r, RETRY_MS));
  const second = await once(csv);
  if (second.ok) return second.text;
  throw new Error(`Census geocoder failed: ${second.why}`);
}
