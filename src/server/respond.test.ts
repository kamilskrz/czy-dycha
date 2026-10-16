import { describe, expect, it } from "vitest";
import { IncompatibleDatabaseError } from "../store/store";
import { ConfigError } from "./config";
import { respond } from "./respond";
import type { Runtime } from "./runtime";

describe("respond", () => {
  it("returns a Polish 500 with a code when opening the runtime fails", async () => {
    const res = await respond(() => ({ status: 200, body: {} }), () => { throw new Error("EACCES"); });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("database-unavailable");
    expect(body.message).toContain("DB_PATH");
    expect(body.message).not.toContain("EACCES");
  });

  it("tells the user to delete an incompatible database file", async () => {
    const res = await respond(() => ({ status: 200, body: {} }), () => { throw new IncompatibleDatabaseError(); });
    const body = (await res.json()) as { code: string; message: string };
    expect(res.status).toBe(500);
    expect(body.code).toBe("database-incompatible");
    expect(body.message).toContain("usuń plik bazy");
  });

  it("reports an invalid environment variable by name instead of blaming the database", async () => {
    const res = await respond(() => ({ status: 200, body: {} }), () => { throw new ConfigError("SYNC_MAX_RETRIES", "abc", 0); });
    const body = (await res.json()) as { code: string; message: string };
    expect(res.status).toBe(500);
    expect(body.code).toBe("invalid-config");
    expect(body.message).toContain("SYNC_MAX_RETRIES");
    expect(body.message).not.toContain("bazy danych");
  });

  it("passes the handler result through when the runtime opens", async () => {
    const res = await respond(() => ({ status: 202, body: { ok: true } }), () => ({}) as Runtime);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
  });
});
