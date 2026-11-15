# Equal Care Across Finland — 2-Minute Pitch Transcript

> **Audio & Transcript Provenance:** Voice-over synthesized with **Gemini TTS** (`gemini-3.1-flash-tts-preview`, voice `Charon`) and automatically QA-transcribed verbatim with **Gemini** (`gemini-3.5-flash`).
> **Gemini Stack in the Product:**
> 1. **Gemini Decisions API (`gemini-decision-1`)** — 771+ synthetic census resident archetypes (attendance + barriers, `r = 0.84`) & live counterfactual interventions (`src/residents.py`, `src/whatif.py`).
> 2. **Gemini Decisions API** — Semantic matching & scoring (`0–3`) of barriers against all 73 National Cancer Strategy Roadmap actions (`src/matcher.py`).
> 3. **Gemini Decisions API (`choice`)** — Step 4 care-pathway stage prioritisation from sourced county indicators (`src/focus.py`).
> 4. **Gemini Text & Image (`gemini-2.5-flash` / `gemini-2.5-flash-image`)** — `{fact}`-placeholder executive briefing, 8-slide deck & Nordic editorial cover/scene illustrations (`src/report.py`), verified by `src/grounding.py`.

**0:00.8 – 0:17.2 · Equal Care Finland** _(SPOTLIGHT WALKTHROUGH  ·  PUBLIC THL DATA)_  
Finland targets eighty percent cancer screening in every county, mapped live with a built-in spotlight guide. Surprisingly, breast screening lags most in Helsinki at seventy-four point three percent — two thousand two hundred women missing each year.

**0:17.6 – 0:32.7 · People or services?** _(ZERO LLM ARITHMETIC  ·  291-MUNI WLS)_  
In step two, plain weighted regression across two hundred and ninety-one municipalities splits Helsinki's seven point three point gap without AI: four point seven points from demographics, and two point six points unexplained locally.

**0:33.1 – 0:50.4 · 771 resident archetypes** _(GEMINI DECISIONS API  ·  RESIDENT SIMULATION)_  
Next, Gemini Decisions evaluates seven hundred and seventy-one census resident types on the map, matching real county attendance at r equals zero point eight four. Language is the top barrier at fifty-four percent — and every dot reveals the exact prompt.

**0:50.7 – 1:09.6 · What closes the gap** _(GEMINI COUNTERFACTUALS + ROADMAP MATCHER)_  
In step three, Gemini also matches barriers against all seventy-three national roadmap actions. Re-running Helsinki's residents with own-language invitations — action one point three point one, page thirty-three — brings nine hundred and ninety-two to two thousand and ninety-three women a year.

**1:09.9 – 1:28.6 · Beyond screening** _(GEMINI STAGE PRIORITISATION  ·  THL QUEUES)_  
Step four covers Strategy Goal Three across the care pathway. Gemini Decisions ranks which stage each county should fix first and flags missing diagnosis-stage data, while Satakunta's monthly map shows thirty-seven point five percent waiting over ninety days — with small-number warnings.

**1:29.0 – 1:43.9 · Grounded briefing** _(GEMINI BRIEFING + IMAGE + TTS VOICE & QA)_  
Finally, Gemini turns your session into an illustrated briefing and slide deck, with every number inserted and verified by code — and Gemini even voiced and transcribed this pitch. Equal Care Across Finland.

_Total video length: 104.8 s (limit: 120 s)_
