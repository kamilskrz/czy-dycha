// Sterowanie widokiem wyniku bez Reacta: start Synchronizacji, polling postępu i odświeżanie histogramu.
// Hook tylko opakowuje ten obiekt, dzięki czemu logikę da się testować na fałszywych zegarach.
import type { HistogramBody, ProgressBody } from "@/server/handlers";
import { ApiError, type Api } from "./api-client";

export interface SyncSnapshot {
  progress: ProgressBody | null;
  histogram: HistogramBody | null;
  /** Nieznana Zbiórka (404). */
  notFound: boolean;
  /** Błąd komunikacji z naszym serwerem (nie błąd portalu), gotowy do pokazania. */
  loadError: string | null;
}

export interface SyncController {
  start(): void;
  /** Ponawia całość (nowy start Synchronizacji). */
  retry(): void;
  stop(): void;
}

export interface SyncControllerOptions {
  slug: string;
  api: Pick<Api, "startSync" | "getProgress" | "getHistogram">;
  onChange: (snapshot: SyncSnapshot) => void;
  pollMs?: number;
  /** Widoczność karty (domyślnie bez pauzy). Gdy karta jest ukryta, polling czeka na jej powrót. */
  visibility?: Visibility;
}

export interface Visibility {
  isHidden(): boolean;
  /** Wywołuje callback przy każdej zmianie widoczności; zwraca funkcję odpinającą. */
  subscribe(callback: () => void): () => void;
}

// Po starcie stan „idle” może być chwilowy; po tylu odpytaniach uznajemy, że Synchronizacja nie ruszy
// (np. trwa minimalny odstęp między Synchronizacjami).
const IDLE_GRACE_POLLS = 2;
const MAX_CONSECUTIVE_POLL_ERRORS = 3;

export function createSyncController(options: SyncControllerOptions): SyncController {
  const { slug, api, onChange, pollMs = 1500, visibility } = options;
  // Dwa osobne błędy: start/polling Synchronizacji i odczyt histogramu. Udany odczyt jednego nie może kasować drugiego.
  let syncError: string | null = null;
  let histogramError: string | null = null;
  let resume: (() => void) | null = null;
  let unsubscribe: (() => void) | undefined;
  let snapshot: SyncSnapshot = { progress: null, histogram: null, notFound: false, loadError: null };
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let histogramSeq = 0;
  let lastDownloaded = -1;

  const update = (gen: number, patch: Partial<SyncSnapshot>) => {
    if (gen !== generation) return;
    snapshot = { ...snapshot, ...patch };
    onChange(snapshot);
  };

  const errorText = (e: unknown) => (e instanceof Error ? e.message : "Coś poszło nie tak.");
  const loadError = () => syncError ?? histogramError;

  const fail = (gen: number, e: unknown, kind: "sync" | "histogram") => {
    if (e instanceof ApiError && e.status === 404) return update(gen, { notFound: true });
    if (kind === "sync") syncError = errorText(e);
    else histogramError = errorText(e);
    update(gen, { loadError: loadError() });
  };

  async function refreshHistogram(gen: number): Promise<void> {
    const seq = ++histogramSeq;
    try {
      const histogram = await api.getHistogram(slug);
      if (seq !== histogramSeq || gen !== generation) return;
      histogramError = null;
      update(gen, { histogram, loadError: loadError() });
    } catch (e) {
      if (seq === histogramSeq) fail(gen, e, "histogram");
    }
  }

  function schedule(gen: number, idlePolls: number, errors: number): void {
    timer = setTimeout(() => {
      timer = undefined;
      if (visibility?.isHidden()) {
        resume = () => void poll(gen, idlePolls, errors); // ukryta karta: czekamy na powrót zamiast odpytywać
        return;
      }
      void poll(gen, idlePolls, errors);
    }, pollMs);
  }

  async function poll(gen: number, idlePolls: number, errors: number): Promise<void> {
    if (gen !== generation) return;
    let progress: ProgressBody;
    try {
      progress = await api.getProgress(slug);
    } catch (e) {
      if (gen !== generation) return;
      if (e instanceof ApiError && e.status === 404) return fail(gen, e, "sync");
      if (errors + 1 >= MAX_CONSECUTIVE_POLL_ERRORS) return fail(gen, e, "sync");
      return schedule(gen, idlePolls, errors + 1); // chwilowy błąd sieci: próbujemy dalej
    }
    if (gen !== generation) return;
    syncError = null; // udany odczyt postępu kasuje wcześniejszy chwilowy błąd Synchronizacji
    update(gen, { progress, loadError: loadError() });
    const changed = progress.downloaded !== lastDownloaded;
    lastDownloaded = progress.downloaded;

    if (progress.state === "running") {
      if (changed) void refreshHistogram(gen);
      return schedule(gen, 0, 0);
    }
    if (progress.state === "idle" && idlePolls < IDLE_GRACE_POLLS) {
      return schedule(gen, idlePolls + 1, 0);
    }
    // complete / failed / idle po karencji: końcowy, pewny odczyt histogramu i koniec pollingu.
    await refreshHistogram(gen);
  }

  async function run(gen: number): Promise<void> {
    syncError = null;
    histogramError = null;
    snapshot = { progress: null, histogram: snapshot.histogram, notFound: false, loadError: null };
    onChange(snapshot);
    lastDownloaded = -1;
    void refreshHistogram(gen); // zapisane wcześniej wpłaty widać od razu
    try {
      const progress = await api.startSync(slug);
      if (gen !== generation) return;
      lastDownloaded = progress.downloaded;
      syncError = null;
      update(gen, { progress, loadError: loadError() });
      if (progress.state === "running" || progress.state === "idle") schedule(gen, 0, 0);
      else await refreshHistogram(gen);
    } catch (e) {
      if (gen === generation) fail(gen, e, "sync");
    }
  }

  const stop = () => {
    generation++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    resume = null;
    unsubscribe?.();
    unsubscribe = undefined;
  };

  const restart = () => {
    stop();
    unsubscribe = visibility?.subscribe(() => {
      if (visibility.isHidden() || resume === null) return;
      const next = resume;
      resume = null;
      next();
    });
    void run(generation);
  };

  return { start: restart, retry: restart, stop };
}
