# Przechowujemy tylko id, kwotę i datę wpłaty

Źródłem Wpłat jest nieoficjalne API siepomaga.pl, które zwraca też dane osobowe płatników (imię, avatar, firma, komentarz). Adapter odrzuca te pola od razu po odebraniu odpowiedzi i do bazy trafiają wyłącznie id wpłaty, kwota w groszach, data i identyfikator Zbiórki. Pełna lista przechowywanych pól to: dla Wpłaty id, kwota w groszach (lub brak), czas, dzień, znacznik cykliczności i id Zbiórki, a dla Zbiórki metadane: tytuł, slug, rodzaj i oczekiwana liczba wpłat, oraz stan Synchronizacji (kursor, znacznik pełnej Historii wpłat, czas ostatniej Synchronizacji). Przechowujemy surowe Wpłaty, a nie same agregaty, żeby pobieranie było odporne na przerwania (deduplikacja po id) i żeby nowe statystyki nie wymagały ponownego pobierania całej Historii wpłat.

## Rozważane opcje

- Same agregaty (histogram kwot): mniej danych, ale brak deduplikacji i błędne liczby po przerwanym pobieraniu. To wada starej wersji.
- Pełne surowe wpłaty z danymi płatnika: większe ryzyko RODO i brak potrzeby, bo statystyki małych wpłat nie używają tożsamości.

## Konsekwencje

- Reszta systemu nigdy nie widzi danych osobowych, więc nie da się ich przypadkiem pokazać ani zapisać w logach.
- Statystyki oparte na płatnikach (np. firmy kontra osoby, wpłaty cykliczne od jednej osoby) wymagałyby zmiany tej decyzji.
- Ta decyzja nie rozstrzyga kwestii regulaminu siepomaga.pl ani praw do bazy danych. Przed publicznym uruchomieniem trzeba uzgodnić zasady z portalem.
