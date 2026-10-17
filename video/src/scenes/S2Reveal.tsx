import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C, F } from "../theme";
import { Body, Page, Rule, prog, useLayout } from "../ui";

export const S2Reveal: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u } = useLayout();
  const p = prog(f, 0, 40);
  return (
    <Page>
      <div style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`, fontFamily: F.mark, fontWeight: 900, fontStretch: "50%", fontSize: 160 * u, lineHeight: 0.9, textTransform: "uppercase" }}>{COPY.N1.text}</div>
      <Rule p={prog(f, 35, 30)} color={C.pencil} weight={8} />
      <Body p={prog(f, 70, 25)} size={1.3}>{COPY.C3.text}</Body>
    </Page>
  );
};
