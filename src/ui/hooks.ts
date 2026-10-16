"use client";
// Cienkie hooki Reacta nad logiką z czystych modułów.
import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyTotals } from "@/domain/types";
import { api } from "./api-client";
import { dailyStateAfterError, type DailyState } from "./daily-state";
import { debounce } from "./debounce";
import { createSyncController, type SyncSnapshot, type Visibility } from "./sync-controller";

// Widoczność karty przeglądarki; poza przeglądarką (SSR) karta liczy się jako widoczna.
const documentVisibility: Visibility = {
  isHidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
  subscribe: (callback) => {
    document.addEventListener("visibilitychange", callback);
    return () => document.removeEventListener("visibilitychange", callback);
  },
};

const EMPTY: SyncSnapshot = { progress: null, histogram: null, notFound: false, loadError: null };

/** Uruchamia Synchronizację przy wejściu, odpytuje postęp i sprząta timery przy odmontowaniu. */
export function useSyncController(slug: string): { snapshot: SyncSnapshot; retry: () => void } {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(EMPTY);
  const controller = useMemo(
    () => createSyncController({ slug, api, onChange: setSnapshot, visibility: documentVisibility }),
    [slug],
  );
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  return { snapshot, retry: controller.retry };
}

export interface DailyResult {
  /** Ostatnie poprawne dane (zostają widoczne w trakcie ładowania i odświeżania w tle, żeby nie migotało). */
  data: DailyTotals[] | null;
  /** Ładowanie po zmianie progu lub Zbiórki; odświeżenie w tle (refreshKey) nie liczy się. */
  loading: boolean;
  error: string | null;
}

/**
 * Oś czasu dla progu. Żądanie leci dopiero po `waitMs` bez zmian progu (suwak);
 * `refreshKey` pozwala odświeżać dane w trakcie pobierania.
 */
export function useDailyTotals(slug: string, threshold: number, refreshKey: number, waitMs = 350): DailyResult {
  const base = `${slug}|${threshold}`;
  const key = `${base}|${refreshKey}`;
  const [state, setState] = useState<DailyState>({ base: "", key: "", data: null, error: null });

  useEffect(() => {
    const abort = new AbortController();
    const load = debounce(() => {
      api
        .getDaily(slug, threshold, abort.signal)
        .then((data) => {
          if (abort.signal.aborted) return;
          setState({ base, key, data, error: null });
        })
        .catch((e: unknown) => {
          if (abort.signal.aborted) return;
          const message = e instanceof Error ? e.message : "Nie udało się pobrać osi czasu.";
          setState((prev) => dailyStateAfterError(prev, base, key, message));
        });
    }, waitMs);
    load();
    return () => {
      load.cancel();
      abort.abort();
    };
  }, [base, key, slug, threshold, waitMs]);

  return { data: state.data, loading: state.base !== base, error: state.key === key ? state.error : null };
}

/**
 * Wartość odświeżana nie częściej niż co `ms` (np. licznik pobranych wpłat w trakcie Synchronizacji).
 * Ostatnia zmiana zawsze w końcu dochodzi.
 */
export function useThrottled<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastAt = useRef(0);
  useEffect(() => {
    const id = setTimeout(
      () => {
        lastAt.current = Date.now();
        setThrottled(value);
      },
      Math.max(0, lastAt.current + ms - Date.now()),
    );
    return () => clearTimeout(id);
  }, [value, ms]);
  return throttled;
}
