# 004: Require sign-in (Clerk) for chat and saving; keep search public

**Decision:** Clerk (a hosted sign-in service) handles accounts. Signing in unlocks the Ask chat and saving datasets, chats, and notes. Search and dataset pages need no account.

**Why this came up:** Tarik wanted to save chats. Saving needs to know who you are. There was a second, bigger reason: a public demo with an AI chat lets anyone run up the AI bill. Without accounts there's no fair way to limit usage.

**Options:**
1. **No accounts:** simplest. Cost: chats vanish on refresh, and the only cost protection is a global cap that one heavy user can exhaust for everyone.
2. **Clerk for sign-in, a database for saved data:** per-person daily limits and saving. Cost: one more vendor, and visitors must sign in to chat.
3. **Clerk plus CopilotKit's paid chat-history service ("Intelligence"):** chat history and resume-on-another-device built in. Cost: pricing unchecked, chats stored with CopilotKit, and saved datasets still need a home elsewhere.

**What we chose and why:** Option 2. Tarik proposed Clerk; Claude framed sign-in as the cost guard; Tarik chose our own storage (which became Convex, decision 002) over CopilotKit's service. Defaults: 30 chat messages a day per person, 200 for the newsroom's email domain, a $10/day global cap.

**What we gave up:** Portfolio visitors must sign in before they can try the chat, which some won't do. Accounts add a privacy duty: saved chats are personal data.

**How we'll know if this was right:** Monthly AI spend stays under the caps, and at least half of portfolio reviewers who open Ask go on to sign in.

**What actually happened:**
