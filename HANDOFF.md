# Handoff: Equal Care Across Finland

Junction 2026 — wyzwanie **AstraZeneca ("Equal Care Across Finland")** oraz **Best Use of Gemini API**.
Najpierw przeczytaj `README.md` i `CLAUDE.md`; szczegóły narracji prezentacyjnej są w `PITCH.md`, a transkrypt wideo w `demo/TRANSCRIPT.md`.

## Kryteria oceny i jak je realizujemy

| Kryterium | Waga | Nasza odpowiedź w produkcie |
|---|---|---|
| **Actionability** | 30 % | Każda rekomendacja cytuje konkretne działanie z rządowego planu wdrożenia (`id + strona` + pełny angielski tytuł) i podaje zakres efektu z dwóch niezależnych modeli jako górną granicę pod pilotaż |
| **Insight** | 25 % | Dwuwarstwowe wyjaśnienie luki: regresja WLS na 291 gminach oddziela demografię od czynników lokalnych (bez AI), a 771 archetypów mieszkańców w Gemini Decisions wskazuje konkretne bariery (język 54 %, praca/czas 17 %) |
| **Data quality & transparency** | 20 % | Każda liczba ma klikalne źródło; rygorystyczne odznaki `DATA` / `SIMULATION` / `ROADMAP` / `ASSUMPTION`; ostrzeżenia `small numbers` przy `n < 30`; jawne pokazanie luki pomiarowej (brak stadium przy diagnozie per region) |
| **Execution** | 15 % | Działa na żywo bez kluczy z zapisanych cache’y (`data/`), ma interaktywną mapę kropek mieszkańców, film kolejek THL, analityka z weryfikacją liczb i generator briefingu/slajdów 16:9 |
| **Clarity** | 10 % | 4-krokowy przewodnik wokół jednego wybranego regionu + samogrający `? Walkthrough` (22 karty spotlight z automatycznymi kliknięciami symulacji) |

## Szybki start

```bash
make setup            # Python 3.12 venv + npm install w web/
make check            # 76 testów danych, rozbicia WLS, symulacji, replaya, matchera i analityka
make demo             # API (:8010) + frontend (:3010); Ctrl-C zatrzymuje oba
make stop             # zwalnia porty 8010 i 3010
```

Wszystkie dane źródłowe oraz cache odpowiedzi **Gemini Decisions** (`data/decisions/`, w tym `data/decisions/focus/`) i **Jev** (`data/jev/`) są w repozytorium — ścieżka demo nie wymaga żadnych kluczy API. Klucze w `.env` (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `TYPESAFE_API_KEY`) są potrzebne wyłącznie przy generowaniu nowych kombinacji spoza cache’u, świeżego briefingu `/report` lub pytań na żywo w `Ask the analyst`.

## Aktualne liczby z danych i modeli (spójne z API)

