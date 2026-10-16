# Widok wyniku i oś czasu

Status: resolved
Blocked by: 02, 03, 04

Strona wejściowa z polem na link i widok wyniku wg spec.md (nagłówek, suwak progu liczony w przeglądarce, przedziały, średnia i mediana, osobna liczba ukrytych, oś czasu zależna od progu z opóźnieniem po suwaku, postęp, czas synchronizacji, oznaczenie wyniku częściowego). Po polsku.

## Uwagi z review zadania 4 (do uwzględnienia)

- Synchronizator musi być singletonem procesu (np. na `globalThis`), inaczej HMR lub wiele workerów podwoi pobieranie. Single-flight działa tylko w obrębie jednej instancji `createSynchronizer`.
- `progress()` nie zna sumy docelowej ("pobrano X z Y"). Potrzebne źródło sumy (np. `donors_count` z permalinku) albo UI pokazuje samo "pobrano X".
- `lastSyncAt` jest zapisywany na starcie Synchronizacji, więc nieudana Synchronizacja też blokuje ponowną na 60 s (spec mówi o odstępie od zakończenia). Zdecydować, czy tak zostaje.
- `Retry-After` bez górnego limitu; skok zegara (`lastSyncAt` z przyszłości) blokuje Synchronizację. Do poprawy przy okazji.
- `savePage` cofa `history_complete` przy niepustym kursorze. Bezpieczniej nie cofać.
- Test przerwania sprawdza jeden punkt; warto sparametryzować po wszystkich punktach.
- Schemat bazy zmieniony (klucz złożony fundraiser_id + id). Istniejący lokalny plik `data/czydycha.db` trzeba usunąć. Ta sama wpłata widoczna w Needy i w jego Fundraise liczy się w obu Zbiórkach osobno.
