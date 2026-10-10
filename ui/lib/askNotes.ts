// Margin notes: each question, then the note's words, then the results the note points at.
// CopilotKit stores a turn as tool calls first and text last; the notes read the other way round.
type Msg = { id: string; role: string; content?: unknown };

const hasText = (m: Msg) => m.role === "assistant" && typeof m.content === "string" && m.content.trim() !== "";

export function noteOrder<M extends Msg>(messages: M[]): M[] {
  const out: M[] = [];
  let turn: M[] = [];
  const flush = () => {
    out.push(...turn.filter(hasText), ...turn.filter((m) => !hasText(m)));
    turn = [];
  };
  for (const m of messages) {
    if (m.role === "user") {
      flush();
      out.push(m);
    } else turn.push(m);
  }
  flush();
  return out;
}

export function noteNumbers(messages: Msg[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const m of messages) if (hasText(m)) numbers.set(m.id, numbers.size + 1);
  return numbers;
}

// Ask sometimes counts broadly before it counts what was asked; only a question's last count is its answer, so the
// cards before it fold away (the broad first count once read as the answer on the live site).
type CallMsg = Msg & { toolCalls?: { id: string; function?: { name?: string } }[] };

export function earlierCountIds(messages: CallMsg[]): Set<string> {
  const earlier = new Set<string>();
  let turn: string[] = [];
  const close = () => {
    turn.slice(0, -1).forEach((id) => earlier.add(id));
    turn = [];
  };
  for (const m of messages) {
    if (m.role === "user") close();
    for (const c of m.toolCalls ?? []) if (c.function?.name === "countRecords") turn.push(c.id);
  }
  close();
  return earlier;
}

// The conversation's newest count: its card shows a live map; older cards offer "Show map" (one map at a time).
export function lastCountId(messages: CallMsg[]): string | null {
  let last: string | null = null;
  for (const m of messages) for (const c of m.toolCalls ?? []) if (c.function?.name === "countRecords") last = c.id;
  return last;
}

// The model often opens one dataset twice in an answer (showDataset, then previewData for its rows); each call would
// draw the same sheet card. One card per dataset per question: the last call keeps it (it carries the preview).
const SHEET_TOOLS = new Set(["showDataset", "previewData"]);
const codeOf = (args: unknown) => {
  try {
    const code = (JSON.parse(String(args)) as { code?: unknown }).code;
    return typeof code === "string" ? code.trim().toUpperCase() : null;
  } catch {
    return null;
  }
};

export function earlierSheetIds(messages: (Msg & { toolCalls?: { id: string; function?: { name?: string; arguments?: unknown } }[] })[]): Set<string> {
  const earlier = new Set<string>();
  let last = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "user") last = new Map();
    for (const c of m.toolCalls ?? []) {
      const code = SHEET_TOOLS.has(c.function?.name ?? "") ? codeOf(c.function?.arguments) : null;
      if (!code) continue;
      const before = last.get(code);
      if (before) earlier.add(before);
      last.set(code, c.id);
    }
  }
  return earlier;
}
