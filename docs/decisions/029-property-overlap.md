# 029: Ask counts the City's properties and lines them up with DYCU's census tracts, and never shows an address or an owner

**Decision:** Ask can now answer property questions from the City's Master Property File (the City's list of every property and its assessment, catalog code H28). It counts properties past a dollar amount, grouped by aldermanic district (the City's council districts) and drawn on a tract map. It also lines up four property measures against DYCU's census-tract data (a "census tract" is a small area the Census Bureau draws, roughly 4,000 people). It never lists properties, and nothing it returns carries an address, a street or an owner.

**Why this came up:** A reader asked Ask "can you show me property with an assessed value over 200,000" (an assessment is the City's yearly dollar figure for a property, used for property taxes). Ask declined, for two reasons. Its instructions forbid looking up individual records in datasets that name people, and its City counter could only match exact values, not "over $200,000". What was at stake was privacy and counting the wrong thing. The property file names owners and gives each property's address, so a careless answer could expose a person. The stronger questions behind the screenshot ("do home values go with broadband?", "where are homes valuable but food insecurity is high?") can be answered without naming anyone, because the file carries each property's census tract. The other risk was a number that looks right and is wrong (see "What live testing changed").

**Options:**
- *A. Join by the City's own tract field (chosen):* each property record already says which census tract it is in. Padded to six digits and prefixed with the county code, that is DYCU's tract ID, so the two sources line up exactly. Cost: only the City's records are covered, and a tract on the City line counts only its City part.
- *B. Point-in-polygon from parcel outlines:* take each parcel's map outline and test which tract shape it falls inside. Cost: much heavier to build and run, and it works at the level of single parcels, which is the address-level data we are trying not to touch.
- *C. List properties with addresses:* answer "show me property over $200,000" literally. Cost: rejected on privacy. A list of addresses with values is a list of where people live and what they are assessed at.

**What we chose and why:** Option A, with these calls made by Tarik on 2026-10-11, from options Claude laid out: Ask shows counts and a tract map, never addresses or owners; the counts and the overlap with DYCU's tract data are built together, in one piece of work; all four measures are included (typical home value, the share of homes over or under a cutoff, the owner-occupied share, and typical year built); and he approved the design in sections 1 to 4 of the spec. The facts that made Option A workable, all checked against the live data on 2026-10-11:
- *The tracts line up.* 210 of the City file's 213 tract codes are DYCU's 2020 Census tracts. The other three hold 14 properties between them, and one of them is "000000", which means no tract.
- *The year is the 2026 assessment.* The live file is the 2026 assessment: 159,555 rows carry 2026 and 394 retired parcels carry 2025. Code reads the year from the data and never hard-codes it, so next year's file will say 2027 without anyone editing a line.
- *The masked columns.* The City publishes tax delinquency, code violations and raze status (whether a building is slated for demolition) with the same filler value on every row, so there is nothing real in them to count. No measure uses them, and the cards' wording for this ("The City doesn't publish tax delinquency, code violations or raze orders in this file") is in the spec, not yet shown anywhere in Ask.
- *Thin tracts.* Only 5 tracts have fewer than 30 homes, and those tracts get no property figure, because a median (the middle value when you line them all up) from a handful of homes says little.
- *The measures use a fixed menu.* The SQL (the database's query language) is built from fixed text plus validated numbers, so no column name chosen by the AI can reach it.
- *"Owner-occupied" is the City's rule.* Per the City's documentation, a property counts as owner-occupied when its address matches the owner's mailing address.
- *Results are kept for a day.* Each property figure is cached (saved so the next question doesn't re-fetch it) for 24 hours, because the assessment changes once a year.
- *For one property, Ask points to the City.* Ask's instructions name the City's Address Search (https://itmdapps.milwaukee.gov/AddressSearch). The catalog's sheet did not link it, so the address is written into the instructions.

The tool results are built so they cannot carry the private columns. The property measures file is the only way property values reach a tract tool, and the owner, mailing-address, parcel-number and street columns are never selected, filtered or grouped.

**What live testing changed:** Three things in the spec turned out to be wrong or missing.
- *The year was 2026, not 2025.* The spec was written from the 2025 figures. By the time we ran against the live file, the City had published the 2026 assessment. The spec and the cards now say 2026 and a card that pairs a property figure with DYCU names both years ("2026 assessment and 2023 survey").
- *A hidden default would have given a wrong count.* When a City count has no dates, Ask counts the last 12 months by the file's date column. For the property file that column is the last sale date. So "how many properties are assessed over $200,000" would have counted only the properties that sold in the past year, a number that looks plausible and is wrong. A property file describes how things are now, not events, so a count with no dates now covers every row. The live run counted 83,243 properties assessed over $200,000, out of 151,138 with an assessed value above $0.
- *Street columns were dropped.* The stored profile of the file offered `STREET` and `SDIR` (street name and direction) as things Ask could count or group by. A count by street is address-level detail, so the property-file override removes them.

**What we gave up:**
- City tracts only. Property figures stop at the City line, and a tract that straddles it counts only its City part.
- No change over time. The public file holds only the current assessment, so Ask says so instead of comparing years.
- Owner-occupied is an address-match rule, not a count of people who live in their homes. An owner who gets mail somewhere else is not counted.
- Assessed value is the City's figure for taxes, not a sale price or market value.
- No street-level detail. A reader who wants one property has to go to the City's Address Search.
- Five thin tracts show no property figure at all.

**How we'll know if this was right:** The three report-card questions pass against the real AI: "How many homes in Milwaukee are assessed over $200,000?", "Do neighborhoods with higher home values have more broadband?" and "Where are home values high but food insecurity is also high?". No tool result ever carries an owner or an address; a test checks every property result for those field names and for any value from those columns. Readers stop asking Ask for lists of addresses and take the Address Search link instead (watch for it in feedback).

**What actually happened:**
