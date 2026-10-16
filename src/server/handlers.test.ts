import { describe, expect, it, vi } from "vitest";
import { AdapterError } from "../adapter/siepomaga";
import type { Cursor, Donation, DonationsPage, Fundraiser } from "../domain/types";
import { openStore } from "../store/store";
import { createSynchronizer } from "../sync/synchronizer";
import { getDaily, getHistogram, getProgress, parseThresholdMinor, registerFundraiser, startSync, type Deps } from "./handlers";

const fundraiser: Fundraiser = { id: "z1", kind: "Fundraise", slug: "test", title: "Test", expectedDonations: 14 };

function donation(n: number, amountMinor: number | null, day = "2024-03-10"): Donation {
  return { id: `w${n}`, amountMinor, paidAt: `${day}T12:00:00+01:00`, day, recurring: false };
}

/** 14 Wplat po 7 na strone; pusta strona konczy Historie. Opcjonalna bramka wstrzymuje odpowiedzi. */
function makeDeps(opts: { gate?: Promise<void>; resolve?: Deps["resolveFundraiser"] } = {}) {
  const store = openStore(":memory:");
  const all = Array.from({ length: 14 }, (_, i) => donation(14 - i, i % 5 === 0 ? null : (i + 1) * 100, i < 7 ? "2024-03-11" : "2024-03-10"));
  const fetchPage = async (_f: Fundraiser, cursor: Cursor | null): Promise<DonationsPage> => {
    await opts.gate;
    const start = cursor ? all.findIndex((d) => d.id === cursor.afterId) + 1 : 0;
    const donations = all.slice(start, start + 7);
    const last = donations.at(-1);
    return { donations, nextCursor: last ? { afterId: last.id, afterValue: last.paidAt } : null };
  };
  const synchronizer = createSynchronizer({ store, fetchPage, sleep: async () => {}, random: () => 0 });
  const deps: Deps = { store, synchronizer, resolveFundraiser: opts.resolve ?? (async () => fundraiser) };
  return { deps, store, synchronizer };
}

