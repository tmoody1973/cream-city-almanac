"use client";
import { Show, SignInButton, SignOutButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import styles from "./ask.module.css";

export function AskPanel() {
  return (
    <section className={styles.panel} aria-label="Ask">
      <Show when="signed-out">
        <p className={styles.intro}>Ask a question about Milwaukee data. Answers show the real tables and reports, with their sources.</p>
        <SignInButton mode="modal">
          <button type="button" className={styles.signIn}>Sign in to ask</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <SignedInStatus />
      </Show>
    </section>
  );
}

function SignedInStatus() {
  const status = useQuery(api.ask.status);
  if (!status) return <p aria-busy="true">Checking your account…</p>;
  return (
    <p className={styles.note}>
      {status.left} of {status.limit} questions left today · Don&apos;t paste private source info ·{" "}
      {/* Stay on this view after signing out (Clerk's default sends people home). */}
      <SignOutButton redirectUrl={typeof window === "undefined" ? "/ask" : `${window.location.pathname}${window.location.search}`}>
        <button type="button" className={styles.textButton}>Sign out</button>
      </SignOutButton>
    </p>
  );
}
