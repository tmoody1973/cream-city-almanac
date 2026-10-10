"use client";
import { useQuery } from "convex/react";
// MapLibre 6 has no default export: named imports only.
import { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { MapData } from "@/convex/lib/cityMap";
import { cellsToGeoJSON, summarySentence } from "@/ui/lib/mapCells";
import { useNight } from "@/ui/lib/useNight";
import styles from "./map.module.css";

const STYLE = { day: "https://tiles.openfreemap.org/styles/positron", night: "https://tiles.openfreemap.org/styles/dark" };
const MILWAUKEE: [[number, number], [number, number]] = [[-88.07, 42.92], [-87.86, 43.2]];
const INK = { day: "#111111", night: "#ecebe6" };
const PENCIL = { day: "#d7261e", night: "#ff6b5e" };
const LAYER_IDS = ["layer-fill", "layer-line", "layer-dot"];

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

type Props = { cells?: MapData | null; count?: number; boundary?: string | null; layer?: { url: string; name: string } | null; height?: number; after?: string };

export default function CityMap({ cells = null, count = 0, boundary = null, layer = null, height = 260, after }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false); // true while the current style is fully loaded (isStyleLoaded() also goes false while tiles load)
  const styleEdition = useRef<"day" | "night">("day"); // the edition the map's current style was requested for
  const night = useNight();
  const shape = useQuery(api.map.cityShape, boundary ? { name: boundary } : "skip");
  const [tiles, setTiles] = useState(true);
  const [layerNote, setLayerNote] = useState<string | null>(null);
  const summary = cells ? summarySentence(cells, count) : null;
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
        m.addLayer({ id: "b3", type: "fill", source: "cells", filter: ["==", ["get", "band"], 3], paint: { "fill-color": ink, "fill-opacity": 0.7 } });
        m.addLayer({ id: "edge", type: "line", source: "cells", paint: { "line-color": ink, "line-width": 1 } });
      }
      if (shape) {
        m.addSource("boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: JSON.parse(shape.geometry) } });
        m.addLayer({ id: "boundary", type: "line", source: "boundary", paint: { "line-color": pen, "line-width": 3 } });
        m.fitBounds([[shape.bbox.minLon, shape.bbox.minLat], [shape.bbox.maxLon, shape.bbox.maxLat]], { padding: 24, duration: 0 });
      }
    };
    if (styleEdition.current !== edition) {
      styleEdition.current = edition;
      loaded.current = false;
      m.once("style.load", draw);
      m.setStyle(STYLE[edition]);
    } else if (loaded.current) draw();
    else m.once("style.load", draw);
    return () => { m.off("style.load", draw); };
  }, [cells, shape, edition]);

  // City map layers: fetched by the browser for the visible area only (Task 8 fills in fetchLayer).
  // Drawn after the style is ready, and again after a style swap (which drops them); the draw effect leaves them alone.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      if (!layer) {
        for (const id of LAYER_IDS) if (m.getLayer(id)) m.removeLayer(id);
        if (m.getSource("layer")) m.removeSource("layer");
        setLayerNote(null);
        return;
      }
      const { fetchLayer } = await import("@/ui/lib/arcgisLayer");
      const r = await fetchLayer(layer.url, m.getBounds().toArray() as [[number, number], [number, number]]);
      if (cancelled) return;
      setLayerNote(r.status === "ok" ? null : r.status === "too-many" ? `Zoom in to see ${layer.name}.` : "This City map layer isn't responding.");
      const data = r.status === "ok" ? r.data : { type: "FeatureCollection" as const, features: [] };
      const src = m.getSource("layer") as GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        const ink = INK[edition];
        m.addSource("layer", { type: "geojson", data });
        m.addLayer({ id: "layer-fill", type: "line", source: "layer", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": ink, "line-width": 1 } });
        m.addLayer({ id: "layer-line", type: "line", source: "layer", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": ink, "line-width": 2 } });
        m.addLayer({ id: "layer-dot", type: "circle", source: "layer", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": ink, "circle-radius": 3 } });
      }
    };
    const onMove = () => { window.clearTimeout(timer); timer = window.setTimeout(load, 300); };
    m.on("moveend", onMove);
    // Registered after the draw effect's listener, so on a style swap our layers go on after the cells and boundary.
    const ready = () => { if (!cancelled) load(); };
    if (loaded.current && styleEdition.current === edition) load(); else m.once("style.load", ready);
    return () => { cancelled = true; window.clearTimeout(timer); m.off("moveend", onMove); m.off("style.load", ready); };
  }, [layer, edition]);

  return (
    <figure className={styles.map} data-map>
      <div ref={box} className={styles.canvas} style={{ height }} role="img" aria-label={summary ?? (layer ? `Map of ${layer.name}` : "Map of Milwaukee")} />
      {!tiles && <p className={styles.message} data-map-message>Street map unavailable.</p>}
      {layerNote && <p className={styles.message} data-map-message>{layerNote}</p>}
      {cells && (
        <ul className={styles.key} aria-label="Map key">
          <li><span className={`${styles.swatch} ${styles.hatch}`} />1–4 in an area</li>
          <li><span className={`${styles.swatch} ${styles.cross}`} />5–19</li>
          <li><span className={`${styles.swatch} ${styles.solid}`} />20 or more</li>
          {shape && <li><span className={`${styles.swatch} ${styles.line}`} />{shape.name} (City boundary)</li>}
        </ul>
      )}
      {summary && <figcaption className={styles.summary} data-map-summary>{summary}{after && ` ${after}`}</figcaption>}
      {cells && <p className={styles.note}>Areas are quarter-mile squares, never addresses.</p>}
    </figure>
  );
}
