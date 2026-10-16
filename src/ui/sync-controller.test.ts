import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistogramBody, ProgressBody } from "@/server/handlers";
import { ApiError } from "./api-client";
import { createSyncController, type SyncSnapshot, type Visibility } from "./sync-controller";

const progress = (p: Partial<ProgressBody>): ProgressBody => ({
  state: "running", downloaded: 0, expected: 100, lastSyncAt: null, isPartial: true, ...p,
});
const histogram = (n: number): HistogramBody => ({ title: "T", slug: "s", amounts: [[1000, n]], hidden: 0 });

function setup(opts: { start: ProgressBody; polls: Array<ProgressBody | Error>; counter?: { n: number } }) {
  const polls = [...opts.polls];
  let hist = 0;
  const api = {
    startSync: vi.fn(async () => opts.start),
    getProgress: vi.fn(async () => {
      const next = polls.length > 1 ? polls.shift()! : polls[0]!;
      if (next instanceof Error) throw next;
      return next;
    }),
    getHistogram: vi.fn(async () => histogram(++hist)),
  };
  const snapshots: SyncSnapshot[] = [];
  const controller = createSyncController({ slug: "s", api, pollMs: 1000, onChange: (s) => snapshots.push(s) });
  return { api, controller, last: () => snapshots[snapshots.length - 1]! };
}

describe("createSyncController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls until complete, refreshes the histogram and stops", async () => {
    const { api, controller, last } = setup({
      start: progress({ downloaded: 0 }),
      polls: [progress({ downloaded: 40 }), progress({ downloaded: 100, state: "complete", isPartial: false })],
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(last().histogram).not.toBeNull(); // stan zapisany wcześniej widać od razu
    await vi.advanceTimersByTimeAsync(1000);
    expect(last().progress?.downloaded).toBe(40);
    await vi.advanceTimersByTimeAsync(1000);
    expect(last().progress?.state).toBe("complete");
    const calls = api.getProgress.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getProgress.mock.calls.length).toBe(calls); // koniec pollingu
    expect(vi.getTimerCount()).toBe(0);
    controller.stop();
  });

  it("stops polling on failure and exposes the error state", async () => {
    const { controller, last, api } = setup({
      start: progress({}),
      polls: [progress({ state: "failed", downloaded: 5, error: { code: "network-error", message: "x" } })],
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(last().progress?.state).toBe("failed");
    expect(api.getProgress).toHaveBeenCalledTimes(1);
  });

  it("gives up on an idle sync (skipped) after a short grace period", async () => {
    const { controller, api } = setup({ start: progress({ state: "idle" }), polls: [progress({ state: "idle" })] });
    controller.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(api.getProgress).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tolerates transient poll errors but reports repeated ones", async () => {
    const boom = new ApiError(0, "network-error", "Brak połączenia");
    const ok = setup({ start: progress({}), polls: [boom, progress({ downloaded: 1 })] });
    ok.controller.start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(ok.last().loadError).toBeNull();
    ok.controller.stop();

    const bad = setup({ start: progress({}), polls: [boom] });
    bad.controller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(bad.last().loadError).toBe("Brak połączenia");
  });

  it("clears a histogram load error after a later successful read", async () => {
    const { controller, api, last } = setup({
      start: progress({}),
      polls: [progress({ downloaded: 10 }), progress({ downloaded: 20 })],
    });
    api.getHistogram.mockRejectedValueOnce(new ApiError(0, "network-error", "Brak połączenia"));
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(last().loadError).toBe("Brak połączenia");
    await vi.advanceTimersByTimeAsync(1000);
    expect(last().loadError).toBeNull();
    controller.stop();
  });

  it("reports an unknown fundraiser", async () => {
    const api = {
      startSync: vi.fn(async () => { throw new ApiError(404, "unknown-fundraiser", "Nie znam"); }),
      getProgress: vi.fn(),
      getHistogram: vi.fn(async () => { throw new ApiError(404, "unknown-fundraiser", "Nie znam"); }),
    };
    let snap: SyncSnapshot | undefined;
    createSyncController({ slug: "x", api, onChange: (s) => (snap = s) }).start();
    await vi.advanceTimersByTimeAsync(0);
    expect(snap?.notFound).toBe(true);
  });

  it("clears the timer on stop and ignores late responses", async () => {
    const { controller, api } = setup({ start: progress({}), polls: [progress({ downloaded: 1 })] });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    controller.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getProgress).not.toHaveBeenCalled();
  });

  it("retry starts a fresh sync", async () => {
    const { controller, api } = setup({ start: progress({}), polls: [progress({ state: "failed" })] });
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    controller.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.startSync).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it("keeps the start error when the histogram arrives later", async () => {
    let resolveHistogram!: (h: HistogramBody) => void;
    const api = {
      startSync: vi.fn<() => Promise<ProgressBody>>(async () => { throw new ApiError(500, "internal-error", "Błąd serwera"); }),
      getProgress: vi.fn(),
      getHistogram: vi.fn(() => new Promise<HistogramBody>((r) => { resolveHistogram = r; })),
    };
    let snap!: SyncSnapshot;
    const controller = createSyncController({ slug: "s", api, onChange: (x) => (snap = x) });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(snap.loadError).toBe("Błąd serwera");
    resolveHistogram(histogram(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(snap.histogram).not.toBeNull();
    expect(snap.loadError).toBe("Błąd serwera"); // udany histogram nie kasuje błędu startu
    expect(api.getProgress).not.toHaveBeenCalled();
    api.startSync.mockResolvedValueOnce(progress({ state: "complete", isPartial: false }));
    controller.retry(); // ponowienie czyści błąd i startuje od nowa
    await vi.advanceTimersByTimeAsync(0);
    expect(api.startSync).toHaveBeenCalledTimes(2);
    expect(snap.loadError).toBeNull();
    controller.stop();
  });

  it("pauses polling while the tab is hidden and resumes on return", async () => {
    let hidden = false;
    let notify = () => {};
    const visibility: Visibility = {
      isHidden: () => hidden,
      subscribe: (cb) => { notify = cb; return () => { notify = () => {}; }; },
    };
    const api = {
      startSync: vi.fn(async () => progress({})),
      getProgress: vi.fn(async () => progress({ downloaded: 5 })),
      getHistogram: vi.fn(async () => histogram(1)),
    };
    const controller = createSyncController({ slug: "s", api, pollMs: 1000, visibility, onChange: () => {} });
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getProgress).toHaveBeenCalledTimes(1);
    hidden = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getProgress).toHaveBeenCalledTimes(1);
    hidden = false;
    notify();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getProgress).toHaveBeenCalledTimes(2);
    controller.stop();
  });
});
