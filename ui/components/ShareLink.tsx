"use client";
import { useAction } from "convex/react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { api } from "@/convex/_generated/api";
import { shareMessage } from "@/ui/lib/shareCard";
import styles from "./ask.module.css";

// Share link (spec 2026-10-14-share-link-design.md §4): the card's tool and arguments travel down to its export bar,
// which offers a link. Outside Ask (fact sheet pages, the shared page itself) there is no scope, so no button.
type Share = { tool: string; args: unknown };
const ShareContext = createContext<Share | null>(null);
export const ShareScope = ({ tool, args, children }: Share & { children: ReactNode }) => <ShareContext.Provider value={{ tool, args }}>{children}</ShareContext.Provider>;
export const useShare = () => useContext(ShareContext);


export function ShareLink({ tool, args }: Share) {
  const create = useAction(api.shares.create);
  const [state, setState] = useState<{ s: "idle" | "making" } | { s: "done"; url: string } | { s: "failed"; message: string }>({ s: "idle" });
  const [copied, setCopied] = useState(false);
  if (state.s === "making") return <span role="status">Making link…</span>;
  if (state.s === "done") {
    return (
      <span className={styles.shareLink} data-share>
        <a href={state.url} data-share-url>{state.url}</a>
        <button type="button" onClick={() => navigator.clipboard.writeText(state.url).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy"}</button>
      </span>
    );
  }
  const share = async () => {
    setState({ s: "making" });
    const r = await create({ tool, args }).catch(() => null);
    setState(r?.ok ? { s: "done", url: `${window.location.origin}/s/${r.id}` } : { s: "failed", message: shareMessage(r) ?? "" });
  };
  return (
    <>
      <button type="button" data-share onClick={share}>Share link</button>
      {state.s === "failed" && <span role="status">{state.message}</span>}
    </>
  );
}
