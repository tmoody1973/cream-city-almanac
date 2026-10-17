import React from "react";
import { Composition, Folder, Still } from "remotion";
import { S1Problem } from "./scenes/S1Problem";
import { S2Reveal } from "./scenes/S2Reveal";
import { Thumbnail } from "./scenes/Thumbnail";

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Scenes">
      <Composition id="S1-Problem" component={S1Problem} durationInFrames={240} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S2-Reveal" component={S2Reveal} durationInFrames={210} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
    </Folder>
    <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />
    <Still id="ThumbnailVertical" component={Thumbnail} width={1080} height={1920} />
  </>
);
