# Pitch: Equal Care Across Finland (2 minutes)

Every number below comes from the running app (`/api/brief`, `/api/recommend`, `/api/whatif`, `/api/residents`, `/api/focus`, `/api/values`).
Simulated figures are always explicitly labelled **SIMULATION** (upper bounds / prioritisation aids, never observed data).

## Live / Video Script (≈ 1:57)

**0:00 — Hook (Step 1: Where is the gap?).**
"Finland aims for 80 % cancer screening attendance in every wellbeing services county. Yet on breast mammography, the county furthest behind isn't rural — it's Helsinki, at **74.3 %** against **81.6 %** nationally: about **2 201 women missing each year** (*THL Sotkanet #3621, 2024*)."
*(Screen: Step 1 — Breast mammography, Helsinki selected on map & ranking.)*

**0:18 — Why? Part A: Data decomposition (Step 2).**
"In step two, we split Helsinki's **7.3-point** shortfall to Finland without AI, using invited-weighted regression across **291 municipalities** (*R² = 60 %*). **4.7 points** (*90 % CI: 1.3–5.8*) come from demographics — language, education, age and municipality size — leaving **2.6 points** unexplained locally, where service access or uncounted private mammography may play a role."
*(Screen: Step 2 top card — `Mostly who lives here`, `DATA · 291 munis`.)*

**0:35 — Why? Part B: Simulated residents (Step 2).**
"Next, we ask **771 synthetic resident archetypes** rebuilt from Statistics Finland census tables. **Gemini Decisions** (`gemini-decision-1`) estimates who attends and what stops them, matching real 2024 county rates at **r = 0.84**. **Language** leads among barriers at **54 %** (followed by **work / time** at **17 %**), independently consistent with Finnish Cancer Registry 2024 group data (*60.8 %* vs *83.2 %*). Clicking any resident dot on the map exposes the exact state, questions and recorded answer."
*(Screen: Click `Ask 771 simulated resident types in Helsinki →` → green & rose dots rain across Helsinki → click a dot → `See what Gemini Decisions was asked`.)*

**0:56 — What would help? Roadmap-backed simulation (Step 3).**
"In step three, we test national roadmap actions on those same residents. Invitations and outreach in the person's **own language** — **Roadmap Action 1.3.1, page 33** (*plus 1.1.1, p. 26*, matched and scored against the roadmap text by Gemini Decisions) — bring **+992 to +2 093 women a year** across two independent engines (**Jev +992**, **Gemini Decisions +2 093**), closing **45–95 %** of Helsinki's gap as a simulated upper bound for a county pilot."
*(Screen: Step 3 → select `Own language` → `Run simulation →` → rose dots flip to emerald green.)*

**1:15 — Beyond screening: Strategy Goal 3 & data gaps (Step 4).**
"Step four tracks **Strategy Goal 3** across the full five-stage care pathway. Gemini Decisions ranks which stage a county should address first from its real stats, while the **Diagnosis** node highlights a critical national measurement gap: stage at diagnosis is not published by county (*recorded for only 42 % of cancers nationally — Roadmap 3.2.1*). Selecting **Satakunta** shows **37.5 %** of oncology patients waiting over 90 days against **3.5 %** nationally (*THL Hoitoon pääsy, 09.2026*) — with an explicit **n = 8 · small numbers** warning and citations to **Roadmap 3.1.2 (p. 56)**."
*(Screen: Step 4 → stage waffles cascade → click `Satakunta 37.5 %` → `Treatment` → press `▶` to animate monthly queues.)*

**1:38 — Grounded briefing, slide deck & close.**
"Finally, one click compiles the counties and interventions you explored into a cited **Briefing** and **16:9 Slide Deck** (`/report`). Gemini writes the narrative using `{fact}` placeholders while deterministic backend code inserts and verifies every figure (*0 grounding flags*). Public data, honest limits, and procurement-ready roadmap actions — Equal Care Across Finland."
*(Screen: `Generate report` → `Slides` → visual Where / What slides.)*

## Slide Deck Summary (`/story` & `/report?view=slides`)

1. **Title** — *Equal Care Across Finland*: public data, verified simulation, cited national roadmap actions.
2. **Where** — Helsinki breast screening **74.3 %** vs **80 %** target (**81.6 %** Finland); **2 201 women/yr** short (*THL Sotkanet #3621, 2024*).
3. **Why (Data)** — **7.3-pt** gap to Finland split by 291-municipality WLS (*R² = 60 %*): **4.7 pts** demographics (*1.3–5.8*), **2.6 pts** unexplained locally.
4. **Who (Simulation)** — **771** Helsinki resident archetypes via Gemini Decisions (*county validation r = 0.84*): top barriers **language (54 %)** and **work / time (17 %)**.
5. **What to do** — **Own language** outreach (**Roadmap 1.3.1, p. 33**): **+992 to +2 093 women/yr** across Jev & Gemini Decisions (*45–95 % of gap, simulated upper bound*).
6. **Pathway & Goal 3** — Monthly THL oncology queues (**Satakunta 37.5 %** vs **3.5 %** Finland, *n = 8* flagged; **Roadmap 3.1.2, p. 56**) + missing county stage-at-diagnosis data (*42 % nationally, Roadmap 3.2.1*).
7. **Limits & Next Steps** — Private mammography counted as absence; survival lacks case counts; HUS shared across Uusimaa/Helsinki; ready for a one-county procurement pilot.

## Core Sources

- **THL Sotkanet** (`#3621` breast screening, `#6103` colorectal screening, 5-year survival, demographics `#187`, `#180`, `#1068`, `#127`): https://sotkanet.fi
- **THL Hoitoon pääsy** (*Erikoissairaanhoito — Syöpätaudit* monthly referral >21d & treatment >90d queues): https://thl.fi/data-ja-tilastot/hoitoon-paasy/erikoissairaanhoito
- **National Cancer Strategy 2026–2035 & Implementation Roadmap 2026–2031** (73 parsed actions with IDs, pages, budgets and metrics)
- **Finnish Cancer Registry (*Syöpä 2024* & 2024 Screening Statistics)** (group attendance by language/education & 42 % stage-at-diagnosis coverage)
- **Statistics Finland** (`geo.stat.fi` boundaries & population tables, CC BY 4.0)
