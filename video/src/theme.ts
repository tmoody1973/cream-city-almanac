import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { loadFont as caps } from "@remotion/google-fonts/SairaExtraCondensed";
import { loadFont as hand } from "@remotion/google-fonts/Caveat";
import { loadFont as body } from "@remotion/google-fonts/Vazirmatn";

// DESIGN.md colors.
export const C = { pencil: "#d7261e", paper: "#ffffff", ink: "#111111", band: "#ededea", muted: "#5c5c5c" } as const;

// The wordmark's variable Saira (width axis 50–125%), the same face app/layout.tsx loads; rendering waits for it.
const wait = delayRender("Saira variable");
new FontFace("SairaVar", `url(${staticFile("fonts/saira-var.woff2")}) format("woff2")`, { weight: "100 900", stretch: "50% 125%" })
  .load()
  .then((f) => {
    document.fonts.add(f);
    continueRender(wait);
  })
  .catch(cancelRender);

export const F = {
  mark: "SairaVar",
  caps: caps("normal", { weights: ["700", "900"], subsets: ["latin"] }).fontFamily,
  hand: hand("normal", { weights: ["600"], subsets: ["latin"] }).fontFamily,
  body: body("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily,
};
