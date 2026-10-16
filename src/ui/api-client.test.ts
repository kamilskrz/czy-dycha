import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, REQUEST_TIMEOUT_MS } from "./api-client";

// Atrapa fetch, która respektuje sygnał przerwania, jak prawdziwa.
function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;
}

const jsonResponse = (text: string, status = 200) => new Response(text, { status });

describe("api client", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse('{"a":1}'));
    await expect(api.getProgress("x")).resolves.toEqual({ a: 1 });
  });

  it("maps a null body on 2xx to invalid-response", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse("null"));
    await expect(api.getProgress("x")).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("maps a non-JSON body on 2xx to invalid-response", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse("<html>"));
    await expect(api.getProgress("x")).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("uses the server error code and message on failure", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse('{"code":"bad","message":"Zle"}', 400));
    await expect(api.getProgress("x")).rejects.toMatchObject({ status: 400, code: "bad", message: "Zle" });
  });

  it("times out a request that never answers as network-error", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const result = api.getProgress("x").catch((e) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    const err = await result;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: "network-error" });
  });

  it("times out a response whose body hangs", async () => {
    vi.stubGlobal("fetch", (async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch);
    const result = api.getProgress("x").catch((e) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await result).toMatchObject({ status: 0, code: "network-error" });
  });

  it("maps a body read failure to network-error", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, text: () => Promise.reject(new TypeError("boom")) }));
    await expect(api.getProgress("x")).rejects.toMatchObject({ code: "network-error" });
  });

  it("re-throws AbortError when the caller aborts", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ac = new AbortController();
    const result = api.getDaily("x", 10, ac.signal).catch((e) => e);
    ac.abort();
    const err = await result;
    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as Error).name).toBe("AbortError");
  });

  it("re-throws AbortError for an already aborted signal", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ac = new AbortController();
    ac.abort();
    const err = await api.getDaily("x", 10, ac.signal).catch((e) => e);
    expect((err as Error).name).toBe("AbortError");
  });
});
