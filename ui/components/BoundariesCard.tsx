"use client";

import type { BoundariesResult } from "@/convex/places";
import { boundariesFootnote, BOUNDARY_GROUPS, placeHeading, shareText } from "@/ui/lib/boundaryText";
import { POLLING_CONFIRM } from "@/ui/lib/placeText";
import styles from "./ask.module.css";

// Which City boundaries cover a place: one group per asked kind, wards as a table with their polling places.
export function BoundariesCard({ r }: { r: Extract<BoundariesResult, { status: "ok" }> }) {
  const wards = r.covers.filter((c) => c.kind === "ward");
  return (
    <div className={`${styles.reference} ${styles.tractCard}`} data-card="boundaries">
      <p className={styles.tractVerdict}>{placeHeading(r.place)}</p>
      {r.place.details?.alder && <p>Alder: {r.place.details.alder}</p>}
      {r.kinds.map((k) => {
        const cs = r.covers.filter((c) => c.kind === k);
        return (
          <div key={k} data-kind={k}>
            <p className={styles.tractMeta}>{BOUNDARY_GROUPS[k]}</p>
            {cs.length === 0 ? <p>None</p> : k === "ward" ? (
              <table>
                <thead><tr><th>Ward</th><th>Share</th><th>Polling place</th><th>Accessible entrance</th></tr></thead>
                <tbody>{cs.map((c) => (
                  <tr key={c.name}><td>{c.name}</td><td>{shareText(c.share)}</td><td>{[c.details?.pollingPlace, c.details?.pollingAddress].filter(Boolean).join(", ")}</td><td>{c.details?.accessibleEntrance ?? ""}</td></tr>
                ))}</tbody>
              </table>
            ) : (
              <ul>{cs.map((c) => <li key={c.name}>{c.name}: {shareText(c.share)}{c.kind === "district" && c.details?.alder && <> · Alder: {c.details.alder}</>}</li>)}</ul>
            )}
          </div>
        );
      })}
      <p className={styles.tractMeta}>{boundariesFootnote(r.asOf)}</p>
      {wards.length > 0 && <p className={styles.tractMeta}>{POLLING_CONFIRM} <a href="https://myvote.wi.gov">myvote.wi.gov</a>.</p>}
    </div>
  );
}
