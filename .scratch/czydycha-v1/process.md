# Proces autonomicznej realizacji v1

Spec: `spec.md`. Zadania: `issues/`. Słownik: `/GLOSSARY.md`. ADR: `/docs/adr/`.

## Potok jednego zadania

1. Implementacja test-first (skill `tdd`).
2. Bramka mechaniczna: `npm run check` (typecheck, lint, wszystkie testy).
3. Niezależne review przez agenta, który nie widział implementacji, w dwóch osiach: zgodność ze spec.md i standardy projektu (skill `code-review`).
4. Poprawki i ponowne review, maksymalnie 2 rundy. Po nich zadanie staje i czeka na człowieka.
5. Commit lokalny (bez zdalnego repo) i `Status: resolved` w pliku zadania.

## Kolejność

0 (szkielet, ręcznie) -> 1, 2, 3 równolegle (osobne katalogi modułów) -> punkt kontrolny -> 4 -> 5 -> 6.

## Punkty zatrzymania (agent staje i pyta człowieka)

- Weryfikacja na żywym API w zadaniu 1 jest sprzeczna ze spec.md.
- Zmiana kolidowałaby z ADR 0001 albo glosariuszem.
- Zadanie nie przechodzi bramki lub review po 2 rundach.
- Po zadaniach 1–3, przed zadaniem 4: człowiek zatwierdza kontrakty modułów.

## Definicja ukończenia

Testy, typecheck i lint przechodzą, review nie ma otwartych uwag. Dodatkowo:
- testy nigdy nie łączą się z siepomaga.pl;
- fixtury pobiera jednorazowy skrypt z limitem zapytań, tylko w zadaniu 1;
- test pilnuje, że do bazy nie trafia żadne pole danych osobowych (ADR 0001);
- nazwy w kodzie i komunikatach używają pojęć z glosariusza.

## Limit kontekstu agentów (cel: do ok. 100k tokenów na agenta)

- Każdy etap to nowy agent z krótkim briefem: numer zadania, ścieżki do przeczytania, czego nie czytać.
- Agent czyta tylko plik zadania, odpowiedni fragment spec.md, glosariusz i pliki swojego modułu. Nie czyta `old/`, node_modules ani całych fixtur.
- Fixtury są małe: wyciągnięte próbki (kilkanaście wpłat), nie pełne odpowiedzi.
- Wyniki wracają jako zwięzły raport (zmienione pliki, wynik bramki, otwarte uwagi), bez wklejania kodu.
- Agent, który widzi, że potrzebuje czytać znacznie więcej, kończy i raportuje zamiast ładować dalej. Takie zadanie dzielimy na mniejsze.
- Review dostaje diff i spec, nie historię implementacji.

## Raportowanie

Raport po każdym punkcie zatrzymania i na końcu. Zbiorczo bez pytania o każdy krok.
