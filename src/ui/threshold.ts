// Próg małej wpłaty po stronie UI: zakres suwaka i walidacja wpisanej wartości.

export const THRESHOLD_DEFAULT = 10;
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 200;
export const THRESHOLD_LIMIT = 100_000;

/** Wartość wpisana ręcznie (przecinek lub kropka) w złotych; null, gdy niepoprawna. */
export function parseThresholdInput(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || !/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value > THRESHOLD_LIMIT) return null;
  return Math.round(value * 100) / 100;
}

/** Pozycja suwaka dla progu spoza jego zakresu. */
export function clampToSlider(threshold: number): number {
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, Math.round(threshold)));
}

/** Próg do pola tekstowego: bez zbędnych zer, z przecinkiem. */
export function formatThresholdInput(threshold: number): string {
  return String(threshold).replace(".", ",");
}
