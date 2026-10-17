import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C, F } from "../theme";
import { Body, Page, Rule, prog, useLayout } from "../ui";

export const S9Start: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  return (
    <Page>
      <div style={{ fontFamily: F.mark, fontWeight: 900, fontStretch: "50%", fontSize: (tall ? 110 : 150) * u, lineHeight: 0.9, opacity: prog(f, 0, 15) }}>{COPY.U1.text}</div>
      <Rule p={prog(f, 15, 30)} color={C.pencil} weight={8} />
      <Body p={prog(f, 40, 20)} size={1.2}>{COPY.C15.text}</Body>
    </Page>
  );
};
