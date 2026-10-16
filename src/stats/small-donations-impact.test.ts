import { describe, expect, it } from "vitest";
import type { Histogram } from "../domain/types";
import { smallDonationsImpact } from "./small-donations-impact";

const h = (amounts: Array<[number, number]>, hidden = 0): Histogram => ({ amounts, hidden });

describe("smallDonationsImpact", () => {
  it("empty histogram: zeros without division by zero", () => {
    const w = smallDonationsImpact(h([]), 10);
    expect(w.disclosedCount).toBe(0);
    expect(w.countPercent).toBe(0);
    expect(w.amountPercent).toBe(0);
    expect(w.meanMinor).toBeNull();
    expect(w.medianMinor).toBeNull();
    expect(w.hidden).toBe(0);
    expect(w.ranges.every((p) => p.count === 0)).toBe(true);
  });

  it("only hidden: zero indicators, hidden reported separately", () => {
    const w = smallDonationsImpact(h([], 7), 10);
    expect(w.hidden).toBe(7);
    expect(w.disclosedCount).toBe(0);
    expect(w.countPercent).toBe(0);
    expect(w.medianMinor).toBeNull();
  });

  it("a donation equal to the threshold is small (inclusive)", () => {
    const w = smallDonationsImpact(h([[1000, 1], [1001, 1]]), 10);
    expect(w.small.count).toBe(1);
    expect(w.small.amountMinor).toBe(1000);
    expect(w.countPercent).toBe(50);
  });

  it("fractional amounts: 8.30 zl = 830 minor units, threshold 8.30 inclusive", () => {
    const w = smallDonationsImpact(h([[830, 3], [831, 1]]), 8.3);
    expect(w.small.count).toBe(3);
    expect(w.small.amountMinor).toBe(2490);
    expect(w.countPercent).toBe(75);
  });

  it("threshold with floating-point error (0.1+0.2 zl = 30 minor units)", () => {
    const w = smallDonationsImpact(h([[30, 1]]), 0.1 + 0.2);
    expect(w.small.count).toBe(1);
  });

  it("amount percent relative to disclosed amounts, hidden excluded", () => {
    const w = smallDonationsImpact(h([[500, 2], [9000, 1]], 100), 10);
    expect(w.small.amountMinor).toBe(1000);
    expect(w.disclosedAmountMinor).toBe(10000);
    expect(w.amountPercent).toBe(10);
    expect(w.countPercent).toBeCloseTo(66.6667, 3);
    expect(w.hidden).toBe(100);
  });

  it("mean", () => {
    const w = smallDonationsImpact(h([[1000, 1], [2000, 1], [3500, 1]]), 10);
    expect(w.meanMinor).toBe(2166.6666666666665);
  });

  it("median: odd count", () => {
    const w = smallDonationsImpact(h([[3000, 1], [100, 1], [500, 1]]), 10);
    expect(w.medianMinor).toBe(500);
  });

  it("median: even count is the mean of the two middle values", () => {
    const w = smallDonationsImpact(h([[100, 1], [200, 1], [400, 1], [1000, 1]]), 10);
    expect(w.medianMinor).toBe(300);
  });

  it("median: middle values in different buckets and in the same one", () => {
    expect(smallDonationsImpact(h([[100, 2], [300, 2]]), 10).medianMinor).toBe(200);
    expect(smallDonationsImpact(h([[100, 1], [300, 4]]), 10).medianMinor).toBe(300);
    expect(smallDonationsImpact(h([[500, 4]]), 10).medianMinor).toBe(500);
  });

  it("ranges: upper bounds inclusive", () => {
    const w = smallDonationsImpact(
      h([[100, 1], [500, 1], [501, 1], [1000, 1], [2000, 1], [5000, 1], [10000, 1], [20000, 1], [50000, 1], [50001, 1]]),
      10,
    );
    expect(w.ranges.map((p) => p.label)).toEqual([
      "1-5 zł", "5-10 zł", "10-20 zł", "20-50 zł", "50-100 zł", "100-200 zł", "200-500 zł", "500+ zł",
    ]);
    expect(w.ranges.map((p) => p.count)).toEqual([2, 2, 1, 1, 1, 1, 1, 1]);
    expect(w.ranges[0]!.amountMinor).toBe(600);
  });

  it("amounts below 1 zl fall into the first range", () => {
    const w = smallDonationsImpact(h([[50, 2]]), 10);
    expect(w.ranges[0]!.count).toBe(2);
  });

  it("does not mutate input and handles thousands of unique amounts", () => {
    const amounts: Array<[number, number]> = [];
    for (let i = 20000; i >= 1; i--) amounts.push([i, 1]);
    const input = h(amounts);
    const w = smallDonationsImpact(input, 100);
    expect(input.amounts[0]![0]).toBe(20000);
    expect(w.small.count).toBe(10000);
    expect(w.medianMinor).toBe(10000.5);
  });
});
