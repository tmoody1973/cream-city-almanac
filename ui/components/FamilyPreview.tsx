"use client";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { firstSentence } from "@/ui/lib/format";
import { PlaceYearGrid } from "./PlaceYearGrid";
import { ProvenanceTag } from "./ProvenanceTag";
import styles from "./rundown.module.css";

export function FamilyPreview({ id, familyKey }: { id: string; familyKey: string }) {
  const preview = useQuery(api.catalog.familyPreview, { key: familyKey });
  if (preview === undefined) return <div id={id} className={styles.panel} aria-busy="true">Loading…</div>;
  if (preview === null) return <div id={id} className={styles.panel}>This dataset is no longer in the catalog.</div>;
  return (
    <div id={id} className={styles.panel}>
      <div className={styles.panelBody}>
        <PlaceYearGrid grid={preview.grid} compact />
        <p className={styles.explainer}>
          {firstSentence(preview.explainer)} <ProvenanceTag source={preview.explainerProvenance} />
        </p>
      </div>
      <div className={styles.actions}>
        <Link className={styles.button} href={`/d/${preview.code}`}>Open sheet →</Link>
        {preview.csvUrl && <a className={styles.button} href={preview.csvUrl}>CSV</a>}
      </div>
    </div>
  );
}
