// FBI NIBRS offense codes (Group A and Group B), as published in the NIBRS User Manual. The City's crime data stores
// the code ("240"); people say the words ("motor vehicle theft").
export const NIBRS: Record<string, string> = {
  "09A": "Murder and Nonnegligent Manslaughter", "09B": "Negligent Manslaughter", "09C": "Justifiable Homicide",
  "100": "Kidnapping/Abduction", "11A": "Rape", "11B": "Sodomy", "11C": "Sexual Assault With An Object", "11D": "Fondling",
  "120": "Robbery", "13A": "Aggravated Assault", "13B": "Simple Assault", "13C": "Intimidation", "200": "Arson",
  "210": "Extortion/Blackmail", "220": "Burglary/Breaking and Entering", "23A": "Pocket-picking", "23B": "Purse-snatching",
  "23C": "Shoplifting", "23D": "Theft From Building", "23E": "Theft From Coin-Operated Machine or Device",
  "23F": "Theft From Motor Vehicle", "23G": "Theft of Motor Vehicle Parts or Accessories", "23H": "All Other Larceny",
  "240": "Motor Vehicle Theft", "250": "Counterfeiting/Forgery", "26A": "False Pretenses/Swindle/Confidence Game",
  "26B": "Credit Card/Automated Teller Machine Fraud", "26C": "Impersonation", "26D": "Welfare Fraud", "26E": "Wire Fraud",
  "26F": "Identity Theft", "26G": "Hacking/Computer Invasion", "26H": "Money Laundering", "270": "Embezzlement",
  "280": "Stolen Property Offenses", "290": "Destruction/Damage/Vandalism of Property", "35A": "Drug/Narcotic Violations",
  "35B": "Drug Equipment Violations", "36A": "Incest", "36B": "Statutory Rape", "370": "Pornography/Obscene Material",
  "39A": "Betting/Wagering", "39B": "Operating/Promoting/Assisting Gambling", "39C": "Gambling Equipment Violations",
  "39D": "Sports Tampering", "40A": "Prostitution", "40B": "Assisting or Promoting Prostitution", "40C": "Purchasing Prostitution",
  "510": "Bribery", "520": "Weapon Law Violations", "64A": "Human Trafficking, Commercial Sex Acts",
  "64B": "Human Trafficking, Involuntary Servitude", "720": "Animal Cruelty",
  "90A": "Bad Checks", "90B": "Curfew/Loitering/Vagrancy Violations", "90C": "Disorderly Conduct",
  "90D": "Driving Under the Influence", "90E": "Drunkenness", "90F": "Family Offenses, Nonviolent", "90G": "Liquor Law Violations",
  "90H": "Peeping Tom", "90J": "Trespass of Real Property", "90Z": "All Other Offenses",
};

export const offenseName = (code: string) => NIBRS[code.trim().toUpperCase()] ?? `Offense code ${code}`;
export const isOffenseColumn = (name: string) => /offense/i.test(name);

export function offenseCodes(words: string): string[] {
  const w = words.trim().toLowerCase();
  if (NIBRS[w.toUpperCase()]) return [w.toUpperCase()];
  return Object.entries(NIBRS).filter(([, name]) => name.toLowerCase().includes(w)).map(([code]) => code);
}
