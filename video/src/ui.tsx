import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useVideoConfig } from "remotion";
import { C, F } from "./theme";

// u: the layout rules' unit (1 = sizes for a 1080 px-wide frame). Capped by height so a 1920×1080 frame gets 1.3,
// not 1.78: at 1.78 the text no longer fits 1080 px of height. tall: the vertical cut.
export function useLayout() {
  const { width, height } = useVideoConfig();
  return { tall: height > width, u: Math.min(width / 1080, height / 830), width, height };
}

// 0 → 1 between start and start + dur, eased out, clamped both ends.
export const prog = (f: number, start: number, dur: number) =>
  interpolate(f, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

const rise = (p: number, u: number): React.CSSProperties => ({ opacity: p, transform: `translateY(${(1 - p) * 30 * u}px)` });

export const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { u, tall, height } = useLayout();
  const pv = tall ? 100 * u : 100 * (height / 1080);
  return (
    <div style={{ position: "absolute", inset: 0, background: C.paper, color: C.ink, fontFamily: F.body, padding: `${pv}px ${80 * u}px`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 32 * u }}>
      {children}
    </div>
  );
};

type Text = { children: React.ReactNode; p?: number; size?: number };
export const Headline: React.FC<Text> = ({ children, p = 1, size = 1 }) => {
  const { u } = useLayout();
  return <div style={{ fontFamily: F.caps, fontWeight: 900, fontSize: 84 * u * size, lineHeight: 0.95, textTransform: "uppercase", ...rise(p, u) }}>{children}</div>;
};
export const Body: React.FC<Text> = ({ children, p = 1, size = 1 }) => {
  const { u } = useLayout();
  return <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: 44 * u * size, lineHeight: 1.25, ...rise(p, u) }}>{children}</div>;
};
// Grease-pencil handwriting.
export const Hand: React.FC<Text> = ({ children, p = 1, size = 1 }) => {
  const { u } = useLayout();
  return <div style={{ fontFamily: F.hand, fontWeight: 600, fontSize: 60 * u * size, lineHeight: 1.1, color: C.pencil, ...rise(p, u) }}>{children}</div>;
};

export const Rule: React.FC<{ p: number; color?: string; weight?: number }> = ({ p, color = C.ink, weight = 2 }) => {
  const { u } = useLayout();
  return <div style={{ height: weight * u, background: color, transform: `scaleX(${p})`, transformOrigin: "left" }} />;
};

// The site's own grease-pencil underline (public/plates/pencil-underline.png), drawn on left to right as p goes 0 → 1.
export const Underline: React.FC<{ p: number; children: React.ReactNode }> = ({ p, children }) => {
  const { u } = useLayout();
  return (
    <div style={{ position: "relative", display: "inline-block", alignSelf: "flex-start", paddingBottom: 30 * u }}>
      {children}
      <Img src={staticFile("plates/pencil-underline.png")} style={{ position: "absolute", left: "-2%", bottom: 0, width: "104%", height: 22 * u, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }} />
    </div>
  );
};

// Lands at frame `at` (in the scene's own frames) with a short overshoot, like a rubber stamp.
export const Stamp: React.FC<{ f: number; at: number; children: React.ReactNode }> = ({ f, at, children }) => {
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 14, stiffness: 220 } });
  return <div style={{ display: "inline-block", opacity: f >= at ? 1 : 0, transform: `scale(${interpolate(s, [0, 1], [1.5, 1])})` }}>{children}</div>;
};

// A source tag as the site draws it: square, ink-ruled, caps.
export const Tag: React.FC<{ name: string }> = ({ name }) => {
  const { u } = useLayout();
  return <span style={{ display: "inline-block", border: `${2 * u}px solid ${C.ink}`, padding: `${4 * u}px ${12 * u}px`, fontFamily: F.caps, fontWeight: 700, fontSize: 44 * u, letterSpacing: "0.04em", lineHeight: 1 }}>{name}</span>;
};
