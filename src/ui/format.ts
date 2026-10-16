// Formatowanie liczb, kwot i czasu po polsku. Czyste funkcje, bez zależności od przeglądarki.

const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const plnWhole = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Kwota w groszach jako "12,34 zł". */
export function formatPLN(minor: number): string {
  return pln.format(minor / 100);
}

/** Kwota w groszach, zaokrąglona do pełnych złotych (osie wykresów). */
export function formatPLNWhole(minor: number): string {
  return plnWhole.format(minor / 100);
}

export function formatCount(n: number): string {
  return integer.format(n);
}

/** Procent z jednym miejscem po przecinku: 12,3%. */
export function formatPercent(value: number): string {
  return `${percent.format(value)}%`;
}

/** Wybór formy rzeczownika wg polskiej odmiany liczebników. */
export function pluralPl(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

const dateTime = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Warsaw",
});

/** Czas ostatniej synchronizacji: względny dla ostatniej doby, potem pełna data. */
export function formatLastSync(iso: string | null, now: Date): string {
  if (iso === null) return "jeszcze nie synchronizowano";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "nieznany";
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "przed chwilą"; // także zegar „z przyszłości”
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${pluralPl(minutes, "minutę", "minuty", "minut")} temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${pluralPl(hours, "godzinę", "godziny", "godzin")} temu`;
  return dateTime.format(then);
}

const dayFormat = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Dzień wpłaty YYYY-MM-DD jako "5 mar 2024". */
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : dayFormat.format(date);
}
