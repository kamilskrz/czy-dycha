// Konfiguracja ze zmiennych środowiskowych. Wartości domyślne żyją w synchronizatorze i adapterze
// (jedno źródło prawdy); tutaj przekazujemy dalej tylko to, co faktycznie ustawiono.
import type { AdapterOptions } from "../adapter/siepomaga";
import type { SynchronizerOptions } from "../sync/synchronizer";

type Env = Record<string, string | undefined>;

export interface Config {
  synchronizer: Pick<
    SynchronizerOptions,
    "requestDelayMs" | "minIntervalMs" | "failureCooldownMs" | "maxRetries" | "backoffBaseMs" | "backoffMaxMs"
  >;
  adapter: Pick<AdapterOptions, "timeoutMs">;
}

/** Błędna wartość zmiennej środowiskowej; komunikat jest po polsku, bo trafia do użytkownika. */
export class ConfigError extends Error {
  constructor(
    readonly variable: string,
    readonly value: string,
    readonly min: number,
  ) {
    super(`Zmienna środowiskowa ${variable} musi być liczbą całkowitą >= ${min}, a ma wartość "${value}".`);
    this.name = "ConfigError";
  }
}

/** Zwraca liczbę całkowitą >= min albo undefined, gdy zmienna nie jest ustawiona. Błędna wartość to błąd startu. */
function readInteger(env: Env, name: string, min: number): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;
  if (!/^\d+$/.test(raw) || Number(raw) < min) {
    throw new ConfigError(name, raw, min);
  }
  return Number(raw);
}

function defined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function readConfig(env: Env = process.env): Config {
  return {
    synchronizer: defined({
      requestDelayMs: readInteger(env, "SYNC_REQUEST_DELAY_MS", 0),
      minIntervalMs: readInteger(env, "SYNC_MIN_INTERVAL_MS", 0),
      failureCooldownMs: readInteger(env, "SYNC_FAILURE_COOLDOWN_MS", 0),
      maxRetries: readInteger(env, "SYNC_MAX_RETRIES", 0),
      backoffBaseMs: readInteger(env, "SYNC_BACKOFF_BASE_MS", 0),
      backoffMaxMs: readInteger(env, "SYNC_BACKOFF_MAX_MS", 0),
    }),
    adapter: defined({
      timeoutMs: readInteger(env, "SIEPOMAGA_REQUEST_TIMEOUT_MS", 1),
    }),
  };
}
