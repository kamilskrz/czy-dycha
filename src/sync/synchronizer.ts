// Synchronizator: jedna Synchronizacja na Zbiorke, wznawianie od kursora, dociaganie nowych Wplat.
// Zegar, sleep i fetchPage sa wstrzykiwane, wiec testy nie czekaja realnego czasu ani nie lacza sie z portalem.
import { AdapterError, type ErrorCode } from "../adapter/siepomaga";
import type { Cursor, Donation, DonationsPage, Fundraiser } from "../domain/types";
import type { Store } from "../store/store";

export interface SynchronizerOptions {
  store: Store;
  fetchPage: (fundraiser: Fundraiser, cursor: Cursor | null) => Promise<DonationsPage>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Minimalny odstep miedzy Synchronizacjami tej samej Zbiorki (domyslnie 60 s). */
  minIntervalMs?: number;
  /** Po nieudanej Synchronizacji kolejna w tym oknie nie uderza w portal, tylko zwraca poprzedni blad (domyslnie 10 s). */
  failureCooldownMs?: number;
  /** Przerwa miedzy kolejnymi zapytaniami do portalu (limit zapytan). */
  requestDelayMs?: number;
  /** Ile razy ponawiac zapytanie po 429/5xx/bledzie sieci. */
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Zrodlo losowosci dla jittera backoffu, [0, 1). Domyslnie Math.random. */
  random?: () => number;
}

export interface SyncProgress {
  running: boolean;
  /** Ile Wpłat jest zapisanych dla Zbiórki (wszystkie Synchronizacje razem). */
  downloaded: number;
  /** Suma docelowa wg portalu (donors_count); null, gdy nieznana. Orientacyjna: może nie zgadzać się z liczbą potwierdzonych Wpłat. */
  expected: number | null;
  /** Liczniki bieżącej (lub ostatniej) Synchronizacji. */
  pagesFetched: number;
  donationsAdded: number;
  historyComplete: boolean;
  /** Kod bledu ostatniej Synchronizacji; null gdy sie udala. */
  error: ErrorCode | null;
  lastSyncAt: string | null;
}

export type SyncResult =
  | { outcome: "completed" }
  /** Poprzednia Synchronizacja byla mniej niz minIntervalMs temu. */
  | { outcome: "skipped" }
  | { outcome: "failed"; error: ErrorCode };

const MAX_STALLED = 3;
const RETRYABLE: ReadonlySet<ErrorCode> = new Set(["rate-limited", "server-error", "network-error"]);

interface Run {
  promise: Promise<SyncResult>;
  pagesFetched: number;
  donationsAdded: number;
  error: ErrorCode | null;
}

