# Adapter siepomaga: rozpoznanie linku i strony wpłat

Status: resolved
Blocked by: -

Spec: spec.md (Moduły, Dane). Pobierz świeże odpowiedzi API do fixtur (Fundraise: latwogang, Needy: maksiu-mazurek), zweryfikuj punkty z sekcji 'Do zweryfikowania'. Zaimplementuj resolveFundraiser(link) i fetchPage(fundraiser, cursor); odrzuć dane osobowe w adapterze; Wpłata bez kwoty zostaje z kwotą null; nierozpoznany link daje czytelny błąd. Testy na fixturach.
