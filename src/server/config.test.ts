import { describe, expect, it } from "vitest";
import { ConfigError, readConfig } from "./config";

describe("readConfig", () => {
  it("returns no overrides when nothing is set", () => {
    expect(readConfig({})).toEqual({ synchronizer: {}, adapter: {} });
  });

  it("treats empty strings as unset", () => {
    expect(readConfig({ SYNC_REQUEST_DELAY_MS: "", SIEPOMAGA_REQUEST_TIMEOUT_MS: "  " })).toEqual({
      synchronizer: {},
      adapter: {},
    });
  });

  it("maps every variable to its option", () => {
    const config = readConfig({
      SYNC_REQUEST_DELAY_MS: "250",
      SYNC_MIN_INTERVAL_MS: "120000",
      SYNC_FAILURE_COOLDOWN_MS: "5000",
      SYNC_MAX_RETRIES: "3",
      SYNC_BACKOFF_BASE_MS: "500",
      SYNC_BACKOFF_MAX_MS: "10000",
      SIEPOMAGA_REQUEST_TIMEOUT_MS: "8000",
    });
    expect(config).toEqual({
      synchronizer: {
        requestDelayMs: 250,
        minIntervalMs: 120000,
        failureCooldownMs: 5000,
        maxRetries: 3,
        backoffBaseMs: 500,
        backoffMaxMs: 10000,
      },
      adapter: { timeoutMs: 8000 },
    });
  });

  it("accepts zero (e.g. no delay between requests)", () => {
    expect(readConfig({ SYNC_REQUEST_DELAY_MS: "0" }).synchronizer.requestDelayMs).toBe(0);
  });

  it.each(["abc", "-1", "1.5", "1e3", "Infinity", "NaN"])("rejects invalid value %s and names the variable", (value) => {
    expect(() => readConfig({ SYNC_REQUEST_DELAY_MS: value })).toThrow(/SYNC_REQUEST_DELAY_MS/);
  });

  it("throws a ConfigError that names the variable", () => {
    expect(() => readConfig({ SYNC_MAX_RETRIES: "x" })).toThrow(ConfigError);
  });

  it("requires a positive timeout", () => {
    expect(() => readConfig({ SIEPOMAGA_REQUEST_TIMEOUT_MS: "0" })).toThrow(/SIEPOMAGA_REQUEST_TIMEOUT_MS/);
  });
});
