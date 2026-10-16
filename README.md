# czydycha

**Czy dycha coś zmienia?** Aplikacja pokazuje, jak duży wpływ na zbiórkę charytatywną na siepomaga.pl mają małe wpłaty. Wklejasz link do zbiórki lub podopiecznego, aplikacja pobiera całą historię wpłat i liczy, jaka część liczby wpłat i jaka część zebranej kwoty pochodzi z wpłat nie większych niż wybrany próg (domyślnie 10 zł).

Projekt powstał w całości z AI: specyfikację, model domeny, kod, testy i dokumentację napisały agenty Claude Code. Moja rola to produkt, decyzje i kontrola jakości: ustalenie, co ma powstać, rozpisanie procesu pracy agentów, zatwierdzanie kontraktów modułów i rozstrzyganie w punktach zatrzymania.

## W skrócie

| | |
|---|---|
| Problem | Czy małe wpłaty mają realne znaczenie dla dużych zbiórek, czy liczą się tylko duzi darczyńcy? Portal tego nie pokazuje. |
| Rozwiązanie | Pobranie pełnej historii wpłat z nieoficjalnego API portalu i statystyki z regulowanym progiem „małej wpłaty”. |
| Stack | Next.js 16 (App Router), React 19, TypeScript, SQLite (better-sqlite3), Tailwind 4, Recharts, Vitest |
| Narzędzia AI | Claude Code: orkiestrator i osobne agenty do implementacji i review, skille `tdd` i `code-review` |
| Czas | v1 od pomysłu do działającej aplikacji: ok. 5 godzin |
| Jakość | 213 testów, typecheck i lint w jednej bramce `npm run check`; testy nigdy nie łączą się z portalem |

## Co widzi użytkownik

- **Wpływ małych wpłat**: jaki procent liczby wpłat i jaki procent kwoty pochodzi z małych wpłat.
- **Suwak progu**: zmiana progu przelicza statystyki od razu w przeglądarce (na histogramie kwot, bez zapytania do serwera).
- Średnia, mediana i rozkład wpłat w stałych przedziałach (1–5, 5–10, …, 500+ zł).
- Osobno liczba wpłat z ukrytą kwotą, żeby nie zniekształcały procentów.
- **Oś czasu** po dniach z podziałem na małe i pozostałe wpłaty; dane dociągane z serwera dopiero po zatrzymaniu suwaka.
- Postęp pobierania („pobrano X z Y”) i wyraźne oznaczenie wyniku częściowego, gdy historia nie jest jeszcze pełna.

## Jak powstał

Zacząłem od ustalenia z agentem, co aplikacja ma robić, a potem puściłem implementację według ustalonego procesu.

1. **Specyfikacja i język domeny.** W rozmowie z Claude'em powstały [spec](.scratch/czydycha-v1/spec.md), [glosariusz](GLOSSARY.md) (Zbiórka, Wpłata, Próg małej wpłaty, Wynik częściowy…) i [ADR o danych osobowych](docs/adr/0001-przechowujemy-tylko-id-kwote-i-date-wplaty.md). Glosariusz pilnuje, żeby kod, komunikaty i dokumentacja używały tych samych pojęć.
2. **Podział na zadania.** Siedem małych zadań w [.scratch/czydycha-v1/issues/](.scratch/czydycha-v1/issues/) z zależnościami. Moduły bez wspólnych plików (adapter API, statystyki, magazyn) szły równolegle.
3. **Potok każdego zadania** (opisany w [process.md](.scratch/czydycha-v1/process.md)):
   - implementacja test-first,
   - mechaniczna bramka `npm run check`,
   - niezależne review przez agenta, który nie widział implementacji, w dwóch osiach: zgodność ze spec i standardy projektu,
   - najwyżej dwie rundy poprawek, potem zadanie staje i czeka na człowieka.
