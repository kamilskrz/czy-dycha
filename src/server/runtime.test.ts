import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("czydycha.runtime")];
  vi.resetModules();
});

describe("getRuntime", () => {
  it("returns one instance per process, also after the module is reloaded (HMR)", async () => {
    vi.stubEnv("DB_PATH", ":memory:");
    const first = (await import("./runtime")).getRuntime();
    expect((await import("./runtime")).getRuntime()).toBe(first);
    vi.resetModules();
    const reloaded = (await import("./runtime")).getRuntime();
    expect(reloaded).toBe(first);
    expect(reloaded.synchronizer).toBe(first.synchronizer);
    expect(reloaded.store).toBe(first.store);
  });
});