- **Krok 1 — Where is the gap? (Mammografia, Helsinki `90`, 2024):**
  - Uczestnictwo: **74,3 %** wobec celu **80 %** i średniej krajowej **81,6 %** (*THL / Sotkanet #3621, 2024*).
  - Do osiągnięcia celu 80 % brakuje ok. **2 201 kobiet rocznie** (spośród 38 608 zaproszonych).
  - Przeżywalność 5-letnia (Goal 3): **91 %** (Finlandia **92 %**).
- **Krok 2a — Rozbicie statystyczne WLS (`src/decompose.py`, bez AI):**
  - Luka Helsinek do Finlandii wynosi **7,3 pkt** (`74,3 %` vs `81,6 %`).
  - Ważona regresja na **291 gminach** (*R² = 60 %*) przypisuje **4,7 pkt** (*przedział 90 %: 1,3–5,8 pkt*) składowi ludności (język obcy, wykształcenie, wiek 65+, wielkość gminy), a **2,6 pkt** pozostawia niewyjaśnione lokalnie (organizacja dostępu, prywatne mammografie liczone w danych publicznych jako nieobecność).
- **Krok 2b — Symulowani mieszkańcy (`src/residents.py`, Gemini Decisions `gemini-decision-1`):**
  - Walidacja ważona po regionach względem realnych wyników 2024: **r = 0,84** (mammografia, 22 regiony) oraz **r = 0,62** (rak jelita grubego). Cytologia (**r = 0,24**) jest celowo wyłączona z głównej ścieżki, bo duża część badań odbywa się poza programem publicznym.
  - W Helsinkach (771 typów mieszkanek) główną barierą wśród nieuczestniczących jest **język (54 %)**, dalej **praca / brak czasu (17 %)** i **brak poczucia potrzeby (11 %)**. Kierunek potwierdza niezależnie Fiński Rejestr Nowotworów 2024 (`83,2 %` języki krajowe vs `60,8 %` inne języki; model przesadza z wielkością różnicy do `48,0 %`, co pokazujemy jawnie w tabeli walidacji grupowej).
- **Krok 3 — Interwencje i roadmapa (`src/whatif.py`, `src/matcher.py`):**
  - **Own language** (*Roadmap 1.3.1, s. 33* + *1.1.1, s. 26*): zakres dwóch modeli **+992 do +2 093 kobiet rocznie** (**Jev +992**, **Gemini Decisions +2 093**), czyli **45,1–95,1 %** rocznej luki Helsinek — pokazywane jako symulowana górna granica przed pilotażem.
  - Pozostałe pojedyncze scenariusze w Helsinkach (Gemini Decisions): *Evening slots* **+421/rok** (`19 %`), *Mobile unit* **0/rok**, *SMS reminder* **−58/rok** (pokazywane uczciwie bez obcinania minusa). Kombinacja *Own language + Evening slots*: **+2 760/rok** (powyżej luki, oznaczona jako upper bound).
- **Krok 4 — Cała ścieżka i Goal 3 (`src/focus.py`, `src/fetch_thl_queue.py`):**
  - Korelacja między badaniem przesiewowym a przeżywalnością na poziomie regionów jest bliska zeru (**r od −0,24 do +0,03**) — wąskie gardła pojawiają się dalej na ścieżce.
  - `/api/focus/{prog}/{code}` używa jednego cache’owanego wywołania `choice` w Gemini Decisions na prawdziwych wskaźnikach regionu do wskazania etapu pierwszego wyboru (etykieta `SIMULATION`, pomoc priorytetyzacyjna).
  - Kolejki do onkologii powyżej 90 dni (*THL Hoitoon pääsy, 30.09.2026*): kraj **3,5 %** (*n = 486*), najdłuższe w **Satakuncie 37,5 %** (*n = 8, ostrzeżenie `small numbers`*), **North Savo 33,3 %** (*n = 6*), **Kanta-Häme 27,3 %** (*n = 11*) — powiązane z działaniami **3.1.2 (s. 56)** i **3.1.4 (s. 58)**.
  - **Diagnosis**: brak publicznych danych o stadium przy diagnozie per region (w skali kraju znane tylko dla **42 %** nowotworów wg raportu *Syöpä 2024*, rozdz. 5) — luka w danych jest wnioskiem samym w sobie (**Roadmap 3.2.1**).

## Wideo demo (`demo/demo.py`)

Skrypt generujący deterministyczne wideo `1920×1080` (≤ 2:00) z lektorem Gemini TTS (`Sulafat`), weryfikacją transkrypcji i wersją bez dźwięku do prezentacji na żywo:

```bash
uv run --with pillow --with google-genai python demo/demo.py vo          # TTS + QA transkrypcji
uv run --with pillow --with google-genai python demo/demo.py rehearse    # rozgrzanie cache API
uv run --with pillow --with google-genai python demo/demo.py record      # nagranie buildu produkcyjnego
uv run --with pillow --with google-genai python demo/demo.py compose     # demo/out/equal-care-pitch.mp4
uv run --with pillow --with google-genai python demo/demo.py transcript  # demo/TRANSCRIPT.md
```
