import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IncompatibleDatabaseError, openStore } from "./store";
import type { Donation, Fundraiser } from "../domain/types";

const fundraiser: Fundraiser = { id: "z1", kind: "Fundraise", slug: "test", title: "Test" };

function donation(id: string, amountMinor: number | null, day = "2024-03-10", recurring = false): Donation {
  return { id, amountMinor, paidAt: `${day}T12:00:00+01:00`, day, recurring };
}

describe("Store", () => {
  it("saves a page and computes the histogram (amounts ascending, hidden separately)", () => {
    const s = openStore(":memory:");
    s.savePage(
      fundraiser,
      [donation("a", 500), donation("b", 500), donation("c", 1000), donation("d", null)],
      { afterId: "d", afterValue: "x" },
    );
    expect(s.histogram("z1")).toEqual({
      amounts: [
        [500, 2],
        [1000, 1],
      ],
      hidden: 1,
    });
    expect(s.syncState("z1").cursor).toEqual({ afterId: "d", afterValue: "x" });
  });

  it("saving the same page again does not change the numbers", () => {
    const s = openStore(":memory:");
    const page = [donation("a", 500), donation("b", null)];
    s.savePage(fundraiser, page, null);
    const before = { h: s.histogram("z1"), d: s.dailyTotals("z1", 1000) };
    s.savePage(fundraiser, page, null);
    expect({ h: s.histogram("z1"), d: s.dailyTotals("z1", 1000) }).toEqual(before);
  });

  it("dailyTotals: splits into small and other by inclusive threshold, hidden separately, by donation day", () => {
    const s = openStore(":memory:");
    s.savePage(
      fundraiser,
      [
        donation("a", 1000, "2024-03-10"),
        donation("b", 1001, "2024-03-10"),
        donation("c", 830, "2024-03-10", true),
        donation("d", null, "2024-03-10"),
        donation("e", 200, "2024-03-11"),
      ],
      null,
    );
    expect(s.dailyTotals("z1", 1000)).toEqual([
      {
        day: "2024-03-10",
        small: { count: 2, amountMinor: 1830 },
        other: { count: 1, amountMinor: 1001 },
        hidden: 1,
      },
      {
        day: "2024-03-11",
        small: { count: 1, amountMinor: 200 },
        other: { count: 0, amountMinor: 0 },
        hidden: 0,
      },
    ]);
  });

  it("keeps fundraisers separate", () => {
    const s = openStore(":memory:");
    s.savePage(fundraiser, [donation("a", 100)], null);
    s.savePage({ ...fundraiser, id: "z2" }, [donation("b", 200)], null);
    expect(s.histogram("z1").amounts).toEqual([[100, 1]]);
    expect(s.histogram("z2").amounts).toEqual([[200, 1]]);
  });

  it("is atomic: an error midway leaves no partial state", () => {
    const s = openStore(":memory:");
    s.savePage(fundraiser, [donation("a", 100)], { afterId: "a", afterValue: "1" });
    const broken = { ...donation("c", 300), paidAt: null } as unknown as Donation;
    expect(() =>
      s.savePage(fundraiser, [donation("b", 200), broken], { afterId: "c", afterValue: "2" }),
    ).toThrow();
    expect(s.histogram("z1").amounts).toEqual([[100, 1]]);
    expect(s.syncState("z1").cursor).toEqual({ afterId: "a", afterValue: "1" });
  });

  it("sync state: history, last sync time", () => {
    const s = openStore(":memory:");
    expect(s.syncState("missing")).toEqual({
      cursor: null,
      historyComplete: false,
      lastSyncAt: null,
    });
    s.savePage(fundraiser, [donation("a", 100, "2024-03-10"), donation("b", 100, "2024-03-12")], null);
    s.recordSyncTime("z1", "2024-04-01T10:00:00.000Z");
    const state = s.syncState("z1");
    expect(state.historyComplete).toBe(true);
    expect(state.lastSyncAt).toBe("2024-04-01T10:00:00.000Z");
  });

  it("schema contains no personal data fields (ADR 0001)", () => {
    const s = openStore(":memory:");
    expect(s.columns("donations").sort()).toEqual(
      ["recurring", "paid_at", "paid_at_ms", "day", "id", "amount_minor", "fundraiser_id"].sort(),
    );
    const fundraisers = s.columns("fundraisers");
    for (const forbidden of ["first_name", "last_name", "avatar", "company", "comment", "email"]) {
      expect(fundraisers).not.toContain(forbidden);
    }
  });

  it("marks history complete atomically with the last page (null cursor)", () => {
    const s = openStore(":memory:");
    s.savePage(fundraiser, [donation("a", 100)], { afterId: "a", afterValue: "1" });
    expect(s.syncState("z1").historyComplete).toBe(false);
    s.savePage(fundraiser, [donation("b", 200)], null);
    expect(s.syncState("z1").historyComplete).toBe(true);
    expect(s.syncState("z1").cursor).toBeNull();
  });

  it("a failed last-page save does not mark history complete", () => {
    const s = openStore(":memory:");
    s.savePage(fundraiser, [donation("a", 100)], { afterId: "a", afterValue: "1" });
    const broken = { ...donation("c", 300), paidAt: "nonsense" };
    expect(() => s.savePage(fundraiser, [donation("b", 200), broken], null)).toThrow();
    expect(s.syncState("z1").historyComplete).toBe(false);
    expect(s.syncState("z1").cursor).toEqual({ afterId: "a", afterValue: "1" });
    expect(s.histogram("z1").amounts).toEqual([[100, 1]]);
  });

  it("validates paidAt explicitly with a readable error", () => {
    const s = openStore(":memory:");
    const bad = { ...donation("a", 100), paidAt: "not a date" };
    expect(() => s.savePage(fundraiser, [bad], null)).toThrow(/paidAt/);
  });

  it.each([1.5, Number.NaN, -1, Number.POSITIVE_INFINITY])("rejects amountMinor %s", (amount) => {
    const s = openStore(":memory:");
    expect(() => s.savePage(fundraiser, [donation("a", amount)], null)).toThrow(/amountMinor/);
  });

  it("saveNewDonations adds donations without touching cursor or history state", () => {
    const s = openStore(":memory:");
    s.savePage(fundraiser, [donation("a", 100)], { afterId: "a", afterValue: "1" });
    expect(s.saveNewDonations(fundraiser, [donation("n", 300), donation("a", 100)])).toBe(1);
    expect(s.syncState("z1").cursor).toEqual({ afterId: "a", afterValue: "1" });
    expect(s.syncState("z1").historyComplete).toBe(false);
    expect(s.hasDonation("z1", "n")).toBe(true);
    expect(s.hasDonation("z1", "zzz")).toBe(false);
  });

  it("the same payment id under two fundraisers is stored and checked per fundraiser", () => {
    const s = openStore(":memory:");
    const other = { ...fundraiser, id: "z2", slug: "other" };
    expect(s.savePage(fundraiser, [donation("shared", 100)], null)).toBe(1);
    expect(s.hasDonation("z2", "shared")).toBe(false);
    expect(s.savePage(other, [donation("shared", 100)], null)).toBe(1);
    expect(s.hasDonation("z2", "shared")).toBe(true);
    expect(s.histogram("z2").amounts).toEqual([[100, 1]]);
  });

  it("histogram and dailyTotals for thousands of donations are correct", () => {
    const s = openStore(":memory:");
    const many: Donation[] = [];
    for (let i = 0; i < 5000; i++) {
      many.push(donation(`w${i}`, (i % 50) * 100 + 100, `2024-01-${String((i % 28) + 1).padStart(2, "0")}`));
    }
    s.savePage(fundraiser, many, null);
    const h = s.histogram("z1");
    const d = s.dailyTotals("z1", 1000);
    expect(h.amounts.reduce((sum, [, n]) => sum + n, 0)).toBe(5000);
    expect(h.amounts).toHaveLength(50);
    expect(d).toHaveLength(28);
    expect(d.reduce((sum, x) => sum + x.small.count + x.other.count, 0)).toBe(5000);
    expect(d.reduce((sum, x) => sum + x.small.count, 0)).toBe(1000);
  });

  it("a non-empty cursor never reverts a complete history", () => {
    const s = openStore(":memory:");
    s.savePage(fundraiser, [donation("a", 100)], null);
    s.savePage(fundraiser, [donation("b", 200)], { afterId: "b", afterValue: "1" });
    expect(s.syncState("z1").historyComplete).toBe(true);
  });

  it("finds a fundraiser by slug and keeps expectedDonations unless a new value arrives", () => {
    const s = openStore(":memory:");
    expect(s.fundraiserBySlug("test")).toBeNull();
    s.registerFundraiser({ ...fundraiser, expectedDonations: 500 });
    expect(s.fundraiserBySlug("test")).toEqual({ ...fundraiser, expectedDonations: 500 });
    s.registerFundraiser(fundraiser); // bez sumy docelowej: zostaje poprzednia
    expect(s.fundraiserBySlug("test")?.expectedDonations).toBe(500);
    s.registerFundraiser({ ...fundraiser, expectedDonations: 700 });
    expect(s.fundraiserBySlug("test")?.expectedDonations).toBe(700);
  });

  it("a fundraiser without expectedDonations has no such key", () => {
    const s = openStore(":memory:");
    s.registerFundraiser(fundraiser);
    expect(s.fundraiserBySlug("test")).toEqual(fundraiser);
  });

  it("donationCount counts hidden-amount donations too, per fundraiser", () => {
    const s = openStore(":memory:");
    s.savePage(fundraiser, [donation("a", 100), donation("b", null)], null);
    s.savePage({ ...fundraiser, id: "z2", slug: "o" }, [donation("a", 100)], null);
    expect(s.donationCount("z1")).toBe(2);
    expect(s.donationCount("z2")).toBe(1);
    expect(s.donationCount("missing")).toBe(0);
  });

  describe("schema version", () => {
    const withDir = (fn: (dir: string) => void) => {
      const dir = mkdtempSync(join(tmpdir(), "czydycha-"));
      try {
        fn(dir);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };

    it("rejects an old database with a single-column primary key with a dedicated error", () => {
      withDir((dir) => {
        const path = join(dir, "old.db");
        const old = new Database(path);
        old.exec("CREATE TABLE donations (id TEXT PRIMARY KEY, amount_minor INTEGER)");
        old.close();
        expect(() => openStore(path)).toThrow(IncompatibleDatabaseError);
      });
    });

    it("stamps a fresh database and reopens it, and adopts a current-schema database without a version", () => {
      withDir((dir) => {
        const path = join(dir, "new.db");
        openStore(path).close();
        openStore(path).close();
        const db = new Database(path);
        db.pragma("user_version = 0"); // baza z poprzedniego kroku bez numeru wersji
        db.close();
        expect(() => openStore(path).close()).not.toThrow();
      });
    });

    it("rejects a database from a newer schema version", () => {
      withDir((dir) => {
        const path = join(dir, "future.db");
        const db = new Database(path);
        db.pragma("user_version = 99");
        db.close();
        expect(() => openStore(path)).toThrow(IncompatibleDatabaseError);
      });
    });
  });
});
