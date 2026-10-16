// Logika tras API jako czyste funkcje: bez serwera Next, zalezności wstrzykiwane.
// Pliki route.ts tylko adaptuja Request/Response na te funkcje.
import { AdapterError, type ErrorCode } from "../adapter/siepomaga";
import type { DailyTotals, Fundraiser, Histogram } from "../domain/types";
import type { Store } from "../store/store";
import type { Synchronizer } from "../sync/synchronizer";

export interface Deps {
  store: Store;
  synchronizer: Pick<Synchronizer, "syncFundraiser" | "progress">;
  resolveFundraiser: (link: string) => Promise<Fundraiser>;
}

export interface HandlerResult<T = unknown> {
  status: number;
  body: T;
}

export interface ErrorBody {
  code: string;
  message: string;
}

export type ProgressState = "idle" | "running" | "failed" | "complete";

export interface ProgressBody {
  state: ProgressState;
  downloaded: number;
  expected: number | null;
  lastSyncAt: string | null;
  /** Wynik częściowy: Historia wpłat nie jest jeszcze pobrana do końca. */
  isPartial: boolean;
  error?: ErrorBody;
}

export type HistogramBody = Histogram & { title: string; slug: string };

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  "unrecognized-link": "Nie rozpoznaję tego linku. Wklej link do Zbiórki lub podopiecznego z siepomaga.pl.",
  "not-found": "Nie znaleziono takiej Zbiórki na siepomaga.pl.",
  "rate-limited": "siepomaga.pl ogranicza zapytania. Spróbuj ponownie za chwilę.",
  "server-error": "siepomaga.pl chwilowo nie działa. Spróbuj ponownie za chwilę.",
  "network-error": "Nie udało się połączyć z siepomaga.pl. Spróbuj ponownie za chwilę.",
  "format-error": "siepomaga.pl zwróciło dane w nieoczekiwanym formacie.",
  "internal-error": "Wystąpił wewnętrzny błąd serwera.",
};

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  "unrecognized-link": 400,
  "not-found": 404,
  "rate-limited": 503,
  "server-error": 502,
  "network-error": 502,
  "format-error": 502,
  "internal-error": 500,
};

const error = (status: number, code: string, message: string): HandlerResult<ErrorBody> => ({ status, body: { code, message } });

const unknownFundraiser = () =>
  error(404, "unknown-fundraiser", "Nie znam takiej Zbiórki. Wklej jej link na stronie głównej.");

const internalError = () => error(500, "internal-error", ERROR_MESSAGES["internal-error"]);

/** Zamienia wyjątek na odpowiedź; komunikaty adaptera są już po polsku. */
function fromException(e: unknown): HandlerResult<ErrorBody> {
  if (e instanceof AdapterError) return error(STATUS_BY_CODE[e.code], e.code, e.message || ERROR_MESSAGES[e.code]);
  return internalError();
}

/** Zbiórka po slugu albo odpowiedź 404; wyjątek magazynu to 500. */
function lookup(deps: Deps, slug: string): Fundraiser | HandlerResult<ErrorBody> {
  try {
    return deps.store.fundraiserBySlug(slug) ?? unknownFundraiser();
  } catch {
    return internalError();
  }
}

const isFailure = (x: Fundraiser | HandlerResult<ErrorBody>): x is HandlerResult<ErrorBody> => "status" in x;

/** POST /api/fundraisers: rozpoznaje link i zapisuje Zbiórkę. */
export async function registerFundraiser(deps: Deps, body: unknown): Promise<HandlerResult> {
  const link = typeof body === "object" && body !== null && "link" in body ? (body as { link: unknown }).link : undefined;
  if (typeof link !== "string" || link.trim() === "") {
    return error(400, "missing-link", "Podaj link do Zbiórki lub podopiecznego z siepomaga.pl.");
  }
  try {
    const fundraiser = await deps.resolveFundraiser(link);
    deps.store.registerFundraiser(fundraiser);
    return { status: 200, body: { slug: fundraiser.slug, title: fundraiser.title } };
  } catch (e) {
    return fromException(e);
  }
}

/** Stan postępu dla UI. */
export function progressBody(deps: Deps, fundraiser: Fundraiser): ProgressBody {
  const p = deps.synchronizer.progress(fundraiser);
  const state: ProgressState = p.running ? "running" : p.error !== null ? "failed" : p.historyComplete ? "complete" : "idle";
  return {
    state,
    downloaded: p.downloaded,
    expected: p.expected,
    lastSyncAt: p.lastSyncAt,
    isPartial: !p.historyComplete,
    ...(p.error !== null && { error: { code: p.error, message: ERROR_MESSAGES[p.error] } }),
  };
}

/** POST /api/fundraisers/[slug]/sync: startuje w tle (nie czeka) i zwraca bieżący postęp. */
export function startSync(deps: Deps, slug: string): HandlerResult {
  const fundraiser = lookup(deps, slug);
  if (isFailure(fundraiser)) return fundraiser;
  // Synchronizator nie odrzuca obietnicy, ale ostatni catch chroni proces przed nieobsłużonym odrzuceniem.
  void deps.synchronizer.syncFundraiser(fundraiser).catch(() => {});
  return { status: 202, body: progressBody(deps, fundraiser) };
}

export function getProgress(deps: Deps, slug: string): HandlerResult {
  const fundraiser = lookup(deps, slug);
  if (isFailure(fundraiser)) return fundraiser;
  return { status: 200, body: progressBody(deps, fundraiser) };
}

export function getHistogram(deps: Deps, slug: string): HandlerResult {
  const fundraiser = lookup(deps, slug);
  if (isFailure(fundraiser)) return fundraiser;
  try {
    const body: HistogramBody = { ...deps.store.histogram(fundraiser.id), title: fundraiser.title, slug: fundraiser.slug };
    return { status: 200, body };
  } catch {
    return internalError();
  }
}

const INVALID_THRESHOLD = "Próg musi być liczbą nie mniejszą od zera (w złotych), np. threshold=10.";

/** Próg w złotych z parametru zapytania; null gdy brak lub niepoprawny. Zwraca grosze. */
export function parseThresholdMinor(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const zloty = Number(raw);
  if (!Number.isFinite(zloty) || zloty < 0) return null;
  const minor = Math.round(zloty * 100); // round: 8.3 * 100 = 830.0000000000001
  return Number.isSafeInteger(minor) ? minor : null;
}

export function getDaily(deps: Deps, slug: string, thresholdParam: string | null): HandlerResult {
  const thresholdMinor = parseThresholdMinor(thresholdParam);
  if (thresholdMinor === null) return error(400, "invalid-threshold", INVALID_THRESHOLD);
  const fundraiser = lookup(deps, slug);
  if (isFailure(fundraiser)) return fundraiser;
  try {
    const body: DailyTotals[] = deps.store.dailyTotals(fundraiser.id, thresholdMinor);
    return { status: 200, body };
  } catch {
    return internalError();
  }
}
