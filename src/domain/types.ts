// Wspólne typy kontraktów między modułami. Słownictwo wg GLOSSARY.md.

export type TargetKind = "Fundraise" | "Needy";

export interface Fundraiser {
  /** Identyfikator celu w portalu (używany w zapytaniach o wpłaty). */
  id: string;
  kind: TargetKind;
  slug: string;
  title: string;
  /** Orientacyjna liczba Wpłat wg portalu (donors_count z permalinku); brak, gdy portal jej nie podał. */
  expectedDonations?: number;
}

/** Potwierdzona Wpłata. Bez żadnych danych płatnika (ADR 0001). */
export interface Donation {
  id: string;
  /** Kwota w groszach; null = Wpłata z ukrytą kwotą. */
  amountMinor: number | null;
  /** Czas wpłaty, ISO 8601 z przesunięciem strefy, jak w odpowiedzi portalu. */
  paidAt: string;
  /** Dzień wpłaty YYYY-MM-DD w Europe/Warsaw. */
  day: string;
  recurring: boolean;
}

/** Pozycja w liście wpłat portalu (paginacja kursorem). */
export interface Cursor {
  afterId: string;
  afterValue: string;
}

export interface DonationsPage {
  /** Tylko potwierdzone Wpłaty ze strony, w kolejności od najnowszej. */
  donations: Donation[];
  /** Kursor do kolejnej (starszej) strony; null gdy to była ostatnia strona. */
  nextCursor: Cursor | null;
}

/** Histogram kwot jawnych (grosze -> liczba Wpłat) i liczba Wpłat z ukrytą kwotą. */
export interface Histogram {
  amounts: Array<[amountMinor: number, count: number]>;
  hidden: number;
}

export interface DailyTotals {
  day: string;
  small: { count: number; amountMinor: number };
  other: { count: number; amountMinor: number };
  hidden: number;
}
