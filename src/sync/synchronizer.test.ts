import { describe, expect, it, vi } from "vitest";
import { AdapterError } from "../adapter/siepomaga";
import type { Cursor, Donation, DonationsPage, Fundraiser } from "../domain/types";
import { openStore } from "../store/store";
import { createSynchronizer, type SynchronizerOptions } from "./synchronizer";

const fundraiser: Fundraiser = { id: "z1", kind: "Fundraise", slug: "test", title: "Test" };
const PAGE_SIZE = 7;

function makeDonation(n: number): Donation {
  const day = `2024-03-${String((n % 28) + 1).padStart(2, "0")}`;
  return { id: `w${n}`, amountMinor: n % 9 === 0 ? null : ((n % 13) + 1) * 100, paidAt: `${day}T12:00:00+01:00`, day, recurring: n % 5 === 0 };
}

/** Atrapa API: lista od najnowszej, strony po 7, pusta strona konczy historie (jak adapter). */
function makeApi(initialCount: number) {
  const all: Donation[] = [];
  for (let i = initialCount; i >= 1; i--) all.push(makeDonation(i));
  const calls: Array<Cursor | null> = [];
  let failOnCall: ((callNumber: number) => AdapterError | null) | null = null;
  const fetchPage = async (_f: Fundraiser, cursor: Cursor | null): Promise<DonationsPage> => {
    calls.push(cursor);
    const err = failOnCall?.(calls.length);
    if (err) throw err;
    const start = cursor ? all.findIndex((d) => d.id === cursor.afterId) + 1 : 0;
    const donations = all.slice(start, start + PAGE_SIZE);
    const last = donations.at(-1);
    return { donations, nextCursor: last ? { afterId: last.id, afterValue: last.paidAt } : null };
  };
  return {
    fetchPage,
    calls,
    addNewest(count: number) {
      const top = Number(all[0]!.id.slice(1));
      for (let i = 1; i <= count; i++) all.unshift(makeDonation(top + i));
    },
    failOn(fn: (callNumber: number) => AdapterError | null) {
      failOnCall = fn;
    },
    reset() {
      calls.length = 0;
    },
  };
}

function setup(api: ReturnType<typeof makeApi>, store = openStore(":memory:"), extra: Partial<SynchronizerOptions> = {}) {
  const clock = { t: Date.parse("2024-04-01T10:00:00Z") };
  const sleeps: number[] = [];
  const sync = createSynchronizer({
    store,
    fetchPage: api.fetchPage,
    now: () => clock.t,
    random: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...extra,
  });
  return { store, clock, sleeps, sync, ...sync };
}

const baseline = (count: number) => {
  const s = setup(makeApi(count));
  return s.sync.syncFundraiser(fundraiser).then(() => s.store.histogram(fundraiser.id));
};

