"use client";
import { Show, SignInButton, SignOutButton } from "@clerk/nextjs";
import { CopilotChat, CopilotChatToolCallsView, CopilotChatView, CopilotKitProvider, type CopilotChatViewProps } from "@copilotkit/react-core/v2";
import { useQuery } from "convex/react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { earlierCountIds, earlierSheetIds, lastCountId, noteNumbers, noteOrder } from "@/ui/lib/askNotes";
import { readPrompt, withoutPrompt } from "@/ui/lib/askPrompt";
import { proseBlocks, proseSegments } from "@/ui/lib/askProse";
import { AskCards, EarlierCounts, EarlierSheets, MapPick, NewestCount } from "./AskCards";
import styles from "./ask.module.css";

const MAX_QUESTION = 500;
// A note that arrives with words is a good answer: it clears an earlier failure's "unavailable" line.
const AnswerArrived = createContext<() => void>(() => {});
type Msg = { id: string; role: string; content?: unknown };

// The person's question: a gray band, as the comps draw it. A hairline above it closes the note before;
// the first question has no note before it, so no rule (CopilotKit's wrappers hide which row is first from CSS).
function Question({ message }: { message: { content?: unknown } }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [first, setFirst] = useState(false);
  useEffect(() => {
    const el = ref.current;
    setFirst(Boolean(el && el.closest("section")?.querySelector("[data-ask-question]") === el));
  });
  return (
    <p ref={ref} data-ask-question className={first ? `${styles.question} ${styles.firstQuestion}` : styles.question}>
      {typeof message.content === "string" ? message.content : ""}
    </p>
  );
}

// The model's words, as paragraphs and a list (ui/lib/askProse.ts proseBlocks). A figure in them is marked
// unverified: the cards and the open sheet carry every number.
function Words({ text, data }: { text: string; data: string }) {
  return proseSegments(text, data).map((s, i) =>
    s.unverified ? (
      <mark key={i} className={styles.unverified} data-unverified title="This number didn't come from the data">
        {s.text}
        <span className={styles.unverifiedTag}>unverified</span>
      </mark>
    ) : (
      <span key={i}>{s.text}</span>
    ),
  );
}

function Prose({ text, data }: { text: string; data: string }) {
  return (
    <div className={styles.noteText} data-ask-prose>
      {proseBlocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}><Words text={b.text} data={data} /></p>
        ) : (
          <ul key={i} className={styles.noteList}>
            {b.items.map((item, j) => <li key={j}><Words text={item} data={data} /></li>)}
          </ul>
        ),
      )}
    </div>
  );
}

// One numbered margin note; a reply that only calls tools renders its results under the note above it.
function Note({ message, messages = [] }: { message: Msg & { toolCalls?: unknown[] }; messages?: Msg[] }) {
  const text = typeof message.content === "string" ? message.content.trim() : "";
  const n = noteNumbers(messages).get(message.id);
  const answered = useContext(AnswerArrived);
  useEffect(() => {
    if (text) answered();
  }, [text !== "", answered]); // eslint-disable-line react-hooks/exhaustive-deps
  // What the tools returned in this conversation: a quoted label in the note must come from it.
  const data = messages.filter((m) => m.role === "tool").map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  return (
    <div className={text ? styles.note : styles.noteResults}>
      {text && (
        <>
          <span className={styles.noteNumber} aria-hidden="true">{n}</span>
          <Prose text={text} data={data} />
        </>
      )}
      <div className={styles.results}>
        <NewestCount.Provider value={lastCountId(messages)}>
          <EarlierCounts.Provider value={earlierCountIds(messages)}>
            <EarlierSheets.Provider value={earlierSheetIds(messages as never)}>
              <CopilotChatToolCallsView message={message as never} messages={messages as never} />
            </EarlierSheets.Provider>
          </EarlierCounts.Provider>
        </NewestCount.Provider>
      </div>
    </div>
  );
}

function StatusLine({ left, limit }: { left: number; limit: number }) {
  return (
    <p className={styles.status}>
      {left} of {limit} questions left today · Don&apos;t paste private source info ·{" "}
      {/* Stay on this view after signing out (Clerk's default sends people home). */}
      <SignOutButton redirectUrl={typeof window === "undefined" ? "/ask" : `${window.location.pathname}${window.location.search}`}>
        <button type="button" className={styles.textButton}>Sign out</button>
      </SignOutButton>
    </p>
  );
}