4. **Punkty zatrzymania.** Agent sam staje i pyta, gdy zachowanie żywego API przeczy specyfikacji, zmiana łamałaby ADR albo glosariusz, lub gdy zadanie nie przechodzi bramki. Po pierwszych trzech modułach zatwierdzałem ich kontrakty, zanim powstał synchronizator.
5. **Budżet kontekstu.** Każdy etap to nowy agent z krótkim briefem (do ok. 100k tokenów): czyta tylko swoje zadanie, fragment spec, glosariusz i pliki swojego modułu. Review dostaje diff i spec, nie historię implementacji. Uwagi z review jednego zadania trafiały do kolejnego (widać to w [zadaniu 5](.scratch/czydycha-v1/issues/05-widok-wyniku.md)).

Co z tego wynikło w praktyce: review wyłapało m.in. synchronizator, który przy HMR albo kilku workerach pobierałby dane podwójnie, oraz `Retry-After` bez górnego limitu. Obie rzeczy są poprawione i pokryte testami.

## Architektura

```
link ──▶ Adapter siepomaga ──▶ Synchronizator ──▶ Magazyn (SQLite) ──▶ trasy API ──▶ UI
         (jedyne miejsce,      (jedna na Zbiórkę,  (wpłaty + kursor                 (statystyki
          które zna format      limit zapytań,      w jednej transakcji)            liczone w
          API; odrzuca dane     backoff, wznawianie)                                przeglądarce)
          osobowe)
```

| Moduł | Katalog | Odpowiedzialność |
|---|---|---|
| Adapter siepomaga | [src/adapter/](src/adapter/) | Rozpoznanie linku (zbiórka albo podopieczny), pobranie strony wpłat, odrzucenie danych płatnika |
| Magazyn | [src/store/](src/store/) | Wpłaty, kursor i stan Synchronizacji w SQLite, histogram, dzienne agregaty w strefie Europe/Warsaw |
| Statystyki | [src/stats/](src/stats/) | Czysta funkcja `smallDonationsImpact(histogram, threshold)`, bez sieci i bazy |
| Synchronizator | [src/sync/](src/sync/) | Jedna Synchronizacja naraz na Zbiórkę, odstęp 60 s, cooldown po błędzie, wznawianie od kursora |
| Serwer | [src/server/](src/server/) | Logika tras, konfiguracja z env, singleton procesu; pliki `route.ts` tylko adaptują Request/Response |
| UI | [src/components/](src/components/), [src/ui/](src/ui/) | Widok wyniku; logika (debounce, formatowanie, stan) wydzielona z komponentów i testowana osobno |

### Najważniejsze decyzje

- **Prywatność od wejścia.** Nieoficjalne API zwraca imiona, avatary i komentarze płatników. Adapter odrzuca je od razu, więc reszta systemu nigdy ich nie widzi, a test pilnuje, że nie trafiają do bazy ([ADR 0001](docs/adr/0001-przechowujemy-tylko-id-kwote-i-date-wplaty.md)).
- **Surowe wpłaty zamiast agregatów.** Dzięki temu pobieranie jest odporne na przerwania (deduplikacja po id), a nowe statystyki nie wymagają ponownego pobierania historii.
- **Grzeczne pobieranie.** Limit zapytań (domyślnie 10/s), backoff przy 429/5xx, własny User-Agent, jedna Synchronizacja na Zbiórkę niezależnie od liczby odwiedzających.
- **Bezpieczne przerwanie.** Wpłaty i kursor zapisują się w jednej transakcji. Test na atrapie API sprawdza, że przerwanie w dowolnym punkcie i wznowienie daje te same liczby co pobranie bez przerwy.
- **Czytelne błędy.** Błędna konfiguracja, niezgodna wersja bazy czy nierozpoznany link dają polski komunikat zamiast cichego powrotu do wartości domyślnych.

## Testy

```bash
npm run check   # typecheck + lint + testy
npm test        # same testy
```

