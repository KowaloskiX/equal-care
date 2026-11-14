# Handoff: Equal Care Across Finland

Junction 2026, wyzwanie AstraZeneca. Najpierw przeczytaj `README.md` i `CLAUDE.md`; poniżej jest to, czego tam nie ma: stan prac i zadania do wzięcia.

## O co gramy

Mapa 23 fińskich regionów (hyvinvointialue), która pokazuje, gdzie ścieżka leczenia raka zostaje w tyle, dlaczego, i co konkretnie zrobić. Punktacja jury:

| Kryterium | Waga | Czym je bierzemy |
|---|---|---|
| Actionability | 30 % | rekomendacja = numerowane działanie z planu wdrożenia (id + strona) + liczba ludzi rocznie |
| Insight | 25 % | luka rozbita na „wynika z tego, kto tam mieszka” i „reszta = usługi” |
| Data quality | 20 % | źródło przy każdej liczbie, symulacja zawsze oznaczona i z walidacją |
| Execution | 15 % | działa na żywo, cache w repo, bez kluczy |
| Clarity | 10 % | decydent rozumie przekaz w 2 minuty |

Wymóg obowiązkowy: co najmniej jeden wskaźnik Goal 3 strategii (przeżywalność, umieralność, czas do leczenia). Mamy przeżywalność 5-letnią z Sotkanet.

## Stan na 15.11 rano

- Demo gotowe: `make demo` (API :8010 + web :3010, Ctrl-C zatrzymuje oba; `make stop` zwalnia porty). Testy: `make check` (40), `cd web && npx tsc --noEmit && npm run lint`.
- Ekran: górny pasek (Data / Simulation, Story) · lewy panel = 5 kroków ścieżki (Diagnosis pokazuje brak danych o stadium jako wniosek) · prawy panel „Screening brief” w 3 krokach (Where / Why / What would help + Combine) · karta regionu z zakładkami Why & what to do / Pathway / What if · `/story` = 7 slajdów z danymi z API.
- Kombinacje „Combine the top two” dla wszystkich regionów z briefu są w cache (0 zapytań na żywo).
- Zapasowe nagranie demo i zrzuty: `media/` (poza gitem): `demo-backup.mp4` (66 s), `final-*.png` (1440×900 i 1280×720).
- Zostało: wywiad z mentorką, push + PR (decyzja Piotra), nagranie z głosem / zgłoszenie na platformie, Gemini po dostaniu klucza.

## Uruchomienie (ok. 5 minut)

```bash
git clone https://github.com/KowaloskiX/equal-care.git && cd equal-care
make setup            # Python 3.12 venv + npm install w web/
make check            # test API, powinno być "all passed"
make app              # API: http://localhost:8010
make web              # frontend: http://localhost:3010 (drugi terminal)
```

Klucze nie są potrzebne do demo: dane i odpowiedzi silnika są w repo (`data/`). Silnik symulacji wybiera `SIM_ENGINE` w `.env` (`gemini` albo `jev`; domyślnie `gemini`) albo flaga `--engine`. `TYPESAFE_API_KEY`/`GEMINI_API_KEY` są potrzebne tylko, jeśli zmieniasz pytania albo stan osób w `src/residents.py` (wtedy cache się unieważnia i idą nowe zapytania). Klucz weź od Łukasza, nie commituj `.env`.

## Co już jest

