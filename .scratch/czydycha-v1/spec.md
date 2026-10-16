# czydycha v1: Wpływ małych wpłat

Słownik: zob. `GLOSSARY.md`. Decyzja o danych: `docs/adr/0001-przechowujemy-tylko-id-kwote-i-date-wplaty.md`.

## Cel

Użytkownik wkleja link do siepomaga.pl i widzi, jak duży wpływ na Zbiórkę mają Małe wpłaty. Przepisanie od zera starej wersji z `old/` (zepsute zliczanie, brak deduplikacji, martwy kod). V1 to prywatne demo, które da się pokazać siepomaga.pl. Publiczne uruchomienie poprzedza kontakt z portalem (regulamin i prawo do bazy danych są nierozstrzygnięte).

## Widok wyniku (po polsku)

- Nagłówek: Wpływ małych wpłat, czyli procent liczby Wpłat i procent kwoty z Małych wpłat. Liczone względem Wpłat z jawną kwotą.
- Suwak Progu małej wpłaty, domyślnie 10 zł włącznie. Zmiana progu liczy statystyki w przeglądarce na histogramie kwot, bez zapytania do serwera.
- Średnia, mediana, stałe przedziały kwot (1–5, 5–10, 10–20, 20–50, 50–100, 100–200, 200–500, 500+ zł).
- Liczba Wpłat z ukrytą kwotą, pokazana osobno.
- Oś czasu po Dniu wpłaty, z podziałem na Małe wpłaty i pozostałe (liczba i kwota) dla wybranego progu. Dane z serwera, żądanie wysyłane po zatrzymaniu suwaka.
- Postęp Synchronizacji ("pobrano X z Y"), czas ostatniej synchronizacji, oznaczenie Wyniku częściowego.

## Dane

- Liczą się tylko Wpłaty potwierdzone.
- Zapisujemy: id wpłaty, kwotę w groszach lub brak kwoty, czas, Dzień wpłaty (Europe/Warsaw), znacznik cykliczności, identyfikator Zbiórki. Żadnych danych płatnika.
- Obsługa linków do zbiórek (`Fundraise`) i do podopiecznych (`Needy`, pobierane z `target_type=Needy`) jako jedno pojęcie Zbiórki. Nierozpoznany link daje czytelny komunikat.
- Stara baza `old/app/czydycha.db` nie jest migrowana. `old/response.json` nie jest fixturą (nieaktualny); fixtury pobieramy świeże.

## Synchronizacja

- Startuje przy wejściu użytkownika.
- Najwyżej jedna naraz dla Zbiórki. Kolejni użytkownicy dołączają do postępu.
- Minimalny odstęp 60 s między Synchronizacjami tej samej Zbiórki.
- Cooldown po błędzie: po nieudanej Synchronizacji kolejne wywołanie w ciągu 10 s (opcja `failureCooldownMs`, zegar wstrzykiwany) nie uderza w portal i zwraca poprzedni błąd; po oknie ponawia.
- Grzeczne pobieranie: limit zapytań, backoff przy 429/5xx, własny User-Agent.
- Wznawianie od kursora. Wpłaty i kursor zapisywane w jednej transakcji. Deduplikacja po id wpłaty.
- Zmiany stanu już zapisanych Wpłat (np. zwroty) ignorowane w v1.

## Moduły

| Moduł | Odpowiedzialność | Interfejs w zarysie |
|---|---|---|
| Adapter siepomaga | Jedyne miejsce znające format API. Odrzuca dane osobowe. | `resolveFundraiser(link)`, `fetchPage(fundraiser, cursor)` |
| Magazyn | Wpłaty, kursor, stan Synchronizacji | `openStore()`, `savePage(fundraiser, donations, cursor)` (jedna transakcja), `histogram(fundraiserId)`, `dailyTotals(fundraiserId, thresholdMinor)`, `syncState(fundraiserId)` |
| Statystyki | Czysta funkcja, bez sieci i bazy | `smallDonationsImpact(histogram, thresholdZloty)` |
| Synchronizator | Jedna Synchronizacja na Zbiórkę, odstęp 60 s, cooldown 10 s po błędzie | `syncFundraiser(fundraiser)`, `progress(fundraiser)` |

## Stack

Next.js, TypeScript, SQLite (jak w starej wersji). V1 działa tylko lokalnie; wdrożenie na Fly.io odłożone. Przerwanie Synchronizacji jest bezpieczne dzięki transakcji z kursorem.

## Testy

1. Statystyki: małe zestawy, przypadki brzegowe (wpłata równa progowi, kwoty ułamkowe jak 8,3 zł, Wpłata z ukrytą kwotą).
2. Adapter: świeżo zapisane odpowiedzi API (`Fundraise` i `Needy`).
3. Ingestia: atrapa API, przerwanie w środku i wznowienie dają te same liczby co pobranie bez przerwania (obowiązkowe).

## Do zweryfikowania w implementacji

- Czy wpłaty `Needy` obejmują zamknięte zbiórki (`archival_cause_id`).
- Znaczenie `payments_count`, `funds_current` (jednostka) i zachowanie API pod obciążeniem.
- Kolejność stron i stabilność kursora (`after_id` + `after_value`).

## Trasy API (JSON, błędy po polsku w polu `message`)

Jedna instancja Magazynu i Synchronizatora na proces (`src/server/runtime.ts`, na `globalThis`); baza z `DB_PATH` (domyślnie `data/czydycha.db`). Logika w `src/server/handlers.ts`, pliki `route.ts` tylko adaptują Request/Response. Błąd ma kształt `{code, message}`; nieznany `slug` daje 404. Gdy nie da się otworzyć bazy (zła ścieżka `DB_PATH`, brak uprawnień, baza ze starszej wersji wykryta po `PRAGMA user_version`), każda trasa zwraca 500 z polskim komunikatem (`database-unavailable` lub `database-incompatible` z prośbą o usunięcie pliku bazy).

| Trasa | Odpowiedź |
|---|---|
| `POST /api/fundraisers` z `{link}` | 200 `{slug, title}`; brak linku i nierozpoznany link 400, nieistniejąca Zbiórka 404, błąd portalu 502/503 |
| `POST /api/fundraisers/[slug]/sync` | 202 z bieżącym postępem; Synchronizacja startuje w tle (nie czeka), dołącza do trwającej |
| `GET /api/fundraisers/[slug]/progress` | `{state: idle\|running\|failed\|complete, downloaded, expected, lastSyncAt, isPartial, error?}`; `expected` z `donors_count` (null, gdy brak), `isPartial` = Historia wpłat niepełna |
| `GET /api/fundraisers/[slug]/histogram` | `{title, slug, amounts, hidden}` |
| `GET /api/fundraisers/[slug]/daily?threshold=<zł>` | `DailyTotals[]` dla progu (włącznie); próg: skończona liczba >= 0, inaczej 400 |

`lastSyncAt` zapisujemy po zakończeniu udanej Synchronizacji; po błędzie obowiązuje cooldown 10 s, potem można ponowić. `Retry-After` jest ograniczony do maksymalnego backoffu (30 s).