export function createSynchronizer(options: SynchronizerOptions) {
  const { store, fetchPage } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const minIntervalMs = options.minIntervalMs ?? 60_000;
  const failureCooldownMs = options.failureCooldownMs ?? 10_000;
  const requestDelayMs = options.requestDelayMs ?? 100;
  const maxRetries = options.maxRetries ?? 5;
  const backoffBaseMs = options.backoffBaseMs ?? 1_000;
  const backoffMaxMs = options.backoffMaxMs ?? 30_000;
  const random = options.random ?? Math.random;

  const running = new Map<string, Run>();
  const last = new Map<string, Run>();
  const failures = new Map<string, { at: number; result: SyncResult }>();

  async function request(run: Run, fundraiser: Fundraiser, cursor: Cursor | null): Promise<DonationsPage> {
    for (let attempt = 0; ; attempt++) {
      if (attempt === 0 && run.pagesFetched > 0) await sleep(requestDelayMs);
      try {
        const page = await fetchPage(fundraiser, cursor);
        run.pagesFetched++;
        return page;
      } catch (e) {
        if (!(e instanceof AdapterError) || !RETRYABLE.has(e.code) || attempt >= maxRetries) throw e;
        // Jitter: do +25% opoznienia, zeby rownolegle klienty nie ponawialy w tym samym momencie.
        const backoff = Math.min(backoffBaseMs * 2 ** attempt, backoffMaxMs) * (1 + 0.25 * random());
        // Retry-After szanujemy, ale z gornym limitem, zeby portal nie uspil nas na godziny.
        const retryAfter = Math.min((e.retryAfterSeconds ?? 0) * 1000, backoffMaxMs);
        await sleep(Math.max(backoff, retryAfter));
      }
    }
  }

  /**
   * Kursor, ktory nie przesuwa sie, oznaczalby petle w nieskonczonosc. Tolerujemy MAX_STALLED - 1 kolejnych
   * odpowiedzi z kursorem identycznym z wyslanym (portal bywa chwilowo niestabilny); MAX_STALLED-ta z rzedu
   * to blad formatu.
   */
  function makeStallGuard() {
    let stalled = 0;
    return (sent: Cursor | null, next: Cursor): void => {
      const same = sent !== null && sent.afterId === next.afterId && sent.afterValue === next.afterValue;
      stalled = same ? stalled + 1 : 0;
      if (stalled >= MAX_STALLED) throw new AdapterError("format-error", "Portal zwrócił ten sam kursor kilka razy z rzędu.");
    };
  }

  async function execute(run: Run, fundraiser: Fundraiser): Promise<void> {
    // Etap 1: wznowienie Historii wpłat od kursora (lub od poczatku).
    const state = store.syncState(fundraiser.id);
    let startedFromTop = false;
    if (!state.historyComplete) {
      let cursor = state.cursor;
      startedFromTop = cursor === null;
      const assertAdvanced = makeStallGuard();
      for (;;) {
        const page = await request(run, fundraiser, cursor);
        // Wplaty i kursor (a przy ostatniej stronie takze znacznik konca Historii) w jednej transakcji.
        run.donationsAdded += store.savePage(fundraiser, page.donations, page.nextCursor);
        if (page.nextCursor === null) break;
        assertAdvanced(cursor, page.nextCursor);
        cursor = page.nextCursor;
      }
    }
    if (startedFromTop) return; // pobralismy wszystko od najnowszej

    // Etap 2: nowe Wpłaty od poczatku listy, az do strony zawierajacej juz znana Wplate.
    // Bufor zapisujemy jedna transakcja na koncu: przerwanie nie zostawi dziury miedzy nowymi a starymi.
    const fresh: Donation[] = [];
    let cursor: Cursor | null = null;
    const assertAdvanced = makeStallGuard();
    for (;;) {
      const page = await request(run, fundraiser, cursor);
      let reachedKnown = false;
      for (const d of page.donations) {
        if (store.hasDonation(fundraiser.id, d.id)) reachedKnown = true;
        else fresh.push(d);
      }
      if (reachedKnown || page.nextCursor === null) break;
      assertAdvanced(cursor, page.nextCursor);
      cursor = page.nextCursor;
    }
    run.donationsAdded += store.saveNewDonations(fundraiser, fresh);
  }

  function syncFundraiser(fundraiser: Fundraiser): Promise<SyncResult> {
    const existing = running.get(fundraiser.id);
    if (existing) return existing.promise; // kolejny uzytkownik dolacza do trwajacej Synchronizacji

    // Cooldown po bledzie: klient nie bombarduje portalu ponowieniami, dopiero po oknie ponawiamy.
    const failure = failures.get(fundraiser.id);
    if (failure) {
      const sinceFailure = now() - failure.at;
      if (sinceFailure >= 0 && sinceFailure < failureCooldownMs) return Promise.resolve(failure.result);
      failures.delete(fundraiser.id);
    }

    // Wyjatek z magazynu przed startem nie moze uciec synchronicznie: kontrakt to zawsze Promise z wynikiem.
    try {
      const lastSyncAt = store.syncState(fundraiser.id).lastSyncAt;
      const elapsed = lastSyncAt === null ? Infinity : now() - Date.parse(lastSyncAt);
      // Ujemny odstep (zegar cofniety, lastSyncAt z przyszlosci) nie blokuje; NaN tez nie.
      if (elapsed >= 0 && elapsed < minIntervalMs) {
        return Promise.resolve({ outcome: "skipped" });
      }
      store.registerFundraiser(fundraiser);
    } catch {
      return Promise.resolve({ outcome: "failed", error: "internal-error" });
    }
    const run: Run = { promise: undefined as unknown as Promise<SyncResult>, pagesFetched: 0, donationsAdded: 0, error: null };
    run.promise = execute(run, fundraiser)
      .then(
        (): SyncResult => ({ outcome: "completed" }),
        (e: unknown): SyncResult => {
          // Bledy spoza adaptera (np. walidacja w magazynie) to nie wina sieci: osobny kod.
          run.error = e instanceof AdapterError ? e.code : "internal-error";
          return { outcome: "failed", error: run.error };
        },
      )
      .then((result): SyncResult => {
        // Sprzatanie zawsze, nawet gdy zapis czasu zawiedzie; wpis w running nie moze zostac na stale.
        running.delete(fundraiser.id);
        last.set(fundraiser.id, run);
        // Odstep 60 s liczymy od zakonczenia UDANEJ Synchronizacji; po bledzie obowiazuje krotki cooldown.
        if (result.outcome !== "completed") {
          failures.set(fundraiser.id, { at: now(), result });
          return result;
        }
        try {
          store.recordSyncTime(fundraiser.id, new Date(now()).toISOString());
        } catch {
          run.error = "internal-error";
          const failed: SyncResult = { outcome: "failed", error: "internal-error" };
          failures.set(fundraiser.id, { at: now(), result: failed });
          return failed;
        }
        failures.delete(fundraiser.id);
        return result;
      });
    running.set(fundraiser.id, run);
    return run.promise;
  }

  /** Nie rzuca: blad magazynu to stan bledu w wyniku, a nie wyjatek w trasie API. */
  function progress(fundraiser: Fundraiser): SyncProgress {
    const run = running.get(fundraiser.id) ?? last.get(fundraiser.id);
    const expected = fundraiser.expectedDonations ?? null;
    let state: ReturnType<Store["syncState"]>;
    let downloaded: number;
    try {
      state = store.syncState(fundraiser.id);
      downloaded = store.donationCount(fundraiser.id);
    } catch {
      return {
        running: running.has(fundraiser.id),
        downloaded: 0,
        expected,
        pagesFetched: run?.pagesFetched ?? 0,
        donationsAdded: run?.donationsAdded ?? 0,
        historyComplete: false,
        error: "internal-error",
        lastSyncAt: null,
      };
    }
    return {
      running: running.has(fundraiser.id),
      downloaded,
      expected,
      pagesFetched: run?.pagesFetched ?? 0,
      donationsAdded: run?.donationsAdded ?? 0,
      historyComplete: state.historyComplete,
      error: run?.error ?? null,
      lastSyncAt: state.lastSyncAt,
    };
  }

  return { syncFundraiser, progress };
}

export type Synchronizer = ReturnType<typeof createSynchronizer>;
