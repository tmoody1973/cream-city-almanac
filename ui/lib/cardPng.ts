import type { CardExport } from "./cardExport";
import { PNG_PAD, SIZE, pngLayout, type Font } from "./pngLayout";

const INK = "#1a1a1a";
const MUTED = "#5c5c5c";

// The exported card as a PNG, always light: white paper, ink text, the page's own font once it has loaded.
export async function cardPng(e: CardExport): Promise<Blob | null> {
  await document.fonts?.ready;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const font = (f: Font) => `${f === "title" || f === "bold" ? "700 " : ""}${SIZE[f]}px ${family}`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const layout = pngLayout(e, (text, f) => {
    ctx.font = font(f);
    return ctx.measureText(text).width;
  });
  canvas.width = layout.width; // resizing clears the canvas and its settings, so paint after it
  canvas.height = layout.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const i of layout.items) {
    ctx.font = font(i.font);
    ctx.fillStyle = i.color === "ink" ? INK : MUTED;
    ctx.fillText(i.text, i.x, i.y);
  }
  ctx.fillStyle = INK;
  for (const y of layout.rules) ctx.fillRect(PNG_PAD, y, layout.width - 2 * PNG_PAD, 1);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
