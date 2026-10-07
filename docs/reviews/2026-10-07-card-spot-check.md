# Card spot-check — 2026-10-07

10 random cards from the first real build. For each card, tick the four checks. Note anything wrong under the card.

Checks: (1) explainer describes the dataset correctly · (2) every DYCU-tagged column matches the sheet · (3) explainer has no numbers or percentages · (4) story angles are questions

## V03 · Households without Vehicle

**Explainer** (AI): This dataset measures how many households have no access to a vehicle, using the American Community Survey (an ongoing U.S. Census Bureau survey of a sample of households) Table B08201. It reports total households, households without a vehicle, and the share without one, each with a margin of error (the range of uncertainty around an estimate). The listed place is County, but the column descriptions refer to census tracts (neighborhood-sized areas the Census Bureau uses). It covers 2022, 2023 and 2024, which correspond to the 2018-2022, 2019-2023 and 2020-2024 5-year estimates (figures pooled from five years of survey responses).

**Column guide** (first 5):
- `object_id` (AI): An object ID (a unique identifier for each row in the database); the source gives no further description.
- `NAME` (DYCU): Census Tract name
- `GEOID` (DYCU): Census Tract identifier
- `households` (DYCU): Estimate - total households
- `no_vehicle` (DYCU): Estimate - households without access to a vehicle
- …and 4 more

**Caveats:**
- These are survey estimates drawn from a sample of households, not full head counts, so cite them as estimates.
- Every estimate has a margin of error; check the margin-of-error columns before calling a difference between places or years meaningful.
- Each year covers a 5-year window (2018-2022, 2019-2023, 2020-2024) that overlaps with the others, so year-to-year comparisons are not between independent periods, and the figures lag current conditions.
- The place list says County while the column descriptions refer to census tracts, so confirm the geographic level in the data before citing.

**Story angles:**
- Which neighborhoods have the largest shares of households without a vehicle, and how do transit options there compare with other areas?
- Do changes across the 2018-2022, 2019-2023 and 2020-2024 estimates fall outside the margins of error, or could they be statistical noise?
- How do the margins of error differ across areas, and which places have estimates too uncertain to rely on for reporting?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## A05 · MKE HMDA Data Explorer

**Explainer** (AI): The MKE HMDA Data Explorer is an app with a map built on HMDA (Home Mortgage Disclosure Act, a 1975 federal law requiring lenders to report mortgage data) records, limited to loans for buying a home that will be the applicant's principal residence. It sorts applications by outcome: originations (loans that were made), denials (applications turned down), and fallout (applications approved but not accepted, withdrawn by the applicant, or closed for incompleteness). It uses applicant race and ethnicity fields to break the outcomes down, and the origination, denial and fallout rates are calculated using the number of applications. The description does not say which places or years the map covers.

**Caveats:**
- The map covers only home-purchase loans for principal residences, so refinances, home improvement loans and investment or second-home purchases are not included.
- 'Fallout' combines three different outcomes (approved but not accepted, withdrawn by the applicant, and file closed for incompleteness), so it should not be described as rejections or as a single cause.
- The source page does not describe margins of error, data quality checks, or what the data leaves out, so completeness and accuracy of the lender-filed records cannot be confirmed from it.
- HMDA data arrives on a lag; the 2025 national datasets and reports were released on June 23, 2026, and the source gives no guidance on how current figures are between annual releases. The description also does not state which years or places the map covers, so confirm that before citing.

**Story angles:**
- How do denial rates for home-purchase loans differ by applicant race and ethnicity in the areas shown on the map?
- Where do application withdrawals or incomplete files (fallout) make up a larger share of outcomes, and what might explain that?
- How do origination rates for home-purchase loans vary from one part of Milwaukee to another, and which lenders are active in those areas?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## S01 · Individuals with Bachelors Degree or Higher

**Explainer** (AI): This dataset measures how many people aged 18 to 24, and aged 25 and older, hold a bachelor's degree or higher, along with the percentage of each age group that holds one. The data come from the American Community Survey (an ongoing U.S. Census Bureau survey of a sample of households) 2020-2024 5-year estimates (figures pooled from five years of survey responses), Table S1501. It is labeled for the year 2024 and lists county as its place type, though the column definitions describe census tracts (neighborhood-sized areas the Census Bureau uses). Each estimate comes with a margin of error (a range showing how far a sample-based estimate could be off).

