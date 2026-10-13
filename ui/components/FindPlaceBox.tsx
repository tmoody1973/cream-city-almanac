"use client";

import { useAction } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { PlaceResult } from "@/convex/places";
import { PlaceBoundaries } from "./PlaceBoundaries";
import { notInCityText, PLACE_PRIVACY, placeRefusal, sheetFor } from "@/ui/lib/placeText";
import styles from "./factSheet.module.css";

// Where an address is: its fact sheet link (or which City neighborhood it is in), then its City boundaries.
function Panel({ r }: { r: Extract<PlaceResult, { status: "ok" }> }) {
  const slug = sheetFor(r);
  const area = r.dycu.find((d) => d.slug === slug)?.name;
  return (
    <>
      <p><strong>{r.matched}</strong> <span className={styles.muted}>(as the U.S. Census Bureau matched it)</span></p>
      {slug && area
        ? <p><Link href={`/n/${slug}`}>Open {area}&apos;s fact sheet →</Link></p>
        : r.neighborhood
          ? <p>That address is in the City&apos;s {r.neighborhood} neighborhood, which Data You Can Use doesn&apos;t profile. <Link href="/ask">Ask about its census tracts →</Link> (try &ldquo;What&apos;s the poverty rate in {r.neighborhood}&apos;s tracts?&rdquo;)</p>
          : <p>{notInCityText(r.tract.number)}</p>}
      <PlaceBoundaries r={r} meta={styles.muted} />
    </>
  );
}

// "Find your neighborhood": an address → a panel with its fact sheet and City boundaries. Nothing is stored.
export function FindPlaceBox() {
  const find = useAction(api.places.placeForBox);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await find({ address });
      setMessage(r.status === "ok" ? <Panel r={r} /> : placeRefusal(r.status));
    } catch {
      setMessage(placeRefusal("unavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.find} onSubmit={submit}>
      <h3 className={styles.findLabel}>Find your neighborhood</h3>
      <label htmlFor="find-address" className={styles.muted}>Your address</label>
      <div className={styles.findRow}>
        <input id="find-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="2400 W Center St" maxLength={200} autoComplete="street-address" />
        <button type="submit" className={styles.print} disabled={busy}>Find</button>
      </div>
      {/* Always on the page, so screen readers announce the answer when it fills in. A div: the panel holds lists. */}
      <div data-place-message role="status">{message}</div>
      <p className={styles.muted}>{PLACE_PRIVACY}</p>
    </form>
  );
}
