import type { Provenance } from "@/convex/lib/types";
import styles from "./rundown.module.css";

// CITY is display-only: it tags live City data and is never stored, so it stays out of Provenance (and vProvenance).
const LABELS: Record<Provenance | "CITY", { short: string; title: string }> = {
  HUB: { short: "HUB", title: "From DYCU's Hub listing" },
  DYCU: { short: "DYCU", title: "DYCU's own definition" },
  SOURCE_SITE: { short: "SOURCE", title: "From the source's website" },
  CITY: { short: "CITY", title: "From the City of Milwaukee's open data" },
  AI: { short: "AI", title: "Written by AI from the facts above" },
};

export function ProvenanceTag({ source }: { source: Provenance | "CITY" }) {
  return (
    <abbr className={styles.provenance} title={LABELS[source].title}>
      {LABELS[source].short}
    </abbr>
  );
}
