import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AdapterError, fetchPage, resolveFundraiser } from "./siepomaga";
import type { Fundraiser } from "../domain/types";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"));

/** Atrapa fetch: zwraca JSON wg dopasowania URL; zapisuje wywolane adresy. */
function mockFetch(routes: Array<[RegExp, unknown | { status: number; headers?: Record<string, string> }]>) {
  const calls: Array<{ url: string; ua: string | null }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, ua: new Headers(init?.headers).get("user-agent") });
    for (const [pattern, response] of routes) {
      if (!pattern.test(url)) continue;
      if (response && typeof response === "object" && "status" in response) {
        return new Response("{}", { status: (response as { status: number }).status, headers: (response as { headers?: Record<string, string> }).headers });
      }
      return new Response(JSON.stringify(response), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  return { fetchImpl, calls };
}

const FUNDRAISE: Fundraiser = { id: "LZSw1Ox", kind: "Fundraise", slug: "latwogang", title: "x" };
const NEEDY: Fundraiser = { id: "Z1SWZN", kind: "Needy", slug: "maksiu-mazurek", title: "x" };

describe("resolveFundraiser", () => {
  it("resolves a Fundraise and takes the title from the title field", async () => {
    const { fetchImpl, calls } = mockFetch([[/permalinks\/latwogang/, fixture("fundraise-latwogang.permalink")]]);
    const z = await resolveFundraiser("https://www.siepomaga.pl/latwogang", { fetch: fetchImpl });
    expect(z).toEqual({ id: "LZSw1Ox", kind: "Fundraise", slug: "latwogang", title: "Łatwogang x Cancer Fighters" });
    expect(calls[0].ua).toBe("czydycha-research");
    expect(calls[0].url).toBe("https://www.siepomaga.pl/api/donor/web/v2/permalinks/latwogang?locale=pl");
  });

  it("resolves a Needy (id from needy.id, title from name)", async () => {
    const { fetchImpl } = mockFetch([[/permalinks\/maksiu-mazurek/, fixture("needy-maksiu-mazurek.permalink")]]);
    const z = await resolveFundraiser("siepomaga.pl/maksiu-mazurek/", { fetch: fetchImpl });
    expect(z).toEqual({ id: "Z1SWZN", kind: "Needy", slug: "maksiu-mazurek", title: "Maksymilian Mazurek" });
  });

  it("takes expectedDonations from donors_count when present and valid", async () => {
    const base = fixture("fundraise-latwogang.permalink") as { data: { target: { fundraise: Record<string, unknown> } } };
    const withCount = (value: unknown) => ({ data: { target: { fundraise: { ...base.data.target.fundraise, donors_count: value }, needy: null } } });
    const resolve = async (value: unknown) => {
      const { fetchImpl } = mockFetch([[/permalinks/, withCount(value)]]);
      return resolveFundraiser("siepomaga.pl/latwogang", { fetch: fetchImpl });
    };
    expect((await resolve(1234)).expectedDonations).toBe(1234);
    expect((await resolve(0)).expectedDonations).toBe(0);
    for (const bad of [-1, 1.5, "12", null]) expect("expectedDonations" in (await resolve(bad))).toBe(false);
  });

  it("tolerates http, query string, fragment and host letter case", async () => {
    const { fetchImpl } = mockFetch([[/permalinks\/latwogang/, fixture("fundraise-latwogang.permalink")]]);
    const z = await resolveFundraiser("  http://WWW.Siepomaga.pl/latwogang?utm=1#abc ", { fetch: fetchImpl });
    expect(z.slug).toBe("latwogang");
  });

  it.each([
    "",
    "this is not a link",
    "https://example.com/latwogang",
    "https://www.siepomaga.pl/",
    "https://www.siepomaga.pl/pomagacze/123",
    "https://www.siepomaga.pl.evil.com/latwogang",
    "https://siepomaga.pl/%E0%A4%A",
  ])("unrecognized link %j gives a readable error without a request", async (link) => {
    const { fetchImpl, calls } = mockFetch([]);
    const error = await resolveFundraiser(link, { fetch: fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error.code).toBe("unrecognized-link");
    expect(error.message).toMatch(/siepomaga\.pl/);
    expect(calls).toHaveLength(0);
  });

  it("404 on the permalink gives a not-found error", async () => {
    const { fetchImpl } = mockFetch([[/permalinks/, { status: 404 }]]);
    const error = await resolveFundraiser("https://www.siepomaga.pl/nie-ma-takiej", { fetch: fetchImpl }).catch((e) => e);
    expect(error.code).toBe("not-found");
  });

  it("permalink without fundraise and needy (e.g. another target) is an unrecognized link", async () => {
    const { fetchImpl } = mockFetch([[/permalinks/, { data: { target: { fundraise: null, needy: null } } }]]);
    const error = await resolveFundraiser("https://www.siepomaga.pl/cos", { fetch: fetchImpl }).catch((e) => e);
    expect(error.code).toBe("unrecognized-link");
  });
});

describe("fetchPage", () => {
  it("first Fundraise page: only confirmed donations, amount in minor units, null for hidden", async () => {
    const { fetchImpl, calls } = mockFetch([[/payments/, fixture("fundraise-latwogang.payments-1")]]);
    const s = await fetchPage(FUNDRAISE, null, { fetch: fetchImpl });
    expect(calls[0].url).toBe(
      "https://www.siepomaga.pl/api/v1/payments?target_type=Fundraise&target_id=LZSw1Ox&sort_by=newest&locale=pl",
    );
    expect(calls[0].ua).toBe("czydycha-research");
    expect(s.donations).toHaveLength(7);
    expect(s.donations[0]).toEqual({
      id: "laSrX70R",
      amountMinor: 1000,
      paidAt: "2026-05-18T12:35:21.786979+02:00",
      day: "2026-05-18",
      recurring: false,
    });
    expect(s.donations[1].amountMinor).toBe(830);
    expect(s.donations.find((w) => w.id === "PJSGlWER")?.amountMinor).toBeNull();
    expect(s.nextCursor).toEqual({ afterId: "dqS0la5R", afterValue: "2026-05-06T13:34:49.603657+02:00" });
  });

  it("Needy uses target_type=Needy, passes the cursor and flags recurring donations", async () => {
    const { fetchImpl, calls } = mockFetch([[/payments/, fixture("needy-maksiu-mazurek.payments-2")]]);
    await fetchPage(NEEDY, { afterId: "xWSVM2zl", afterValue: "2026-10-12T07:01:49.581000+02:00" }, { fetch: fetchImpl });
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("target_type")).toBe("Needy");
    expect(url.searchParams.get("target_id")).toBe("Z1SWZN");
    expect(url.searchParams.get("after_id")).toBe("xWSVM2zl");
    expect(url.searchParams.get("after_value")).toBe("2026-10-12T07:01:49.581000+02:00");
    expect(url.searchParams.get("sort_by")).toBe("newest");
  });

  it("flaga constant_help daje recurring=true", async () => {
    const { fetchImpl } = mockFetch([[/payments/, fixture("needy-maksiu-mazurek.payments-1")]]);
    const s = await fetchPage(NEEDY, null, { fetch: fetchImpl });
    expect(s.donations.some((w) => w.recurring)).toBe(true);
    expect(s.donations.some((w) => !w.recurring)).toBe(true);
  });

  it("subsequent fixture pages do not overlap and the cursor points at the last item", async () => {
    const p1 = fixture("fundraise-latwogang.payments-1") as { data: Array<{ id: string }> };
    const p2 = fixture("fundraise-latwogang.payments-2");
    const { fetchImpl } = mockFetch([[/payments/, p2]]);
    const s = await fetchPage(FUNDRAISE, null, { fetch: fetchImpl });
    const ids1 = new Set(p1.data.map((p) => p.id));
    expect(s.donations.every((w) => !ids1.has(w.id))).toBe(true);
  });

  it("an empty page ends pagination (cursor null)", async () => {
    const { fetchImpl } = mockFetch([[/payments/, { data: [] }]]);
    const s = await fetchPage(FUNDRAISE, { afterId: "a", afterValue: "b" }, { fetch: fetchImpl });
    expect(s).toEqual({ donations: [], nextCursor: null });
  });

  it("drops unconfirmed donations but derives the cursor from the last item of the page", async () => {
    const item = (id: string, state: string, amount: string | null, t: string) => ({
      id, amount, currency: "PLN", state, state_changed_at: t, constant_help: false,
    });
    const page = {
      data: [
        item("a", "confirmed", "5.0", "2026-03-01T10:00:00.000000+01:00"),
        item("b", "pending", "7.0", "2026-02-28T10:00:00.000000+01:00"),
        item("c", "failed", "9.0", "2026-02-27T10:00:00.000000+01:00"),
      ],
    };
    const { fetchImpl } = mockFetch([[/payments/, page]]);
    const s = await fetchPage(FUNDRAISE, null, { fetch: fetchImpl });
    expect(s.donations.map((w) => w.id)).toEqual(["a"]);
    expect(s.nextCursor).toEqual({ afterId: "c", afterValue: "2026-02-27T10:00:00.000000+01:00" });
  });

  it("donation day computed in Europe/Warsaw (23:30 UTC is already the next day, DST change)", async () => {
    const item = (id: string, t: string) => ({ id, amount: "1.0", state: "confirmed", state_changed_at: t, constant_help: false });
    const { fetchImpl } = mockFetch([
      [/payments/, { data: [
        item("z", "2026-01-10T23:30:00.000000+00:00"),
        item("l", "2026-07-10T22:30:00.000000Z"),
        item("p", "2026-05-18T00:10:00.000000+02:00"),
        item("k", "2026-05-17T23:59:59.000000+02:00"),
      ] }],
    ]);
    const s = await fetchPage(FUNDRAISE, null, { fetch: fetchImpl });
    expect(s.donations.map((w) => w.day)).toEqual(["2026-01-11", "2026-07-11", "2026-05-18", "2026-05-17"]);
  });

  it("rounds fractional amounts without floating-point errors", async () => {
    const item = (id: string, amount: string) => ({ id, amount, state: "confirmed", state_changed_at: "2026-05-18T12:00:00+02:00", constant_help: false });
    const { fetchImpl } = mockFetch([[/payments/, { data: [item("1", "8.3"), item("2", "0.29"), item("3", "1234"), item("4", "19.99"), item("5", "0.5")] }]]);
    const s = await fetchPage(FUNDRAISE, null, { fetch: fetchImpl });
    expect(s.donations.map((w) => w.amountMinor)).toEqual([830, 29, 123400, 1999, 50]);
  });

  it("ADR 0001: result contains no payer fields or comment", async () => {
    const dirty = {
      data: [{
        id: "x", amount: "10.0", state: "confirmed", state_changed_at: "2026-05-18T12:00:00+02:00",
        constant_help: true, comment_text: "SECRET-COMMENT",
        payer: { id: "P1", name: "SECRET-NAME", avatar_url: "SECRET-AVATAR", url: "SECRET-URL", company: true },
        subject: { type: "needy", id: "Z1SWZN", title: "T", slug: "s", archival_cause_id: null },
      }],
    };
    const { fetchImpl } = mockFetch([[/payments/, dirty]]);
    const s = await fetchPage(NEEDY, null, { fetch: fetchImpl });
    expect(Object.keys(s.donations[0]).sort()).toEqual(["amountMinor", "day", "id", "paidAt", "recurring"]);
    expect(JSON.stringify(s)).not.toMatch(/SECRET/);
  });

  it("fixtures in the repo contain no payer data", () => {
    for (const n of ["fundraise-latwogang.payments-1", "fundraise-latwogang.payments-2", "needy-maksiu-mazurek.payments-1", "needy-maksiu-mazurek.payments-2"]) {
      const d = fixture(n) as { data: Array<{ payer: Record<string, unknown>; comment_text: unknown }> };
      for (const p of d.data) {
        expect(p.comment_text).toBeNull();
        expect(Object.values(p.payer).every((v) => v === null)).toBe(true);
      }
    }
  });

  it.each([
    [429, "rate-limited"],
    [503, "server-error"],
    [500, "server-error"],
    [404, "not-found"],
  ])("status %i gives error %s", async (status, code) => {
    const { fetchImpl } = mockFetch([[/payments/, { status, headers: status === 429 ? { "retry-after": "30" } : {} }]]);
    const error = await fetchPage(FUNDRAISE, null, { fetch: fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error.code).toBe(code);
    if (status === 429) expect(error.retryAfterSeconds).toBe(30);
  });

  it("passes an abort signal to fetch", async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };
    await fetchPage(FUNDRAISE, null, { fetch: fetchImpl });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("a request exceeding the timeout gives network-error", async () => {
    const hanging = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    await expect(fetchPage(FUNDRAISE, null, { fetch: hanging, timeoutMs: 5 })).rejects.toMatchObject({
      code: "network-error",
    });
  });

  it("a timeout while reading the body gives network-error, not format-error", async () => {
    const slowBody = async (_url: string | URL | Request, init?: RequestInit) =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      }) as unknown as Response;
    await expect(fetchPage(FUNDRAISE, null, { fetch: slowBody, timeoutMs: 5 })).rejects.toMatchObject({
      code: "network-error",
    });
  });

  it("a network failure gives network-error", async () => {
    const fetchImpl = async () => { throw new TypeError("fetch failed"); };
    const error = await fetchPage(FUNDRAISE, null, { fetch: fetchImpl }).catch((e) => e);
    expect(error.code).toBe("network-error");
  });

  it("an unexpected response format gives format-error", async () => {
    const { fetchImpl } = mockFetch([[/payments/, { cos: 1 }]]);
    const error = await fetchPage(FUNDRAISE, null, { fetch: fetchImpl }).catch((e) => e);
    expect(error.code).toBe("format-error");
  });
});

