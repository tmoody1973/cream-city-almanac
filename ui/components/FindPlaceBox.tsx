"use client";

import { useAction } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { notInCityText, PLACE_PRIVACY, placeRefusal, sheetFor } from "@/ui/lib/placeText";
import styles from "./factSheet.module.css";

// "Find your neighborhood": an address → its fact sheet, or which City neighborhood it is in. Nothing is stored.
export function FindPlaceBox() {
  const find = useAction(api.places.placeForBox);
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await find({ address });
      if (r.status !== "ok") return setMessage(placeRefusal(r.status));
      const slug = sheetFor(r);
      if (slug) return router.push(`/n/${slug}`);
      setMessage(r.neighborhood
        ? <>That address is in the City&apos;s {r.neighborhood} neighborhood, which Data You Can Use doesn&apos;t profile. <Link href="/ask">Ask about its census tracts →</Link> (try &ldquo;What&apos;s the poverty rate in {r.neighborhood}&apos;s tracts?&rdquo;)</>
        : <>{notInCityText(r.tract.number)}</>);
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
      {/* Always on the page, so screen readers announce the answer when it fills in. */}
      <p data-place-message role="status">{message}</p>
      <p className={styles.muted}>{PLACE_PRIVACY}</p>
    </form>
  );
}
