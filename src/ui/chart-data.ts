// Przygotowanie danych osi czasu: wybór miary i uzupełnienie dni bez wpłat zerami.
import type { DailyTotals } from "@/domain/types";

export type Metric = "count" | "amount";

export interface TimelinePoint {
  day: string;
  /** Mała wpłata: liczba albo kwota w złotych (zależnie od miary). */
  small: number;
  other: number;
}

const DAY_MS = 86_400_000;
// Ochrona przed ogromną osią przy błędnych danych; powyżej pomijamy uzupełnianie luk.
const MAX_FILLED_DAYS = 4000;

const pick = (part: { count: number; amountMinor: number }, metric: Metric) =>
  metric === "count" ? part.count : part.amountMinor / 100;

export function buildTimeline(daily: DailyTotals[], metric: Metric): TimelinePoint[] {
  const sorted = [...daily].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const byDay = new Map(sorted.map((d) => [d.day, d]));
  if (sorted.length === 0) return [];

  const first = Date.parse(`${sorted[0]!.day}T00:00:00Z`);
  const last = Date.parse(`${sorted[sorted.length - 1]!.day}T00:00:00Z`);
  const span = (last - first) / DAY_MS + 1;
  if (!Number.isFinite(span) || span > MAX_FILLED_DAYS) {
    return sorted.map((d) => ({ day: d.day, small: pick(d.small, metric), other: pick(d.other, metric) }));
  }

  const points: TimelinePoint[] = [];
  for (let t = first; t <= last; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    const d = byDay.get(day);
    points.push({ day, small: d ? pick(d.small, metric) : 0, other: d ? pick(d.other, metric) : 0 });
  }
  return points;
}

/** Opis wykresu dla czytników ekranu: podsumowanie zamiast samych słupków. */
export function describeTimeline(points: TimelinePoint[], metric: Metric): string {
  if (points.length === 0) return "Wykres dzienny: brak danych.";
  const sum = (key: "small" | "other") => points.reduce((acc, p) => acc + p[key], 0);
  const fmt = (v: number) => (metric === "count" ? `${Math.round(v)}` : `${v.toFixed(2).replace(".", ",")} zł`);
  const what = metric === "count" ? "liczba wpłat" : "kwota wpłat";
  return `Wykres dzienny, ${what}: ${points.length} dni od ${points[0]!.day} do ${points[points.length - 1]!.day}. Razem małe wpłaty ${fmt(sum("small"))}, pozostałe ${fmt(sum("other"))}.`;
}
