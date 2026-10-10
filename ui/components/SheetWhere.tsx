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
  const names = useQuery(api.map.cityNeighborhoodNames, {});
  // The server renders the defaults (the sheet page is cached and has no address); the shared address is read once on mount.
  const [type, setType] = useState("");
  const [when, setWhen] = useState("12m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [area, setArea] = useState("");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const seq = useRef(0);
  // Only a whole neighborhood name is sent (a half-typed one would spend a request on a refusal); undefined while
  // the list loads or when nothing matches.
  const typed = area.trim().toLowerCase();
  const place = typed ? names?.find((n) => n.toLowerCase() === typed) : "";
  const unknownPlace = Boolean(typed) && names !== undefined && !place;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const w = q.get("when");
    // A shared type that isn't one of What's options is dropped, so the select (All) and the request agree.
    const shared = q.get("type") ?? "";
    setType(what?.options.some((o) => o.value === shared) ? shared : "");
    setWhen(w === "year" || w === "custom" ? w : q.get("from") ? "custom" : "12m");
    setFrom(q.get("from") ?? "");
    setTo(q.get("to") ?? "");
    setArea(q.get("area") ?? "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return; // until the address has been read, writing it would wipe a shared map's filters
    const q = new URLSearchParams(window.location.search);
    const wanted = { type, when: when === "12m" ? "" : when, from: when === "custom" ? from : "", to: when === "custom" ? to : "", area };
    for (const [k, v] of Object.entries(wanted)) v ? q.set(k, v) : q.delete(k);
    // Only rewrite the address when a filter changed it: on a laptop this sheet's own address is about to be replaced by the two-pane view.
    if (q.toString() !== window.location.search.slice(1)) window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
    const mine = ++seq.current;
    if (place === undefined) { setPending(false); return; } // no request until the name is a whole one from the list
    setPending(true);
    const t = window.setTimeout(async () => {
      const year = isoToday().slice(0, 4);
      let r: CountResult;
      try {
        r = await run({
          code,
          from: when === "year" ? `${year}-01-01` : when === "custom" ? from || undefined : undefined,
          to: when === "custom" ? to || undefined : undefined,
          filters: type && what ? [{ column: what.column, values: [type] }] : undefined,
          neighborhood: place || undefined,
        });
      } catch {
        r = { status: "unavailable" } as CountResult;
      }
      if (mine !== seq.current) return; // only the newest request may draw
      setResult(r);
      setPending(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [ready, code, type, when, from, to, area, place, run, what]);

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
          <datalist id="city-neighborhoods">{(names ?? []).map((n) => <option key={n} value={n} />)}</datalist>
        </label>
      </div>
      <div aria-busy={pending}>{unknownPlace ? <p className={styles.message} data-map-message>Pick a neighborhood from the list.</p> : <WhereResult r={result} />}</div>
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
  if (r.status === "bad-dates") return <p className={styles.message} data-map-message>From must be on or before To.</p>;
  if (r.status === "choose" && r.column === "neighborhood") return <p className={styles.message} data-map-message>Pick a neighborhood from the list.</p>;
  if (r.status === "choose" || r.status === "bad-column") return <p className={styles.message} data-map-message>Pick a type from the list.</p>;
  if (r.status !== "ok") return <p className={styles.message} data-map-message>This dataset can&apos;t be mapped.</p>;
  return (
    <>
      <p className={styles.figure} data-where-count>{r.count.toLocaleString("en-US")} records · {r.period}{r.area ? ` · In ${r.area}` : ""}</p>
      <CityMap cells={r.map} count={r.count} boundary={r.map?.area ?? null} height={420} />
    </>
  );
}
