// Real Health Compass Milwaukee data (whole population), captured from /api/v1/ (spec 2026-10-15-zip-health §8).
export const HC_TOPICS_PAGE = { count: 8, next: null, previous: null, results: [
  {
    "key": "MQ35",
    "name": "Food Insecurity (2024 Food Insecurity)",
    "description": "In the last 12 months, did you ever eat less than you felt you should because there wasn’t\r\nenough money for food? % who answered yes",
    "units": "% of residents",
    "format": "2 decimal places",
    "is_count": false,
    "keywords": "",
    "team": "milwaukee-health-partnership",
    "datasets": []
  },
  {
    "key": "FAI",
    "name": "Food insecurity (Feeding America)",
    "description": "Percentage of the population experiencing food insecurity at some point. Food insecurity is the household-level economic and social condition of limited or uncertain access to adequate food, as represented in USDA food-security reports.",
    "units": "% of residents",
    "format": "1 decimal place",
    "is_count": false,
    "keywords": "hunger,hungry,  food-security, food desert, dessert, access, rate",
    "team": null,
    "datasets": [
      {
        "source": "Feeding America",
        "notes": "",
        "dataset": {
          "name": "Map the Meal Gap"
        }
      }
    ]
  },
  {
    "key": "MQ36",
    "name": "Child food insecurity",
    "description": "In the last 12 months, did your child/children eat less than you felt they should because\r\nthere wasn’t enough money for food? % of applicable responses (e.g. not an NA for this question) that answered yes",
    "units": "% of residents",
    "format": "2 decimal places",
    "is_count": false,
    "keywords": "",
    "team": "milwaukee-health-partnership",
    "datasets": []
  },
  {
    "key": "POV",
    "name": "Poverty rate",
    "description": "Percent of residents in families that are in poverty (below the Federal Poverty Level).",
    "units": "% of residents",
    "format": "1 decimal place",
    "is_count": false,
    "keywords": "impoverished, poor, children, child poverty, fpl, federal poverty level",
    "team": null,
    "datasets": [
      {
        "source": "U.S. Census Bureau",
        "notes": "Table B17001",
        "dataset": {
          "name": "American Community Survey (ACS)"
        }
      }
    ]
  },
  {
    "key": "PVA",
    "name": "Deep poverty",
    "description": "Individuals in families whose income is less than half of the federal poverty level, in past 12 months income.",
    "units": "% of residents",
    "format": "1 decimal place",
    "is_count": false,
    "keywords": "impoverished, poor, fpl, federal poverty level",
    "team": null,
    "datasets": [
      {
        "source": "U.S. Census Bureau",
        "notes": "Table C17002",
        "dataset": {
          "name": "American Community Survey (ACS)"
        }
      }
    ]
  },
  {
    "key": "ALI",
    "name": "Households below ALICE threshold",
    "description": "The % of households below the ALICE threshold includes all households that do not meet the minimum income level necessary to afford the Household Survival Budget for their county, including both households in poverty (below the Federal Poverty Level) and ALICE households. ALICE households earn above the Federal Poverty Level but are unable to afford the basics of housing, child care, food, transportation, health care, and technology in the communities where they live.",
    "units": "% of households",
    "format": "1 decimal place",
    "is_count": false,
    "keywords": "poverty",
    "team": null,
    "datasets": [
      {
        "source": "United for Alice",
        "notes": "",
        "dataset": {
          "name": "United Way ALICE Data"
        }
      }
    ]
  },
  {
    "key": "WIHRA",
    "name": "Asthma emergency department visit rate",
    "description": "Annual emergency department visits for asthma per 100,000 residents. Asthma is a condition in which the airways narrow and swell causing reversible obstruction. Risk-adjusted by age and sex. This is a Prevention Quality Indicator (PQI #15), a metric for tracking potentially avoidable hospitalizations. All hospital providers, all payers, based on patient residence.",
    "units": "per 100,000 residents",
    "format": "2 decimal places",
    "is_count": false,
    "keywords": "claims,ed,er,emergency room,outpatient,pqi 15",
    "team": null,
    "datasets": [
      {
        "source": null,
        "notes": "Calculated by Metopio",
        "dataset": {
          "name": "Wisconsin Hospital Association Information Center (WHAIC)"
        }
      }
    ]
  },
  {
    "key": "AST",
    "name": "Current asthma",
    "description": "Percent of adults (civilian, non-institutionalized population) who answer “yes” both to both of the following questions: “Have you ever been told by a doctor, nurse, or other health professional that you have asthma?” and the question “Do you still have asthma?”",
    "units": "% of adults",
    "format": "1 decimal place",
    "is_count": false,
    "keywords": "",
    "team": null,
    "datasets": [
      {
        "source": "Centers for Disease Control and Prevention (CDC)",
        "notes": "For sub-state geographic levels, including MSA, county, tract, and others",
        "dataset": {
          "name": "PLACES"
        }
      },
      {
        "source": null,
        "notes": "For state and US",
        "dataset": {
          "name": "Behavioral Risk Factor Surveillance System (BRFSS)"
        }
      }
    ]
  }
] };
// POV 2020-2024 and MQ35 2024 for every ZIP in COUNTY_ZIPS, plus Milwaukee County (55079).
export const HC_ROWS = [
  { g: "55079", l: "county", a: "MQ35", p: "", d: "2024", v: 13.8549, se: 0.4671 },
  { g: "53110", l: "zip", a: "MQ35", p: "", d: "2024", v: 10.4, se: 2.7303 },
  { g: "53129", l: "zip", a: "MQ35", p: "", d: "2024", v: 8.0745, se: 2.1472 },
  { g: "53130", l: "zip", a: "MQ35", p: "", d: "2024", v: 17.6471, se: 6.5379 },
  { g: "53132", l: "zip", a: "MQ35", p: "", d: "2024", v: 6.5693, se: 2.1166 },
  { g: "53154", l: "zip", a: "MQ35", p: "", d: "2024", v: 11.1111, se: 1.9453 },
  { g: "53172", l: "zip", a: "MQ35", p: "", d: "2024", v: 17.8218, se: 3.808 },
  { g: "53202", l: "zip", a: "MQ35", p: "", d: "2024", v: 15.4185, se: 2.3969 },
  { g: "53203", l: "zip", a: "MQ35", p: "", d: "2024", v: 11.7647, se: 7.8142 },
  { g: "53204", l: "zip", a: "MQ35", p: "", d: "2024", v: 23.9583, se: 3.0804 },
  { g: "53205", l: "zip", a: "MQ35", p: "", d: "2024", v: 36.0, se: 6.7882 },
  { g: "53206", l: "zip", a: "MQ35", p: "", d: "2024", v: 22.449, se: 4.2148 },
  { g: "53207", l: "zip", a: "MQ35", p: "", d: "2024", v: 6.8452, se: 1.3776 },
  { g: "53208", l: "zip", a: "MQ35", p: "", d: "2024", v: 9.7143, se: 2.2387 },
  { g: "53209", l: "zip", a: "MQ35", p: "", d: "2024", v: 16.2264, se: 2.2649 },
  { g: "53210", l: "zip", a: "MQ35", p: "", d: "2024", v: 21.3675, se: 3.7895 },
  { g: "53211", l: "zip", a: "MQ35", p: "", d: "2024", v: 9.0909, se: 1.6096 },
  { g: "53212", l: "zip", a: "MQ35", p: "", d: "2024", v: 16.4251, se: 2.5752 },
  { g: "53213", l: "zip", a: "MQ35", p: "", d: "2024", v: 3.6697, se: 1.2734 },
  { g: "53214", l: "zip", a: "MQ35", p: "", d: "2024", v: 15.3374, se: 2.8225 },
  { g: "53215", l: "zip", a: "MQ35", p: "", d: "2024", v: 18.251, se: 2.3818 },
  { g: "53216", l: "zip", a: "MQ35", p: "", d: "2024", v: 25.0, se: 3.3017 },
  { g: "53217", l: "zip", a: "MQ35", p: "", d: "2024", v: 3.0888, se: 1.0751 },
  { g: "53218", l: "zip", a: "MQ35", p: "", d: "2024", v: 29.8507, se: 3.9531 },
  { g: "53219", l: "zip", a: "MQ35", p: "", d: "2024", v: 13.4969, se: 2.6763 },
  { g: "53220", l: "zip", a: "MQ35", p: "", d: "2024", v: 16.9231, se: 3.2886 },
  { g: "53221", l: "zip", a: "MQ35", p: "", d: "2024", v: 11.3636, se: 2.3923 },
  { g: "53222", l: "zip", a: "MQ35", p: "", d: "2024", v: 10.6061, se: 2.1883 },
  { g: "53223", l: "zip", a: "MQ35", p: "", d: "2024", v: 12.7907, se: 2.5466 },
  { g: "53224", l: "zip", a: "MQ35", p: "", d: "2024", v: 14.2857, se: 3.4149 },
  { g: "53225", l: "zip", a: "MQ35", p: "", d: "2024", v: 20.5882, se: 4.0036 },
  { g: "53226", l: "zip", a: "MQ35", p: "", d: "2024", v: 10.5263, se: 2.8743 },
  { g: "53227", l: "zip", a: "MQ35", p: "", d: "2024", v: 18.4783, se: 4.0464 },
  { g: "53228", l: "zip", a: "MQ35", p: "", d: "2024", v: 9.3333, se: 3.359 },
  { g: "53233", l: "zip", a: "MQ35", p: "", d: "2024", v: 15.7895, se: 5.9153 },
  { g: "53235", l: "zip", a: "MQ35", p: "", d: "2024", v: 25.3333, se: 5.022 },
  { g: "55079", l: "county", a: "POV", p: "", d: "2020-2024", v: 17.2211, se: 0.3141 },
  { g: "53110", l: "zip", a: "POV", p: "", d: "2020-2024", v: 11.3844, se: 2.1064 },
  { g: "53126", l: "zip", a: "POV", p: "", d: "2020-2024", v: 5.0662, se: 1.116 },
  { g: "53129", l: "zip", a: "POV", p: "", d: "2020-2024", v: 8.3683, se: 2.192 },
  { g: "53130", l: "zip", a: "POV", p: "", d: "2020-2024", v: 3.484, se: 1.3455 },
  { g: "53132", l: "zip", a: "POV", p: "", d: "2020-2024", v: 6.4034, se: 1.3212 },
  { g: "53154", l: "zip", a: "POV", p: "", d: "2020-2024", v: 4.9174, se: 0.6824 },
  { g: "53172", l: "zip", a: "POV", p: "", d: "2020-2024", v: 13.0566, se: 1.7013 },
  { g: "53202", l: "zip", a: "POV", p: "", d: "2020-2024", v: 15.8787, se: 1.5027 },
  { g: "53203", l: "zip", a: "POV", p: "", d: "2020-2024", v: 9.7582, se: 2.7621 },
  { g: "53204", l: "zip", a: "POV", p: "", d: "2020-2024", v: 32.1568, se: 2.0686 },
  { g: "53205", l: "zip", a: "POV", p: "", d: "2020-2024", v: 45.0485, se: 4.4545 },
  { g: "53206", l: "zip", a: "POV", p: "", d: "2020-2024", v: 40.5205, se: 3.0866 },
  { g: "53207", l: "zip", a: "POV", p: "", d: "2020-2024", v: 7.2246, se: 0.7218 },
  { g: "53208", l: "zip", a: "POV", p: "", d: "2020-2024", v: 21.6291, se: 2.2113 },
  { g: "53209", l: "zip", a: "POV", p: "", d: "2020-2024", v: 23.6801, se: 2.0827 },
  { g: "53210", l: "zip", a: "POV", p: "", d: "2020-2024", v: 29.1262, se: 2.7703 },
  { g: "53211", l: "zip", a: "POV", p: "", d: "2020-2024", v: 17.7673, se: 1.352 },
  { g: "53212", l: "zip", a: "POV", p: "", d: "2020-2024", v: 24.7267, se: 1.5614 },
  { g: "53213", l: "zip", a: "POV", p: "", d: "2020-2024", v: 5.7047, se: 0.7627 },
  { g: "53214", l: "zip", a: "POV", p: "", d: "2020-2024", v: 15.5963, se: 1.4446 },
  { g: "53215", l: "zip", a: "POV", p: "", d: "2020-2024", v: 22.0435, se: 1.3489 },
  { g: "53216", l: "zip", a: "POV", p: "", d: "2020-2024", v: 22.0413, se: 2.2203 },
  { g: "53217", l: "zip", a: "POV", p: "", d: "2020-2024", v: 5.1846, se: 0.9872 },
  { g: "53218", l: "zip", a: "POV", p: "", d: "2020-2024", v: 25.893, se: 1.9775 },
  { g: "53219", l: "zip", a: "POV", p: "", d: "2020-2024", v: 12.0797, se: 1.3817 },
  { g: "53220", l: "zip", a: "POV", p: "", d: "2020-2024", v: 11.4061, se: 1.8156 },
  { g: "53221", l: "zip", a: "POV", p: "", d: "2020-2024", v: 14.6277, se: 1.6587 },
  { g: "53222", l: "zip", a: "POV", p: "", d: "2020-2024", v: 11.4528, se: 1.6681 },
  { g: "53223", l: "zip", a: "POV", p: "", d: "2020-2024", v: 12.6297, se: 1.4992 },
  { g: "53224", l: "zip", a: "POV", p: "", d: "2020-2024", v: 25.3139, se: 3.921 },
  { g: "53225", l: "zip", a: "POV", p: "", d: "2020-2024", v: 16.958, se: 2.2654 },
  { g: "53226", l: "zip", a: "POV", p: "", d: "2020-2024", v: 7.0319, se: 0.9743 },
  { g: "53227", l: "zip", a: "POV", p: "", d: "2020-2024", v: 10.0376, se: 1.312 },
  { g: "53228", l: "zip", a: "POV", p: "", d: "2020-2024", v: 8.1172, se: 1.6135 },
  { g: "53233", l: "zip", a: "POV", p: "", d: "2020-2024", v: 58.2202, se: 3.487 },
  { g: "53235", l: "zip", a: "POV", p: "", d: "2020-2024", v: 16.9645, se: 3.6862 },
  { g: "53295", l: "zip", a: "POV", p: "", d: "2020-2024", v: 100.0, se: 20.2283 },
];
