// Wiersze tabeli przedziałów kwot z udziałem w Wpłatach z jawną kwotą.
import type { SmallDonationsImpact } from "@/stats";

export interface RangeRow {
  label: string;
  count: number;
  amountMinor: number;
  /** Udział w liczbie Wpłat z jawną kwotą, 0-100. */
  sharePercent: number;
}

export function rangeRows(impact: SmallDonationsImpact): RangeRow[] {
  return impact.ranges.map((r) => ({
    ...r,
    sharePercent: impact.disclosedCount > 0 ? (r.count / impact.disclosedCount) * 100 : 0,
  }));
}