describe("synchronizer", () => {
  it("fetches the whole history and marks it complete", async () => {
    const api = makeApi(23);
    const s = setup(api);
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "completed" });
    const h = s.store.histogram("z1");
    expect(h.amounts.reduce((sum, [, n]) => sum + n, 0) + h.hidden).toBe(23);
    expect(s.store.syncState("z1").historyComplete).toBe(true);
    expect(s.progress(fundraiser)).toMatchObject({ running: false, donationsAdded: 23, historyComplete: true, error: null });
  });

  // 40 Wplat po 7 na strone = 6 stron + pusta strona konczaca Historie, czyli 7 zapytan; przerywamy przy kazdym.
  it.each([1, 2, 3, 4, 5, 6, 7])("an interrupted sync (failure on request %i) resumed later gives the same numbers", async (failAt) => {
    const expected = await baseline(40);
    const api = makeApi(40);
    api.failOn((n) => (n === failAt ? new AdapterError("format-error", "boom") : null));
    const store = openStore(":memory:");
    const first = setup(api, store);
    expect(await first.syncFundraiser(fundraiser)).toEqual({ outcome: "failed", error: "format-error" });
    expect(store.syncState("z1").historyComplete).toBe(false);
    expect(first.progress(fundraiser).error).toBe("format-error");
    const cursorAfterCrash = store.syncState("z1").cursor;
    expect(cursorAfterCrash === null).toBe(failAt === 1);

    api.failOn(() => null);
    api.reset();
    const second = setup(api, store); // nowy proces, ta sama baza
    expect(await second.syncFundraiser(fundraiser)).toEqual({ outcome: "completed" }); // po bledzie bez czekania
    expect(api.calls[0]).toEqual(cursorAfterCrash);
    expect(store.histogram("z1")).toEqual(expected);
    expect(store.syncState("z1").historyComplete).toBe(true);
  });

  it("two concurrent entries do not fetch twice", async () => {
    const api = makeApi(23);
    const single = makeApi(23);
    await setup(single).syncFundraiser(fundraiser);
    const s = setup(api);
    const [a, b] = await Promise.all([s.syncFundraiser(fundraiser), s.syncFundraiser(fundraiser)]);
    expect(a).toEqual({ outcome: "completed" });
    expect(b).toBe(a);
    expect(api.calls).toEqual(single.calls);
  });

  it("progress shows a running sync that others join", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = makeApi(10);
    const s = createSynchronizer({
      store: openStore(":memory:"),
      fetchPage: async (f, c) => {
        await gate;
        return api.fetchPage(f, c);
      },
      sleep: async () => {},
    });
    const p1 = s.syncFundraiser(fundraiser);
    expect(s.progress(fundraiser).running).toBe(true);
    const p2 = s.syncFundraiser(fundraiser);
    release();
    await Promise.all([p1, p2]);
    expect(s.progress(fundraiser)).toMatchObject({ running: false, donationsAdded: 10 });
  });

  it("enforces a 60 s gap between syncs of the same fundraiser", async () => {
    const api = makeApi(10);
    const s = setup(api);
    await s.syncFundraiser(fundraiser);
    api.reset();
    s.clock.t += 59_000;
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "skipped" });
    expect(api.calls).toHaveLength(0);
    s.clock.t += 1_000;
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "completed" });
    expect(api.calls).toHaveLength(1);
  });

  it("fetches only new donations when the history is complete", async () => {
    const api = makeApi(30);
    const s = setup(api);
    await s.syncFundraiser(fundraiser);
    api.addNewest(3);
    api.reset();
    s.clock.t += 61_000;
    await s.syncFundraiser(fundraiser);
    expect(api.calls).toEqual([null]);
    expect(s.progress(fundraiser).donationsAdded).toBe(3);
    expect(s.store.histogram("z1")).toEqual(await baseline(33));
  });

  it("picks up new donations spanning several pages", async () => {
    const api = makeApi(30);
    const s = setup(api);
    await s.syncFundraiser(fundraiser);
    api.addNewest(20);
    s.clock.t += 61_000;
    await s.syncFundraiser(fundraiser);
    expect(s.store.histogram("z1")).toEqual(await baseline(50));
  });

  it("an interrupted fetch of new donations leaves no gap", async () => {
    const api = makeApi(30);
    const s = setup(api);
    await s.syncFundraiser(fundraiser);
    api.addNewest(20);
    api.reset();
    api.failOn((n) => (n === 2 ? new AdapterError("format-error", "boom") : null));
    s.clock.t += 61_000;
    expect((await s.syncFundraiser(fundraiser)).outcome).toBe("failed");
    api.failOn(() => null);
    s.clock.t += 61_000;
    await s.syncFundraiser(fundraiser);
    expect(s.store.histogram("z1")).toEqual(await baseline(50));
  });

  it("a history interrupted earlier also picks up donations added in the meantime", async () => {
    const api = makeApi(40);
    api.failOn((n) => (n === 3 ? new AdapterError("format-error", "boom") : null));
    const s = setup(api);
    await s.syncFundraiser(fundraiser);
    api.failOn(() => null);
    api.addNewest(4);
    s.clock.t += 61_000;
    await s.syncFundraiser(fundraiser);
    expect(s.store.histogram("z1")).toEqual(await baseline(44));
    expect(s.store.syncState("z1").historyComplete).toBe(true);
  });

  it("pauses between requests (request limit)", async () => {
    const s = setup(makeApi(15), openStore(":memory:"), { requestDelayMs: 250 }); // 3 strony z danymi + pusta = 4 zapytania
    await s.syncFundraiser(fundraiser);
    expect(s.sleeps).toEqual([250, 250, 250]);
  });

  it("stores donations with a hidden amount without breaking the cursor", async () => {
    const api = makeApi(30); // co 9. Wplata ma ukryta kwote
    const s = setup(api);
    await s.syncFundraiser(fundraiser);
    const h = s.store.histogram("z1");
    expect(h.hidden).toBe(3);
    expect(h).toEqual(await baseline(30));
    expect(s.store.syncState("z1").historyComplete).toBe(true);
  });

  it("a page with no confirmed donations but a next cursor does not end the history", async () => {
    const real = makeApi(10);
    let n = 0;
    const fetchPage = async (f: Fundraiser, c: Cursor | null): Promise<DonationsPage> => {
      n++;
      if (n === 2) return { donations: [], nextCursor: c ? { afterId: c.afterId, afterValue: c.afterValue } : null };
      return real.fetchPage(f, c);
    };
    // Druga strona jest pusta, ale z kursorem: Synchronizacja musi isc dalej (kursor z poprzedniej strony).
    const store = openStore(":memory:");
    const sync = createSynchronizer({ store, fetchPage, sleep: async () => {}, random: () => 0 });
    expect(await sync.syncFundraiser(fundraiser)).toEqual({ outcome: "completed" });
    const h = store.histogram("z1");
    expect(h.amounts.reduce((sum, [, k]) => sum + k, 0) + h.hidden).toBe(10);
  });

  it("applies jitter to the backoff delay", async () => {
    const api = makeApi(5);
    api.failOn((n) => (n === 1 ? new AdapterError("server-error", "5xx") : null));
    const sleeps: number[] = [];
    const sync = createSynchronizer({
      store: openStore(":memory:"),
      fetchPage: api.fetchPage,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.5,
    });
    await sync.syncFundraiser(fundraiser);
    expect(sleeps[0]).toBe(1125);
  });

  it("reports a store error as internal-error instead of network-error", async () => {
    const api = makeApi(3);
    const bad = api.fetchPage;
    const s = setup({ ...api, fetchPage: async (f, c) => ({ ...(await bad(f, c)), donations: [{ ...makeDonation(1), paidAt: "not-a-date" }] }) });
    const result = await s.syncFundraiser(fundraiser);
    expect(result).toEqual({ outcome: "failed", error: "internal-error" });
    expect(s.progress(fundraiser).error).toBe("internal-error");
  });

  it("cleans up and allows a later sync when recordSyncTime throws", async () => {
    const api = makeApi(3);
    const store = openStore(":memory:");
    vi.spyOn(store, "recordSyncTime").mockImplementation(() => {
      throw new Error("SQLITE_BUSY");
    });
    const s = setup(api, store);
    const result = await s.syncFundraiser(fundraiser);
    expect(result).toEqual({ outcome: "failed", error: "internal-error" });
    expect(s.progress(fundraiser).running).toBe(false);
    api.reset();
    s.clock.t += 10_000; // po cooldownie po bledzie
    await s.syncFundraiser(fundraiser);
    expect(api.calls.length).toBeGreaterThan(0);
  });

  it("aborts with format-error when the history cursor does not advance", async () => {
    const api = makeApi(30);
    const stuck = async (): Promise<DonationsPage> => ({ donations: [makeDonation(1)], nextCursor: { afterId: "w1", afterValue: "x" } });
    const s = setup({ ...api, fetchPage: stuck });
    const result = await s.syncFundraiser(fundraiser);
    expect(result).toEqual({ outcome: "failed", error: "format-error" });
    expect(s.progress(fundraiser).running).toBe(false);
  });

  it("aborts with format-error when the new-donations walk gets a repeated cursor", async () => {
    const api = makeApi(10);
    const s = setup(api);
    await s.syncFundraiser(fundraiser);
    const stuck = async (): Promise<DonationsPage> => ({ donations: [makeDonation(500)], nextCursor: { afterId: "w500", afterValue: "x" } });
    const s2 = setup({ ...api, fetchPage: stuck }, s.store);
    s2.clock.t += 120_000;
    const result = await s2.syncFundraiser(fundraiser);
    expect(result).toEqual({ outcome: "failed", error: "format-error" });
  });

  it("does not stop the new-donations walk on a payment known only under another fundraiser", async () => {
    const api = makeApi(20);
    const store = openStore(":memory:");
    const other: Fundraiser = { id: "z2", kind: "Fundraise", slug: "o", title: "O" };
    const s = setup(api, store);
    await s.syncFundraiser(fundraiser);
    store.savePage(other, [makeDonation(25)], null); // platnosc znana tylko pod inna Zbiorka
    api.addNewest(10); // w21..w30, wsrod nich w25
    s.clock.t += 120_000;
    await s.syncFundraiser(fundraiser);
    expect(store.hasDonation("z1", "w30")).toBe(true);
    expect(store.hasDonation("z1", "w21")).toBe(true);
    expect(store.hasDonation("z1", "w25")).toBe(true);
  });

  it("returns a rejected-free failed result when the store throws synchronously before the sync", async () => {
    const store = openStore(":memory:");
    vi.spyOn(store, "registerFundraiser").mockImplementation(() => {
      throw new Error("SQLITE_BUSY");
    });
    const s = setup(makeApi(3), store);
    await expect(s.syncFundraiser(fundraiser)).resolves.toEqual({ outcome: "failed", error: "internal-error" });
    expect(s.progress(fundraiser).running).toBe(false);
  });

  it("a failed sync does not record the sync time and a retry after the cooldown works", async () => {
    const api = makeApi(10);
    api.failOn((n) => (n === 1 ? new AdapterError("format-error", "boom") : null));
    const s = setup(api);
    expect((await s.syncFundraiser(fundraiser)).outcome).toBe("failed");
    expect(s.store.syncState("z1").lastSyncAt).toBeNull();
    s.clock.t += 10_000;
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "completed" });
    expect(s.store.syncState("z1").lastSyncAt).toBe(new Date(s.clock.t).toISOString());
  });

  it("after a failure it returns the previous error without hitting the portal until the cooldown passes", async () => {
    const api = makeApi(10);
    api.failOn((n) => (n === 1 ? new AdapterError("format-error", "boom") : null));
    const s = setup(api);
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "failed", error: "format-error" });
    const callsAfterFailure = api.calls.length;
    s.clock.t += 9_999;
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "failed", error: "format-error" });
    expect(api.calls.length).toBe(callsAfterFailure); // zadnego zapytania do portalu
    expect(s.progress(fundraiser)).toMatchObject({ running: false, error: "format-error" });
    s.clock.t += 1;
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "completed" });
    expect(api.calls.length).toBeGreaterThan(callsAfterFailure);
    expect(s.progress(fundraiser).error).toBeNull();
  });

  it("the 60 s gap counts from the end of the sync, not from its start", async () => {
    const api = makeApi(10);
    const s = createSynchronizer({
      store: openStore(":memory:"),
      fetchPage: async (f, c) => {
        clock.t += 40_000; // kazde zapytanie trwa 40 s
        return api.fetchPage(f, c);
      },
      now: () => clock.t,
      sleep: async () => {},
    });
    const clock = { t: Date.parse("2024-04-01T10:00:00Z") };
    await s.syncFundraiser(fundraiser); // konczy sie po 80 s (2 zapytania)
    clock.t += 59_000;
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "skipped" });
  });

  it("a lastSyncAt in the future (clock moved back) does not block", async () => {
    const api = makeApi(5);
    const s = setup(api);
    s.store.registerFundraiser(fundraiser);
    s.store.recordSyncTime("z1", new Date(s.clock.t + 3_600_000).toISOString());
    expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "completed" });
  });

  it("progress reports downloaded and expected counts", async () => {
    const withExpected = { ...fundraiser, expectedDonations: 30 };
    const s = setup(makeApi(23));
    expect(s.progress(withExpected)).toMatchObject({ downloaded: 0, expected: 30 });
    await s.syncFundraiser(withExpected);
    expect(s.progress(withExpected)).toMatchObject({ downloaded: 23, expected: 30 });
    expect(s.progress(fundraiser).expected).toBeNull();
  });

  it("progress does not throw when the store fails; it returns an error state", () => {
    const store = openStore(":memory:");
    vi.spyOn(store, "syncState").mockImplementation(() => {
      throw new Error("SQLITE_BUSY");
    });
    const s = setup(makeApi(3), store);
    expect(s.progress(fundraiser)).toMatchObject({ running: false, error: "internal-error", downloaded: 0 });
  });

  describe("backoff", () => {
    it("caps Retry-After at the maximum backoff", async () => {
      const api = makeApi(5);
      api.failOn((n) => (n === 1 ? new AdapterError("rate-limited", "429", 3600) : null));
      const s = setup(api);
      await s.syncFundraiser(fundraiser);
      expect(s.sleeps[0]).toBe(30_000);
    });

    it("respects Retry-After also for a 503 reported as server-error", async () => {
      const api = makeApi(5);
      api.failOn((n) => (n === 1 ? new AdapterError("server-error", "503", 12) : null));
      const s = setup(api);
      await s.syncFundraiser(fundraiser);
      expect(s.sleeps[0]).toBe(12_000);
    });

    it("retries 5xx with exponential delays and then succeeds", async () => {
      const api = makeApi(5);
      api.failOn((n) => (n <= 3 ? new AdapterError("server-error", "5xx") : null));
      const s = setup(api);
      expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "completed" });
      expect(s.sleeps.slice(0, 3)).toEqual([1000, 2000, 4000]);
    });

    it("on 429 respects Retry-After when it is longer than the backoff", async () => {
      const api = makeApi(5);
      api.failOn((n) => (n === 1 ? new AdapterError("rate-limited", "429", 10) : null));
      const s = setup(api);
      await s.syncFundraiser(fundraiser);
      expect(s.sleeps[0]).toBe(10_000);
    });

    it("gives up after the retry limit and keeps what was already saved", async () => {
      const api = makeApi(30);
      api.failOn((n) => (n >= 2 ? new AdapterError("network-error", "down") : null));
      const s = setup(api);
      expect(await s.syncFundraiser(fundraiser)).toEqual({ outcome: "failed", error: "network-error" });
      expect(s.store.histogram("z1").amounts.length).toBeGreaterThan(0);
      expect(s.store.syncState("z1").historyComplete).toBe(false);
      expect(s.progress(fundraiser)).toMatchObject({ running: false, error: "network-error" });
    });

    it("does not retry a format error", async () => {
      const api = makeApi(5);
      api.failOn(() => new AdapterError("format-error", "bad"));
      const s = setup(api);
      await s.syncFundraiser(fundraiser);
      expect(api.calls).toHaveLength(1);
    });
  });
});
