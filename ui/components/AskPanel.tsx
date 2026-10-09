"use client";
import { Show, SignInButton, SignOutButton } from "@clerk/nextjs";
import { CopilotChat, CopilotChatToolCallsView, CopilotKitProvider } from "@copilotkit/react-core/v2";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { noteNumbers, noteOrder } from "@/ui/lib/askNotes";
import { proseSegments } from "@/ui/lib/askProse";
import { AskCards } from "./AskCards";
import styles from "./ask.module.css";

const MAX_QUESTION = 500;
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

// The model's words. A figure in them is marked unverified: the cards and the open sheet carry every number.
function Prose({ text }: { text: string }) {
  return (
    <p className={styles.noteText}>
      {proseSegments(text).map((s, i) =>
        s.unverified ? (
          <mark key={i} className={styles.unverified} data-unverified title="This number didn't come from the data">
            {s.text}
            <span className={styles.unverifiedTag}>unverified</span>
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

// One numbered margin note; a reply that only calls tools renders its results under the note above it.
function Note({ message, messages = [] }: { message: Msg & { toolCalls?: unknown[] }; messages?: Msg[] }) {
  const text = typeof message.content === "string" ? message.content.trim() : "";
  const n = noteNumbers(messages).get(message.id);
  return (
    <div className={text ? styles.note : styles.noteResults}>
      {text && (
        <>
          <span className={styles.noteNumber} aria-hidden="true">{n}</span>
          <Prose text={text} />
        </>
      )}
      <div className={styles.results}>
        <CopilotChatToolCallsView message={message as never} messages={messages as never} />
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

export function AskPanel({ onOpen }: { onOpen?: (search: string) => void }) {
  return (
    <section className={styles.panel} aria-label="Ask">
      <Show when="signed-out">
        <p className={styles.intro}>Ask a question about Milwaukee data. Answers show the real tables and reports, with their sources.</p>
        <SignInButton mode="modal">
          <button type="button" className={styles.signIn}>Sign in to ask</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <AskChat onOpen={onOpen} />
      </Show>
    </section>
  );
}

function AskChat({ onOpen }: { onOpen?: (search: string) => void }) {
  const status = useQuery(api.ask.status);
  const [unavailable, setUnavailable] = useState(false);
  if (status === undefined) return <p aria-busy="true">Checking your account…</p>;
  if (status === null) return null;
  const blocked = status.paused
    ? "Ask is paused until midnight to stay within today's budget. Search still works."
    : status.left === 0
      ? `You've used today's ${status.limit} questions. They reset at midnight.`
      : null;
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit" enableInspector={false}>
      <AskCards onOpen={onOpen} />
      <CopilotChat
        className={styles.chat}
        labels={{ chatInputPlaceholder: "Ask about Milwaukee data" }}
        welcomeScreen={false}
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
  );
}
