import { describe, expect, it } from "vitest";
import type { ProgressBody } from "@/server/handlers";
import { describeProgress, phaseAnnouncement } from "./progress-view";

const base: ProgressBody = { state: "running", downloaded: 120, expected: 400, lastSyncAt: null, isPartial: true };

describe("describeProgress", () => {
  it("shows a connecting state before the first response", () => {
    expect(describeProgress(null)).toMatchObject({ phase: "connecting", ratio: null, isPartial: true });
  });
  it("computes the ratio and label while downloading", () => {
    const v = describeProgress(base);
    expect(v.phase).toBe("downloading");
    expect(v.ratio).toBeCloseTo(0.3);
    expect(v.label.replace(/\s/g, " ")).toBe("Pobrano 120 z ok. 400 wpłat");
  });
  it("caps the ratio when the portal estimate is exceeded", () => {
    expect(describeProgress({ ...base, downloaded: 500 }).ratio).toBe(1);
  });
  it("has no ratio and no total when expected is unknown", () => {
    const v = describeProgress({ ...base, expected: null });
    expect(v.ratio).toBeNull();
    expect(v.label).toBe("Pobrano 120 wpłat");
  });
  it("marks complete as not partial", () => {
    expect(describeProgress({ ...base, state: "complete", isPartial: false })).toMatchObject({ phase: "complete", ratio: 1, isPartial: false });
  });
  it("keeps failed results partial", () => {
    expect(describeProgress({ ...base, state: "failed" })).toMatchObject({ phase: "failed", isPartial: true });
  });
});

describe("phaseAnnouncement", () => {
  it("announces only start and end, the same text for the whole download", () => {
    expect(phaseAnnouncement("connecting")).toBe(phaseAnnouncement("downloading"));
    expect(phaseAnnouncement("complete")).toBe("Pobieranie zakończone.");
    expect(phaseAnnouncement("failed")).toBe("");
  });
});
