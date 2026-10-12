"use client";
import { useState } from "react";
import { exportState, toCsv, toText, type CardExport, type Ctx } from "@/ui/lib/cardExport";
import { cardPng } from "@/ui/lib/cardPng";
import styles from "./ask.module.css";

type Props = { make: ((ctx: Ctx) => CardExport) | null; expired?: boolean } | { copy: (ctx: Ctx) => string };

// Read at click time: where the page lives (for the dataset links) and today's date.
const here = (): Ctx => ({ origin: window.location.origin, date: new Date().toLocaleDateString("en-US", { dateStyle: "long" }) });

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // ponytail: revoked a minute later; Safari can still be reading the blob just after the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// CSV · Copy text · PNG under a card (spec 2026-10-12 §4); a report quote gets Copy text only.
export function ExportBar(props: Props) {
  const [status, setStatus] = useState("");
  const say = (s: string) => {
    setStatus(s);
    setTimeout(() => setStatus(""), 4_000);
  };
  const copy = async (text: string, failed: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say("Copied");
    } catch {
      say(failed);
    }
  };
  const live = <span role="status" aria-live="polite">{status}</span>;

  if ("copy" in props) {
    return (
      <div className={styles.exportBar} data-export>
        <button type="button" onClick={() => copy(props.copy(here()), "Couldn't copy.")}>Copy text</button>
        {live}
      </div>
    );
  }
  const { make } = props;
  const state = exportState(make !== null, Boolean(props.expired));
  if (state === "expired") return <p className={styles.exportBar} data-export="expired">Ask again to export</p>;
  const png = async () => {
    if (!make) return;
    const e = make(here());
    const blob = await cardPng(e).catch(() => null);
    if (blob) save(blob, `${e.filename}.png`);
    else say("Couldn't make the image.");
  };
  return (
    <div className={styles.exportBar} data-export>
      <button type="button" disabled={!make} onClick={() => { if (!make) return; const e = make(here()); save(new Blob([toCsv(e)], { type: "text/csv;charset=utf-8" }), `${e.filename}.csv`); }}>CSV</button>
      <button type="button" disabled={!make} onClick={() => make && copy(toText(make(here())), "Couldn't copy. Use CSV instead.")}>Copy text</button>
      <button type="button" disabled={!make} onClick={png}>PNG</button>
      {state === "loading" && <span>Loading…</span>}
      {live}
    </div>
  );
}
