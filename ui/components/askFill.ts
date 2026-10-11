"use client";
import { createContext } from "react";

// The question box's one way in besides typing: the guide's ?prompt= links and the follow-up buttons both set
// `prompt`; the chat view types it in (as if the person had) and focuses the box. Nothing here ever sends.
export const PromptFill = createContext<{ prompt: string; placed: () => void; fill: (text: string) => void }>({
  prompt: "", placed: () => {}, fill: () => {},
});

// The newest answer's tool-call ids (ui/lib/askNotes.ts newestTurnCallIds); FollowUps render only for these.
// Provided once above CopilotKit's memoized messages (an older message never re-renders on a new question, so a
// per-message provider would keep stale ids).
export const NewestTurn = createContext<Set<string>>(new Set());
// Calls the model repeated in the same answer (ui/lib/askNotes.ts retriedCallIds): their "Pick one:" rows are hidden.
export const RetriedCalls = createContext<Set<string>>(new Set());