**Column guide** (first 5):
- `object_id` (AI): A unique row identifier (object ID) for each record in the table.
- `NAME` (DYCU): Census Tract name
- `GEOID` (DYCU): Census Tract identifier
- `pop_18_24` (DYCU): Estimate - total population age 18 to 24
- `bach_18_24` (DYCU): Estimate - individuals aged 18 to 24 who hold a Bachelors degree or higher
- …and 10 more

**Caveats:**
- These are survey estimates drawn from a sample of households, not full head counts, so cite them as estimates.
- Every estimate has a margin of error in its own column; check it before comparing places or calling a difference real, especially for small areas or the 18 to 24 group.
- The 2024 label reflects pooled 2020-2024 data, not a single year, so the figures lag the present and cannot show year-to-year change.
- The dataset lists county as its place type, but the column definitions describe census tracts; confirm the geography level with the publisher before citing.

**Story angles:**
- How do bachelor's degree rates for young adults aged 18 to 24 compare with those for adults 25 and older across different areas?
- Which areas have margins of error large enough that apparent differences in degree attainment may not be meaningful?
- Do areas with many young adults show different degree patterns than areas with mostly older residents, and what might explain it?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## H07 · Redlining Boundaries

**Explainer** (AI): This dataset maps the historic boundaries drawn by the Home Owner Loan Corporation (HOLC, a federal agency that graded neighborhoods to decide who could get low-interest mortgage loans). The boundaries cover areas in the City of Milwaukee and were heavily influenced by racial boundaries. The input lists no specific years, only that the boundaries were used in the 1900s. The map is meant to help residents and policymakers identify areas affected by redlining (the practice of denying or limiting loans in certain neighborhoods) and target strategies to rebuild them.

**Column guide** (first 5):
- `state` (AI): The state where the graded area is located.
- `city` (AI): The city where the graded area is located.
- `name` (AI): The name given to the graded area; the input does not say more about how names were assigned.
- `holc_id` (AI): An identifier for the HOLC area, as text.
- `holc_grade` (AI): The grade HOLC assigned to the area, which was used to judge eligibility for low-interest mortgage loans; the input does not list the grade categories.
- …and 4 more

**Caveats:**
- The input lists no years, so do not tie these boundaries to a specific date without checking the original source.
- The boundaries reflect historic judgments heavily influenced by racial boundaries, so they are not neutral measures of neighborhood quality.
- The input does not define several columns (such as neighborho and area_descr) or the units of the shape fields, so confirm their meaning before citing them.
- Historic HOLC areas may not line up with today's neighborhood or city boundaries.

**Story angles:**
- How do the historic HOLC graded areas compare with the neighborhoods Milwaukee residents recognize today?
- What do the area descriptions in the data reveal about how HOLC judged different parts of Milwaukee?
- How might policymakers use these boundaries to target efforts to reduce segregation and rebuild neighborhoods affected by redlining?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## D04 · Latinx Homeownership

**Explainer** (AI): This dataset measures Latinx homeownership, calculated by dividing the number of Hispanic households that are owner-occupied by the total number of Hispanic households. It is built from American Community Survey (a U.S. Census Bureau survey of a sample of households) 5-year estimates, table B25003I, and the data are organized by census tract (a neighborhood-sized area the Census Bureau uses). It covers the city and has two releases, labeled 2022 (based on 2018-2022 data) and 2023 (based on 2019-2023 data).

**Column guide** (first 5):
- `STATEFP` (AI): The state code (FIPS, a federal numbering system for places) for the tract.
- `COUNTYFP` (AI): The county code (FIPS) for the county the tract is in.
- `TRACTCE` (AI): The census tract code within its county.
- `GEOID` (AI): A combined state, county and tract code that uniquely identifies each census tract.
- `NAME` (AI): The short name of the census tract, usually its number.
- …and 19 more

