import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ImpactHeader from "./ImpactHeader";
import type { SmallDonationsImpact } from "@/stats";

const impact = {
  disclosedCount: 10,
  disclosedAmountMinor: 100000,
  hidden: 0,
  small: { count: 4, amountMinor: 3000 },
  countPercent: 40,
  amountPercent: 3,
} as unknown as SmallDonationsImpact;

describe("ImpactHeader", () => {
  it("shows a fractional threshold without rounding", () => {
    const html = renderToStaticMarkup(createElement(ImpactHeader, { title: "T", impact, threshold: 8.5 }));
    expect(html).toContain("8,5 zł");
    expect(html).not.toContain("9 zł");
  });

  it("names the threshold in the section heading and labels the metrics as small donations", () => {
    const html = renderToStaticMarkup(createElement(ImpactHeader, { title: "T", impact, threshold: 10 }));
    expect(html).toContain("Wpływ małych wpłat (do 10 zł włącznie)");
    expect(html).toContain("Małe wpłaty: udział w liczbie wpłat");
    expect(html).toContain("Małe wpłaty: udział w zebranej kwocie");
  });

  it("says the download is in progress instead of claiming there are no donations", () => {
    const empty = { ...impact, disclosedCount: 0 } as SmallDonationsImpact;
    const waiting = renderToStaticMarkup(createElement(ImpactHeader, { title: "T", impact: empty, threshold: 10, pending: true }));
    expect(waiting).toContain("Pobieranie trwa");
    expect(waiting).not.toContain("Nie ma jeszcze wpłat");
    const done = renderToStaticMarkup(createElement(ImpactHeader, { title: "T", impact: empty, threshold: 10 }));
    expect(done).toContain("Nie ma jeszcze wpłat z jawną kwotą");
  });
});