describe("Retry-After", () => {
  const rejection = async (status: number, headers: Record<string, string>) => {
    const { fetchImpl } = mockFetch([[/payments/, { status, headers }]]);
    return (await fetchPage(FUNDRAISE, null, { fetch: fetchImpl }).catch((e) => e)) as AdapterError;
  };

  it("is passed on for 503 as well as 429", async () => {
    expect((await rejection(503, { "retry-after": "7" })).retryAfterSeconds).toBe(7);
    expect((await rejection(429, { "retry-after": "7" })).retryAfterSeconds).toBe(7);
  });

  it("is ignored for other 5xx and for garbage values", async () => {
    expect((await rejection(500, { "retry-after": "7" })).retryAfterSeconds).toBeUndefined();
    expect((await rejection(503, { "retry-after": "soon" })).retryAfterSeconds).toBeUndefined();
    expect((await rejection(503, { "retry-after": "-5" })).retryAfterSeconds).toBeUndefined();
  });

  it("understands the HTTP-date form", async () => {
    const date = new Date(Date.now() + 20_000).toUTCString();
    const seconds = (await rejection(429, { "retry-after": date })).retryAfterSeconds;
    expect(seconds).toBeGreaterThan(15);
    expect(seconds).toBeLessThanOrEqual(20);
  });
});
