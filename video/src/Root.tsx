import React from "react";
import { Composition, Folder, Still } from "remotion";
import { S1Problem } from "./scenes/S1Problem";
import { S2Reveal } from "./scenes/S2Reveal";
import { S3Address } from "./scenes/S3Address";
import { S4FactSheet } from "./scenes/S4FactSheet";
import { S5Ask } from "./scenes/S5Ask";
import { S6Trust } from "./scenes/S6Trust";
import { S7WhoFor } from "./scenes/S7WhoFor";
import { S8ComingNext } from "./scenes/S8ComingNext";
import { S9Start } from "./scenes/S9Start";
import { Thumbnail } from "./scenes/Thumbnail";

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Scenes">
      <Composition id="S1-Problem" component={S1Problem} durationInFrames={240} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S2-Reveal" component={S2Reveal} durationInFrames={210} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S3-Address" component={S3Address} durationInFrames={450} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S4-FactSheet" component={S4FactSheet} durationInFrames={360} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S5-Ask" component={S5Ask} durationInFrames={480} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S6-Trust" component={S6Trust} durationInFrames={300} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S7-WhoFor" component={S7WhoFor} durationInFrames={360} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S8-ComingNext" component={S8ComingNext} durationInFrames={150} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
      <Composition id="S9-Start" component={S9Start} durationInFrames={150} fps={30} width={1920} height={1080} defaultProps={{ k: 1 }} />
    </Folder>
    <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />
    <Still id="ThumbnailVertical" component={Thumbnail} width={1080} height={1920} />
  </>
);
