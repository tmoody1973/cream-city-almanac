# Cream City Almanac: How to Use Ask — Design

Approved in conversation 2026-10-09 (Tarik): Part 1 (page and behavior) and Part 2 (build, design check, testing).
Follows the Ask spec (`2026-10-08-ask-chat-design.md`), decisions 019 and 020, and Start here (decision 018).

## 1. Why

Ask's empty panel is a bare input. A newcomer doesn't know what Ask is good at (exact figures with margins, what a
neighborhood report says, caveats, story angles) or what it refuses (guessing figures, forecasts, opinions), and
doesn't know how to read an answer: the number lives in the card, not the sentence, and figures in the AI's own
words are marked unverified. Start here teaches searching by hand; nothing teaches Ask.

## 2. Verified facts (2026-10-09)

- `api.ask.getNumber` is a public query (no identity): the guide can draw a live card signed out, with no AI call.
- CopilotKit's chat view takes `inputValue` / `onInputChange`, so Ask's input can start with a question typed in.
- The report card (`scripts/ask-questions.ts`, `npm run ask:card`) grades the real model, ~$0.035 per question.
- The phone menu (`PhoneMenu.tsx`) and the footer (`CreditFooter.tsx`) list site pages; Start here's layout
  (three ruled columns on laptops, stacked on phones) is approved and in `start.module.css`.

## 3. Scope

In: the `/ask/guide` page; `?prompt=` prefill on Ask (phone `/ask`, laptop `/?ask=1`); links in from Ask's empty
panel, Start here, the footer and the phone menu; a shared example list graded by the report card; decision 022.
Out: auto-sending a question; new Ask tools; saved or shared conversations; examples for City open data (Phase 4).

## 4. The page: `/ask/guide` (one order on every screen)

Masthead side "HOW TO USE ASK"; heading "HOW TO USE ASK".

1. **What Ask is** (two lines): a reference desk for DYCU's data. It looks things up and points to the exact table
   or report passage; every figure comes from the data, never from the AI's own words.
2. **Reading an answer**: one live, annotated sample (§5).
3. **What to ask**: three role sections, laptop columns / phone stack, each a heading, a one-line purpose and 3–4
   example questions. Each example is a link to Ask with the question typed in (§6).
   - **A JOURNALIST**: figures with margins, what a report says, caveats before publishing, story angles.
   - **A NONPROFIT**: grant-ready figures for a neighborhood, what a table covers, a report's key takeaways.
   - **A CITIZEN**: the air lately, what data exists on a topic, how old the homes are, how to read the tables.
4. **What Ask won't do**: guess or forecast figures; give opinions; reach data outside DYCU's catalog; remember a
   conversation after the tab closes. 30 questions a day per account, 200 with a newsroom email (convex/settings.ts); sign-in required.
5. Footer as on every page.

## 5. The live sample

Built from Ask's own components, so it always looks like the app:

- the question band ("How many kids under 5 live in poverty in Harambee?");
- numbered note 1 with fixed, figure-free prose ("Here is what the data shows.");
- the number card for Harambee's newest year, Poverty Status by Age, "Under 5 years", filled by `getNumber` with the
  same nearby-rows excerpt Ask shows on phones, and the "Open the full table" link;
- one sample sentence with a figure marked unverified, labeled as an example of the mark (its figure is made up and
  says so, so no real-looking number is typed into the page).

Grease-pencil notes, in How it works' hand and red (`PencilNote`): "the number comes from this card", "this opens
the full table", "a figure in the AI's words gets marked like this". Laptop: notes in the margin with arrows. Phone:
each note sits above the part it explains. While loading: the card's empty ruled rows. If `getNumber` fails or the
row is gone: "Live data didn't load. The examples below still work." and the rest of the page renders.

## 6. Examples and prefill

- One list, `lib/ask/examples.ts`: `{ role, question, tool }[]`, 3–4 per role. The guide renders it; the report
  card imports it, so every example is graded against the real model before shipping. An example that fails is
  reworded or dropped; none ships failing.
- Starting list (all but two already pass the report card):
  - Journalist: story angles about old housing and health; caveats on Housing Built Before 1950; what the Harambee
    report says about housing; kids under 5 in poverty in Harambee.
  - Nonprofit: households without a car in Harambee; what renters pay in Lincoln Park; how many adults in Harambee
    finished high school (new); key takeaways for Lincoln Park.
  - Citizen: the air in Milwaukee lately; is there data on asthma; how old the homes in Harambee are; what "margin
    of error" means on these tables (new).
- Each example links to `/ask?prompt=<question>` on phones and `/?ask=1&prompt=<question>` on laptops (one link
  that the existing laptop redirect carries). Ask puts the text in its input, focused, **not sent**. The prompt is
  read once, then removed from the address so a reload doesn't re-insert it, and capped at 500 characters like any
  question. Signed out: the "Sign in to ask" panel shows the waiting question; after sign-in it is in the input.
- Ask's empty panel gains a line: "What can I ask? See examples →" to `/ask/guide`.

## 7. Links in

Ask's empty panel (§6); Start here, one line under the lede: "Prefer to ask in plain English? How to use Ask →";
the footer ("How to use Ask"); the phone menu (HOW TO USE ASK, after ASK). Laptop masthead links stay as they are.

## 8. Errors and edge cases

- `prompt` longer than 500 characters: cut to 500. Empty or whitespace: ignored.
- A prompt arriving while a conversation exists: it replaces whatever is in the input, never sends.
- Paused or limit-reached Ask: the prompt is still placed; the existing blocked message explains why it can't send.
- Live sample offline: §5's message; examples and text still render.

## 9. Testing

- Unit: the example list has 3–4 per role and every entry appears in the report card's list; prompt parsing
  (trim, cap, empty).
- e2e (fake model): the page renders the sample card with a live value and all three roles; an example opens Ask
  with its question in the input and nothing sent (the "left today" count unchanged, no answer appears); signed
  out, sign-in keeps the question; reload doesn't re-insert it; links in from the panel, Start here, the footer and
  the phone menu; axe in light and dark; no sideways scroll on a phone.
- Report card: `npm run ask:card` with the new examples, all passing, before the PR is opened.

## 10. Design process

No new comp round: the page reuses Start here's approved layout, its type, and How it works' grease-pencil notes.
Finish: the design reviewer checks the page against DESIGN.md in light and dark, laptop and phone. DESIGN.md gains a
"How to use Ask" section; decision 022 records why the guide is a page and why its examples must pass the report card.

## 11. Open items for planning

- Confirm `inputValue` reaches the input through `CopilotChat` (else use the textArea slot's `value`/`onChange`).
- Choose the live sample's year at render time (newest year with the row), not hard-coded.
