# Pitch: Equal Care Across Finland (2 minutes)

Every number below comes from the running app (`/api/brief`, `/api/recommend`, `/api/whatif`, `/api/values`).
Re-check them against the live demo before presenting. Simulated numbers are always said as "simulated".

## Script (≈ 2:00)

**0:00 Hook.** "Finland wants 80 % screening attendance in every wellbeing services county. The county furthest
behind on breast screening isn't in the countryside. It's Helsinki: 74.3 %, about 2 200 women a year missing."
*(Demo: landing page, 2-minute brief, Breast.)*

**0:20 Insight: where the gap comes from.** "We rebuilt Finland's 50 to 69 year olds from Statistics Finland tables
and asked simulated residents whether they would attend. Helsinki's population explains 0.4 points of its 7.3-point
gap. The other 6.9 points are services: access, appointment times, and private mammography counted as absence. The
simulation matches real 2024 county rates with r = 0.75." *(Point at the split bar and the Simulation pill.)*

**0:45 What to do, with a citation.** "Each recommendation is a numbered action of the national roadmap. For Helsinki
the biggest simulated lever is invitations in the person's own language, roadmap action 1.3.1, page 33: +676 women a
year. SMS reminders with one-tap rebooking add +440 through action 2.4.1." *(Open Helsinki card, Why and what to do.)*

**1:05 Live simulation.** "Here's the live part. Combine interventions and the simulated residents answer again."
*(What if: own language + SMS → Run.)* "Combined, about 1 200 more women a year, more than half of Helsinki's gap.
That's an upper bound from the model, not a forecast, and we label it that way."

**1:25 Goal 3: further down the pathway.** "Screening doesn't explain survival: at county level the correlation is
weak or absent (r between −0.24 and 0.03), so the survival gap appears later. THL's monthly queue data shows where. In
Satakunta, Pohjois-Savo and Kanta-Häme between a quarter and over a third of oncology patients waited over 90 days, against 3.5 % nationally. Those are small
numbers and we show n next to every value. Recommendation: regional care pathways and quality targets, 3.1.2 and 3.1.4."
*(Map: Oncology waiting >90 days layer, Satakunta card.)*

**1:45 The data gap is a finding.** "Stage at diagnosis is recorded for only 42 % of cancers nationally, 72 % in
Pirkanmaa. Until the quality registry (action 3.2.1) exists, nobody can say which county diagnoses late. Our tool is
built to take that data the day it is published."

**1:55 Close.** "Public data, a source behind every number, and an action a county can put in its next procurement.
Equal Care Across Finland."

## Slides (if slides are required next to the demo)

1. Title + one line: "Where does cancer care fall behind, and what should each county do?"
2. Helsinki 74.3 % vs 80 % target; 2 201 women a year. Source: THL Sotkanet #3621, 2024.
3. Split bar: population 0.4 pts / services 6.9 pts (simulation, r = 0.75 vs 2024 county rates).
4. Actions table: scenario → people per year → roadmap id + page (1.3.1 p.33, 2.4.1 p.47, 2.4.5 p.50).
5. Goal 3: oncology waiting > 90 days by county (THL, 30.09.2026), with n; actions 3.1.2 / 3.1.4.
6. Limits: private mammography counts as absence; survival has no case counts (Åland noisy); queue data covers
   non-urgent care and is reported per producer (HUS shared by Helsinki and the four Uusimaa counties); stage known
   for 42 % of cases.
7. Beyond Junction: a pilot with one county. Monthly refresh from THL and Sotkanet, the what-if before each
   procurement round, and Gemini Decisions as the simulation engine.

## Sources to show

- THL Sotkanet indicators 3621 (breast), 6103 (colorectal), survival indicators: https://sotkanet.fi
- THL Hoitoon pääsy, erikoissairaanhoito, Syöpätaudit: https://thl.fi/data-ja-tilastot/hoitoon-paasy/erikoissairaanhoito
- Kansallisen syöpästrategian toimeenpanon tiekartta 2026–2031 (action ids and pages)
- Suomen Syöpärekisteri, Syöpä 2024 report, chapter 5 (stage coverage)
- Statistics Finland population tables and boundaries (CC BY 4.0)