/** Czeka, az tlo Synchronizacji sie skonczy (postep przestaje byc running). */
async function settled(deps: Deps) {
  for (let i = 0; i < 200 && (getProgress(deps, "test").body as { state: string }).state === "running"; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe("registerFundraiser", () => {
  it("resolves the link, stores the fundraiser and returns slug and title", async () => {
    const { deps, store } = makeDeps();
    const res = await registerFundraiser(deps, { link: "https://www.siepomaga.pl/test" });
    expect(res).toEqual({ status: 200, body: { slug: "test", title: "Test" } });
    expect(store.fundraiserBySlug("test")).toEqual(fundraiser);
  });

  it.each([null, {}, { link: 5 }, { link: "   " }, "text"])("rejects a missing link (%j) with 400 and a Polish message", async (body) => {
    const res = await registerFundraiser(makeDeps().deps, body);
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/link/);
  });

  it.each([
    ["unrecognized-link", 400],
    ["not-found", 404],
    ["rate-limited", 503],
    ["network-error", 502],
    ["format-error", 502],
  ] as const)("maps adapter error %s to HTTP %i and keeps the adapter message", async (code, status) => {
    const { deps } = makeDeps({
      resolve: async () => {
        throw new AdapterError(code, "Komunikat po polsku.");
      },
    });
    const res = await registerFundraiser(deps, { link: "x" });
    expect(res).toEqual({ status, body: { code, message: "Komunikat po polsku." } });
  });

  it("an unexpected exception is a 500 without leaking details", async () => {
    const { deps } = makeDeps({
      resolve: async () => {
        throw new Error("secret path /etc/x");
      },
    });
    const res = await registerFundraiser(deps, { link: "x" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});

describe("unknown fundraiser", () => {
  it.each([
    ["startSync", (d: Deps) => startSync(d, "nope")],
    ["getProgress", (d: Deps) => getProgress(d, "nope")],
    ["getHistogram", (d: Deps) => getHistogram(d, "nope")],
    ["getDaily", (d: Deps) => getDaily(d, "nope", "10")],
  ])("%s gives 404 with a Polish message", (_name, call) => {
    const res = call(makeDeps().deps);
    expect(res.status).toBe(404);
    expect((res.body as { message: string }).message).toMatch(/Zbiórk/);
  });
});

describe("startSync and getProgress", () => {
  it("returns 202 at once with a running state and does not wait for the sync", async () => {
    let release!: () => void;
    const { deps } = makeDeps({ gate: new Promise<void>((r) => (release = r)) });
    deps.store.registerFundraiser(fundraiser);
    const res = startSync(deps, "test");
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ state: "running", downloaded: 0, expected: 14, isPartial: true });
    release();
    await settled(deps);
    expect(getProgress(deps, "test").body).toMatchObject({ state: "complete", downloaded: 14, expected: 14, isPartial: false });
  });

  it("a second start joins the running sync instead of fetching twice", async () => {
    let release!: () => void;
    const spy = vi.fn();
    const { deps } = makeDeps({ gate: new Promise<void>((r) => (release = r)) });
    deps.store.registerFundraiser(fundraiser);
    const original = deps.synchronizer.syncFundraiser;
    deps.synchronizer = { ...deps.synchronizer, syncFundraiser: (f) => (spy(), original(f)) };
    startSync(deps, "test");
    const second = startSync(deps, "test");
    expect(second.body).toMatchObject({ state: "running" });
    release();
    await settled(deps);
    expect(deps.store.donationCount("z1")).toBe(14);
  });

  it("idle before any sync, with null lastSyncAt and a partial result", () => {
    const { deps } = makeDeps();
    deps.store.registerFundraiser(fundraiser);
    expect(getProgress(deps, "test")).toEqual({
      status: 200,
      body: { state: "idle", downloaded: 0, expected: 14, lastSyncAt: null, isPartial: true },
    });
  });

  it("failed state carries a Polish error message", async () => {
    const store = openStore(":memory:");
    store.registerFundraiser(fundraiser);
    const synchronizer = createSynchronizer({
      store,
      fetchPage: async () => {
        throw new AdapterError("format-error", "x");
      },
      sleep: async () => {},
    });
    const deps: Deps = { store, synchronizer, resolveFundraiser: async () => fundraiser };
    startSync(deps, "test");
    await settled(deps);
    const body = getProgress(deps, "test").body as { state: string; error: { code: string; message: string } };
    expect(body.state).toBe("failed");
    expect(body.error.code).toBe("format-error");
    expect(body.error.message).toMatch(/formacie/);
  });

  it("a store failure in progress gives an error state, not an exception", () => {
    const { deps, store } = makeDeps();
    store.registerFundraiser(fundraiser);
    vi.spyOn(store, "syncState").mockImplementation(() => {
      throw new Error("SQLITE_BUSY");
    });
    const res = getProgress(deps, "test");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: "failed", error: { code: "internal-error" } });
  });
});

describe("getHistogram and getDaily", () => {
  async function synced() {
    const made = makeDeps();
    made.store.registerFundraiser(fundraiser);
    startSync(made.deps, "test");
    await settled(made.deps);
    return made.deps;
  }

  it("histogram comes with fundraiser metadata", async () => {
    const res = getHistogram(await synced(), "test");
    expect(res.status).toBe(200);
    const body = res.body as { title: string; slug: string; amounts: number[][]; hidden: number };
    expect(body).toMatchObject({ title: "Test", slug: "test" });
    expect(body.amounts.reduce((s, [, n]) => s + n, 0) + body.hidden).toBe(14);
  });

  it("daily totals are computed for the threshold given in zloty (inclusive)", async () => {
    const deps = await synced();
    const res = getDaily(deps, "test", "2");
    expect(res.status).toBe(200);
    const days = res.body as Array<{ day: string; small: { count: number }; other: { count: number }; hidden: number }>;
    expect(days.map((d) => d.day)).toEqual(["2024-03-10", "2024-03-11"]);
    const small = days.reduce((s, d) => s + d.small.count, 0);
    expect(small).toBe(deps.store.dailyTotals("z1", 200).reduce((s, d) => s + d.small.count, 0));
    expect(small).toBeGreaterThan(0);
  });

  it.each([null, "", "  ", "abc", "-1", "NaN", "Infinity", "1e400", "1e300"])("rejects threshold %j with 400", async (raw) => {
    const res = getDaily(await synced(), "test", raw);
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/Próg/);
  });

  it("parseThresholdMinor converts zloty to minor units without float errors", () => {
    expect(parseThresholdMinor("8.3")).toBe(830);
    expect(parseThresholdMinor("0")).toBe(0);
    expect(parseThresholdMinor("10")).toBe(1000);
  });
});
