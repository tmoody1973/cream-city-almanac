import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { C } from "../theme";
import { Body, Headline, Page, Rule, Stamp, Tag, prog, useLayout } from "../ui";

export const S6Trust: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  const tags = COPY.T1.text.split(" · ");
  const names = COPY.C11.text.split(" · ");
  const t0 = tall ? 60 : 150;
  return (
    <Page>
      {!tall && <Body p={prog(f, 0, 20)}>{COPY.C9.text}</Body>}
      <Headline p={prog(f, tall ? 0 : 70, 20)}>{COPY.C10.text}</Headline>
      <Rule p={prog(f, tall ? 20 : 100, 25)} color={C.pencil} weight={6} />
      <div style={{ display: "grid", gridTemplateColumns: tall ? "1fr" : "1fr 1fr", gap: `${16 * u}px ${40 * u}px` }}>
        {tags.map((t, i) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 20 * u }}>
            <Stamp f={f} at={t0 + i * 20}>
              <Tag name={t} />
            </Stamp>
            <span style={{ fontSize: 36 * u, opacity: prog(f, t0 + i * 20 + 5, 10) }}>{names[i]}</span>
          </div>
        ))}
      </div>
    </Page>
  );
};
