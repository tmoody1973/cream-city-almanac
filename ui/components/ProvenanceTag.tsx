import type { Provenance } from "@/convex/lib/types";
import styles from "./rundown.module.css";

// CITY, CENSUS and HCM are display-only: they tag live City and Census data and are never stored, so they stay out of
// Provenance (and vProvenance).
const LABELS: Record<Provenance | "CITY" | "CENSUS" | "HCM", { short: string; title: string }> = {
  HUB: { short: "HUB", title: "From DYCU's Hub listing" },
  DYCU: { short: "DYCU", title: "DYCU's own definition" },
  SOURCE_SITE: { short: "SOURCE", title: "From the source's website" },
  CITY: { short: "CITY", title: "From the City of Milwaukee's open data" },
  CENSUS: { short: "CENSUS", title: "From the U.S. Census Bureau's American Community Survey" },
  HCM: { short: "HCM", title: "From Health Compass Milwaukee (Milwaukee Health Care Partnership)" },
  AI: { short: "AI", title: "Written by AI from the facts above" },
};

export function ProvenanceTag({ source }: { source: Provenance | "CITY" | "CENSUS" | "HCM" }) {
  return (
    <abbr className={styles.provenance} title={LABELS[source].title}>
      {LABELS[source].short}
    </abbr>
  );
}
