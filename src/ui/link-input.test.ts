import { describe, expect, it } from "vitest";
import { normalizeLinkInput } from "./link-input";

describe("normalizeLinkInput", () => {
  it("rejects empty input", () => {
    expect(normalizeLinkInput("   ").ok).toBe(false);
  });
  it("turns a bare slug into a link", () => {
    expect(normalizeLinkInput(" pomoc-dla-ani ")).toEqual({ ok: true, link: "https://www.siepomaga.pl/pomoc-dla-ani" });
  });
  it("passes links through for the server to recognise", () => {
    expect(normalizeLinkInput("https://www.siepomaga.pl/ania")).toEqual({ ok: true, link: "https://www.siepomaga.pl/ania" });
    expect(normalizeLinkInput("siepomaga.pl/ania")).toEqual({ ok: true, link: "siepomaga.pl/ania" });
  });
  it("rejects text with whitespace or without a dot", () => {
    expect(normalizeLinkInput("dwa slowa").ok).toBe(false);
    expect(normalizeLinkInput("zł!?").ok).toBe(false);
  });
});
