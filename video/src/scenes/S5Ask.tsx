import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { DATA } from "../data";
import { C, F } from "../theme";
import { Body, Hand, Page, Stamp, Tag, prog, useLayout } from "../ui";

export const S5Ask: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  const q = COPY.Q1.text;
  const typed = q.slice(0, Math.max(0, Math.floor((f - 10) * 0.8)));
  const card = prog(f, 90, 20);
  const asOf = new Date(`${DATA.asOf}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const items = COPY.C8.text.split(" · ");
  return (
    <Page>
      <div style={{ display: "flex", alignItems: "center", border: `${2 * u}px solid ${C.ink}`, padding: `${20 * u}px ${28 * u}px`, fontSize: 48 * u, minHeight: 64 * u }}>
        {typed}
        <div style={{ width: 4 * u, height: 52 * u, marginLeft: 4 * u, background: C.ink, opacity: Math.floor(f / 15) % 2 === 0 ? 1 : 0 }} />
      </div>
      <div style={{ borderTop: `${4 * u}px solid ${C.ink}`, paddingTop: 24 * u, opacity: card, transform: `translateY(${(1 - card) * 40 * u}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 * u }}>
          <div style={{ fontFamily: F.caps, fontWeight: 900, fontSize: 200 * u, lineHeight: 0.9 }}>{DATA.robbery.count.toLocaleString("en-US")}</div>
          <Stamp f={f} at={125}>
            <Tag name={COPY.T1.text.split(" · ")[1]} />
          </Stamp>
        </div>
        <Body size={0.8}>{DATA.robbery.caption}</Body>
        <div style={{ fontSize: 32 * u, color: C.muted }}>{`${COPY.K4.text} ${asOf}`}</div>
      </div>
      {!tall && (
        <div style={{ position: "relative", height: 72 * u }}>
          {items.map((t, i) => {
            const at = 270 + i * 40;
            const out = i === items.length - 1 ? 0 : prog(f, at + 34, 6);
            return (
              <div key={t} style={{ position: "absolute", inset: 0, opacity: prog(f, at, 8) * (1 - out) }}>
                <Hand>{t}</Hand>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
};
