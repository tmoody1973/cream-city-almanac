# 001: Use DYCU's Hub catalog as the backbone, not the Google Sheet

**Decision:** The app's list of datasets comes from DYCU's ArcGIS Hub catalog feed. The Google Sheet only adds column definitions.

**Why this came up:** The request started from the Google Sheet and assumed Firecrawl (a service that reads web pages and turns them into clean text) would pull details from the sheet's links. When we opened the sheet, all 60 of its links pointed to other tabs in the same file, not to websites, so there was nothing to crawl. Then Tarik shared the Hub link. The Hub turned out to hold 382 items (the sheet lists 101), with real download links. If we had built on the sheet, the app would have missed most of the data and still had no way to download anything.

**Options:**
1. **Build on the sheet.** Simple, and it's what DYCU staff already edit. Cost: 101 of 382 items, no download links, typos and wrong tags baked in.
2. **Scrape the Hub's web pages with Firecrawl.** Works on any site. Cost: slow and fragile, and it pays to re-read pages the Hub already offers as structured data.
3. **Read the Hub's public catalog feed (DCAT, a standard format governments use to list open data), and add the sheet's definitions on top.** Cost: we depend on the Hub's feed format staying stable.

**What we chose and why:** Option 3. Claude found the feed and recommended it; Tarik agreed when approving the architecture. The feed is free, structured, and complete, and it includes "last updated" dates, so we only re-process what changed. Firecrawl moves to the work it's actually good at: reading the 180 report PDFs and the source agencies' websites.

**What we gave up:** If DYCU changes or removes the feed, the weekly refresh breaks until we adapt. The sheet's hand-written notes about datasets that aren't on the Hub are ignored.

**How we'll know if this was right:** The first full build matches every one of the Hub's datasets to a family, and the mismatch report lists fewer than 10 items needing a hand fix.

**What actually happened:**