// The guide's examples arrive as ?prompt=…: CopilotChat keeps the input's text in its own state and ignores an
// inputValue prop, so a thin chat view calls its setter once (as if typed), then focuses the box. Never sends.
const PromptFill = createContext<{ prompt: string; placed: () => void }>({ prompt: "", placed: () => {} });
function PrefillChatView(props: CopilotChatViewProps) {
  const { prompt, placed } = useContext(PromptFill);
  const { onInputChange } = props;
  useEffect(() => {
    if (!prompt || !onInputChange) return;
    onInputChange(prompt);
    placed();
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('section[aria-label="Ask"] textarea')?.focus());
  }, [prompt, onInputChange, placed]);
  return <CopilotChatView {...props} />;
}

const ExamplesLine = () => (
  <p className={styles.examplesLine}>
    <Link href="/ask/guide">What can I ask? See examples →</Link>
  </p>
);

export function AskPanel({ onOpen }: { onOpen?: (search: string) => void }) {
  // Read once on mount, before Search's own address writes (the parent's effects run after this one).
  const [prompt, setPrompt] = useState("");
  useEffect(() => setPrompt(readPrompt(window.location.search)), []);
  // Which count card the reader asked to see the map of ("Show map"); see MapPick in AskCards.
  const [picked, setPicked] = useState<{ id: string; newest: string | null } | null>(null);
  const placed = useCallback(() => {
    setPrompt("");
    window.history.replaceState(null, "", withoutPrompt(window.location.href));
  }, []);
  return (
    <section className={styles.panel} aria-label="Ask">
      <Show when="signed-out">
        <p className={styles.intro}>Ask a question about Milwaukee data. Answers show the real tables and reports, with their sources.</p>
        {prompt && <p className={styles.waiting}>Your question is waiting: “{prompt}”</p>}
        <SignInButton mode="modal">
          <button type="button" className={styles.signIn}>Sign in to ask</button>
        </SignInButton>
        <ExamplesLine />
      </Show>
      <Show when="signed-in">
        <ExamplesLine />
        <PromptFill.Provider value={{ prompt, placed }}>
          <MapPick.Provider value={{ picked, pick: (id, newest) => setPicked({ id, newest }) }}>
            <AskChat onOpen={onOpen} />
          </MapPick.Provider>
        </PromptFill.Provider>
      </Show>
    </section>
  );
}

function AskChat({ onOpen }: { onOpen?: (search: string) => void }) {
  const status = useQuery(api.ask.status);
  const [unavailable, setUnavailable] = useState(false);

  const clearUnavailable = useRef(() => setUnavailable(false)).current;
  if (status === undefined) return <p aria-busy="true">Checking your account…</p>;
  if (status === null) return null;
  const blocked = status.paused
    ? "Ask is paused until midnight to stay within today's budget. Search still works."
    : status.left === 0
      ? `You've used today's ${status.limit} questions. They reset at midnight.`
      : null;
  return (
    <AnswerArrived.Provider value={clearUnavailable}>
    <CopilotKitProvider runtimeUrl="/api/copilotkit" enableInspector={false}>
      <AskCards onOpen={onOpen} />
      <CopilotChat
        className={styles.chat}
        labels={{ chatInputPlaceholder: "Ask about Milwaukee data" }}
        welcomeScreen={false}
        chatView={PrefillChatView as never}
        messageView={{ transformMessages: noteOrder as never, userMessage: Question as never, assistantMessage: Note as never }}
        input={{
          className: blocked ? styles.hidden : styles.input,
          textArea: { maxLength: MAX_QUESTION } as never,
          sendButton: { "aria-label": "Send question" } as never,
          // Our status line sits under the field (with it, above a phone's tab bar); unverified marks carry the warning.
          disclaimer: (() => <StatusLine left={status.left} limit={status.limit} />) as never,
          addMenuButton: (() => null) as never, // no attachments in Ask
        }}
        onError={() => setUnavailable(true)}
      />
      {unavailable && <p role="status" className={styles.blocked}>Ask is unavailable right now. Search still works.</p>}
      {blocked && <p role="status" className={styles.blocked}>{blocked}</p>}
      {blocked && <StatusLine left={status.left} limit={status.limit} />}
    </CopilotKitProvider>
    </AnswerArrived.Provider>
  );
}
