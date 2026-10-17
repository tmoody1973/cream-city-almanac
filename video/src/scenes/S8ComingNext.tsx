import React from "react";
import { useCurrentFrame } from "remotion";
import { COPY } from "../copy";
import { Hand, Headline, Page, Underline, prog } from "../ui";

export const S8ComingNext: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const [lead, rest] = COPY.C14.text.split(": ");
  return (
    <Page>
      <Hand p={prog(f, 0, 15)} size={1.3}>{lead}</Hand>
      <Underline p={prog(f, 40, 40)}>
        <Headline p={prog(f, 10, 20)}>{rest}</Headline>
      </Underline>
    </Page>
  );
};
