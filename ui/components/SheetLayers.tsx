"use client";
import { useState } from "react";
import { CityMap } from "./CityMapLoader";
import styles from "./map.module.css";

// WHERE for a City map-layer dataset: pick a layer; the map fetches only what's in view.
export function SheetLayers({ layers }: { layers: { name: string; url: string }[] }) {
  const [at, setAt] = useState(0);
  const layer = layers[at];
  return (
    <div className={styles.where} data-sheet-layers>
      {layers.length > 1 && (
        <label className={styles.filters}>Layer
          <select value={at} onChange={(e) => setAt(Number(e.target.value))} data-filter="layer">
            {layers.map((l, i) => <option key={l.url} value={i}>{l.name}</option>)}
          </select>
        </label>
      )}
      <CityMap layer={layer} height={420} />
    </div>
  );
}
