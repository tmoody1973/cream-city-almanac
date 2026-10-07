export interface Chunk {
  section: string;
  text: string;
}

export function chunkMarkdown(md: string, maxChars = 1500, minChars = 40): Chunk[] {
  const chunks: Chunk[] = [];
  let section = "Report";
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text.length >= minChars) chunks.push({ section, text });
  };
  for (const raw of md.split(/\n{2,}/)) {
    const para = raw.trim();
    if (!para) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(para);
    if (heading) {
      flush();
      section = heading[1].trim().slice(0, 120);
      continue;
    }
    if (para.length > maxChars) {
      flush();
      for (let i = 0; i < para.length; i += maxChars) {
        buffer.push(para.slice(i, i + maxChars));
        flush();
      }
      continue;
    }
    if (buffer.join("\n").length + para.length + 1 > maxChars) flush();
    buffer.push(para);
  }
  flush();
  return chunks;
}
