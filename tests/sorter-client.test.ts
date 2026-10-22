import assert from "node:assert/strict";
import test from "node:test";
import { credentialsFor, REFUSED_MESSAGE, resetSorterSessions, sorterFetch } from "../src/lib/sorter-client";

type Call = { url: string; headers: Headers; credentials?: RequestCredentials; method: string };

function fakeServer(script: (call: Call, n: { shakes: number }) => Response) {
  const calls: Call[] = [];
  const n = { shakes: 0 };
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), headers: new Headers(init.headers), credentials: init.credentials, method: init.method ?? "GET" };
    calls.push(call);
    if (call.url.endsWith("?action=handshake")) n.shakes += 1;
    return script(call, n);
  }) as typeof fetch;
  return { calls, fetcher, n };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const API = "https://wengindustries.com/app/taxes/sorter/api.php";

test("handshake once, app header on every call, CSRF token on POSTs", async () => {
  resetSorterSessions();
  const { calls, fetcher, n } = fakeServer((call) => (call.url.endsWith("?action=handshake") ? json(200, { ok: true, csrf: "tok" }) : json(200, { ok: true })));
  await sorterFetch(API, {}, fetcher);
  await sorterFetch(`${API}?owed=a.md`, {}, fetcher);
  await sorterFetch(API, { method: "POST", body: "x" }, fetcher);
  assert.equal(n.shakes, 1);
  for (const call of calls) assert.equal(call.headers.get("X-Taxes-App"), "1");
  assert.equal(calls[1].headers.get("X-Taxes-Csrf"), null, "GET carries no CSRF header");
  assert.equal(calls[3].headers.get("X-Taxes-Csrf"), "tok");
  assert.equal(calls[3].credentials, "include", "the API is on another origin than the test page");
});

test("an expired session (403) gets one fresh handshake and one retry", async () => {
  resetSorterSessions();
  let listed = 0;
  const { fetcher, n } = fakeServer((call, state) => {
    if (call.url.endsWith("?action=handshake")) return json(200, { ok: true, csrf: `tok${state.shakes}` });
    listed += 1;
    return listed === 1 ? json(403, { ok: false, error: "forbidden" }) : json(200, { ok: true });
  });
  const response = await sorterFetch(API, {}, fetcher);
  assert.equal(response.status, 200);
  assert.equal(n.shakes, 2);

  resetSorterSessions();
  const always = fakeServer((call) => (call.url.endsWith("?action=handshake") ? json(200, { ok: true, csrf: "t" }) : json(403, { ok: false, error: "forbidden" })));
  assert.equal((await sorterFetch(API, {}, always.fetcher)).status, 403, "only one retry");
  assert.equal(always.n.shakes, 2);
});

test("parallel calls that hit an expired session share one new handshake", async () => {
  resetSorterSessions();
  let expired = true;
  const { fetcher, n } = fakeServer((call) => {
    if (call.url.endsWith("?action=handshake")) {
      if (n.shakes > 1) expired = false;
      return json(200, { ok: true, csrf: `tok${n.shakes}` });
    }
    return expired ? json(403, { ok: false, error: "forbidden" }) : json(200, { ok: true });
  });
  const results = await Promise.all([sorterFetch(API, {}, fetcher), sorterFetch(`${API}?owed=a.md`, {}, fetcher)]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  assert.equal(n.shakes, 2, "one initial handshake, one shared retry handshake");
});

test("a refused handshake explains the allowlist; network errors still throw TypeError", async () => {
  resetSorterSessions();
  const refused = fakeServer(() => json(403, { ok: false, error: "forbidden" }));
  await assert.rejects(sorterFetch(API, {}, refused.fetcher), new Error(REFUSED_MESSAGE));
  resetSorterSessions();
  const down = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await assert.rejects(sorterFetch(API, {}, down), TypeError);
});

test("credentials: same-origin on the live site, include for the dev server", () => {
  assert.equal(credentialsFor("https://wengindustries.com/app/taxes/sorter/api.php", "https://wengindustries.com"), "same-origin");
  assert.equal(credentialsFor("http://localhost:8888/weng/app/taxes/sorter/api.php", "http://localhost:43123"), "include");
});
