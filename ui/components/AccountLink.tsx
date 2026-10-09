"use client";
import { useAuth, useClerk } from "@clerk/nextjs";

// Signed in: ACCOUNT (Clerk's window: email, profile) and SIGN OUT among the site links, and the same pair in the
// footer for phone pages without a tab bar. Signing out keeps the reader on the page they were reading.
export function AccountLink({ className, labels = ["ACCOUNT", "SIGN OUT"], before = "", between = "" }: { className: string; labels?: [string, string]; before?: string; between?: string }) {
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  if (!isSignedIn) return null;
  return (
    <>
      {before}
      <button type="button" className={className} onClick={() => clerk.openUserProfile()}>
        {labels[0]}
      </button>
      {between}
      <button type="button" className={className} onClick={() => clerk.signOut({ redirectUrl: window.location.href })}>
        {labels[1]}
      </button>
    </>
  );
}
