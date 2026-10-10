"use client";
import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { CountResult } from "@/lib/ask/tools";
import { CityMap } from "./CityMapLoader";
import styles from "./map.module.css";

type What = { column: string; options: { value: string; label: string }[] } | null;
const isoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

// WHERE: the dataset's records as quarter-mile areas, filtered by what, when and where. The filters live in the
// address so a map can be shared. Anyone can use it (the server caches and caps City queries).
export function SheetWhere({ code, what }: { code: string; what: What }) {
  const run = useAction(api.map.mapCells);
  const names = useQuery(api.map.cityNeighborhoodNames, {}) ?? [];
  const read = (k: string) => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get(k) ?? "");
  const [type, setType] = useState(read("type"));
  const [when, setWhen] = useState(read("from") ? "custom" : "12m");
  const [from, setFrom] = useState(read("from"));
  const [to, setTo] = useState(read("to"));
  const [area, setArea] = useState(read("area"));
  const [result, setResult] = useState<CountResult | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries({ type, from: when === "custom" ? from : "", to: when === "custom" ? to : "", area })) v ? q.set(k, v) : q.delete(k);
    // Only rewrite the address when a filter changed it: on a laptop this sheet's own address is about to be replaced by the two-pane view.
    if (q.toString() !== window.location.search.slice(1)) window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      const year = isoToday().slice(0, 4);
      const r = await run({
        code,
        from: when === "year" ? `${year}-01-01` : when === "custom" ? from || undefined : undefined,
        to: when === "custom" ? to || undefined : undefined,
        filters: type && what ? [{ column: what.column, values: [type] }] : undefined,
        neighborhood: area || undefined,
      });
      if (mine === seq.current) setResult(r); // only the newest request may draw
    }, 250);
    return () => window.clearTimeout(t);
  }, [code, type, when, from, to, area, run, what]);

  return (
    <div className={styles.where} data-sheet-where>
      <div className={styles.filters}>
        {what && (
          <label>What
            <select value={type} onChange={(e) => setType(e.target.value)} data-filter="what">
              <option value="">All</option>
              {what.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
        <label>When
          <select value={when} onChange={(e) => setWhen(e.target.value)} data-filter="when">
            <option value="12m">Last 12 months</option><option value="year">This year</option><option value="custom">From – to</option>
          </select>
        </label>
        {when === "custom" && (<><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></>)}
        <label>Where
          <input list="city-neighborhoods" value={area} placeholder="Whole city" onChange={(e) => setArea(e.target.value)} data-filter="where" />
          <datalist id="city-neighborhoods">{names.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
      </div>
      <WhereResult r={result} />
    </div>
  );
}

function WhereResult({ r }: { r: CountResult | null }) {
  if (!r) return <p className={styles.message} data-map-message>Loading map…</p>;
  if (r.status === "busy") return <p className={styles.message} data-map-message>The map is busy; try again in a minute.</p>;
  if (r.status === "unavailable") return <p className={styles.message} data-map-message>The City&apos;s data didn&apos;t respond. Try again shortly.</p>;
  if (r.status === "too-broad") return <p className={styles.message} data-map-message>Too many records in this area; try a shorter period.</p>;
  if (r.status === "no-neighborhood") return <p className={styles.message} data-map-message>No City neighborhood is called &ldquo;{r.asked}&rdquo;.{r.nearest.length ? ` Nearest: ${r.nearest.join(", ")}.` : ""}</p>;
  if (r.status === "outside-coverage") return <p className={styles.message} data-map-message>Outside the data&apos;s range ({r.coverage}).</p>;
  if (r.status !== "ok") return <p className={styles.message} data-map-message>Pick a neighborhood from the list.</p>;
  return (
    <>
      <p className={styles.figure} data-where-count>{r.count.toLocaleString("en-US")} records · {r.period}{r.area ? ` · In ${r.area}` : ""}</p>
      <CityMap cells={r.map} count={r.count} boundary={r.map?.area ?? null} height={420} />
    </>
  );
}
