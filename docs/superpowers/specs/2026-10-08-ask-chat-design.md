# Cream City Almanac: Ask (Phase 3b) — Design

**Status:** sections approved in conversation 2026-10-08; this document is the written spec for Tarik's review.
**Builds on:** the original design's §8 Ask chat (`docs/superpowers/specs/2026-10-07-cream-city-almanac-design.md`), decisions 003 (AI picks, the app fills in), 004 (Clerk sign-in gates chat), 010 (Ask before Saved), 014 (City data after Ask; source-agnostic tools), and decision 019 (this design's choices).

## 1. Why

Search answers "which dataset?". A reporter on deadline, a nonprofit writing a grant, or a resident has a question, not a keyword: "How many kids under 5 live in poverty in Harambee?" Today they search, open a sheet, pick a neighborhood, a year and a topic, and read the table. Ask takes the question and puts the right table, passage or dataset in front of them, with its source.

**The rule (decision 003):** the AI picks; the app fills in. The AI chooses which dataset, table, neighborhood or passage answers the question. Every number, quote and link the person reads comes from the catalog or the Hub, shown by the app, never typed by the AI.

**Audience:** the three people on Start here: reporters, nonprofits, residents.

**Success:** someone with a real question gets a sourced answer (the right table row, passage or dataset) faster than by searching and clicking through sheets, and no number in an answer comes from the AI's own words.

## 2. Verified facts (2026-10-08)

- **Data Ask reads already exists.** `portraitTables`: 1,564 neighborhood tables, each row an estimate ± margin as DYCU wrote them (`convex/validators.ts` `vPortraitTable`). `docChunks`: 6,931 passages from 279 report PDFs, read weekly by Firecrawl (`convex/build.ts:176`), each with a 1,536-dimension embedding in a vector index (`by_embedding`). Section names, not page numbers, are stored ("Key Takeaways", "How to interpret this table"). Counts are from the dev deployment.
- **Search** is `runSearch` in `convex/search.ts` (keyword + vector, with a degraded mode); the public action spends a shared embedding allowance through `@convex-dev/rate-limiter` (`convex/limits.ts`).
- **Sheets and address:** `familySheet` (`convex/catalog.ts`) loads a dataset's sheet; the laptop pane is driven by the address (`?q=…&open=CODE`, plus `place`, `year`, `topic` for N03 tables).
- **Settings:** a `settings` row holds the build's AI model (`anthropic/claude-sonnet-5.5`), per-token prices ($2 in / $10 out per million) and a $5 build cap. The AI Gateway key is `AI_GATEWAY_API_KEY`.
- **Laptop layout:** list 39%, sheet pane, and a 6% Ask rail placeholder ("ASK / coming soon"; `DESIGN.md` "Ask Rail").
- **Not installed yet:** Clerk and CopilotKit.
- **CopilotKit v2** (Context7, 2026-10-08): the runtime mounts in one Next.js App Router route with `createCopilotRuntimeHandler` and an in-process `BuiltInAgent` from `@copilotkit/runtime/v2`; the handler is created at module scope (a known race if created per request).

## 3. Scope

