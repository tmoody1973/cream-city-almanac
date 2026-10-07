import type { Provenance } from "@/convex/lib/types";
import styles from "./rundown.module.css";

const LABELS: Record<Provenance, { short: string; title: string }> = {
  HUB: { short: "HUB", title: "From DYCU's Hub listing" },
  DYCU: { short: "DYCU", title: "DYCU's own definition" },
  SOURCE_SITE: { short: "SOURCE", title: "From the source's website" },
  AI: { short: "AI", title: "Written by AI from the facts above" },
};

export function ProvenanceTag({ source }: { source: Provenance }) {
  return (
    <abbr className={styles.provenance} title={LABELS[source].title}>
      {LABELS[source].short}
    </abbr>
  );
}
