// Cienki klient tras API aplikacji. Błędy mają komunikaty po polsku, gotowe do pokazania.
import type { DailyTotals } from "@/domain/types";
import type { HistogramBody, ProgressBody } from "@/server/handlers";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Api {
  registerLink(link: string): Promise<{ slug: string; title: string }>;
  startSync(slug: string): Promise<ProgressBody>;
  getProgress(slug: string): Promise<ProgressBody>;
  getHistogram(slug: string): Promise<HistogramBody>;
  getDaily(slug: string, thresholdZloty: number, signal?: AbortSignal): Promise<DailyTotals[]>;
}

const NETWORK_MESSAGE = "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.";
const GENERIC_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie za chwilę.";

// Limit czasu na całe zapytanie (nagłówki i treść), żeby zawieszona odpowiedź nie blokowała interfejsu.
export const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const callerSignal = init?.signal ?? undefined;
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  let body: unknown;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
    // Błąd odczytu treści to też błąd sieci; zła treść (nie-JSON) to po prostu brak treści.
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  } catch (e) {
    // Przerwanie przez wywołującego przekazujemy dalej; przekroczenie czasu to błąd sieci.
    if (callerSignal?.aborted) throw e instanceof Error ? e : new DOMException("Aborted", "AbortError");
    throw new ApiError(0, "network-error", NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
  if (!response.ok) {
    const err = (body ?? {}) as { code?: string; message?: string };
    throw new ApiError(response.status, err.code ?? "unknown", err.message ?? GENERIC_MESSAGE);
  }
  // Pusta lub niepoprawna treść przy 2xx to nie sukces: nie oddajemy null jako danych.
  if (body === null) throw new ApiError(response.status, "invalid-response", GENERIC_MESSAGE);
  return body as T;
}

const base = (slug: string) => `/api/fundraisers/${encodeURIComponent(slug)}`;

export const api: Api = {
  registerLink: (link) =>
    request("/api/fundraisers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link }),
    }),
  startSync: (slug) => request(`${base(slug)}/sync`, { method: "POST" }),
  getProgress: (slug) => request(`${base(slug)}/progress`, { cache: "no-store" }),
  getHistogram: (slug) => request(`${base(slug)}/histogram`, { cache: "no-store" }),
  getDaily: (slug, threshold, signal) =>
    request(`${base(slug)}/daily?threshold=${encodeURIComponent(String(threshold))}`, { cache: "no-store", signal }),
};
