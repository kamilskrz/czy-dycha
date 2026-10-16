import { describe, expect, it } from "vitest";
import type { DailyTotals } from "@/domain/types";
import { dailyStateAfterError, type DailyState } from "./daily-state";

const data = [{ day: "2025-01-01" }] as unknown as DailyTotals[];
const prev: DailyState = { base: "slug|10", key: "slug|10|1", data, error: null };

describe("dailyStateAfterError", () => {
  it("zachowuje dane przy błędzie odświeżenia w tle dla tego samego progu", () => {
    const next = dailyStateAfterError(prev, "slug|10", "slug|10|2", "błąd");
    expect(next).toEqual({ base: "slug|10", key: "slug|10|2", data, error: "błąd" });
  });

  it("odrzuca dane po zmianie progu i kończy ładowanie", () => {
    const next = dailyStateAfterError(prev, "slug|20", "slug|20|1", "błąd");
    expect(next.data).toBeNull();
    expect(next.base).toBe("slug|20");
    expect(next.error).toBe("błąd");
  });
});