- **Dane** (`src/fetch_*.py`, `src/strategy.py`): 14 wskaźników THL Sotkanet dla kraju, regionów i gmin; granice z Tilastokeskus; tabele ludności z Tilastokeskus; strategia i plan wdrożenia strona po stronie, 73 działania z planu sparsowane (odpowiedzialny, budżet, miernik, strona).
- **API** (`app/server.py`): `/api/values`, `/api/region/{code}`, `/api/gap`, `/api/actions`, `/api/sim/...`. Każda liczba ma `source`.
- **Symulacja mieszkańców** (`src/population.py`, `src/residents.py`, `src/simulate.py`): mieszkańcy 30–74 jako ważone komórki (gmina × płeć × wiek × język × typ zabudowy × wykształcenie × aktywność), silnik decyzyjny (`SIM_ENGINE`: Jev/TypeSafe albo Gemini Decisions `gemini-decision-1`) odpowiada raz na archetyp „czy pójdzie na badanie i co jest główną barierą”, scenariusze „co jeśli”. Obecnie skomitowane dane pochodzą z Gemini Decisions (`data/decisions/`); cache Jev (`data/jev/`) zostaje i `SIM_ENGINE=jev` przywraca stare wyniki.
- **Kolejki do onkologii z THL** (`src/fetch_thl_queue.py` → `data/thl_queue.csv`, `make thl-queue`): co miesiąc od 01.2024, specjalność Syöpätaudit, per region: `onc_ref_21` (skierowania rozpatrzone po >21 dniach, etap referral) i `onc_wait_90` (czekający >90 dni na leczenie, etap treatment), oba Goal 3. THL raportuje per placówka: 4 regiony Uusimaa i Helsinki dostają wartość HUS (`shared_producer`), Kainuu i Åland brak. Małe liczby: przy każdej wartości `n`, flaga przy n < 30.
- **Rekomendacje** (`src/recommend.py`, `/api/recommend/{prog}/{code}`, `/api/brief`): rozbicie luki (driver: services / population / national / on_target), scenariusze → działania z planu (1.3.1, 2.4.1 + 1.1.1), działania ścieżki (2.4.5, 2.5.2, 3.1.2, 3.1.4, 3.2.1, 3.2.2) z `why` i `assumption`; tytuły po angielsku (`TITLE_EN`).
- **What-if na żywo** (`src/whatif.py`, `/api/whatif?prog=&code=&s=a,b`): łączenie interwencji dla jednego regionu, brakujące odpowiedzi idą na żywo do aktywnego silnika (Gemini Decisions), wynik w osobach rocznie i % zamkniętej luki. Kombinacje dla regionów z briefu są w cache (klik 1–3 s); nowa kombinacja 4–14 s; bez klucza HTTP 503.
- **Frontend** (`web/`): mapa z przełącznikiem Data / Simulation, „2-minute brief” (3 regiony z największą luką per program), karta regionu ze ścieżką (sparkline, n, small numbers), „Why and what to do”, „What if this county…”.

## Co wiemy z danych (do pitchu)

