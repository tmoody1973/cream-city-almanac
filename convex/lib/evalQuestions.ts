// Reporter-style questions with the family keys a good answer must include in its top 3.
// Tarik adds 5 real newsroom questions here. Never edit an expectation to match a bad result.
export const QUESTIONS: { question: string; expect: string[] }[] = [
  { question: "kids who can't afford food", expect: ["dataset:food-insecurity-prevalence", "dataset:child-public-assistance-status"] },
  { question: "how many people own their homes", expect: ["dataset:housing-tenure", "dataset:black-homeownership", "dataset:hispanic-homeownership", "dataset:latinx-homeownership"] },
  { question: "asthma rates", expect: ["dataset:asthma-prevalence"] },
  { question: "mortgage lending discrimination", expect: ["dataset:hmda-data"] },
  { question: "who doesn't have internet at home", expect: ["dataset:households-with-broadband-internet"] },
  { question: "families without a car", expect: ["dataset:households-without-vehicle"] },
  { question: "lead paint risk in old houses", expect: ["dataset:housing-built-before-1950"] },
  { question: "people who struggle with English", expect: ["dataset:linguistic-isolation"] },
  { question: "how much do households earn", expect: ["dataset:median-income"] },
  { question: "renters paying too much for rent", expect: ["dataset:rent-burdened-households"] },
  { question: "jobless rate", expect: ["dataset:unemployment-rate"] },
  { question: "empty houses", expect: ["dataset:vacant-residential-housing"] },
  { question: "air pollution", expect: ["dataset:daily-air-quality"] },
  { question: "test scores in schools", expect: ["dataset:school-proficiency"] },
  { question: "college graduates", expect: ["dataset:individuals-with-bachelors-degree-or-higher"] },
  { question: "how long people drive to work", expect: ["dataset:work-commute-time"] },
  { question: "foreclosures", expect: ["dataset:residential-foreclosures"] },
  { question: "redlining map", expect: ["dataset:redlining-boundaries"] },
  { question: "home sale prices", expect: ["dataset:median-residential-property-sales"] },
  { question: "poverty", expect: ["dataset:households-living-in-poverty"] },
  { question: "depression and mental health", expect: ["dataset:poor-mental-health-prevalence"] },
  { question: "going to the dentist", expect: ["dataset:individuals-who-have-visited-the-dentist-in-the-past-year"] },
  { question: "people with disabilities", expect: ["dataset:disability-status-by-age", "dataset:disability-status-by-type"] },
  { question: "Latino population growth", expect: ["dataset:hispanic-population", "dataset:population-change"] },
  { question: "racial makeup of the county", expect: ["dataset:racial-demographics", "dataset:racial-and-ethnic-diversity"] },
  { question: "what has changed in Harambee", expect: ["document:neighborhood-change-over-time-report", "document:neighborhood-portrait"] },
];

export function passesTop3(expected: string[], resultKeys: string[]): boolean {
  return resultKeys.slice(0, 3).some((k) => expected.includes(k));
}