**In:** Clerk sign-in; the Ask chat on laptop (in the list's column) and phone (its own screen); the five tools; result cards; the gatekeeper (per-person limits, newsroom tier, site budget); the prose number check; an Ask report card; decision 019.

**Out:** page numbers or better PDF reading (an upgrade to the existing passage store, its own project); City of Milwaukee data (Phase 4); saved chats, history or notes (Phase 5); any math across rows, tracts or years; voice; storing question text anywhere.

## 4. How a question flows

1. **Sign in.** Signed out, the ASK rail (laptop) and the ASK tab (phone) show "Sign in to ask", which opens Clerk's sign-in. Search and sheets never require an account.
2. **Ask.** The browser sends the conversation to `/api/copilotkit`, one Vercel route running CopilotKit's runtime with a `BuiltInAgent`.
3. **Gatekeeper first.** Before the model runs, the route calls a Convex mutation with the person's Clerk identity. It refuses with a plain reason when the person is over today's limit or the site is over today's budget (§6). It reserves the question against the person's count.
4. **The AI picks.** The model (from `settings`, Sonnet 5.5) reads the question and calls tools (§5). At most 6 tool calls per answer.
5. **The app fills.** Each tool result renders as a card in the chat (§7). Opening a card puts the real sheet or table in the pane through the same address search uses.
6. **The prose check.** The AI's own text is scanned; any number other than a year or a dataset code is marked unverified (§8).
7. **The meter.** The answer's token usage × the prices in `settings` is added to today's site total.

The conversation lives only in the open tab; nothing about it is stored except the per-person daily count and the site's daily cost.

## 5. The five tools

All tools are read-only and take IDs, not "a DYCU dataset", so City data can plug in later behind the same definitions (decision 014). Each returns facts and IDs for its card; the model sees the same facts, so it can choose what to show next.

| Tool | Input | Reads | Returns |
|---|---|---|---|
| `searchCatalog` | query; optional topic, place, year | `runSearch` | up to 5 result rows (code, name, places, years) |
| `showDataset` | family code | `familySheet` | code, name, places, years, explainer, caveats |
| `previewData` | family code; optional place, year | the family's members | the member's feed URL and headline fields; the card fetches the first rows or chart from the Hub, as sheet previews do today |
| `getNumber` | neighborhood, year, table (topic/tab), row label | one `portraitTables` row | label, estimate, margin, table IDs, vintage, neighborhood, year, the table's notes; refuses anything that would combine rows, tables, places or years |
| `readReport` | question; optional family code or neighborhood | vector search over `docChunks` | up to 3 passages: quote, report name, section, family code |

`readReport` embeds the question with the build's embedding model and spends Ask's own budget, not search's shared embedding allowance.

## 6. Guardrails

| Guardrail | Rule |
|---|---|
| Per person | 30 questions a day; 200 for a verified email at a newsroom domain. Resets at midnight America/Chicago. Stored: account ID, day, count. |
| Newsroom domains | A list in `settings`, starting with `datayoucanuse.org` and `radiomilwaukee.org`; Tarik adds others. |
| Site budget | Today's total cost of Ask answers. At $10 (a setting) Ask pauses until midnight America/Chicago; search keeps working. |
| Per answer | Question ≤ 500 characters; ≤ 6 tool calls; a cap on reply length. |
| Read-only | No tool writes data. |
| Report text is data | Passages are other people's PDF text; the model is told to treat them as quotes, never instructions, and cards show them as quotes. |
| Privacy | Question and answer text is never stored or logged on the server. The input carries "Don't paste private source info." |
| Bots | Clerk's sign-up protection plus the limits above. |

New `settings` fields: `askModel`, `askInputUsdPerToken`, `askOutputUsdPerToken`, `askDailyCapUsd`, `askDailyLimit`, `askNewsroomLimit`, `askNewsroomDomains`.

**Rough cost (arithmetic, not measured):** a question with a few tool calls ≈ 10k tokens in, 500 out ≈ $0.03–0.06 at the settings' prices, so roughly 150–300 questions a day before the $10 pause. The build measures this on the report card (§10) before launch.

## 7. What people see

**Laptop.** Choosing ASK swaps the list column (39%) for the chat; the sheet pane keeps its width; the rail becomes the close (✕) control and brings the list back. **Phone.** Ask is its own screen from the masthead's ASK; Open goes to the sheet page (`/d/CODE…`).

**The chat:** messages; an input at the bottom; one graphite line under it: "27 of 30 questions left today · Don't paste private source info · Sign out" (Tarik, 2026-10-08: signing out returns to the same view, now signed out).

**Margin notes** (Tarik's pick from the comp round, 2026-10-08). Each question sits in a gray band; the answer is a short numbered note in plain words, with no figures. Tool results land as follows:

| Tool | Laptop | Phone |
|---|---|---|
| `getNumber` | The pane opens that exact table (`?open=N03&place=…&year=…&topic=…&row=…`) with the row outlined in ink; an ink leader runs from the note to the row | A compact excerpt of the table under the note (the row and its neighbors, the row outlined, DYCU tag, Census table, "Open the full table →") with a short leader |
| `showDataset`, `previewData` | The pane opens that sheet; the leader points at its heading | The note carries "Open CODE →" (and the live chart for `previewData`) |
| `searchCatalog` | Up to 5 compact ruled rows inside the note, each with Open | Same |
| `readReport` | Quoted passages inside the note with report name and section, each with Open | Same |

Leaders and outlines are ink, never red (red is DYCU's teaching voice, not the AI's).

**Look:** comp-led: laptop `.impeccable/mocks/ask-laptop.webp`, phone `.impeccable/mocks/ask-a-phone.webp`; surface brief `.impeccable/surfaces/ui-components-askpanel-tsx.md`. `DESIGN.md` gains an Ask section.

## 8. The prose number check

The model is instructed never to write figures in its own sentences ("Harambee's poverty-by-age table is open, with your row marked"), because the cards and the open sheet carry every number. A check on each answer marks any number in the model's text as unverified (dotted underline and an "unverified" tag) unless it is:

- a four-digit year (1900–2099) or a dataset code (a letter and two digits, like N03);
- an identifier with letters glued to its digits (Census table B17001, PM2.5);
- inside a quoted row label ("Under 5 years"); a quoted bare figure ("608") still flags;
- a definition (Tarik, 2026-10-08): an age band ("ages 20 to 64", "18 and older"), a survey period ("5-year"), or a table number ("Table 11").

It does not match numbers against data: under this rule, any other number in prose is wrong.

## 8a. Story angles (Tarik, 2026-10-08; decision 020)

Ask also helps reporters find stories. Asked for angles, it reads the datasets first (`showDataset` returns each one's caveats and the story angles on its sheet), then suggests up to three angles of its own as questions, names the datasets each draws on by code, uses their caveats to avoid comparisons the data can't support, and labels them as suggestions to check, not findings. Angles follow every number rule. They are the one list a reply may contain.

## 9. When things break

| Failure | What the person sees |
|---|---|
| A tool fails (Hub down, query error) | That card says it couldn't load and offers Try again |
| The AI service fails | "Ask is unavailable right now. Search still works." |
| Daily limit reached | "You've used today's 30 questions. They reset at midnight." |
| Site budget reached | "Ask is paused until midnight to stay within today's budget." |
| Clerk unavailable | Ask can't open; the rest of the site works |
| No good answer | The model says so and offers a search link; it does not guess |

A failed answer still counts against the person's daily count (the reservation in §4), so retries can't run up cost.

## 10. Testing

- **Unit:** the gatekeeper (30 vs 200 by verified domain; the $10 pause; the midnight America/Chicago reset, including the day boundary); the prose check (flags "6,520" and "18%", allows "2024" and "N03"); cost arithmetic; each tool's output for fixture data; `getNumber` refusing combined rows.
- **Browser:** signed out shows "Sign in to ask" on both screens; signed in with a Clerk test account and a scripted fake model (no real AI calls, no cost): each card type renders, Open fills the pane (laptop) or opens the sheet page (phone), the close control brings the list back, the limit message appears at the limit.
- **Ask report card:** about 20 real questions across the five tools, run against the real model by hand before launch and on demand. Graded on the right card type, dataset, table and neighborhood, and zero unverified numbers. It reports the measured cost per question and stops at a cost cap.

## 11. Open items for planning

- Clerk setup: the Clerk ↔ Convex auth wiring and a test account for browser tests (Clerk's testing tokens).
- How the scripted fake model plugs into `BuiltInAgent` for browser tests (a test-only model setting on the preview and local runs, never production).
- The exact `getNumber` input shape: how the model names a table and row reliably (likely a lookup step that lists a neighborhood's tables first).
- Whether the phone sheet page (`/d/N03`) honors `place`, `year` and `topic` in the address, so a Number card opens the exact table on a phone; if not, add it.
- Whether `previewData`'s card reuses `LivePreview` as is or a compact variant.
- Production order: Convex first (new tables, settings, functions), as in Phases 3a and Start here.
