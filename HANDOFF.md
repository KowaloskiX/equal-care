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

## Uruchomienie (ok. 5 minut)

```bash
git clone https://github.com/KowaloskiX/equal-care.git && cd equal-care
make setup            # Python 3.12 venv + npm install w web/
make check            # test API, powinno być "all passed"
make app              # API: http://localhost:8010
make web              # frontend: http://localhost:3010 (drugi terminal)
```

Klucze nie są potrzebne do demo: dane i odpowiedzi Jev są w repo (`data/`). `TYPESAFE_API_KEY` w `.env` jest potrzebny tylko, jeśli zmieniasz pytania albo stan osób w `src/jev_sim.py` (wtedy cache się unieważnia i idą nowe zapytania, ok. $0.07 za program). Klucz weź od Łukasza, nie commituj `.env`.

## Co już jest

- **Dane** (`src/fetch_*.py`, `src/strategy.py`): 14 wskaźników THL Sotkanet dla kraju, regionów i gmin; granice z Tilastokeskus; tabele ludności z Tilastokeskus; strategia i plan wdrożenia strona po stronie, 73 działania z planu sparsowane (odpowiedzialny, budżet, miernik, strona).
- **API** (`app/server.py`): `/api/values`, `/api/region/{code}`, `/api/gap`, `/api/actions`, `/api/sim/...`. Każda liczba ma `source`.
- **Symulacja z krakow-sim** (`src/population.py`, `src/jev_sim.py`, `src/simulate.py`): mieszkańcy 30–74 jako ważone komórki (gmina × płeć × wiek × język × typ zabudowy × wykształcenie × aktywność), Jev odpowiada raz na archetyp „czy pójdzie na badanie i co jest główną barierą”, scenariusze „co jeśli”.
- **Frontend** (`web/`): mapa regionów z przełącznikiem wskaźnika i karta regionu ze ścieżką leczenia. Nie było jeszcze testowane w przeglądarce, zacznij od sprawdzenia, czy się renderuje.

## Co wiemy z danych (do pitchu)

- Mammografia: najniższe uczestnictwo w stolicy (Helsinki 74,3 %, cel 80 %), nie na prowincji. Helsinkom brakuje ok. 2 200 kobiet rocznie.
- Przeżywalność 5-letnia, rak jelita grubego (Goal 3): od 63 % (Päijät-Häme) do 74 % (Keski-Uusimaa), Finlandia 68 %.
- Na poziomie regionów uczestnictwo w badaniach nie koreluje z przeżywalnością (r od −0,24 do 0,03): luka w przeżywalności powstaje dalej na ścieżce.
- Symulacja vs rzeczywistość 2024 (r po regionach): mammografia 0,75, jelito grube 0,58, cytologia 0,24. Cytologia słaba, bo dużo badań robi się prywatnie, poza programem. W historii używamy mammografii i jelita grubego.
- Rozbicie luki, mammografia, Helsinki: 7,3 pkt poniżej Finlandii, z czego skład ludności (wiek, język, wykształcenie, praca) tłumaczy 0,4 pkt, a 6,9 pkt nie. West Uusimaa: 0,4 vs 5,1 pkt, Vantaa i Kerava: 1,0 vs 3,9 pkt. To nasz „insight”: luka w stolicy to nie mieszkańcy, tylko usługi (dostęp, terminy, badania prywatne liczone jako nieobecność; to ostatnie trzeba potwierdzić z mentorką).
- Scenariusze (symulacja, cała Finlandia, dodatkowe osoby rocznie):

  | Scenariusz | Mammografia | Jelito grube | Cytologia |
  |---|---|---|---|
  | SMS z przypomnieniem i zmianą terminu jednym kliknięciem | +3 251 | +7 230 | +8 576 |
  | Zaproszenie we własnym języku | +3 033 | +5 649 | +4 530 |
  | Terminy wieczorne i w soboty | +1 919 | +1 785 | +3 164 |
  | Mobilny punkt blisko domu | +1 431 | +3 096 | +1 128 |

  Liczby per region są w `/api/sim/{prog}?scenario=...`. To szacunki, pokazujemy je zawsze z walidacją.

## Zadania do wzięcia

Pracuj na własnej gałęzi, PR do `main`. Zadania są tak podzielone, żeby nie dotykać tych samych plików.

1. **Frontend: warstwa symulacji i rekomendacji** (`web/src/`). Przełącznik „dane / symulacja” na mapie; w karcie regionu: rozbicie luki (`composition_gap` vs `other_gap` z `/api/sim/{prog}/region/{code}`), scenariusze z liczbą dodatkowych osób rocznie, rekomendacja z działaniem z planu (`/api/actions?q=...`). Wszystko symulowane z etykietą „Simulation” i walidacją.
2. **Analityk na Gemini** (`src/analyst.py` + `/api/ask`). Gemini dostaje narzędzia nad `datastore`, `/api/sim` i `strategy.actions()`, odpowiada na pytanie decydenta, każda liczba przechodzi przez `src/grounding.py`. Potrzebny `GEMINI_API_KEY` (Google AI Studio). Zgłaszamy też do „Best Use of Gemini API” (4000 €).
3. **Więcej danych do Goal 3**. Stadium w chwili rozpoznania i czas do leczenia według regionu: Syöpärekisteri (syoparekisteri.fi, aplikacja statystyczna), NORDCAN. Dodać jako wskaźnik w `src/indicators.py` ze źródłem.
4. **Rozmowa z mentorką** (Kaisa Kaitila, Medical Affairs, AstraZeneca, na miejscu w sobotę). Pytania: czy niskie uczestnictwo w mammografii w stolicy to efekt prywatnych badań; jak dużo cytologii dzieje się poza programem; która rekomendacja jest wykonalna dla regionu. Odpowiedzi zapisać jako źródło („mentor interview”).
5. **Pitch**: 2-minutowa historia dla decydenta, slajdy, nagranie demo, zgłoszenie na platformie Junction (zgłoszenie do AstraZeneca i Gemini).

## Zasady (pełne w `CLAUDE.md`)

- Żadnej liczby wpisanej ręcznie w UI ani wygenerowanej przez model. Liczby liczy kod, model tylko tłumaczy i wybiera.
- Każda rekomendacja cytuje działanie z planu wdrożenia (id + strona).
- Symulacja nigdy nie udaje danych: etykieta + walidacja.
- Mówimy, czego dane nie pokazują (brak liczebności przy przeżywalności, prywatne badania liczone jako nieobecność).
