import type React from "react";
import type { SceneId } from "../timeline";
import { S1Problem } from "./S1Problem";
import { S2Reveal } from "./S2Reveal";
import { S3Address } from "./S3Address";
import { S4FactSheet } from "./S4FactSheet";
import { S5Ask } from "./S5Ask";
import { S6Trust } from "./S6Trust";
import { S7WhoFor } from "./S7WhoFor";
import { S8ComingNext } from "./S8ComingNext";
import { S9Start } from "./S9Start";

export const SCENES: Record<SceneId, React.FC<{ k?: number }>> = {
  "S1-Problem": S1Problem,
  "S2-Reveal": S2Reveal,
  "S3-Address": S3Address,
  "S4-FactSheet": S4FactSheet,
  "S5-Ask": S5Ask,
  "S6-Trust": S6Trust,
  "S7-WhoFor": S7WhoFor,
  "S8-ComingNext": S8ComingNext,
  "S9-Start": S9Start,
};
