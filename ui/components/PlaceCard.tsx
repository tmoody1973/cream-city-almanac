"use client";

import Link from "next/link";
import type { PlaceResult } from "@/convex/places";
import { notInCityText, PLACE_PRIVACY_ASK } from "@/ui/lib/placeText";
import { PlaceBoundaries } from "./PlaceBoundaries";
import styles from "./ask.module.css";

// Where an address is: its tract, City neighborhood and DYCU area. Nothing about the property.
export function PlaceCard({ r }: { r: Extract<PlaceResult, { status: "ok" }> }) {
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="place">
      <p className={styles.tractVerdict}>{r.matched}</p>
      <p className={styles.tractMeta}>(as the U.S. Census Bureau matched it)</p>
      <ul>
        <li>Census tract {r.tract.number}</li>
        <li>{r.neighborhood ? <>City neighborhood: {r.neighborhood} (City of Milwaukee boundary)</> : <>{notInCityText(r.tract.number)}</>}</li>
        {r.dycu.length > 0
          ? r.dycu.map((d) => <li key={d.name}>DYCU&apos;s area: {d.name}{d.slug && <> · <Link href={`/n/${d.slug}`}>Open the fact sheet →</Link></>}</li>)
          : <li>Not in one of the areas Data You Can Use profiles</li>}
      </ul>
      <PlaceBoundaries r={r} meta={styles.tractMeta} />
      <p className={styles.tractMeta}>{PLACE_PRIVACY_ASK}</p>
    </div>
  );
}
