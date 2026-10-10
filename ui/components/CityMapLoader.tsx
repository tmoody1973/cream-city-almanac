"use client";
import dynamic from "next/dynamic";

// MapLibre loads only where a map is shown; pages without one don't carry it.
export const CityMap = dynamic(() => import("./CityMap"), { ssr: false, loading: () => <p data-map-message>Loading map…</p> });
