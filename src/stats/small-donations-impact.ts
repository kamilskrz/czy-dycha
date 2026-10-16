import type { Histogram } from "../domain/types";

export interface AmountRange {
  label: string;
  count: number;
  amountMinor: number;
}

export interface SmallDonationsImpact {
  /** Liczba Wpłat z jawną kwotą (podstawa wskaźników). */
  disclosedCount: number;
  /** Suma kwot Wpłat z jawną kwotą, w groszach. */
  disclosedAmountMinor: number;
  /** Liczba Wpłat z ukrytą kwotą - zawsze osobno. */
  hidden: number;
  /** Małe wpłaty: kwota <= próg. */
  small: { count: number; amountMinor: number };
  /** Procent (0-100) liczby Wpłat z jawną kwotą. */
  countPercent: number;
  /** Procent (0-100) kwoty Wpłat z jawną kwotą. */
  amountPercent: number;
  /** Średnia i mediana w groszach (wśród Wpłat z jawną kwotą); null gdy brak. */
  meanMinor: number | null;
  medianMinor: number | null;
  ranges: AmountRange[];
}

// Górne granice włącznie, w groszach; ostatni przedział (500+) jest otwarty.
const RANGES: Array<{ label: string; upperMinor: number }> = [
  { label: "1-5 zł", upperMinor: 500 },
  { label: "5-10 zł", upperMinor: 1000 },
  { label: "10-20 zł", upperMinor: 2000 },
  { label: "20-50 zł", upperMinor: 5000 },
  { label: "50-100 zł", upperMinor: 10000 },
  { label: "100-200 zł", upperMinor: 20000 },
  { label: "200-500 zł", upperMinor: 50000 },
  { label: "500+ zł", upperMinor: Infinity },
];

// Walidacja progu (NaN, Infinity, wartosci ujemne) nalezy do warstwy UI; ta funkcja zaklada poprawny prog.
export function smallDonationsImpact(histogram: Histogram, thresholdZloty: number): SmallDonationsImpact {
  const thresholdMinor = Math.round(thresholdZloty * 100);
  const buckets = histogram.amounts
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0] - b[0]);

  const ranges: AmountRange[] = RANGES.map((r) => ({ label: r.label, count: 0, amountMinor: 0 }));
  let disclosedCount = 0;
  let disclosedAmountMinor = 0;
  let smallCount = 0;
  let smallAmount = 0;
  let r = 0;

  for (const [amount, count] of buckets) {
    disclosedCount += count;
    disclosedAmountMinor += amount * count;
    if (amount <= thresholdMinor) {
      smallCount += count;
      smallAmount += amount * count;
    }
    while (amount > RANGES[r]!.upperMinor) r++;
    ranges[r]!.count += count;
    ranges[r]!.amountMinor += amount * count;
  }

  return {
    disclosedCount,
    disclosedAmountMinor,
    hidden: histogram.hidden,
    small: { count: smallCount, amountMinor: smallAmount },
    countPercent: disclosedCount > 0 ? (smallCount / disclosedCount) * 100 : 0,
    amountPercent: disclosedAmountMinor > 0 ? (smallAmount / disclosedAmountMinor) * 100 : 0,
    meanMinor: disclosedCount > 0 ? disclosedAmountMinor / disclosedCount : null,
    medianMinor: median(buckets, disclosedCount),
    ranges,
  };
}

function median(buckets: Array<[number, number]>, n: number): number | null {
  if (n === 0) return null;
  const lower = Math.ceil(n / 2); // pozycja (od 1) dolnego środkowego
  const upper = Math.floor(n / 2) + 1; // pozycja górnego środkowego
  let cumulative = 0;
  let a: number | null = null;
  for (const [amount, count] of buckets) {
    cumulative += count;
    if (a === null && cumulative >= lower) a = amount;
    if (cumulative >= upper) return (a! + amount) / 2;
  }
  return null;
}
