// Scene lengths in frames at 30 fps. Every boundary is a multiple of 15 (a beat at 120 BPM).
export const FPS = 30;
export type SceneId = "S1-Problem" | "S2-Reveal" | "S3-Address" | "S4-FactSheet" | "S5-Ask" | "S6-Trust" | "S7-WhoFor" | "S8-ComingNext" | "S9-Start";

export const WIDE: readonly { id: SceneId; frames: number }[] = [
  { id: "S1-Problem", frames: 240 },
  { id: "S2-Reveal", frames: 210 },
  { id: "S3-Address", frames: 450 },
  { id: "S4-FactSheet", frames: 360 },
  { id: "S5-Ask", frames: 480 },
  { id: "S6-Trust", frames: 300 },
  { id: "S7-WhoFor", frames: 360 },
  { id: "S8-ComingNext", frames: 150 },
  { id: "S9-Start", frames: 150 },
];

export const VERTICAL: readonly { id: SceneId; frames: number }[] = [
  { id: "S1-Problem", frames: 120 },
  { id: "S2-Reveal", frames: 120 },
  { id: "S3-Address", frames: 240 },
  { id: "S5-Ask", frames: 210 },
  { id: "S6-Trust", frames: 90 },
  { id: "S8-ComingNext", frames: 60 },
  { id: "S9-Start", frames: 60 },
];

export const total = (tl: readonly { frames: number }[]) => tl.reduce((t, s) => t + s.frames, 0);
export const wideFrames = (id: SceneId) => WIDE.find((s) => s.id === id)!.frames;