- Mammografia: najniższe uczestnictwo w stolicy (Helsinki 74,3 %, cel 80 %), nie na prowincji. Helsinkom brakuje ok. 2 200 kobiet rocznie.
- Przeżywalność 5-letnia, rak jelita grubego (Goal 3): od 63 % (Päijät-Häme) do 74 % (Keski-Uusimaa), Finlandia 68 %.
- Na poziomie regionów uczestnictwo w badaniach nie koreluje z przeżywalnością (r od −0,24 do 0,03): luka w przeżywalności powstaje dalej na ścieżce.
- Symulacja vs rzeczywistość 2024 (r po regionach, Gemini Decisions): mammografia 0,87, jelito grube 0,62; cytologii nie symulujemy. W historii używamy mammografii i jelita grubego.
- **Znana zależność od modelu (Jev vs Gemini):** Jev dawał mammografia r = 0,75 / jelito grube r = 0,58 (po gminach ~0,30 / ~0,24), Gemini 0,87 / 0,62 (po gminach 0,28 / 0,29; gminy 300+: 0,43 / 0,20). Pod Gemini wynik dla Helsinek się odwraca: mammografia to głównie „kto tu mieszka” (expected ≈ 74,4 vs realne 74,3; composition −7,2 pkt, other −0,1 pkt), pod Jev było odwrotnie (composition −0,4 / other −6,9, driver „services”). Wartości Jev działają nadal przez `SIM_ENGINE=jev` — traktować rozbicie luki jako wynik modelowy, nie fakt.
- **Walidacja grupowa (Cancer Registry 2024 vs symulacja, tylko do pokazania — bez kalibracji):** `data/registry_groups.json` trzyma surowe uczestnictwo wg języka i wykształcenia z raportów Syöpärekisteri (stats.cancerregistry.fi, uczestniczący/zaproszeni, bez standaryzacji wiekowej). `simulate.group_validation` liczy te same grupy na zakotwiczonej symulacji; wynik jest w `/api/sim/{prog}` i w `final` replaya (krok 2b, „How this was computed"). ASSUMPTION mapowania: język „domestic" = fi/sv; wykształcenie: 9_X → podstawowe/nieznane, 3_4 → średnie, 5_6 i 7_8 → wyższe. Wyniki (rejestr vs Gemini): mammografia język 83,2 vs 85,3 (fi/sv) i 60,8 vs 48,0 (inne); wykształcenie 63,5 vs 72,9 / 81,2 vs 81,9 / 85,9 vs 85,3. Jelito grube: 74,5 vs 77,3 i 53,4 vs 37,0; 61,5 vs 61,1 / 73,0 vs 73,8 / 79,3 vs 82,2. Czyli model przesadza z luką językową, a w mammografii niedoszacowuje bariery przy niskim wykształceniu.
- Rozbicie luki, mammografia, Helsinki: 7,3 pkt poniżej Finlandii, z czego skład ludności (wiek, język, wykształcenie, praca) tłumaczy 0,4 pkt, a 6,9 pkt nie. West Uusimaa: 0,4 vs 5,1 pkt, Vantaa i Kerava: 1,0 vs 3,9 pkt. To nasz „insight”: luka w stolicy to nie mieszkańcy, tylko usługi (dostęp, terminy, badania prywatne liczone jako nieobecność; to ostatnie trzeba potwierdzić z mentorką).
- Scenariusze (symulacja, cała Finlandia, dodatkowe osoby rocznie):

  | Scenariusz | Mammografia | Jelito grube | Cytologia |
  |---|---|---|---|
  | SMS z przypomnieniem i zmianą terminu jednym kliknięciem | +3 251 | +7 230 | +8 576 |
  | Zaproszenie we własnym języku | +3 033 | +5 649 | +4 530 |
  | Terminy wieczorne i w soboty | +1 919 | +1 785 | +3 164 |
  | Mobilny punkt blisko domu | +1 431 | +3 096 | +1 128 |

  Liczby per region są w `/api/sim/{prog}?scenario=...`. To szacunki, pokazujemy je zawsze z walidacją.
- Połączenie czterech interwencji w Helsinkach (what-if, symulacja): mammografia +1 992 osób rocznie (90,5 % luki), jelito grube +4 014 (91,9 %). To górna granica modelu, a nie prognoza: interwencje są zakładane jako w pełni wdrożone i działające niezależnie.
- Kolejki do onkologii, 30.09.2026 (THL): w kraju 486 czekających, 3,5 % ponad 90 dni. Najwięcej: Satakunta 37,5 % (n = 8), Pohjois-Savo 33,3 % (n = 6), Kanta-Häme 27,3 % (n = 11), Etelä-Pohjanmaa 23,1 % (n = 13), Pohjois-Karjala 13,9 % (n = 36). Skierowania >21 dni: wszędzie poniżej 1 %, czyli etap skierowania nie jest wąskim gardłem w tych danych.
- Stadium przy rozpoznaniu: raport Syöpärekisteri 2024 (rozdz. 5) podaje, że stadium jest znane w 41,9 % przypadków w kraju, Pirkanmaa 71,9 %, cel ≥ 70 %. Wartości per region są tylko na wykresach (KUVA 5.1/5.2), więc nie ma ich w aplikacji jako wskaźnika. Wniosek do pitchu: luki w przeżywalności nie da się umiejscowić na ścieżce, bo brakuje danych o stadium; to rekomendacja 3.2.1 / 4.1.1.

## Zadania do wzięcia

Pracuj na własnej gałęzi, PR do `main`. Zadania są tak podzielone, żeby nie dotykać tych samych plików.

1. ~~Frontend: warstwa symulacji i rekomendacji~~ zrobione (gałąź `feat/gemini-decisions`).
2. **Przełączenie symulacji na Gemini Decisions**, gdy będzie `GEMINI_API_KEY`: `SIM_ENGINE=gemini` w `.env`, `make sim-residents && make sim`, potem nowe r walidacji do README/CLAUDE/HANDOFF.
3. **Analityk na Gemini** (`src/analyst.py` + `/api/ask`). Gemini dostaje narzędzia nad `datastore`, `/api/sim` i `strategy.actions()`, odpowiada na pytanie decydenta, każda liczba przechodzi przez `src/grounding.py`. Potrzebny `GEMINI_API_KEY` (Google AI Studio). Zgłaszamy też do „Best Use of Gemini API” (4000 €).
4. **Więcej danych do Goal 3**: kolejki THL zrobione. Stadium per region istnieje tylko jako wykres w raporcie Syöpärekisteri; można zapytać mentorkę albo app@cancer.fi o tabelę.
5. **Rozmowa z mentorką** (Kaisa Kaitila, Medical Affairs, AstraZeneca, na miejscu w sobotę). Pytania: czy niskie uczestnictwo w mammografii w stolicy to efekt prywatnych badań; jak dużo cytologii dzieje się poza programem; która rekomendacja jest wykonalna dla regionu; czy kolejki THL do onkologii (leczenie niepilne) to sensowny wskaźnik przepustowości; czy jest tabela pokrycia stadium per region. Odpowiedzi zapisać jako źródło („mentor interview”).
6. **Pitch** (szkic w `PITCH.md`): 2-minutowa historia dla decydenta, slajdy, nagranie demo, zgłoszenie na platformie Junction (zgłoszenie do AstraZeneca i Gemini).

## Zasady (pełne w `CLAUDE.md`)

- Żadnej liczby wpisanej ręcznie w UI ani wygenerowanej przez model. Liczby liczy kod, model tylko tłumaczy i wybiera.
- Każda rekomendacja cytuje działanie z planu wdrożenia (id + strona).
- Symulacja nigdy nie udaje danych: etykieta + walidacja.
- Mówimy, czego dane nie pokazują (brak liczebności przy przeżywalności, prywatne badania liczone jako nieobecność).
