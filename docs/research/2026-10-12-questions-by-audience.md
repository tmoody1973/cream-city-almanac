# What People Will Want to Know: Questions by Audience

Cream City Almanac · drafted 2026-10-12

This is a working list of questions that **journalists, nonprofits and residents** are likely to bring to Cream City Almanac. Each question is grounded in a dataset the platform actually holds. Every question carries an honest label for whether Ask can answer it today.

It serves three purposes:
- **Prompts for the Ask guide and the landing page.** It shows what to advertise.
- **A test list for Ask.** Questions marked "Now" should get the right card.
- **A roadmap.** The "Not yet" questions show where the platform falls short of what people will ask.

## How to read the labels

| Label | Meaning |
|---|---|
| **Now** | Ask answers it with a card built from the data (the card's numbers come from code, never the AI). |
| **Partly** | Ask finds the right dataset, explains its columns and caveats, and links the download or app, but the specific number needs the data opened outside Ask, or only part of the question works. |
| **Not yet** | The data is on the platform, but Ask can't do this calculation yet. These are candidates for future projects. |
| **Not in the data** | The platform doesn't hold this. The answer says so instead of guessing. |

**What Ask can do today, in plain words:**
- **Find and explain.** Search the catalog; open a dataset's sheet (what it measures, every column, caveats, story angles); preview a chart.
- **Neighborhood figures.** One number from a DYCU Neighborhood Portrait table, with its margin of error, for the neighborhoods DYCU profiles (Harambee, Lincoln Park, Clarke Square and others).
- **Report quotes.** Passages from DYCU's report PDFs, with the report and section named.
- **City counts.** Live counts from 67 City of Milwaukee files, by date range, by values of their columns (district, type, ZIP, department …), grouped by month, year or a column. The four files with locations (NIBRS crime, fire incidents, MFD calls, libraries) can also be counted inside a City neighborhood's official boundary.
- **Tract analysis.** For DYCU's census-tract datasets (32 of them): rank tracts, find tracts that changed clearly between years, and test whether two measures go together or find mismatches. All of this is done with margins of error. Each tract is named by its City neighborhoods and DYCU areas.
- **Property.** Counts from the City's Master Property File above or below a value, by aldermanic district, plus tract measures (typical home value, owner-occupancy, year built) that line up with DYCU's data.
- **How long things take.** The median and the time 9 in 10 finish within, for complaints, 311 requests, permits, fire dispatch, arrival and time on scene, and MFD arrival.
- **Export.** CSV, plain text or an image of a card, with its source and caveats.

**Data notes that shape every answer:**
- **Survey estimates.** DYCU's census figures are mostly 5-year American Community Survey estimates (2022–2024 releases). Each is a range, not a count; the cards show the margin of error.
- **Health figures** (asthma, obesity, mental health, dentist visits, food insecurity) are CDC model estimates by tract.
- **Coverage varies.** Some DYCU datasets cover the City, some the County, some both. A few are one year only: parks 2018, grocery access 2019, fire incident detail 2021.
- **City files update on the City's schedule.** Some (311, crime, permits) are current. Others (election results, quarterly stop-and-search) are fixed snapshots.

---

## Journalists

Journalists want figures they can publish and defend: the number, its margin of error, its source, the caveat that could sink the story, and where it varies.

### Accountability and public safety
| Question | Data | Status |
|---|---|---|
| How long do complaints against police and fire take to close, and does it vary by department or category? | Citizen Complaints (City) | **Now** (how long) |
| Have complaints been closing faster or slower year to year? | Citizen Complaints | **Now** (how long, by year; the card warns that recent years look faster because slow cases are still open) |
| How many complaints were filed against each department, and in which categories? | Citizen Complaints | **Now** (City count by Department or Category) |
| How many robberies (or any offense) happened this year in a given neighborhood, and how does it compare with last year? | NIBRS Crime Data | **Now** (City count by offense, period and neighborhood; "same period a year earlier" button) |
| Which police districts have the most reported assaults, by month? | NIBRS Crime Data | **Now** (by Police_District, by month) |
| Which incidents involved a firearm? | NIBRS Crime Data (weapon column) | **Now** (filter on weapon used) |
| How fast does the Fire Department arrive, and how does it vary by call type or ZIP? | MFD Calls for Service; Fire Incident Detail (2021) | **Now** (how long: time to arrive, time to dispatch, time on scene; both files since L1) |
| How many EMS calls were there by call type and aldermanic district? | EMS Calls for Service | **Now** (City count) |
| How many traffic stops led to a search or pat-down, and does it differ by age or sex? | MPD Stop and Search (quarterly files, 2019–2024) | **Partly.** One quarter at a time; across quarters is **Not yet**. |
| Who gets stopped by MPD, over five years? | Stop and Search (23 quarterly packages) | **Now** (people stopped by race, sex and quarter, 2019–2024; frisk and search rates for field interviews; traffic stops through 2023, since 2024's traffic file isn't comparable) |
| Where are crashes concentrated, and have they changed? | Traffic Crash Data | **Not yet** (the file isn't profiled yet, so Ask can't count it; worth fixing) |
| Where are the police stations, squad areas and reporting districts? | Police Stations, Districts, Squad Areas | **Partly** (sheets and downloads; maps) |

### Housing, property and land
| Question | Data | Status |
|---|---|---|
| Which tracts have the highest share of rent-burdened households? | H08 Rent-Burdened Households | **Now** (tract ranking) |
| Where did vacancy rise clearly between 2022 and 2024? | H09 Vacant Residential Housing | **Now** (tract change) |
| Is Black homeownership lower where poverty is higher? | H01 × E02 | **Now** (go-together) |
| Where are home values high but food insecurity is also high? | Master Property File × F02 | **Now** (mismatch) |
| How many properties are assessed over $200,000, by aldermanic district? | Master Property File | **Now** (City count over/under) |
| How has the typical home value changed since 2005? | Master Property File (yearly files) | **Now** (by year, citywide or one district) |
| How long does the City take to issue permits, by permit type? | Residential and Commercial Permit Work Data | **Now** (how long: time to issue) |
| How many permits were opened for new dwelling units this year? | Permit Work Data | **Now** (City count, filtered) |
| How many vacant buildings are there, by aldermanic district or ZIP? | Vacant Buildings | **Now** (City count) |
| How long have buildings been vacant? | Vacant Buildings | **Not yet** (only an open date; no approved pair) |
| How much back property tax is owed, by ZIP or district? | Delinquent Real Estate Tax Accounts | **Partly.** Counting accounts is **Now**; summing the tax owed is **Not yet**. |
| How many tax-delinquent brownfields are in each district? | Tax Delinquent Brownfields | **Now** (City count) |
| What did homes sell for, by neighborhood? | E04 Median Residential Property Sales (tract); Property Sales Data (City) | **Now** (tract ranking of median sales); a median from the City sales file is **Not yet** |
| Where are foreclosure rates highest? | E06 Residential Foreclosures | **Now** (tract ranking) |
| Do lending patterns (HMDA) differ where redlining happened? | H03 HMDA; H07 Redlining Boundaries | **Partly.** HMDA by tract is **Now**; overlaying 1930s redlining grades is **Not yet**. |
| How have TID values changed since the 1990s? | TID Value History | **Partly** (sheet and download; year-by-year values need the file) |
| What does the City own and sell, and for how much? | City-Owned Improved Properties Sold by Year | **Partly** (counts; dollar totals **Not yet**) |
| Who owns this property, or how many do they own? | Master Property File | **Not in Ask by design.** It never lists owners; it points to the City's Address Search. |

### Poverty, economy and work
| Question | Data | Status |
|---|---|---|
| Which tracts have the highest poverty rate, and which are statistically tied? | E02 | **Now** (tract ranking with ties) |
| Where did poverty grow most between 2022 and 2024? | E02 | **Now** (tract change) |
| How many kids under 5 live in poverty in Harambee? | N03 Neighborhood Portrait | **Now** (neighborhood figure) |
| Where is unemployment highest, and does it track long commutes? | E07 × E08 | **Now** (ranking; go-together) |
| Which tracts rely most on child public assistance? | E01 | **Now** |
| What's the median household income by tract? | E03 | **Now** |
| What do City employees earn, by department? | City Employee Salary Data | **Partly.** Headcount by department or job title is **Now**; pay totals or averages are **Not yet**. |
| Where does City money go? | Open Checkbook; Annual Comprehensive Financial Report | **Partly** (sheet and links; no analysis) |

### Health, environment and food
| Question | Data | Status |
|---|---|---|
| Is asthma higher where poverty is higher? | W01 × E02 | **Now** (go-together) |
| Where are poor mental health and obesity both high? | W04 × W03 | **Now** (go-together / mismatch) |
| Where is food insecurity low despite high poverty? | F02 × E02 | **Now** (mismatch) |
| What has the air been like lately? Any bad days? | V02 Daily Air Quality | **Now** (preview chart); "how many days over a level" is **Not yet** |
| Which tracts lack a nearby grocery store? | F01 Access to Grocery Stores (2019) | **Now** (tract ranking, one year) |
| Which areas are far from parks? | V01 Access to Parks (2018) | **Partly** (not set up for tract analysis) |
| Where do people skip the dentist? | W02 | **Now** |

### Demographics, language and disability
| Question | Data | Status |
|---|---|---|
| Where is linguistic isolation highest? Which neighborhoods need translated outreach? | D05 | **Now** |
| How has the population changed from 2010 to 2020, by tract? | D06 | **Partly** (ranking a change column works; it isn't a two-release comparison) |
| Where is disability most common, and of what type? | D01, D02 | **Now** |
| Which tracts are most racially diverse? | D07, D08 | **Now** |
| What do the aldermanic districts look like demographically? | Aldermanic District Demographics | **Partly** (a 15-row table; counting rows isn't the question) |

### Elections and civic life
| Question | Data | Status |
|---|---|---|
| Where are the polling places, and which are accessible? | Voting Wards and Polling Places | **Now** (City count by accessibility, district) |
| How did each ward vote in 2020? | 2020 election results (by ward) | **Not yet** (vote totals need sums; counting rows only counts wards) |
| Did turnout change between elections? | Election files 2016–2022 | **Now** (12 elections, 2016–2022; citywide or by ward) |

### Story ideas and caveats
| Question | Data | Status |
|---|---|---|
| Give me story angles about old housing and health. | H05 sheet, W01 | **Now** (dataset sheet story angles) |
| What are the caveats before I publish a number from this table? | Any dataset sheet | **Now** |
| What did DYCU's Harambee report say about housing? | DYCU report PDFs | **Now** (report quote) |
| Can I get this as a chart for my story? | Any number card | **Now** (export as an image, with source and caveats) |

---

## Nonprofits

Nonprofits want grant-ready figures for the places they serve, proof of need, and a way to show change over time to funders.

### Making the case for a neighborhood
| Question | Data | Status |
|---|---|---|
| How many households in our neighborhood have no car? | N03 Neighborhood Portrait | **Now** (neighborhood figure) |
| What do renters pay in our neighborhood, and how many pay more than 30% of income? | N03; H08 | **Now** |
| What's the poverty rate in the tracts we serve? | E02 | **Partly.** By tract it's **Now**, and each tract shows its City neighborhoods. "All tracts in Bay View" in one question is **Not yet**. |
| How many children in our area live in poverty, by age? | N03 | **Now** |
| What are the key takeaways for Lincoln Park? | DYCU report PDFs | **Now** (report quote) |
| How does our neighborhood compare with the city as a whole? | N03 vs City figures | **Partly** (one neighborhood at a time; a side-by-side is **Not yet**, which is the planned fact sheet) |
| Give me a one-page fact sheet for our neighborhood. | Several | **Not yet** (planned: Project D) |

### Targeting services
| Question | Data | Status |
|---|---|---|
| Which census tracts have the highest poverty rate? | E02 | **Now** |
| Where are seniors with disabilities concentrated? | D01 | **Now** |
| Where should we offer Spanish-language services? | D03, D05 | **Now** |
| Where is broadband lowest, for a digital-inclusion grant? | H04 | **Now** |
| Which tracts lost the most households to vacancy? | H09 | **Now** (change) |
| Where is food insecurity highest, and does it follow poverty? | F02, E02 | **Now** |
| Where are the libraries, and when are they open? | Libraries | **Now** (City count; hours per library from the sheet) |
| Where are medication drop boxes? | Medication Drop Boxes | **Now** (count by city or village) |
| Where are the community-based residential facilities and child residential facilities? | CBRF, Child Residential Facilities | **Partly** (sheets, downloads, maps) |

### Showing change and impact
| Question | Data | Status |
|---|---|---|
| Did poverty fall in our tracts between 2022 and 2024, beyond the margin of error? | E02 | **Now** (tract change; "clear" means beyond both years' margins) |
| How many energy-efficiency (Me2) projects were completed, and what did they include? | Me2 Residential Program Data | **Now** (City count by improvement type) |
| How many 311 requests about our issue came from our area this year? | Call Center Data (311) | **Partly.** Counts by type and month are **Now**; by neighborhood is **Not yet** (the 311 file has no locations). |
| How long did the City take to close 311 requests of a certain type? | Call Center Data | **Now** (how long; the card warns that most requests have no close date) |
| Which Targeted Investment Neighborhoods or NRSAs cover our area? | TINs, NRSAs, NSPs | **Now** (Ask lists the TINs, NRSAs and NSPs covering a neighborhood, tract or address, with shares) |

### Using numbers responsibly
| Question | Data | Status |
|---|---|---|
| What does "margin of error" mean, and can I cite this number? | Any tract card; DYCU documentation | **Now** (cards explain; "How to read this") |
| Which definition of "Harambee" does this number use? | DYCU areas vs City neighborhoods | **Now** (cards say which; How it works explains both maps) |
| Can I download the underlying data for our grant? | Any dataset | **Now** (CSV export of the card; links to DYCU's and the City's files) |

---

## Residents

Residents want to understand their own block and neighborhood, see whether the City responds, and know where services are.

### My neighborhood
| Question | Data | Status |
|---|---|---|
| What's my neighborhood like: income, renters, age of housing? | N03; E03, H06, H05 | **Now** (DYCU neighborhoods; by tract elsewhere) |
| Which City neighborhood is my census tract in? | Tract names (City neighborhoods + DYCU areas) | **Now** (every tract table names them) |
| How many crimes were reported in my neighborhood this year? | NIBRS Crime Data | **Now** (City count in the neighborhood's official boundary) |
| Are there vacant buildings near me? | Vacant Buildings | **Partly.** By district or ZIP it's **Now**; by address it's **Not in Ask**. |
| What's the zoning or land use of my block? | Zoning; Land Use Code | **Partly** (code meanings are **Now**; by address it's **Not in Ask**) |
| Is my area in an Opportunity Zone, TID or BID? | Opportunity Zones, TIDs, BIDs | **Now** (by address, neighborhood, tract or district) |

### City services
| Question | Data | Status |
|---|---|---|
| How long does the City take to close 311 requests? | Call Center Data | **Now** (how long) |
| What do people call 311 about most? | Call Center Data | **Now** (City count by request type) |
| How fast does the Fire Department get to calls? | MFD Calls for Service | **Now** (how long) |
| How long does a building permit take? | Permit Work Data | **Now** (how long) |
| How long have vacant buildings been vacant? | Vacant Buildings | **Now** (age so far, L2) |
| How long have open complaints against police and fire been waiting? | Citizen Complaints | **Now** (age so far, as of the file's last update, L2) |
| Where are the libraries, and when are they open? | Libraries | **Now** |
| When is garbage or recycling pickup? | DPW Sanitation | **Partly** (sheet and download; not in Ask's counts) |
| Where are the bike lanes, streetcar stops and Bublr stations? | Bicycle Network, Streetcar, Bublr | **Partly** (maps and links) |

### Health and environment
| Question | Data | Status |
|---|---|---|
| What has the air been like? | V02 Daily Air Quality | **Now** |
| Is asthma higher where I live? | W01 | **Now** (by tract) |
| Is there a grocery store or park near me? | F01, V01 | **Partly** (by tract; by address it's **Not in Ask**) |

### Voting and civic life
| Question | Data | Status |
|---|---|---|
| Where is my polling place, and is it accessible? | Voting Wards and Polling Places | **Now** (an address gives its ward and polling place, with the accessible entrance; confirm at myvote.wi.gov) |
| Who is my alder? | Voting Wards and Polling Places (Alderman column) | **Now** (by address or district) |
| How did my ward vote? | Election results | **Not yet** (vote sums) |

### Understanding the data
| Question | Data | Status |
|---|---|---|
| What data exists about my topic? | The whole catalog | **Now** (search) |
| What does margin of error mean on these tables? | DYCU documentation | **Now** (report quote, "How to read this") |
| Why do two maps of "Harambee" disagree? | DYCU areas vs City neighborhoods | **Now** (How it works) |

---

## Questions every audience asks

- **"Is this number reliable enough to say out loud?"** Cards show margins of error, say "can't tell" when a column has none, and mark tracts too uncertain to rank. **Now**.
- **"Has it gotten better or worse?"**
  - Tract change between releases: **Now**.
  - City counts year over year: **Now**.
  - Time spans by year: **Now**.
  - Long trends across many years of DYCU data: **Partly**, because most tract data covers 2022–2024 only.
- **"Compared to what?"**
  - The citywide or countywide figure next to a neighborhood figure: **Partly**.
  - Neighborhood vs neighborhood side by side: **Not yet** (fact sheet).
- **"For my exact address."** **Not in Ask** by design. Ask works at the tract, neighborhood and district level and never lists properties or owners. It points to the City's Address Search for one property.
- **"Can I share this?"**
  - CSV, text or an image of a card: **Now**.
  - A link an editor can open: **Now** (C2, decision 043).

---

## Gaps worth building, ranked by how often these questions come up

1. **Sums and averages in City counts.** Vote totals by ward, tax owed, salaries, sale prices, dollars spent. These are some of the most common accountability questions, and today Ask only counts rows. (Several files; one new measure option on the City count tool.)
2. **Tract questions for a City neighborhood.** "Poverty in Bay View's tracts", "rank tracts in Harambee". The names exist now (Project B); asking by them doesn't. (Deferred from B.)
3. **Neighborhood fact sheet and side-by-side comparison.** The grant writer's and editor's one-pager. (Project D.)
4. **Share link to an answer.** Done (C2, decision 043): any exportable card can be shared as a permanent link that shows it as it was that day.
5. **Traffic crashes.** The file isn't profiled, so Ask can't count crashes, which is one of the most common local questions. Likely a data-pipeline fix rather than a new feature; worth checking first.
6. **Files split by period.** Crime's Current and Historical files are now read together, so crime counts reach back to 2005 (K1, decision 039). The property file is now read by year too, 2005 onward, citywide and by district (K2, decision 040). Stop-and-search is counted across all 23 quarterly packages, 2019–2024 (K3, decision 041). Election turnout is read across 12 elections, 2016–2022 (K4, decision 042). Gap 6 is done. 311's older file isn't joined, because it is missing most requests from December 2020 to 2025.
7. **311 by location.** The 311 file has no coordinates, so "requests near me" fails. Check whether the City publishes a located version.
8. **More "how long" pairs.** Checked on 2026-10-14 (decision 044). Only 7 City datasets have two or more date columns.
   - **L1, done:** the Fire Department's current calls file (2024–2026) now measures time to dispatch and time on scene, alongside time to arrive.
   - **L2, done:** vacant buildings have no end date, so Ask says how long today's vacant buildings have been vacant, and how long open complaints have waited: "still open" ages to an as-of date (decision 045).
   - **Liquor licenses** run about a year by rule, so a term measures nothing.
   - **There is no DPW work-order file** on the portal.
   - **Still to do:** fire incidents across 2015–2023 (L3) and City employee tenure (L4).
9. **Boundary overlap.** "Is this tract in a TID, Opportunity Zone or redlined area?", answered by combining boundary files with tract data.

---

## Notes on this list

- **Sources.**
  - Datasets: drawn from the platform's catalog on 2026-10-12. That covers 49 DYCU entries (36 datasets, 7 apps, 3 neighborhood report series, 3 guide pages) and 131 City files, of which 67 currently have the profile Ask needs to count them.
  - The 282 DYCU report PDFs are searchable through report quotes.
  - Tract-level status was checked by looking for a GEOID column in each DYCU dataset's column guide.
- **Codes.** City dataset codes differ between the development and live databases (citizen complaints is P01 in development and P24 live), so City datasets are named here, not coded. DYCU codes (E02, H08, W01 …) are stable.
- **The labels are a snapshot.** A "Now" was not run question by question. The 13 graded guide questions and the browser tests cover a sample. Run the Ask report card (`npm run ask:card`) on any question here before advertising it.
