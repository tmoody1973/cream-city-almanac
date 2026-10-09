"use client";
import { useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { ThemeSwitch } from "./ThemeSwitch";
import styles from "./rundown.module.css";

const PAGES: [href: string, label: string][] = [["/", "SEARCH"], ["/ask", "ASK"], ["/start-here", "START HERE"], ["/how-it-works", "HOW IT WORKS"]];

// Phones and tablets: MENU in the masthead opens every page, the account, and the theme switch, on a native modal
// <dialog> (focus moves in, Escape closes, the page behind is inert; focus goes back to MENU by hand, since Safari
// doesn't restore it). Laptops hide it: their
// masthead carries the links.
export function PhoneMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const close = () => dialog.current?.close();
  // Clerk's windows open in the page, so the modal menu must close first or it would cover them.
  const thenClose = (action: () => void) => () => {
    close();
    action();
  };
  return (
    <>
      <button ref={button} type="button" className={styles.menuButton} aria-haspopup="dialog" aria-expanded={open} onClick={() => (dialog.current?.showModal(), setOpen(true))}>
        MENU
      </button>
      <dialog ref={dialog} className={styles.menu} aria-label="Menu" onClose={() => (setOpen(false), button.current?.focus())}>
        <div className={styles.menuHead}>
          <span className={styles.menuTitle}>MENU</span>
          <button type="button" className={styles.menuClose} onClick={close}>
            CLOSE <span aria-hidden="true">×</span>
          </button>
        </div>
        <nav aria-label="Pages">
          <ul className={styles.menuList}>
            {PAGES.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className={styles.menuItem} aria-current={path === href ? "page" : undefined} onClick={close}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ul className={styles.menuList}>
          {isSignedIn ? (
            <>
              <li><button type="button" className={styles.menuItem} onClick={thenClose(() => clerk.openUserProfile())}>ACCOUNT</button></li>
              <li><button type="button" className={styles.menuItem} onClick={thenClose(() => clerk.signOut({ redirectUrl: window.location.href }))}>SIGN OUT</button></li>
            </>
          ) : (
            <li><button type="button" className={styles.menuItem} onClick={thenClose(() => clerk.openSignIn())}>SIGN IN</button></li>
          )}
        </ul>
        <div className={styles.menuTheme}>
          <ThemeSwitch />
        </div>
      </dialog>
    </>
  );
}
