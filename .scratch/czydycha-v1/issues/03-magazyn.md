# Magazyn: wpłaty, kursor, histogram, dzienne agregaty

Status: resolved
Blocked by: -

SQLite. savePage zapisuje wpłaty i kursor w jednej transakcji z deduplikacją po id. histogram(fundraiserId) i dailyTotals(fundraiserId, thresholdMinor) z Dniem wpłaty w Europe/Warsaw. Zapisuje znacznik cykliczności. Test: ponowne zapisanie tej samej strony nie zmienia liczb.
