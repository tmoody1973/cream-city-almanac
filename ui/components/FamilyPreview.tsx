"use client";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { shortExplainer } from "@/ui/lib/format";
import { portraitFocusQuery, type PortraitFocus } from "@/ui/lib/portrait";
import { SEARCH_TIMEOUT_MS } from "@/ui/lib/search";
import { Arrow } from "./Arrow";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./rundown.module.css";

export function FamilyPreview({ id, familyKey, focus }: { id: string; familyKey: string; focus?: PortraitFocus | null }) {
  const preview = useQuery(api.catalog.familyPreview, { key: familyKey });
  // useQuery waits silently while the connection is down; after the search timeout, say so instead.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (preview !== undefined) return;
    const timer = setTimeout(() => setStalled(true), SEARCH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [preview]);
  if (preview === undefined && stalled) {
    return <div id={id} className={styles.panel} role="status">Can&apos;t reach the catalog. Check your connection and try again.</div>;
  }
  if (preview === undefined) return <div id={id} className={styles.panel} aria-busy="true">Loading…</div>;
  if (preview === null) return <div id={id} className={styles.panel}>This dataset is no longer in the catalog.</div>;
  if (preview.kind === "page") {
    return (
      <div id={id} className={styles.panel}>
        <p className={styles.explainer}>
          A guide page on DYCU&apos;s Hub, not a dataset.{" "}
          {preview.guideUrl && (
            <a href={preview.guideUrl}>
              Open it on the Hub <ProvenanceTag source="HUB" />
            </a>
          )}
        </p>
        <p className={styles.explainer}>
          New here? <Link href="/start-here">Start here</Link>.
        </p>
      </div>
    );
  }
  return (
    <div id={id} className={styles.panel}>
      <div className={styles.panelBody}>
        <PlaceYearGrid grid={preview.grid} compact />
        <p className={styles.explainer}>
          {shortExplainer(preview.explainer)} <ProvenanceTag source={preview.explainerProvenance} />
        </p>
      </div>
      <div className={styles.actions}>
        <Link className={styles.button} href={`/d/${preview.code}${portraitFocusQuery(focus)}`}>
          Open sheet
          <Arrow />
        </Link>
        {preview.csvUrl && <a className={styles.button} href={preview.csvUrl}>CSV</a>}
      </div>
    </div>
  );
}
