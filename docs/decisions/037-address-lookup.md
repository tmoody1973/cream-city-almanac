# 037: Address lookup tells you which places an address is in, using the Census geocoder, and keeps nothing

**Decision:** You can type an address or an intersection, in Ask or in the "Find your neighborhood" box on the fact sheet list, and the Almanac tells you which census tract, City of Milwaukee neighborhood and Data You Can Use (DYCU) area it's in, with links to those places' figures. To find the location, the address goes to the U.S. Census Bureau's free geocoder (a service that turns an address into a map point and its census tract). The Almanac doesn't store it, never logs it, and never shows anything about the property itself.

**Why this came up:** People start from where they live: "Which neighborhood is my address in?", "Is asthma higher where I live?" Ask worked at the tract and neighborhood level, but people don't know which tract or neighborhood they're in. Two risks shaped the design. An address is personal, so it shouldn't be kept. And "look up an address" can slide into "look up a property's owner", which Ask has refused by design since the start.

**Options:**
- **The Census geocoder, live (chosen).** It's free and needs no key. It handles house numbers, intersections and loose spellings, and returns the location and the 2020 census tract in one request. The cost: the address leaves the Almanac to reach a federal service, so the page says so.
- **The City's property file (MPROP).** It lists every property with its tract, with no outside service. But it only knows exact property addresses: no intersections, no mistyped numbers. A lookup by property address also sits close to property-level information the Almanac avoids.
- **The City's own geocoder.** It wasn't found at its expected address, and wasn't needed.

**What we chose and why (Tarik, 2026-10-12):**
- **The Census geocoder.**
- **The Almanac then works out the rest itself:**
  - the City neighborhood, by the address's exact point inside the City's boundary shapes;
  - DYCU's area, from the tract.
- **A tract in two DYCU areas** opens the fact sheet named like the City neighborhood. 2400 W Center St is in the City's Amani; its tract is in DYCU's Metcalfe Park and Amani, so it opens Amani.
- **Limits:** a per-person allowance in Ask, and a site-wide one on the public box, so the box can't hammer the Census.

**What we gave up:**
- **The address goes to the Census Bureau,** a third party, on every lookup.
- **If the geocoder is down,** the lookup says so and finds nothing.
- **Aldermanic district, ward, polling place and TINs by address** wait for Project I's boundary files.
- **The address stays in that person's Ask conversation,** like anything else they type.

**How we'll know if this was right:**
- Lookups land on the right neighborhood (the browser test checks 2400 W Center St → Amani against the live geocoder).
- No address ever appears in the Almanac's database or logs (a test counts every table before and after a lookup).
- No one gets property details from it.

**What actually happened:**
