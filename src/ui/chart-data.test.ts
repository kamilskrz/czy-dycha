import { describe, expect, it } from "vitest";
import type { DailyTotals } from "@/domain/types";
import { buildTimeline } from "./chart-data";

const day = (d: string, sc: number, sa: number, oc: number, oa: number): DailyTotals => ({
  day: d,
  small: { count: sc, amountMinor: sa },
  other: { count: oc, amountMinor: oa },
  hidden: 0,
});

describe("buildTimeline", () => {
  const data = [day("2024-03-03", 1, 500, 0, 0), day("2024-03-01", 2, 1000, 1, 5000)];
  it("sorts, fills gaps with zeros and converts amounts to zloty", () => {
    expect(buildTimeline(data, "amount")).toEqual([
      { day: "2024-03-01", small: 10, other: 50 },
      { day: "2024-03-02", small: 0, other: 0 },
      { day: "2024-03-03", small: 5, other: 0 },
    ]);
  });
  it("uses counts for the count metric", () => {
    expect(buildTimeline(data, "count").map((p) => [p.small, p.other])).toEqual([[2, 1], [0, 0], [1, 0]]);
  });
  it("returns an empty list for no data", () => {
    expect(buildTimeline([], "count")).toEqual([]);
  });
  it("does not fill gaps across absurdly long spans", () => {
    const wide = [day("1900-01-01", 1, 100, 0, 0), day("2024-01-01", 1, 100, 0, 0)];
    expect(buildTimeline(wide, "count")).toHaveLength(2);
  });
});

import { describeTimeline } from "./chart-data";

describe("describeTimeline", () => {
  it("summarises totals for screen readers", () => {
    const points = [{ day: "2024-03-01", small: 2, other: 1 }, { day: "2024-03-02", small: 0, other: 3 }];
    expect(describeTimeline(points, "count")).toBe(
      "Wykres dzienny, liczba wpłat: 2 dni od 2024-03-01 do 2024-03-02. Razem małe wpłaty 2, pozostałe 4.",
    );
    expect(describeTimeline([], "amount")).toBe("Wykres dzienny: brak danych.");
  });
});
