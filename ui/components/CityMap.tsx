"use client";
import { useQuery } from "convex/react";
// MapLibre 6 has no default export: named imports only.
import { GeoJSONSource, Map as MapLibreMap, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { MapData } from "@/convex/lib/cityMap";
import { escapeHtml, fetchLayer, labelFields } from "@/ui/lib/arcgisLayer";
import { cellPopupText, cellsToGeoJSON, SOLID_OPACITY, summarySentence } from "@/ui/lib/mapCells";
import { geojsonBounds, tractShapesUrl } from "@/ui/lib/tractShapes";
import { useNight } from "@/ui/lib/useNight";
import styles from "./map.module.css";

// MapLibre 6 looks for its worker beside its own bundle, which Next relocates (404, so no layer ever drew): serve it from public/.
// public/maplibre holds copies of the installed version's worker files; tests/ui/maplibreWorker.test.ts catches drift.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const STYLE = { day: "https://tiles.openfreemap.org/styles/positron", night: "https://tiles.openfreemap.org/styles/dark" };
const MILWAUKEE: [[number, number], [number, number]] = [[-88.07, 42.92], [-87.86, 43.2]];
const INK = { day: "#111111", night: "#ecebe6" };
const PENCIL = { day: "#d7261e", night: "#ff6b5e" };
const LAYER_IDS = ["layer-fill", "layer-outline", "layer-line", "layer-dot"];
const CELL_IDS = ["b1", "b2", "b3"];

// Hatching drawn in the edition's ink: 1–4 diagonal, 5–19 crossed. Patterns read without relying on faint shades.
function pattern(color: string, crossed: boolean, size: number): ImageData {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  x.strokeStyle = color; x.lineWidth = 2; x.beginPath();
  x.moveTo(0, size); x.lineTo(size, 0); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(size - 2, size + 2); x.lineTo(size + 2, size - 2);
  if (crossed) { x.moveTo(0, 0); x.lineTo(size, size); x.moveTo(-2, size - 2); x.lineTo(2, size + 2); x.moveTo(size - 2, -2); x.lineTo(size + 2, 2); }
  x.stroke();
  return x.getImageData(0, 0, size, size);
}

const TRACT_IDS = ["tracts-fit", "tracts-line"];
export type TractShapes = { url: string; fits: string[]; close: string[] };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const tractSummary = ({ fits, close }: TractShapes) =>
  fits.length ? `Map of ${plural(fits.length, "highlighted tract")}${close.length ? `, ${close.length} close` : ""}` : `Map of ${plural(close.length, "close tract")}`;
type Props = { cells?: MapData | null; count?: number; boundary?: string | null; layer?: { url: string; name: string } | null; tracts?: TractShapes | null; height?: number; after?: string };

export default function CityMap({ cells = null, count = 0, boundary = null, layer = null, tracts = null, height = 260, after }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const fig = useRef<HTMLElement>(null); // carries data-drawn="day|night" once the cells and boundary are on the current style
  const map = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false); // true while the current style is fully loaded (isStyleLoaded() also goes false while tiles load)
  const styleEdition = useRef<"day" | "night">("day"); // the edition the map's current style was requested for
  const night = useNight();
  const shape = useQuery(api.map.cityShape, boundary ? { name: boundary } : "skip");
  const [tiles, setTiles] = useState(true);
  const [layerNote, setLayerNote] = useState<string | null>(null);
  const [tractNote, setTractNote] = useState<string | null>(null);
  const [tractData, setTractData] = useState<GeoJSON.FeatureCollection | null>(null);
  const tractsNow = useRef(tracts);
  const tractsFitted = useRef(false);
  tractsNow.current = tracts;
  const tractKey = tracts ? [tracts.url, tracts.fits.join(","), tracts.close.join(",")].join("|") : ""; // by value: a re-render with the same tracts must not refetch
  const summary = cells ? summarySentence(cells, count) : tracts ? tractSummary(tracts) : null;
  const edition: "day" | "night" = night ? "night" : "day";
  const editionNow = useRef(edition);
  editionNow.current = edition;

  useEffect(() => {
    if (!box.current) return;
    styleEdition.current = editionNow.current;
    const m = new MapLibreMap({ container: box.current, style: STYLE[editionNow.current], bounds: MILWAUKEE, cooperativeGestures: true, attributionControl: { compact: true } });
    m.on("style.load", () => { loaded.current = true; });
    m.on("error", (e) => { if (String(e.error?.message ?? "").includes("tiles.openfreemap.org")) setTiles(false); });
    map.current = m;
    return () => { m.remove(); map.current = null; loaded.current = false; };
  }, []);

  // One effect owns the style and what we draw on it: a style swap drops every custom layer, so after a
  // day/night switch we draw on the new style's `style.load`; when only the data changes we redraw in place.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const ink = INK[edition], pen = PENCIL[edition];
      for (const id of ["b1", "b2", "b3", "edge", "boundary"]) if (m.getLayer(id)) m.removeLayer(id);
      for (const id of ["cells", "boundary"]) if (m.getSource(id)) m.removeSource(id);
      for (const id of ["hatch", "cross"]) if (m.hasImage(id)) m.removeImage(id);
      m.addImage("hatch", pattern(ink, false, 8));
      m.addImage("cross", pattern(ink, true, 8));
      if (cells) {
        m.addSource("cells", { type: "geojson", data: cellsToGeoJSON(cells) });
        m.addLayer({ id: "b1", type: "fill", source: "cells", filter: ["==", ["get", "band"], 1], paint: { "fill-pattern": "hatch" } });
        m.addLayer({ id: "b2", type: "fill", source: "cells", filter: ["==", ["get", "band"], 2], paint: { "fill-pattern": "cross" } });
        m.addLayer({ id: "b3", type: "fill", source: "cells", filter: ["==", ["get", "band"], 3], paint: { "fill-color": ink, "fill-opacity": SOLID_OPACITY } });
        m.addLayer({ id: "edge", type: "line", source: "cells", paint: { "line-color": ink, "line-width": 1 } });
      }
      if (shape) {
        m.addSource("boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: JSON.parse(shape.geometry) } });
        m.addLayer({ id: "boundary", type: "line", source: "boundary", paint: { "line-color": pen, "line-width": 3 } });
        m.fitBounds([[shape.bbox.minLon, shape.bbox.minLat], [shape.bbox.maxLon, shape.bbox.maxLat]], { padding: 24, duration: 0 });
      }
      if (fig.current) fig.current.dataset.drawn = edition; // only after the layers above were added
    };
    if (styleEdition.current !== edition) {
      styleEdition.current = edition;
      loaded.current = false;
      delete fig.current?.dataset.drawn; // the old style's drawing is gone until draw() runs again
      m.once("style.load", draw);
      m.setStyle(STYLE[edition]);
    } else if (loaded.current) draw();
    else m.once("style.load", draw);
    return () => { m.off("style.load", draw); };
  }, [cells, shape, edition]);

  // A square says its count on hover (pointer) or tap: from 5 up the number, below that the "1–4" band. Never an address.
  // Listeners bound to layer ids survive a style swap, so this is registered once for the map's life.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pop = new Popup({ closeButton: false, closeOnClick: false });
    const show = (e: { features?: { properties?: Record<string, unknown> | null }[]; lngLat: { lng: number; lat: number } }) => {
      const label = e.features?.[0]?.properties?.label;
      if (typeof label === "string") pop.setLngLat(e.lngLat).setText(cellPopupText(label)).addTo(m);
    };
    const hide = () => pop.remove();
    // A tap elsewhere on the map dismisses it (touch has no mouseleave).
    const away = (e: { point: { x: number; y: number } }) => { if (m.getLayer("b1") && !m.queryRenderedFeatures(e.point as never, { layers: CELL_IDS.filter((id) => m.getLayer(id)) }).length) pop.remove(); };
    m.on("mousemove", CELL_IDS, show);
    m.on("click", CELL_IDS, show);
    m.on("mouseleave", CELL_IDS, hide);
    m.on("click", away);
    return () => { m.off("mousemove", CELL_IDS, show); m.off("click", CELL_IDS, show); m.off("mouseleave", CELL_IDS, hide); m.off("click", away); pop.remove(); };
  }, []);

  // City map layers: fetched by the browser for the visible area only.
  // Drawn after the style is ready, and again after a style swap (which drops them); the draw effect leaves them alone.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let cancelled = false;
    let timer: number | undefined;
    let inFlight: AbortController | undefined; // only the newest view's request may draw; older ones are cancelled
    let popup: Popup | undefined;
    const load = async () => {
      inFlight?.abort();
      const ctl = new AbortController();
      inFlight = ctl;
      if (!layer) {
        for (const id of LAYER_IDS) if (m.getLayer(id)) m.removeLayer(id);
        if (m.getSource("layer")) m.removeSource("layer");
        setLayerNote(null);
        return;
      }
      let r: Awaited<ReturnType<typeof fetchLayer>>;
      try {
        r = await fetchLayer(layer.url, m.getBounds().toArray() as [[number, number], [number, number]], ctl.signal);
      } catch {
        return; // cancelled by a newer view or by cleanup
      }
      if (cancelled || ctl.signal.aborted) return;
      setLayerNote(r.status === "ok" ? null : r.status === "too-many" ? `Zoom in to see ${layer.name}.` : "This City map layer isn't responding.");
      const data = r.status === "ok" ? r.data : { type: "FeatureCollection" as const, features: [] };
      const src = m.getSource("layer") as GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        const ink = INK[edition];
        m.addSource("layer", { type: "geojson", data });
        // An invisible fill makes a click anywhere inside a zone pick it; the outline is what shows.
        m.addLayer({ id: "layer-fill", type: "fill", source: "layer", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ink, "fill-opacity": 0 } });
        m.addLayer({ id: "layer-outline", type: "line", source: "layer", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": ink, "line-width": 1 } });
        m.addLayer({ id: "layer-line", type: "line", source: "layer", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": ink, "line-width": 2 } });
        m.addLayer({ id: "layer-dot", type: "circle", source: "layer", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": ink, "circle-radius": 3 } });
      }
    };
    const onMove = () => { window.clearTimeout(timer); timer = window.setTimeout(load, 300); };
    m.on("moveend", onMove);
    // A click on a shape labels it with up to six of the City's own fields. A click handler bound to layer ids stays
    // registered across a style swap, so it works again once the layers are re-added.
    const onClick = (e: { features?: { properties?: Record<string, unknown> | null }[]; lngLat: { lng: number; lat: number } }) => {
      const html = labelFields(e.features?.[0]?.properties ?? {}).map(([k, v]) => `<b>${escapeHtml(k)}</b> ${escapeHtml(v)}`).join("<br>");
      if (!html) return;
      popup?.remove();
      popup = new Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(m);
    };
    m.on("click", LAYER_IDS, onClick);
    // Registered after the draw effect's listener, so on a style swap our layers go on after the cells and boundary.
    const ready = () => { if (!cancelled) load(); };
    if (loaded.current && styleEdition.current === edition) load(); else m.once("style.load", ready);
    return () => {
      cancelled = true; window.clearTimeout(timer); inFlight?.abort(); popup?.remove();
      m.off("moveend", onMove); m.off("click", LAYER_IDS, onClick); m.off("style.load", ready);
      // The old layer's shapes and label must not sit under the next layer's note (skipped when the map is going away).
      if (map.current === m && loaded.current) (m.getSource("layer") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      setLayerNote(null);
    };
  }, [layer, edition]);

  // Tract shapes: fetched once per set of tracts from the dataset's own service, then drawn (and redrawn after a style swap).
  useEffect(() => {
    tractsFitted.current = false; // a new set of tracts is framed once, on its first draw
    setTractData(null);
    setTractNote(null);
    const t = tractsNow.current;
    if (!t) return;
    const url = tractShapesUrl(t.url, [...t.fits, ...t.close]);
    if (!url) { setTractNote("Tract map unavailable."); return; }
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(url, { signal: ctl.signal });
        const body = (await res.json()) as GeoJSON.FeatureCollection & { error?: unknown };
        if (!res.ok || body.error || !Array.isArray(body.features) || !body.features.length) throw new Error("no shapes");
        setTractData({ type: "FeatureCollection", features: body.features });
      } catch {
        if (!ctl.signal.aborted) setTractNote("Tract map unavailable.");
      }
    })();
    return () => ctl.abort();
  }, [tractKey]);

  // Modeled on the City-layer effect: drawn once the style is ready, and again after a style swap (which drops them).
  useEffect(() => {
    const m = map.current;
    const t = tractsNow.current;
    if (!m || !t || !tractData) return;
    let cancelled = false;
    const draw = () => {
      if (cancelled || m.getSource("tracts")) return;
      const ink = INK[edition];
      if (m.hasImage("tract-hatch")) m.removeImage("tract-hatch");
      m.addImage("tract-hatch", pattern(ink, false, 8));
      m.addSource("tracts", { type: "geojson", data: tractData });
      if (t.fits.length) m.addLayer({ id: "tracts-fit", type: "fill", source: "tracts", filter: ["in", ["get", "GEOID"], ["literal", t.fits]], paint: { "fill-pattern": "tract-hatch" } });
      m.addLayer({ id: "tracts-line", type: "line", source: "tracts", paint: { "line-color": ink, "line-width": 1.5 } });
      const box = geojsonBounds(tractData);
      // Once per set of tracts: a day/night redraw keeps whatever view the person has panned to. Extra room at the
      // bottom for the attribution.
      if (box && !tractsFitted.current) {
        m.fitBounds(box, { padding: { top: 24, right: 24, left: 24, bottom: 44 }, duration: 0 });
        tractsFitted.current = true;
      }
      if (fig.current) fig.current.dataset.tracts = edition; // only after the layers above were added
    };
    if (loaded.current && styleEdition.current === edition) draw(); else m.once("style.load", draw);
    return () => {
      cancelled = true;
      m.off("style.load", draw);
      delete fig.current?.dataset.tracts;
      if (map.current === m && loaded.current) {
        for (const id of TRACT_IDS) if (m.getLayer(id)) m.removeLayer(id);
        if (m.getSource("tracts")) m.removeSource("tracts");
      }
    };
  }, [tractData, edition]);

  return (
    <figure ref={fig} className={styles.map} data-map>
      <div ref={box} className={styles.canvas} style={{ height }} role="group" aria-label={summary ?? (layer ? `Map of ${layer.name}` : "Map of Milwaukee")} />
      {tractNote && <p className={styles.message} data-map-message>{tractNote}</p>}
      {!tiles && <p className={styles.message} data-map-message>Street map unavailable.</p>}
      {layerNote && <p className={styles.message} data-map-message>{layerNote}</p>}
      {cells && (
        <ul className={styles.key} aria-label="Map key">
          <li><span className={`${styles.swatch} ${styles.hatch}`} />1–4 in an area</li>
          <li><span className={`${styles.swatch} ${styles.cross}`} />5–19</li>
          <li><span className={`${styles.swatch} ${styles.solid}`} style={{ opacity: SOLID_OPACITY }} />20 or more</li>
          {shape && <li><span className={`${styles.swatch} ${styles.line}`} />{shape.name} (City boundary)</li>}
        </ul>
      )}
      {tracts && (
        <ul className={styles.key} aria-label="Map key">
          {tracts.fits.length > 0 && <li><span className={`${styles.swatch} ${styles.hatch}`} />highlighted tract</li>}
          {tracts.close.length > 0 && <li><span className={styles.swatch} />close, not clear</li>}
        </ul>
      )}
      {summary && <figcaption className={styles.summary} data-map-summary>{summary}{after && ` ${after}`}</figcaption>}
      {cells && <p className={styles.note}>Areas are quarter-mile squares, never addresses.</p>}
    </figure>
  );
}
