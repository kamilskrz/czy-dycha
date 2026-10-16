import { describe, expect, it } from "vitest";
import { formatCount, formatDay, formatLastSync, formatPercent, formatPLN, pluralPl } from "./format";

// Intl używa twardych spacji; porównujemy po ich normalizacji.
const norm = (s: string) => s.replace(/\s/g, " ");

describe("format", () => {
  it("formats minor units as PLN", () => {
    expect(norm(formatPLN(1234))).toBe("12,34 zł");
    expect(norm(formatPLN(123456789))).toBe("1 234 567,89 zł");
  });
  it("formats percent with one decimal and comma", () => {
    expect(formatPercent(12.345)).toBe("12,3%");
    expect(formatPercent(0)).toBe("0,0%");
  });
  it("formats counts with grouping", () => {
    expect(norm(formatCount(12345))).toBe("12 345");
  });
  it("picks the right Polish plural form", () => {
    const f = (n: number) => pluralPl(n, "minutę", "minuty", "minut");
    expect([1, 2, 4, 5, 12, 14, 22, 25, 112].map(f)).toEqual([
      "minutę", "minuty", "minuty", "minut", "minut", "minut", "minuty", "minut", "minut",
    ]);
  });
  it("formats last sync relative to now", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    expect(formatLastSync(null, now)).toBe("jeszcze nie synchronizowano");
    expect(formatLastSync("2026-01-10T11:59:40Z", now)).toBe("przed chwilą");
    expect(formatLastSync("2026-01-10T12:05:00Z", now)).toBe("przed chwilą"); // zegar z przyszłości
    expect(formatLastSync("2026-01-10T11:58:00Z", now)).toBe("2 minuty temu");
    expect(formatLastSync("2026-01-10T07:00:00Z", now)).toBe("5 godzin temu");
    expect(norm(formatLastSync("2026-01-01T10:30:00Z", now))).toContain("2026");
    expect(formatLastSync("nonsense", now)).toBe("nieznany");
  });
  it("formats donation day", () => {
    expect(norm(formatDay("2024-03-05"))).toContain("2024");
    expect(formatDay("bad")).toBe("bad");
  });
});
