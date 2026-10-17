import React from "react";
import { AbsoluteFill, Series, interpolate, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { MUSIC_START } from "./music";
import { SCENES } from "./scenes";
import { C } from "./theme";
import { VERTICAL, WIDE, total, wideFrames } from "./timeline";

// One cut of the video: its scenes in order (each timed in wide frames, scaled by k), with the music under it.
export const Master: React.FC<{ cut: "wide" | "vertical" }> = ({ cut }) => {
  const tl = cut === "wide" ? WIDE : VERTICAL;
  const end = total(tl);
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Series>
        {tl.map((s) => {
          const Scene = SCENES[s.id];
          return (
            <Series.Sequence key={s.id} durationInFrames={s.frames}>
              <Scene k={s.frames / wideFrames(s.id)} />
            </Series.Sequence>
          );
        })}
      </Series>
      <Audio src={staticFile("music.mp3")} trimBefore={MUSIC_START} volume={(fr) => interpolate(fr, [0, 15, end - 45, end], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    </AbsoluteFill>
  );
};
