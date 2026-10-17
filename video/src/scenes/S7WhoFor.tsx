import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C } from "../theme";
import { Body, Headline, Page, prog, useLayout } from "../ui";

export const S7WhoFor: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u } = useLayout();
  const col = (title: string, text: string, at: number) => {
    const p = prog(f, at, 20);
    return (
      <div style={{ flex: 1, borderTop: `${4 * u}px solid ${C.ink}`, paddingTop: 24 * u, display: "flex", flexDirection: "column", gap: 20 * u, opacity: p, transform: `translateY(${(1 - p) * 40 * u}px)` }}>
        <Headline size={0.7}>{title}</Headline>
        <Body size={0.8}>{text}</Body>
      </div>
    );
  };
  return (
    <Page>
      <div style={{ display: "flex", gap: 60 * u }}>
        {col(COPY.L1.text, COPY.C12.text, 0)}
        {col(COPY.L2.text, COPY.C13.text, 90)}
      </div>
    </Page>
  );
};
