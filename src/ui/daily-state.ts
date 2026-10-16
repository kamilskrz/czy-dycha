// Czysty reducer stanu osi czasu (wydzielony z hooka, żeby dało się go testować bez Reacta).
import type { DailyTotals } from "@/domain/types";

export interface DailyState {
  /** Slug i próg, dla których są dane; zmiana odświeżenia w tle (refreshKey) go nie zmienia. */
  base: string;
  key: string;
  data: DailyTotals[] | null;
  error: string | null;
}

/**
 * Stan po nieudanym zapytaniu. Stare dane zostają tylko dla tego samego progu i Zbiórki;
 * przy zmianie progu byłyby pokazane pod opisem nowego progu, więc je odrzucamy.
 * `base` zawsze ustawiamy na bieżący, żeby ładowanie się kończyło.
 */
export function dailyStateAfterError(prev: DailyState, base: string, key: string, error: string): DailyState {
  return { base, key, data: prev.base === base ? prev.data : null, error };
}