**Caveats:**
- These are survey estimates drawn from a sample of households, not full head counts.
- Each estimate has a margin of error in its own column; check it before citing a tract-level figure, since small tracts may be especially uncertain.
- Each release pools five years of survey data (2018-2022 and 2019-2023), so it does not describe a single year, and the two releases overlap heavily.
- Data lag the present, and the source page does not spell out release timing in detail.

**Story angles:**
- Which Milwaukee neighborhoods have the highest and lowest Latinx homeownership, and what might explain the differences?
- How did Latinx homeownership change between the 2018-2022 and 2019-2023 releases, and are the changes larger than the margins of error?
- How do areas with many Latinx renters compare to areas with many Latinx owners, and what does that mean for housing affordability?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## H02 · Hispanic Homeownership

**Explainer** (AI): This dataset measures how many Hispanic / Latinx households (a household is a person or group living in one housing unit) own their homes versus rent them, plus the share of each. It draws on the U.S. Census Bureau's American Community Survey 2020-2024 5-year estimates (survey responses pooled across five years), Table B25003I, and is labeled 2024. The listed place type is County, but the column definitions describe each row as a census tract (a neighborhood-sized area the Census Bureau uses), so check the geography before citing.

**Column guide** (first 5):
- `object_id` (AI): Internal record identifier (an object ID) for each row; the source gives no further definition.
- `NAME` (DYCU): Census Tract name
- `GEOID` (DYCU): Census Tract identifier
- `hisp_households` (DYCU): Estimate - total number of Hispanic / Latinx households
- `owner_occupied` (DYCU): Estimate - Hispanic owner-occupied households
- …and 8 more

**Caveats:**
- These are survey estimates drawn from a sample of households, not full head counts.
- Every estimate has a paired margin of error column; the source page does not discuss margins of error, so check them before citing any figure or comparing areas.
- The data pool five years of responses (2020-2024), so they do not describe a single year and lag the present.
- The place type is listed as County, but the column definitions say census tract; confirm which geography each row represents before reporting.

**Story angles:**
- Which parts of Milwaukee have more Hispanic households renting than owning, and do the margins of error allow a confident comparison?
- How does Hispanic homeownership differ between neighborhoods, and what local housing or lending factors might explain it?
- Where are the margins of error too large to support firm conclusions, and what does that say about data on smaller communities?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## E02 · Households Living in Poverty

**Explainer** (AI): This dataset measures how many households have income below the poverty line, out of all households, in Milwaukee-area census tracts (neighborhood-sized areas the Census Bureau uses). It is built from American Community Survey (an ongoing Census Bureau survey of a sample of households) 5-year estimates (figures pooled from five years of survey responses) in Table B17017, and the hub lists the city and county as places. The listed years are 2022, 2023 and 2024, and the source descriptions cite 5-year periods of 2018-2022, 2019-2023 and 2020-2024.

**Column guide** (first 5):
- `object_id` (AI): A system-generated row identifier (object ID) for each record in the dataset; it is not a Census measure.
- `NAME` (DYCU): Census Tract name
- `GEOID` (DYCU): Census Tract identifier
- `households` (DYCU): Estimate - total number of households
- `poverty` (DYCU): Estimate - number of households with income below the poverty line
- …and 4 more

**Caveats:**
- These are estimates from a sample of households, not full head counts, so describe them as estimates.
- Check the margin of error columns before citing any figure, especially for small tracts where uncertainty can be large; the source page does not discuss margins of error, so look them up in the data tables.
- Each figure is a 5-year estimate, so it blends several years of responses and the 5-year periods overlap between releases; comparing one release to another is not a clean year-to-year comparison.
- Figures lag the present because data come in annual releases, and the source descriptions list different 5-year periods, so confirm which period applies to the rows you use.

**Story angles:**
- Which census tracts have the highest poverty rate estimates, and do their margins of error leave room for other tracts to be in the same range?
- How do poverty rate estimates in tracts compare with the city and county as a whole across the 5-year periods listed?
- Do tracts with many households but a high poverty estimate point to areas where services or assistance may be most needed?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## W02 · Individuals who have Visited the Dentist in the Past Year