- Statystyki: przypadki brzegowe (wpłata równa progowi, kwoty ułamkowe jak 8,30 zł, wpłaty z ukrytą kwotą, pusty zbiór).
- Adapter: zapisane odpowiedzi API dla zbiórki i podopiecznego. Fixtury pobrał jednorazowy skrypt [scripts/fetch-fixtures.mjs](scripts/fetch-fixtures.mjs) z limitem zapytań i zanonimizowanymi danymi płatników.
- Synchronizator: atrapa API, przerwanie i wznowienie w każdym punkcie, dwa równoległe wejścia bez podwójnego pobierania, zegar wstrzykiwany do testów odstępów i cooldownu.

## Uruchomienie

Wymagania: Node.js 24 i npm.

```bash
npm install
npm run dev
```

Aplikacja działa pod http://localhost:3000. Wklej na stronie głównej link, np. `https://www.siepomaga.pl/latwogang`.

Wersja produkcyjna lokalnie: `npm run build && npm start`.

v1 to prywatne demo uruchamiane lokalnie. Publiczne uruchomienie wymaga wcześniej uzgodnienia zasad z portalem (regulamin, prawa do bazy danych).

### Baza danych

Dane są w pliku SQLite. Domyślna ścieżka to `data/czydycha.db`, zmienić ją można zmienną `DB_PATH`:

```bash
DB_PATH=/ścieżka/do/pliku.db npm run dev   # albo w .env.local
```

Plik bazy z wcześniejszej wersji schematu trzeba usunąć. Aplikacja zgłosi to czytelnym komunikatem.

### Konfiguracja

Ustawienia pochodzą ze zmiennych środowiskowych. Skopiuj [.env.example](.env.example) do `.env.local`, odkomentuj i zmień potrzebne wartości, a potem zrestartuj serwer. Wszystkie są opcjonalne:

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `DB_PATH` | `data/czydycha.db` | plik bazy SQLite |
| `SYNC_REQUEST_DELAY_MS` | 100 | przerwa między zapytaniami do portalu (limit zapytań) |
| `SYNC_MIN_INTERVAL_MS` | 60000 | minimalny odstęp między Synchronizacjami tej samej Zbiórki |
| `SYNC_FAILURE_COOLDOWN_MS` | 10000 | pauza po nieudanej Synchronizacji |
| `SYNC_MAX_RETRIES` | 5 | liczba ponowień po 429, 5xx lub błędzie sieci |
| `SYNC_BACKOFF_BASE_MS`, `SYNC_BACKOFF_MAX_MS` | 1000, 30000 | zakres backoffu |
| `SIEPOMAGA_REQUEST_TIMEOUT_MS` | 20000 | timeout pojedynczego zapytania |

### Synchronizacja

Pobieranie historii wpłat zaczyna się po wejściu na stronę zbiórki i działa w tle w procesie serwera. Wznawia się od zapisanego kursora po przerwaniu. Duże zbiórki pobierają się długo: przy 3 mln wpłat (7 wpłat na zapytanie) pełna historia to kilkanaście godzin przy domyślnym tempie. W trakcie pobierania widok pokazuje wynik częściowy z wyraźnym oznaczeniem.

## Trasy API

JSON, błędy w kształcie `{code, message}` z polskim komunikatem.

| Trasa | Odpowiedź |
|---|---|
| `POST /api/fundraisers` z `{link}` | `{slug, title}`; nierozpoznany link 400, nieistniejąca Zbiórka 404, błąd portalu 502/503 |
| `POST /api/fundraisers/[slug]/sync` | 202 z bieżącym postępem; Synchronizacja startuje w tle lub dołącza do trwającej |
| `GET /api/fundraisers/[slug]/progress` | `{state, downloaded, expected, lastSyncAt, isPartial, error?}` |
| `GET /api/fundraisers/[slug]/histogram` | `{title, slug, amounts, hidden}` |
| `GET /api/fundraisers/[slug]/daily?threshold=<zł>` | dzienne sumy dla progu (włącznie) |
