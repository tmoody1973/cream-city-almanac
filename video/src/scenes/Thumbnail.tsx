import React from "react";
import { COPY } from "../copy";
import { F } from "../theme";
import { Underline, Headline, Page, Rule, Tag, useLayout } from "../ui";

// The designed cover: YouTube's custom thumbnail (1280×720) and the vertical cover (1080×1920).
export const Thumbnail: React.FC = () => {
  const { u, tall } = useLayout();
  return (
    <Page>
      <div style={{ fontFamily: F.mark, fontWeight: 900, fontStretch: "50%", fontSize: (tall ? 270 : 155) * u, lineHeight: 0.88, textTransform: "uppercase" }}>{COPY.N1.text}</div>
      <Rule p={1} weight={4} />
      <Underline p={1}>
        <Headline size={tall ? 1.15 : 0.75}>{COPY.C3a.text}</Headline>
      </Underline>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 * u }}>
        {COPY.T1.text.split(" · ").map((t) => <Tag key={t} name={t} />)}
      </div>
    </Page>
  );
};
