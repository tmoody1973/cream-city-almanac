# Prompts to test what went live on 2026-10-12

Sign in at https://www.creamcityalmanac.app and use **Ask**. The expected numbers come from a run against the City's live data on 2026-10-12, so they may have moved a little since.

## Totals and medians (PR #30)

| Ask this | You should see |
|---|---|
| How much back property tax is owed, by aldermanic district? | A money card: about 17,500 accounts, about $59.0 million, median about $2,324, a row per district, and the note that ZIP is the owner's mailing ZIP |
| What do City employees earn, by department? | Gross pay: about 9,057 employees, about $594.9 million, median about $69,928. Small departments read "fewer than 5 records" |
| What's the median hourly pay rate for City employees, by department? | No Total column (adding up hourly rates means nothing) |
| What's the median home sale price, by year? | Sale price by year, overall median about $240,000 |
| What is all the property in Milwaukee assessed at, by aldermanic district? | About $49.8 billion, and a note that 8,417 $0 (exempt) properties were left out |
| What's the average back tax owed? | An Average column beside the median, and a note if the two are far apart |

## Privacy and the new refusals (PR #30)

| Ask this | You should see |
|---|---|
| What do employees in the Mayor's office earn, by job title? | Small job titles hidden. If fewer than 5 people match in all, the total is hidden too |
| What was total City employee pay in 2024? | The AI says the salary file has no dates, and doesn't keep retrying |
| What's the total assessed value of properties over $1 million? | "Totals can't be limited to a range of C_A_TOTAL yet…" |

## Follow-up buttons (PR #31)

Ask "How much back tax is owed for levy year 2024, by aldermanic district?", then click **SHOW THE AVERAGE**. The question it sends should include "where Levy Year is 2024".

## Empty City file (PR #28)

Ask "How many traffic crashes were there in 2025?". You should get "The City's current file for this dataset is empty…".

## Diagram (PR #29)

Open How it works. Under "What the AI does", click "the diagram of how Ask answers a question". It should open https://www.creamcityalmanac.app/how-ask-works.html.

## What you found

| Prompt | What happened | OK? |
|---|---|---|
| | | |
