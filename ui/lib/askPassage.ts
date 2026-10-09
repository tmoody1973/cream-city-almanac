// Report passages arrive as Firecrawl's markdown of DYCU's PDFs (bullets, --- rules, | tables) or as one table row
// per line. A page collapses newlines, so they read as a wall of pipes; this turns them into blocks to render.
export type Block = { kind: "p"; text: string } | { kind: "list"; items: string[] } | { kind: "table"; rows: string[][] } | { kind: "rule" };

const plain = (s: string) => s.replace(/\*\*|__|(?<![\w*])\*(?!\s)|(?<=\S)\*(?![\w*])/g, "").trim();
const BULLET = /^\s*(?:[•·▪]|[-*+](?=\s))\s+/;
const SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const cells = (line: string) => {
  const parts = line.trim().split("|").map((c) => plain(c));
  if (line.trim().startsWith("|")) parts.shift();
  if (line.trim().endsWith("|")) parts.pop();
  return parts;
};

export function passageBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const last = blocks.at(-1);
    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(line)) blocks.push({ kind: "rule" });
    else if (line.startsWith("|")) {
      if (SEPARATOR.test(line)) continue;
      if (last?.kind === "table") last.rows.push(cells(line));
      else blocks.push({ kind: "table", rows: [cells(line)] });
    } else if (BULLET.test(line)) {
      const item = plain(line.replace(BULLET, ""));
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else blocks.push({ kind: "p", text: plain(line) });
  }
  return blocks;
}
