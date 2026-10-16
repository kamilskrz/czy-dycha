// Adapter siepomaga: jedyne miejsce znajace format API portalu.
// Dane osobowe platnikow odrzucamy natychmiast po odebraniu odpowiedzi (ADR 0001).
//
// Wyniki weryfikacji API (na swiezych fixturach):
// - Wplaty dla Needy obejmuja tez wplaty na zbiorki podopiecznego (subject.type='fundraise' z innym subject.id).
// - archival_cause_id jest puste w probce, wiec nie wiadomo, czy zamkniete zbiorki sa uwzglednione.
// - Paginacja kursorem after_id + after_value zweryfikowana na 2 stronach.
// - Koniec historii to pusta strona.
// - donors_count (opcjonalna suma docelowa postepu) NIE wystepuje w zapisanych fixturach permalinku; nie zweryfikowano go na zywym API.
// - Backoff i limit zapytan sa w synchronizatorze, nie tutaj.
import type { Cursor, TargetKind, DonationsPage, Donation, Fundraiser } from "../domain/types";

const BASE_URL = "https://www.siepomaga.pl";
export const USER_AGENT = "czydycha-research";
const TIMEZONE = "Europe/Warsaw";

export type ErrorCode =
  | "unrecognized-link"
  | "not-found"
  | "rate-limited" // 429
  | "server-error" // 5xx
  | "network-error"
  | "format-error"
  | "internal-error"; // blad po naszej stronie (magazyn), nie portalu

/** Blad adaptera z kodem, po ktorym synchronizator decyduje o ponowieniu. */
export class AdapterError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** Dla 429 i 503: wartosc Retry-After w sekundach, jesli portal ja podal. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

export interface AdapterOptions {
  fetch?: typeof fetch;
  /** Limit czasu pojedynczego zapytania w ms (domyslnie 20 s); po jego przekroczeniu network-error. */
  timeoutMs?: number;
}

const UNRECOGNIZED_MESSAGE =
  "Nie rozpoznaję tego linku. Wklej link do Zbiórki lub podopiecznego z siepomaga.pl, np. https://www.siepomaga.pl/nazwa.";

function extractSlug(link: string): string {
  let url: URL;
  try {
    const text = link.trim();
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new AdapterError("unrecognized-link", UNRECOGNIZED_MESSAGE);
  }
  const host = url.hostname.toLowerCase();
  if ((url.protocol !== "https:" && url.protocol !== "http:") || (host !== "siepomaga.pl" && host !== "www.siepomaga.pl")) {
    throw new AdapterError("unrecognized-link", UNRECOGNIZED_MESSAGE);
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) throw new AdapterError("unrecognized-link", UNRECOGNIZED_MESSAGE);
  try {
    return decodeURIComponent(segments[0]);
  } catch {
    throw new AdapterError("unrecognized-link", UNRECOGNIZED_MESSAGE);
  }
}

/** Retry-After: liczba sekund albo data HTTP; zwraca sekundy (> 0) lub undefined. */
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds > 0 ? seconds : undefined;
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  const delta = (date - Date.now()) / 1000;
  return delta > 0 ? delta : undefined;
}

async function fetchJson(url: string, options: AdapterOptions | undefined, label: string): Promise<unknown> {
  const f = options?.fetch ?? fetch;
  let res: Response;
  const signal = AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    res = await f(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal,
    });
  } catch {
    throw new AdapterError("network-error", `Nie udało się połączyć z siepomaga.pl (${label}).`);
  }
  if (res.status === 429) {
    throw new AdapterError("rate-limited", "siepomaga.pl ogranicza zapytania (429). Spróbuj za chwilę.", parseRetryAfter(res.headers.get("retry-after")));
  }
  if (res.status === 404) throw new AdapterError("not-found", `Nie znaleziono Zbiórki na siepomaga.pl (${label}).`);
  if (res.status >= 500) {
    const retryAfter = res.status === 503 ? parseRetryAfter(res.headers.get("retry-after")) : undefined;
    throw new AdapterError("server-error", `siepomaga.pl zwróciło błąd ${res.status} (${label}).`, retryAfter);
  }
  if (!res.ok) throw new AdapterError("format-error", `Nieoczekiwana odpowiedź ${res.status} z siepomaga.pl (${label}).`);
  try {
    return await res.json();
  } catch {
    // Limit czasu obejmuje też odczyt treści: przerwany odczyt to problem sieci (ponawialny), nie formatu.
    if (signal.aborted) throw new AdapterError("network-error", `Nie udało się pobrać odpowiedzi z siepomaga.pl (${label}).`);
    throw new AdapterError("format-error", `Odpowiedź siepomaga.pl nie jest poprawnym JSON (${label}).`);
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const count = (x: unknown): number | undefined => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : undefined);
const text = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);

