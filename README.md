# czydycha

Aplikacja pokazuje, jak duży wpływ na zbiórkę charytatywną na siepomaga.pl mają małe wpłaty. Wklejasz link do zbiórki lub podopiecznego, a aplikacja pobiera całą historię wpłat i liczy, jaka część liczby wpłat i jaka część zebranej kwoty pochodzi z wpłat nie większych niż wybrany próg (domyślnie 10 zł).

Wersja v1 działa tylko lokalnie. Pojęcia opisuje [GLOSSARY.md](GLOSSARY.md), decyzje architektoniczne są w [docs/adr/](docs/adr/), a specyfikacja w [.scratch/czydycha-v1/spec.md](.scratch/czydycha-v1/spec.md).

## Wymagania

- Node.js 24 i npm

## Uruchomienie

```bash
npm install
npm run dev
```

Aplikacja działa pod http://localhost:3000. Wklej na stronie głównej link, np. `https://www.siepomaga.pl/latwogang`.

Wersja produkcyjna lokalnie: `npm run build && npm start`.

## Baza danych

Dane są w pliku SQLite. Domyślna ścieżka to `data/czydycha.db`, a zmienić ją można zmienną środowiskową `DB_PATH`:

```bash
DB_PATH=/ścieżka/do/pliku.db npm run dev   # albo w .env.local
```

Plik bazy z wcześniejszej wersji schematu trzeba usunąć. Aplikacja zgłosi to czytelnym komunikatem.

## Konfiguracja

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

Błędna wartość (np. tekst zamiast liczby) kończy się czytelnym komunikatem błędu, a nie cichym powrotem do wartości domyślnej.

## Synchronizacja

Pobieranie historii wpłat zaczyna się po wejściu na stronę zbiórki i działa w tle w procesie serwera. Jest ograniczone do grzecznego tempa wobec portalu (domyślnie 10 zapytań na sekundę, 7 wpłat w zapytaniu, backoff przy błędach) i wznawia się od zapisanego kursora po przerwaniu. Duże zbiórki pobierają się bardzo długo: przy 3 mln wpłat pełna historia to kilkanaście godzin przy domyślnym tempie. W trakcie pobierania widok pokazuje wynik częściowy z wyraźnym oznaczeniem.

## Testy

```bash
npm run check   # typecheck + lint + testy
npm test        # same testy
```

Testy nigdy nie łączą się z siepomaga.pl. Fixtury w `src/adapter/__fixtures__/` odświeża jednorazowy skrypt `scripts/fetch-fixtures.mjs` (z limitem zapytań).

## Struktura

| Katalog | Zawartość |
|---|---|
| `src/adapter` | jedyne miejsce znające format API siepomaga.pl; odrzuca dane osobowe |
| `src/store` | SQLite: wpłaty, kursor, histogram, sumy dzienne |
| `src/stats` | czysta funkcja liczenia Wpływu małych wpłat |
| `src/sync` | Synchronizator: jedna synchronizacja na zbiórkę, limit zapytań, backoff |
| `src/server` | singleton runtime i logika tras API |
| `src/app`, `src/components`, `src/ui` | interfejs |