**Explainer** (AI): This dataset estimates the share of adults (people 18 and older) who say they visited a dentist in the past year, drawn from the CDC's PLACES project (a CDC program that produces local health estimates). It is tied to census tracts (neighborhood-sized areas the Census Bureau uses) and lists City and County as places, with data labeled for 2021 and 2022. The figures are built from the Behavioral Risk Factor Surveillance System (BRFSS, a health survey), with population numbers from the American Community Survey (a Census Bureau survey).

**Column guide** (first 5):
- `object_id` (AI): A system-assigned row identifier (an OID, or object ID); the input gives no further description.
- `GEOID` (DYCU): Census Tract identifier
- `per_visit_dentist` (DYCU): Estimate - percentage of individuals 18 years and older who report visiting the dentist within the past year
- `Low_Confidence_Limit` (DYCU): The lower limit of a 95% Confidence Interval for the estimate
- `High_Confidence_Limit` (DYCU): The higher limit of a 95% Confidence Interval for the estimate
- …and 2 more

**Caveats:**
- These are modeled estimates produced by a methodology, not direct counts of people who visited a dentist; check the PLACES Methodology and Measure Definitions pages before citing.
- Each estimate comes with a 95% confidence interval, so compare the low and high limits before calling one tract higher or lower than another.
- The data comes from different PLACES releases (2023, 2024 and 2025) tied to survey years 2021 and 2022, so the year labels may not match when the survey was actually done, and the 2024 and 2025 releases both cite 2022 survey data. Confirm which release a figure comes from before comparing years.
- The data lags current conditions, and the source page notes the latest release as August 2024.

**Story angles:**
- Which Milwaukee census tracts have the widest confidence intervals, and what does that say about how reliable neighborhood-level dental figures are?
- How do dental visit estimates line up with tract population, and do areas with more adults appear to differ from smaller ones?
- Did the estimates for the City and the County move between the 2021 and 2022 data, and can the release differences explain any change?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## A07 · The Bridge Project Program Participant Map

**Explainer** (AI): This is an interactive map from The Bridge Project, a collaboration with the Zilber Family Foundation that created Milwaukee's first unconditional cash program (money given with no conditions on how it is spent) for pregnant individuals in the city. The map shows privacy-protected program applicants and recipients in the City of Milwaukee, and users can view it by Aldermanic District (a city council district), neighborhood, or zip code. The input does not list specific years.

**Caveats:**
- The input lists no years, so the time period covered by the map is unknown; confirm with The Bridge Project before citing.
- The map is privacy-protected, so locations are likely masked or generalized; confirm with the program how before describing where participants live.
- The input does not describe how applicants and recipients are distinguished or counted, so check the map's own notes before characterizing either group.
- The input lists no columns or data sources, so the underlying data fields and their origins are unverified.

**Story angles:**
- Which Milwaukee Aldermanic Districts, neighborhoods, or zip codes have the most applicants and recipients, and how does that compare with where need is greatest?
- How did The Bridge Project and the Zilber Family Foundation protect participant privacy on the map, and what does that mean for how reliable the geographic patterns are?
- What have participants and program organizers said about the effect of unconditional cash on pregnant individuals in Milwaukee?

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:

## H08 · Rent-Burdened Households

**Explainer** (AI): This dataset estimates how many renter households in Milwaukee-area geographies spend a large share of their income on rent, along with median rent. A household is rent-burdened if it spends 30% or more of its income on rent. The figures come from the American Community Survey (a Census Bureau survey of a sample of households) 5-year estimates (data pooled over five years), Table DP04, in releases labeled 2022, 2023 and 2024 that cover 2018-2022, 2019-2023 and 2020-2024.

**Column guide** (first 5):
- `object_id` (AI): An internal row identifier for each record in the dataset.
- `NAME` (DYCU): Census tract name
- `GEOID` (DYCU): Census tract identifier
- `median_rent` (DYCU): Estimate - median rent in dollars
- `total_renters` (DYCU): Estimate - total number of renters for which rent could be calculated
- …and 14 more

- [ ] (1) explainer correct  - [ ] (2) DYCU columns match  - [ ] (3) no numbers  - [ ] (4) angles are questions

Notes:
