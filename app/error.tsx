"use client";
import Link from "next/link";
import { Arrow } from "@/ui/components/Arrow";
import { Masthead } from "@/ui/components/Masthead";
import styles from "@/ui/components/sheet.module.css";

// Last line of defence: an unexpected error shows a plain message with a way back, never a blank page.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={styles.page}>
      <Masthead side="RUNDOWN" showDate={false} />
      <main className={styles.section}>
        <p>Something on this page didn&apos;t load. Try again, or go back to the rundown.</p>
        <p>
          <button type="button" className={styles.button} onClick={reset}>
            Try again
          </button>
        </p>
        <Link href="/search">
          <Arrow direction="left" />
          Back to the rundown
        </Link>
      </main>
    </div>
  );
}
