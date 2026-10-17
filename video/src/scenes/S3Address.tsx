import React from "react";
import { staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import { RESULT_AT } from "../clip";
import { COPY } from "../copy";
import { C } from "../theme";
import { Body, Hand, Headline, Page, Underline, prog, useLayout } from "../ui";

export const S3Address: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const f = useCurrentFrame() / k;
  const { u, tall } = useLayout();
  // Callouts start when the real result appears in the clip, one every second.
  const first = RESULT_AT * 30 + 10;
  return (
    <Page>
      <Headline p={prog(f, 0, 20)} size={0.8}>{COPY.C4.text}</Headline>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", gap: 40 * u, alignItems: tall ? "stretch" : "center" }}>
        <div style={{ flex: tall ? "none" : "0 0 52%", border: `${2 * u}px solid ${C.ink}`, opacity: prog(f, 10, 20) }}>
          <Video src={staticFile("address.mp4")} muted playbackRate={1 / k} style={{ width: "100%", display: "block" }} />
        </div>
        <div style={{ display: "flex", flexDirection: tall ? "row" : "column", flexWrap: "wrap", gap: 28 * u }}>
          {COPY.K1.text.split(" · ").map((t, i) => (
            <Underline key={t} p={prog(f, first + i * 30 + 6, 18)}>
              <Hand p={prog(f, first + i * 30, 8)}>{t}</Hand>
            </Underline>
          ))}
        </div>
      </div>
      <Body p={prog(f, Math.min(first + 130, 400), 20)} size={0.9}>{COPY.C5.text}</Body>
    </Page>
  );
};
