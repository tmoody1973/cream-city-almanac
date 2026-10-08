# 011: Launch publicly at the end of Phase 2, quietly

**Decision:** The code is a public GitHub repo (MIT license) and the site runs on Vercel production at the end of Phase 2. The link isn't shared until the laptop layout ships.

**Why this came up:** Phase 2 made the product usable: search, results that open in place, and dataset sheets. It could stay on a laptop, go to a private preview link, or go public. Going public means real infrastructure (a production database, CI, branch protection) and a public record of the code, which is both the point (portfolio) and a risk (anyone can read it, including any mistake).

**Options:**
1. **Keep it local.** Cost: nobody can use it, and nothing proves it runs anywhere but one laptop.
2. **A private preview link.** Cost: half-real. Real readers and the weekly job would still need a production setup later.
3. **Public repo and production now.** Cost: the setup work (secrets scan, CI, production keys and data), and the code is visible to anyone.

**What we chose and why:** Option 3 (Tarik). Before going public: a scan of every commit for keys (clean, confirmed independently by GitHub's GitGuardian check); CI that runs typechecks, tests and the build on every change, proven by deliberately breaking a test; branch protection on `main`; and a full code review, with every important finding fixed under a test. The production catalog was copied from dev rather than rebuilt, so launch cost no AI spend. After launch Tarik chose to keep the link private ("launch quietly") until the laptop layout is done (decision 008).

**What we gave up:** Privacy of the code and its history (commit emails included, by Tarik's choice). A real desktop design at launch: today's desktop is the phone layout in a wider column.

**How we'll know if this was right:** Three reporters each complete five real lookups on the live site in under 60 seconds apiece, and the weekly rebuild and search check stay green without anyone touching them.

**What actually happened:**
