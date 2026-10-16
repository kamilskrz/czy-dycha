# Glosariusz

Aplikacja pokazuje, jak duży wpływ na zbiórkę charytatywną na siepomaga.pl mają małe wpłaty.

## Pojęcia

**Zbiórka**: Cel, na który ktoś wpłaca na siepomaga.pl, czyli wszystko, co portal zwraca jako wpłaty na dany cel. Obejmuje zarówno zbiórkę zakładaną przez osobę lub organizację, jak i podopiecznego razem z jego wcześniejszymi zbiórkami. Użytkownik wskazuje ją linkiem do portalu i nie rozróżnia tych rodzajów.

W kodzie: Fundraiser.

**Wpłata**: Pojedyncza, potwierdzona darowizna na Zbiórkę, z kwotą i datą. Wpłaty niepotwierdzone nie są wpłatami.

W kodzie: Donation.

**Wpłata cykliczna**: Wpłata pochodząca ze stałej pomocy (regularnej, np. miesięcznej darowizny). Każda taka wpłata jest osobną Wpłatą i liczy się tak samo jak pozostałe, ale jest oznaczona, żeby można ją było osobno analizować.

W kodzie: Recurring donation.

**Dzień wpłaty**: Data kalendarzowa Wpłaty w czasie polskim (Europe/Warsaw). Na jej podstawie powstaje oś czasu.

W kodzie: Donation day.

**Wpłata z ukrytą kwotą**: Potwierdzona Wpłata, której kwota nie jest ujawniona przez portal. Wlicza się do liczby Wpłat, ale nie do kwot ani do Małych wpłat. Wskaźniki Wpływu małych wpłat liczy się względem Wpłat z jawną kwotą, a liczba Wpłat z ukrytą kwotą jest zawsze pokazana osobno.

W kodzie: Hidden-amount donation.

**Synchronizacja**: Dociągnięcie do Historii wpłat Wpłat, których jeszcze nie mamy. Dla jednej Zbiórki w danym momencie trwa najwyżej jedna Synchronizacja, niezależnie od liczby odwiedzających.

W kodzie: Sync.

**Historia wpłat**: Pełna lista Wpłat na Zbiórkę od początku jej istnienia.

W kodzie: Donation history.

**Próg małej wpłaty**: Kwota wybierana przez użytkownika. Wpłata nie większa od progu jest Małą wpłatą.

W kodzie: Small donation threshold.

**Mała wpłata**: Wpłata, której kwota mieści się w Progu małej wpłaty.

W kodzie: Small donation.

**Wpływ małych wpłat**: Główna odpowiedź aplikacji. Mówi, jaka część liczby Wpłat i jaka część zebranej kwoty pochodzi z Małych wpłat.

W kodzie: Small donations impact.

**Wynik pełny / częściowy**: Wynik pełny opiera się na całej Historii wpłat. Wynik częściowy powstaje w trakcie pobierania i jest wyraźnie oznaczony jako niepełny.


W kodzie: Complete / partial result.