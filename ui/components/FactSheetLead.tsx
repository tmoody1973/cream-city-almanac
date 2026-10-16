"use client";
import { useQueries } from "convex/react";
import Link from "next/link";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import styles from "./rundown.module.css";

// A search that names a fact-sheet neighborhood ("riverwest crime") leads with that neighborhood's sheet.
export function FactSheetLead({ q }: { q: string }) {
  // useQueries hands back a failure as a value instead of throwing it: if the lookup fails, search still works, without the line.
  const queries = useMemo((): Parameters<typeof useQueries>[0] => (q ? { area: { query: api.factSheet.areaInSearch, args: { q } } } : {}), [q]);
  const { area } = useQueries(queries);
  if (!area || area instanceof Error) return null;
  return (
    <p className={styles.factLead} data-fact-lead>
      <Link href={`/n/${area.slug}`}>
        <span className={styles.factLeadLabel}>Fact sheet</span>
        <span className={styles.factLeadName} data-fact-lead-name>{area.name}</span>
        <span>Its people and homes next to the rest of the city →</span>
      </Link>
    </p>
  );
}
