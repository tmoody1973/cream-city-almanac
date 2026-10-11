"use client";
import { type ReactNode, useRef, useState } from "react";
import styles from "./ask.module.css";

// EXPAND on a tract card: the card's plot, map and table in a native modal <dialog>, nearly the whole window on a
// laptop and all of it on a phone. Like the phone menu, the browser moves focus in, Escape closes, and the page behind
// is inert; focus goes back to EXPAND by hand (Safari doesn't). A click on the backdrop closes it too. The contents
// are drawn only while open, so the big map measures a visible box (a map made inside a closed dialog is zero-sized).
export function BigView({ title, children }: { title: string; children: () => ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => dialog.current?.close();
  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.expand}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (dialog.current?.showModal(), setOpen(true))}
        data-expand
      >
        EXPAND <span aria-hidden="true">⤢</span>
      </button>
      <dialog
        ref={dialog}
        className={styles.big}
        aria-label={title}
        onClose={() => (setOpen(false), button.current?.focus())}
        onClick={(e) => e.target === dialog.current && close()}
        data-big-view
      >
        <div className={styles.bigBody}>
          <div className={styles.bigHead}>
            <p className={styles.tractHead}>{title}</p>
            <button type="button" className={styles.expand} onClick={close}>
              CLOSE <span aria-hidden="true">×</span>
            </button>
          </div>
          {open && children()}
        </div>
      </dialog>
    </>
  );
}
