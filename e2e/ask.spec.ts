// The shared fixtures add the Vercel preview bypass in CI.
import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

test("signed out, Ask offers sign-in and search stays public", async ({ page }, info) => {
  await page.goto(info.project.name === "phone" ? "/ask" : "/search?ask=1");
  await expect(page.getByRole("button", { name: "Sign in to ask" })).toBeVisible();
  await page.goto("/d/N03");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("signed out, Ask shows the waiting question and links to examples", async ({ page }) => {
  await page.goto("/ask?prompt=" + encodeURIComponent("Rent & burden in Lincoln Park"));
  await expect(page.getByText("Your question is waiting: “Rent & burden in Lincoln Park”").filter({ visible: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /what can i ask/i }).filter({ visible: true }).first()).toHaveAttribute("href", "/ask/guide");
});

test("signed out, there is no ACCOUNT", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("link", { name: "ASK" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^account$/i })).toHaveCount(0);
});

test("the masthead ASK is a link", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("link", { name: "ASK" }).first()).toHaveAttribute("href", "/ask");
});

test.describe("signed in", () => {
  test.skip(!process.env.E2E_CLERK_USER_EMAIL || !process.env.CLERK_SECRET_KEY, "needs a Clerk test user");

  test.beforeEach(async ({ page }, info) => {
    const { clerk, setupClerkTestingToken } = await import("@clerk/testing/playwright");
    await setupClerkTestingToken({ page });
    // The scripted test model (lib/ask/model.ts): no real AI calls, no cost, not counted against the account.
    // Only our route gets the header (sent everywhere it breaks Clerk's cross-origin requests); fallback() then lets
    // the fixtures' preview-bypass route add its header too.
    await page.route("**/api/copilotkit/**", (route) => route.fallback({ headers: { ...route.request().headers(), "x-ask-fake": "1" } }));
    // Sign in on the page under test, then reload: Clerk navigates on its own after signing in.
    const target = info.project.name === "phone" ? "/ask" : "/search?ask=1";
    await page.goto(target);
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
    // Clerk may still be redirecting after sign-in; a canceled reload just means load the page fresh.
    await page.reload().catch(() => page.goto(target));
  });

  // The chat accepts a question once it has connected; retry Enter until the box empties (the question was sent).
  const ask = async (page: import("@playwright/test").Page, q: string) => {
    const box = page.getByPlaceholder("Ask about Milwaukee data");
    await box.fill(q);
    await expect(async () => {
      if ((await box.inputValue()) !== "") await box.press("Enter");
      await expect(box).toHaveValue("", { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  };

  test("a poverty question opens the Harambee table with the row marked (laptop) or excerpted (phone)", async ({ page }, info) => {
    await ask(page, "How many kids under 5 are in poverty in Harambee?");
    await expect(page.getByText("Here is what the data shows.")).toBeVisible({ timeout: 30_000 });
    if (info.project.name === "phone") {
      const card = page.locator("[data-card=number]");
      await expect(card.locator("[data-row-marked]")).toContainText("Under 5 years");
      await expect(card).toContainText("±");
      await expect(card.getByRole("link", { name: /Open the full table/ })).toHaveAttribute("href", /\/d\/N03\?place=harambee&year=\d{4}&topic=poverty-status-by-age&row=2/);
    } else {
      await expect(page.locator("#sheet-pane [data-row-marked]")).toContainText("Under 5 years", { timeout: 20_000 });
      await expect(page).toHaveURL(/ask=1.*open=N03.*row=2/);
      await expect(page.locator("svg[data-leader] path").first()).toBeAttached();
    }
  });

  test("an air question shows the live preview", async ({ page }) => {
    await ask(page, "What has the air been like?");
    await expect(page.locator("[data-card=preview]")).toContainText("Daily Air Quality", { timeout: 30_000 });
  });

  test("a report passage reads as lines, lists and tables, not one run of text", async ({ page }) => {
    await ask(page, "What did the Harambee report say?");
    const passage = page.locator("[data-card=passage]").first();
    await expect(passage).toBeVisible({ timeout: 30_000 });
    expect(await passage.locator("p, li, tr").count()).toBeGreaterThan(1);
    await expect(passage).not.toContainText("| --- |");
    // A quote copies as text only: no CSV, no image.
    await expect(passage.locator("[data-export]").getByRole("button")).toHaveText(["Copy text"]);
  });

  test("a reply keeps its paragraphs and its list of story angles", async ({ page }) => {
    await ask(page, "story angles please");
    const prose = page.locator("[data-ask-prose]").last();
    await expect(prose.locator("li")).toHaveCount(3, { timeout: 30_000 });
    await expect(prose.locator("p")).toHaveCount(2);
    await expect(prose.locator("li").first()).toHaveText("Where it is highest");
  });

  test("a dataset opened twice in one answer shows one card", async ({ page }) => {
    await ask(page, "open it twice");
    await expect(page.locator("[data-card=preview]")).toContainText("Daily Air Quality", { timeout: 30_000 });
    await expect(page.locator("[data-card=preview]")).toHaveCount(1);
    await expect(page.locator("[data-card=dataset]")).toHaveCount(0);
  });

  test("a figure in the model's words is marked unverified", async ({ page }) => {
    await ask(page, "unverified please");
    await expect(page.locator("mark[data-unverified]")).toContainText("608", { timeout: 30_000 });
  });

  test("when the model fails, Ask says it's unavailable and search still works", async ({ page }) => {
    await ask(page, "fail please");
    await expect(page.getByText("Ask is unavailable right now. Search still works.")).toBeVisible({ timeout: 30_000 });
  });

  test("closing and reopening Ask on a laptop keeps the conversation", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "laptop only");
    await ask(page, "unverified please");
    await expect(page.locator("mark[data-unverified]")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Close Ask" }).click();
    await expect(page.getByText("UPDATED THIS SEASON")).toBeVisible();
    await page.getByRole("link", { name: "Open Ask" }).click();
    await expect(page.locator("mark[data-unverified]")).toBeVisible();
  });

  test("on a phone, opening the full table keeps the chat (a new tab)", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "phone only");
    await ask(page, "How many kids under 5 are in poverty in Harambee?");
    await expect(page.locator("[data-card=number] a")).toHaveAttribute("target", "_blank", { timeout: 30_000 });
  });

  test("a good answer after a failure clears the unavailable line", async ({ page }) => {
    await ask(page, "fail please");
    await expect(page.getByText("Ask is unavailable right now. Search still works.")).toBeVisible({ timeout: 30_000 });
    await ask(page, "unverified please");
    await expect(page.locator("mark[data-unverified]")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Ask is unavailable right now. Search still works.")).toHaveCount(0);
  });

  test("closing Ask brings the list back on a laptop", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "laptop only");
    await page.getByRole("link", { name: "Close Ask" }).click();
    await expect(page.getByText("UPDATED THIS SEASON")).toBeVisible();
  });

  test("ACCOUNT on every page opens Clerk's account window", async ({ page }) => {
    await page.goto("/start-here");
    await page.getByRole("button", { name: /^account$/i }).filter({ visible: true }).first().click();
    await expect(page.locator(".cl-userProfile-root")).toBeVisible({ timeout: 15_000 });
  });

  test("signed in, the laptop masthead keeps every label on one line and START HERE keeps its rule", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    for (const path of ["/start-here", "/search?ask=1"])
      for (const width of [1100, 1180, 1280, 1440, 1536, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.getByRole("button", { name: /^account$/i }).first().waitFor();
        const r = await page.evaluate(() => {
          const nav = document.querySelector("nav[aria-label=Site]")!;
          const items = [...nav.children] as HTMLElement[];
          const start = items.find((e) => e.textContent === "START HERE")!;
          return {
            broken: items.filter((e) => e.getClientRects().length > 1 || e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).fontSize) * 1.6).map((e) => e.textContent),
            past: Math.round(nav.getBoundingClientRect().right - innerWidth),
            startRule: getComputedStyle(start, "::before").borderLeftWidth,
            rules: items.filter((e) => getComputedStyle(e, "::before").borderLeftWidth === "1px").map((e) => e.textContent),
          };
        });
        expect({ path, width, ...r }).toEqual({ path, width, broken: [], past: expect.any(Number), startRule: "1px", rules: ["START HERE", "HOW IT WORKS", "ACCOUNT"] });
        expect(r.past, `${path} at ${width}`).toBeLessThanOrEqual(0);
      }
  });

  test("SIGN OUT on every page signs you out and keeps the page", async ({ page }) => {
    await page.goto("/start-here");
    await page.getByRole("button", { name: /^sign out$/i }).filter({ visible: true }).first().click();
    await expect(page.getByRole("button", { name: /^account$/i })).toHaveCount(0, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/start-here/);
  });

  test("a prompt in the address lands in the box, focused, unsent, and only once", async ({ page }, info) => {
    const q = "Rent & burden in Lincoln Park";
    await page.goto("/ask?prompt=" + encodeURIComponent(q));
    const box = page.getByPlaceholder("Ask about Milwaukee data");
    await expect(box).toHaveValue(q, { timeout: 20_000 });
    await expect(box).toBeFocused();
    await page.waitForTimeout(1500);
    await expect(page.locator("[data-ask-question]")).toHaveCount(0);
    await expect(page).not.toHaveURL(/prompt=/);
    if (info.project.name === "desktop") await expect(page).toHaveURL(/ask=1/);
    await page.reload();
    await expect(page.getByPlaceholder("Ask about Milwaukee data")).toHaveValue("", { timeout: 20_000 });
  });

  test("a City count arrives as a card with the count, its filters in words and the CITY tag", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How many thefts by month?");
    const card = page.locator("[data-card=count]").first();
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("All Other Larceny");
    await expect(card.locator("[data-count]")).toHaveText(/^\d{1,3}(,\d{3})*$/);
    await expect(card.getByTitle("From the City of Milwaukee's open data")).toBeVisible();
    await expect(card.getByRole("link", { name: /open the data/i })).toBeVisible();
  });

  test("a how-long question draws a time-span card with medians, open cases and the export line", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How long do complaints take to close, by department?");
    const card = page.locator("[data-card=span]:visible").first();
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("time to close · by Department");
    await expect(card.locator("[data-summary]")).toContainText(/half of the complaints measured took [\d,.]+ days? or less to close/);
    await expect(card.locator("tbody tr").first()).toContainText("Milwaukee Police Department");
    await expect(card).toContainText(/aren't closed yet/);
    await expect(card.getByTitle("From the City of Milwaukee's open data")).toBeVisible();
    await expect(card.locator("[data-export]").getByRole("button", { name: "CSV" })).toBeVisible();
    // A phone scrolls the table inside the card, never the page.
    await expect(card.getByRole("region", { name: /scroll sideways/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a how-much question draws a measure card with records, total and median", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How much back property tax is owed, by aldermanic district?");
    const card = page.locator("[data-card=measure]:visible").first();
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("back tax owed · by Ald Dist");
    await expect(card.locator("thead")).toContainText("Records");
    await expect(card.locator("thead")).toContainText("Total");
    await expect(card.locator("thead")).toContainText("Median");
    await expect(card.locator("[data-summary]")).toContainText(/accounts total \$[\d.,]+ (million|billion)?/);
    await expect(card).toContainText("owner's mailing ZIP");
    await expect(card.getByRole("region", { name: /scroll sideways/ })).toBeVisible();
    await expect(card.locator("[data-export]").getByRole("button", { name: "CSV" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a fact-sheet question links to the printable sheet", async ({ page }) => {
    await ask(page, "Give me a fact sheet for Harambee");
    const card = page.locator("[data-card=fact-sheet]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card.getByRole("link", { name: /Open the fact sheet/ })).toHaveAttribute("href", "/n/harambee");
  });

  test("an address question draws where it is, and says where the address went", async ({ page }) => {
    await ask(page, "What neighborhood is 2400 W Center St in?");
    const card = page.locator("[data-card=place]:visible");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("Census tract");
    await expect(card).toContainText("U.S. Census Bureau");
    await expect(card.locator("[data-boundaries]")).toBeVisible();
  });

  test("a neighborhood count names the City boundary it used", async ({ page }) => {
    test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
    await ask(page, "How many robberies in Harambee this year?");
    // The broad first count folds to one line; the open card is the robbery count.
    await expect(page.locator("[data-earlier-count]")).toHaveCount(1, { timeout: 40_000 });
    const card = page.locator("[data-card=count]:visible");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Robbery");
    await expect(card.locator("[data-area]")).toHaveText("In Harambee (City of Milwaukee boundary)");
    await expect(card.locator("[data-count]")).toHaveText(/^\d{1,3}(,\d{3})*$/);
    await expect(card.locator("[data-map-summary]")).toContainText("records in");
    await expect(card.locator("[data-map] canvas")).toHaveCount(1);
    // One live map: the folded earlier count draws none, so the page holds exactly one map canvas.
    await expect(page.locator("[data-map] canvas")).toHaveCount(1);
  });

  // The tract tools call the real DYCU FeatureServer through dev Convex; skip when it can't be reached.
  const dycuUp = (page: import("@playwright/test").Page) =>
    page.request.get("https://services.arcgis.com/").then((r) => r.status() < 500).catch(() => false);

  test("a ranking question draws a ranked tract table with ranges", async ({ page }, info) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "rank tracts by poverty");
    const card = page.locator("[data-card=tract-rank]:visible");
    await expect(card.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText("pov_rate");
    await expect(card).toContainText("90% confidence (Census)");
    await expect(card.locator("tbody tr").first().locator("td").first()).toHaveText("1");
    // Units only where DYCU says percent; the meaning stops before its formula; extra ties fold away.
    await expect(card.locator("tbody tr").first()).toContainText(/\d%/);
    await expect(card).not.toContainText("Calculation:");
    // The ten highlighted tracts are drawn from DYCU's own service: the map shows, then its shapes are on it.
    await expect(card.locator("[data-map]")).toBeVisible();
    await expect(card.locator("[data-map][data-drawn][data-tracts]")).toHaveCount(1, { timeout: 30_000 });
    await expect(card.locator("details[data-ties]")).toHaveCount(1);
    // Two names per tract: the City's neighborhoods (biggest first, "+N" for the rest) and every DYCU area.
    const head = card.locator("thead").first(); // the top-10 table (ties and too-uncertain tables follow)
    await expect(head).toContainText("Neighborhood");
    await expect(head).toContainText("DYCU area");
    await expect(card).toContainText("the City's official neighborhoods covering at least 10% of the tract");
    // The highest-poverty tracts are in the City; most overlap several neighborhoods, so "+N" opens the shares.
    const more = card.locator("details[data-places]").first();
    await expect(more).toBeVisible();
    await more.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(more).toHaveAttribute("open", "");
    await expect(more).toContainText(/\d+%/);
    // The extra column scrolls inside the card; the page itself never scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(card.getByRole("link", { name: "How neighborhoods work" })).toHaveAttribute("href", "/how-it-works#neighborhoods");
    // The plain sentence leads, written by code from the same counts.
    await expect(card.locator("[data-summary]")).toContainText(/^These are the 10 census tracts in Milwaukee County with the highest /);
    // The caveat link keeps the chat: a new tab on a phone, the side pane on a laptop.
    const caveat = card.getByRole("link", { name: /E02/ });
    if (info.project.name === "phone") await expect(caveat).toHaveAttribute("target", "_blank");
    else {
      await caveat.click();
      await expect(page).toHaveURL(/\/search/);
      await expect(page.getByText("rank tracts by poverty")).toBeVisible();
    }
  });

  test("a neighborhood's tracts arrive as every tract in it, with its share and citywide rank", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "What's the poverty rate in Bay View's tracts?");
    const card = page.locator("[data-card=tract-rank]:visible");
    await expect(card.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    await expect(card.locator("[data-area]")).toContainText("Bay View (City of Milwaukee boundary)");
    await expect(card).toContainText(/\d+% of this tract is in Bay View/);
    await expect(card).toContainText(/\d+(st|nd|rd|th) highest of \d+/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a growth question draws the counts line and only the clear changes", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "where did poverty grow most");
    const card = page.locator("[data-card=tract-change]:visible");
    await expect(card).toContainText(/\d+ clear increases · \d+ clear decreases · \d+ no clear change/, { timeout: 60_000 });
    await expect(card).toContainText("90% confidence (Census)");
    await expect(card).toContainText("neighboring releases share four years of responses"); // the overlapping-release caveat
    await expect(card.locator("[data-summary]")).toContainText(/^(From \d{4} to \d{4} in Milwaukee County|Can't tell)/);
  });

  test("a mismatch question draws the scatter, says what it found in plain words, and opens big", async ({ page }, info) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "food insecurity low despite high poverty");
    const card = page.locator("[data-card=tract-relate]:visible");
    await expect(card.locator("svg[role=img]")).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(/clear match|No clear match/);
    await expect(card.locator("[data-summary]")).toContainText(/^We looked for census tracts in Milwaukee County/);
    await expect(card).toContainText("Related doesn't mean one causes the other.");
    // Near-misses are outlined even when nothing clearly fits: the map is there, with its tracts drawn.
    await expect(card.locator("[data-map][data-tracts]")).toBeVisible({ timeout: 30_000 });
    // EXPAND: the plot and the map at full size in a modal window; Escape closes it and focus comes back to EXPAND.
    const expand = card.getByRole("button", { name: /expand/i });
    await expand.click();
    const big = page.locator("dialog[data-big-view][open]");
    await expect(big.locator("[data-scatter=big] svg[role=img]")).toBeVisible();
    await expect(big.locator("[data-map][data-tracts]")).toBeVisible({ timeout: 30_000 });
    if (info.project.name !== "phone") {
      const width = (l: import("@playwright/test").Locator) => l.evaluate((e) => e.getBoundingClientRect().width);
      expect(await width(big.locator("[data-scatter=big] svg"))).toBeGreaterThan(await width(card.locator("[data-scatter=card] svg")));
    }
    await page.keyboard.press("Escape");
    await expect(big).toHaveCount(0);
    await expect(expand).toBeFocused();
  });

  const cityUp = (page: import("@playwright/test").Page) =>
    page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false);

  test("a property count says it plainly, by district, with the tracts on the map and no addresses", async ({ page }) => {
    test.skip(!(await cityUp(page)) || !(await dycuUp(page)), "City or DYCU unreachable");
    await ask(page, "how many properties over 200000");
    const card = page.locator("[data-card=count]:visible");
    await expect(card.locator("[data-summary]")).toContainText(/^[\d,]+ properties in the City of Milwaukee are assessed over \$200,000 \(\d{4} assessment\), out of [\d,]+ with an assessed value\./, { timeout: 60_000 });
    await expect(card).toContainText("Aldermanic district");
    await expect(card.locator("[data-map][data-tracts]")).toBeVisible({ timeout: 30_000 });
    await expect(card).not.toContainText(/OWNER|TAXKEY/);
  });

  test("home values line up with broadband as exact City figures", async ({ page }) => {
    test.skip(!(await cityUp(page)) || !(await dycuUp(page)), "City or DYCU unreachable");
    await ask(page, "do home values go with broadband");
    const card = page.locator("[data-card=tract-relate]:visible");
    await expect(card.locator("[data-summary]")).toContainText("assessment and 2023 survey", { timeout: 60_000 });
    await expect(card).toContainText("exact (City records)");
    await expect(card).toContainText("Assessed value is the City's figure for property taxes");
  });

  test("next-question buttons fill the box, never send, and only the newest answer has them", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "rank tracts by poverty");
    const card = page.locator("[data-card=tract-rank]:visible");
    await expect(card.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    const left = await page.getByText(/of \d+ questions left today/).first().textContent();
    const row = page.locator("[data-follow-ups=next]").filter({ visible: true });
    await row.getByRole("button", { name: "SHOW THE LOWEST" }).click();
    const box = page.getByPlaceholder("Ask about Milwaukee data");
    await expect(box).toHaveValue(/lowest first.*\(E02 pov_rate\)/);
    await expect(box).toBeFocused();
    // A second button replaces the text; still nothing sent.
    await row.getByRole("button", { name: "WHAT GOES WITH IT?" }).click();
    await expect(box).toHaveValue(/^What else goes with .*\(E02 pov_rate\)$/);
    await expect(page.getByText(/of \d+ questions left today/).first()).toHaveText(left ?? "");
    // A newer question takes the buttons with it.
    await box.fill("");
    await ask(page, "What has the air been like?");
    await expect(page.locator("[data-card=preview]")).toContainText("Daily Air Quality", { timeout: 30_000 });
    await expect(page.locator("[data-follow-ups=next]").filter({ visible: true })).toHaveCount(1);
    await expect(page.locator("[data-follow-ups=next]").filter({ visible: true }).getByRole("button", { name: "SHOW THE LOWEST" })).toHaveCount(0);
  });

  test("a tract card exports CSV, text and a PNG, each with its source", async ({ page, context }, info) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "rank tracts by poverty");
    const card = page.locator("[data-card=tract-rank]:visible");
    await expect(card.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    const bar = card.locator("[data-export]");
    await expect(bar.getByRole("button", { name: "CSV" })).toBeEnabled({ timeout: 30_000 });

    const [csv] = await Promise.all([page.waitForEvent("download"), bar.getByRole("button", { name: "CSV" }).click()]);
    expect(csv.suggestedFilename()).toBe("almanac_E02-pov_rate_County-2023_rank.csv");
    const text = (await readFile(await csv.path())).toString("utf8");
    expect(text).toContain("Rank,Tract,GEOID,City neighborhoods,DYCU areas,pov_rate (percent),Low,High,Status");
    expect(text).toContain("Source: DYCU, E02");

    const [png] = await Promise.all([page.waitForEvent("download"), bar.getByRole("button", { name: "PNG" }).click()]);
    expect(png.suggestedFilename()).toBe("almanac_E02-pov_rate_County-2023_rank.png");
    expect([...(await readFile(await png.path())).subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // Only Chromium lets a test read the clipboard; the phone project runs WebKit.
    if (info.project.name !== "phone") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await bar.getByRole("button", { name: "Copy text" }).click();
      await expect(bar.getByRole("status")).toHaveText("Copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Highest pov_rate · County 2023\n/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a wrong column offers the server's columns as 'Pick one:' buttons", async ({ page }) => {
    test.skip(!(await dycuUp(page)), "DYCU unreachable");
    await ask(page, "wrong column");
    const pick = page.locator("[data-follow-ups=pick]").filter({ visible: true });
    await expect(pick).toContainText("Pick one:", { timeout: 60_000 });
    await expect(pick.getByRole("button", { name: /\(pov_rate\)/ })).toBeVisible();
    await pick.getByRole("button", { name: /\(pov_rate\)/ }).click();
    await expect(page.getByPlaceholder("Ask about Milwaukee data")).toHaveValue(/^Rank census tracts by .*\(E02 pov_rate\)\.$/);
  });

  test("shows today's count and a way to sign out", async ({ page }) => {
    await expect(page.getByText(/of \d+ questions left today/)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("copilot-input-overlay").getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign in to ask" })).toBeVisible();
  });
});

test("a table address with row= outlines that row", async ({ page }) => {
  // row is the row's position in the table (labels repeat across sections in some tables); 2 is "Under 5 years".
  await page.goto("/d/N03?place=harambee&year=2024&topic=poverty-status-by-age&row=2");
  await expect(page.locator("[data-row-marked]")).toContainText("Under 5 years");
});

test.describe("signing in with a waiting question", () => {
  test.skip(!process.env.E2E_CLERK_USER_EMAIL || !process.env.CLERK_SECRET_KEY, "needs a Clerk test user");
  test("the question is in the box after sign-in", async ({ page }) => {
    const { clerk, setupClerkTestingToken } = await import("@clerk/testing/playwright");
    await setupClerkTestingToken({ page });
    await page.goto("/ask?prompt=" + encodeURIComponent("How old are the homes in Harambee?"));
    await expect(page.getByText(/Your question is waiting/).filter({ visible: true })).toBeVisible({ timeout: 15_000 });
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
    await expect(page.getByPlaceholder("Ask about Milwaukee data")).toHaveValue("How old are the homes in Harambee?", { timeout: 20_000 });
  });
});
