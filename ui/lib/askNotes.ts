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
