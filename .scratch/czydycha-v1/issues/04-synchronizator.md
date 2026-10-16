# Synchronizator: jedna Synchronizacja na Zbiórkę

Status: resolved
Blocked by: 01, 03

Wznawianie od kursora, dociąganie nowych Wpłat, limit zapytań, backoff 429/5xx, User-Agent, odstęp 60 s, dołączanie kolejnych użytkowników do postępu. Test na atrapie API: przerwanie w środku i wznowienie daje te same liczby co pobranie bez przerwania; dwa równoległe wejścia nie pobierają podwójnie.
