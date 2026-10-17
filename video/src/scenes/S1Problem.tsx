import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C, F } from "../theme";
import { Body, Headline, Page, Rule, prog, useLayout } from "../ui";

// Where each file name sits at frame 0 (frame 0 is a designed cover, never empty paper), and the pile it slides into.
const SPOTS = [{ x: 6, y: 10, r: -4 }, { x: 54, y: 6, r: 3 }, { x: 22, y: 30, r: 2 }, { x: 58, y: 34, r: -3 }, { x: 8, y: 52, r: 4 }, { x: 46, y: 56, r: -2 }];
const PILE = [{ x: 6, y: 16, r: -6 }, { x: 10, y: 12, r: 4 }, { x: 4, y: 9, r: -2 }, { x: 12, y: 6, r: 7 }, { x: 7, y: 3, r: -5 }, { x: 9, y: 0, r: 3 }];

export const S1Problem: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  const m = prog(f, 20, 60);
  return (
    <Page>
      {COPY.W1.text.split(" · ").map((w, i) => {
        const a = SPOTS[i];
        const b = PILE[i];
        return (
          <div key={w} style={{ position: "absolute", left: `${a.x + (b.x - a.x) * m}%`, top: `${a.y + (b.y - a.y) * m + 6}%`, transform: `rotate(${a.r + (b.r - a.r) * m}deg) scale(${1 - 0.3 * m})`, transformOrigin: "top left", background: C.band, border: `${2 * u}px solid ${C.ink}`, padding: `${10 * u}px ${20 * u}px`, fontFamily: F.caps, fontWeight: 700, fontSize: 44 * u, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            {w}
          </div>
        );
      })}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 24 * u }}>
        <Headline p={prog(f, 90, 20)}>{COPY.C1.text}</Headline>
        {!tall && <Body p={prog(f, 150, 20)}>{COPY.C2.text}</Body>}
        {!tall && <Rule p={prog(f, 180, 30)} color={C.pencil} weight={6} />}
      </div>
    </Page>
  );
};
