import { describe, expect, it } from "vitest";
import { clampToSlider, formatThresholdInput, parseThresholdInput } from "./threshold";

describe("threshold", () => {
  it("parses comma and dot decimals", () => {
    expect(parseThresholdInput("8,3")).toBe(8.3);
    expect(parseThresholdInput(" 12.5 ")).toBe(12.5);
    expect(parseThresholdInput("0")).toBe(0);
  });
  it("rejects invalid input", () => {
    for (const bad of ["", "abc", "-1", "1e3", "1.234", "1,2,3", "999999"]) {
      expect(parseThresholdInput(bad), bad).toBeNull();
    }
  });
  it("clamps to the slider range", () => {
    expect(clampToSlider(0)).toBe(0);
    expect(clampToSlider(0.4)).toBe(0);
    expect(clampToSlider(-3)).toBe(0);
    expect(clampToSlider(10.4)).toBe(10);
    expect(clampToSlider(5000)).toBe(200);
  });
  it("formats with a comma", () => {
    expect(formatThresholdInput(8.3)).toBe("8,3");
    expect(formatThresholdInput(10)).toBe("10");
  });
});
