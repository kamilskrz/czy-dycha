import { describe, expect, it } from "vitest";
import { smallDonationsImpact } from "@/stats";
import { rangeRows } from "./ranges";

describe("rangeRows", () => {
  it("adds count shares that sum to 100", () => {
    const impact = smallDonationsImpact({ amounts: [[500, 1], [1500, 3]], hidden: 0 }, 10);
    const rows = rangeRows(impact);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ label: "1-5 zł", count: 1, sharePercent: 25 });
    expect(rows.reduce((a, r) => a + r.sharePercent, 0)).toBeCloseTo(100);
  });
  it("gives zero shares with no disclosed donations", () => {
    const rows = rangeRows(smallDonationsImpact({ amounts: [], hidden: 4 }, 10));
    expect(rows.every((r) => r.sharePercent === 0)).toBe(true);
  });
});