/** Zamienia link do portalu na Zbiórke (Fundraise lub Needy jako jedno pojecie). */
export async function resolveFundraiser(link: string, options?: AdapterOptions): Promise<Fundraiser> {
  const slug = extractSlug(link);
  const json = await fetchJson(`${BASE_URL}/api/donor/web/v2/permalinks/${encodeURIComponent(slug)}?locale=pl`, options, slug);
  const target = isObject(json) && isObject(json.data) && isObject(json.data.target) ? json.data.target : null;
  if (!target) throw new AdapterError("format-error", "Nieoczekiwany format odpowiedzi siepomaga.pl (permalink).");

  const build = (kind: TargetKind, obj: unknown, titleField: string): Fundraiser | null => {
    if (!isObject(obj)) return null;
    const id = text(obj.id);
    const title = text(obj[titleField]);
    if (!id || !title) {
      throw new AdapterError("format-error", "Nieoczekiwany format odpowiedzi siepomaga.pl (brak id lub tytułu).");
    }
    // donors_count to tylko orientacyjna suma docelowa postepu; jej brak lub dziwny format nie jest bledem.
    const expectedDonations = count(obj.donors_count);
    return { id, kind, slug: text(obj.slug) ?? slug, title, ...(expectedDonations !== undefined && { expectedDonations }) };
  };
  // Fundraise: tytuł w polu title (custom_owner_name bywa null). Needy: name.
  const result = build("Fundraise", target.fundraise, "title") ?? build("Needy", target.needy, "name");
  if (!result) throw new AdapterError("unrecognized-link", UNRECOGNIZED_MESSAGE);
  return result;
}

/** "8.3" -> 830. Parsowanie tekstowe, bez bledow zmiennoprzecinkowych. */
function toMinor(amount: unknown): number | null {
  if (amount === null || amount === undefined) return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(amount).trim());
  if (!m) throw new AdapterError("format-error", `Nieoczekiwany format kwoty: ${String(amount)}`);
  const zloty = Number(m[1]);
  const fraction = (m[2] ?? "").padEnd(3, "0");
  const groszy = Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);
  return zloty * 100 + groszy;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

function warsawDay(paidAt: string): string {
  const t = Date.parse(paidAt);
  if (Number.isNaN(t)) throw new AdapterError("format-error", `Nieoczekiwany format czasu: ${paidAt}`);
  return DAY_FORMAT.format(new Date(t));
}

/** Jedna strona Wplat (7 pozycji), od najnowszej. Tylko potwierdzone, bez danych platnika. */
export async function fetchPage(fundraiser: Fundraiser, cursor: Cursor | null, options?: AdapterOptions): Promise<DonationsPage> {
  const q = new URLSearchParams({ target_type: fundraiser.kind, target_id: fundraiser.id, sort_by: "newest", locale: "pl" });
  if (cursor) {
    q.set("after_id", cursor.afterId);
    q.set("after_value", cursor.afterValue);
  }
  const json = await fetchJson(`${BASE_URL}/api/v1/payments?${q}`, options, fundraiser.slug);
  if (!isObject(json) || !Array.isArray(json.data)) {
    throw new AdapterError("format-error", "Nieoczekiwany format odpowiedzi siepomaga.pl (wpłaty).");
  }
  const items = json.data;
  const donations: Donation[] = [];
  let next: Cursor | null = null;
  for (const p of items) {
    if (!isObject(p)) throw new AdapterError("format-error", "Nieoczekiwana pozycja na liście wpłat.");
    const id = text(p.id);
    const paidAt = text(p.state_changed_at);
    if (!id || !paidAt) throw new AdapterError("format-error", "Wpłata bez id lub czasu.");
    // Kursor wynika z ostatniej pozycji strony, takze gdy jest niepotwierdzona.
    next = { afterId: id, afterValue: paidAt };
    if (p.state !== "confirmed") continue;
    // Z pozycji czytamy wylacznie pola potrzebne Wplacie; payer i comment_text ignorujemy (ADR 0001).
    donations.push({ id, amountMinor: toMinor(p.amount), paidAt, day: warsawDay(paidAt), recurring: p.constant_help === true });
  }
  return { donations, nextCursor: items.length === 0 ? null : next };
}
