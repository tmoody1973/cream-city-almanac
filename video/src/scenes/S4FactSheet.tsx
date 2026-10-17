import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { DATA, type Est } from "../data";
import { C, F } from "../theme";
import { Body, Hand, Headline, Page, Stamp, prog, useLayout } from "../ui";

// Same formats as pct and margin in ui/lib/factText.ts.
const pct = (e: Est) => `${(e.estimate * 100).toFixed(1)}%`;
const margin = (e: Est) => (e.moe === null ? "" : `± ${(e.moe * 100).toFixed(1)} points`);

export const S4FactSheet: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u } = useLayout();
  const r = DATA.riverwest;
  const top = (e: Est) => e.estimate + (e.moe ?? 0);
  // Room to the right of the longest bar for its figure and margin.
  const max = Math.max(top(r.rate), top(r.city)) * 1.6;
  const rows = [{ name: r.name, e: r.rate, at: 30, fill: C.ink }, { name: COPY.K2.text, e: r.city, at: 60, fill: C.band }];
  return (
    <Page>
      <Headline p={prog(f, 0, 20)} size={0.8}>{COPY.C6.text}</Headline>
      <Hand p={prog(f, 15, 15)}>{`${r.label} · ${r.period}`}</Hand>
      {rows.map((row) => {
        const g = prog(f, row.at, 40);
        const w = (row.e.estimate / max) * 100;
        const lo = ((row.e.estimate - (row.e.moe ?? 0)) / max) * 100;
        const hi = (top(row.e) / max) * 100;
        return (
          <div key={row.name} style={{ display: "grid", gridTemplateColumns: "32% 1fr", alignItems: "center", gap: 24 * u }}>
            <div style={{ fontFamily: F.caps, fontWeight: 700, fontSize: 44 * u, textTransform: "uppercase", whiteSpace: "nowrap" }}>{row.name}</div>
            <div style={{ position: "relative", height: 72 * u }}>
              <div style={{ position: "absolute", left: 0, top: 12 * u, bottom: 12 * u, width: `${w * g}%`, background: row.fill, border: `${2 * u}px solid ${C.ink}` }} />
              {row.e.moe !== null && <div style={{ position: "absolute", left: `${lo}%`, width: `${hi - lo}%`, top: "50%", height: 6 * u, marginTop: -3 * u, background: C.pencil, opacity: prog(f, row.at + 40, 15) }} />}
              <div style={{ position: "absolute", left: `calc(${hi * g}% + ${20 * u}px)`, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 16 * u, fontSize: 44 * u, fontWeight: 700, whiteSpace: "nowrap", opacity: g }}>
                {pct(row.e)}
                <span style={{ fontSize: 32 * u, color: C.muted, fontWeight: 400 }}>{margin(row.e)}</span>
              </div>
            </div>
          </div>
        );
      })}
      <Stamp f={f} at={170}>
        <div style={{ border: `${4 * u}px solid ${C.pencil}`, color: C.pencil, fontFamily: F.caps, fontWeight: 900, fontSize: 56 * u, textTransform: "uppercase", padding: `${8 * u}px ${20 * u}px` }}>{`${r.name}: ${r.verdict}`}</div>
      </Stamp>
      <Body p={prog(f, 260, 20)} size={0.9}>{COPY.C7.text}</Body>
    </Page>
  );
};
