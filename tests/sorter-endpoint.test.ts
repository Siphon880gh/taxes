import assert from "node:assert/strict";
import test from "node:test";
import { isLocalHost, resolveSorterEndpoint, unreachableMessage } from "../src/lib/sorter-endpoint";

const LOCAL_URL = "http://localhost:8888/weng/app/taxes/sorter/api.php";

test("isLocalHost recognises loopback names only", () => {
  for (const host of ["localhost", "127.0.0.1", "127.0.0.2", "::1", "[::1]", "app.localhost"]) assert.equal(isLocalHost(host), true, host);
  for (const host of ["wengindustries.com", "192.168.1.5", "10.0.0.2", "localhost.evil.com", "127.0.0.1.nip.io"]) assert.equal(isLocalHost(host), false, host);
});

test("the live site calls the api.php next to out/, even when the build carries a localhost URL", () => {
  for (const configured of [LOCAL_URL, ""]) {
    assert.deepEqual(
      resolveSorterEndpoint({ hostname: "wengindustries.com", href: "https://wengindustries.com/app/taxes/out/" }, configured),
      { ok: true, url: "https://wengindustries.com/app/taxes/sorter/api.php" },
      configured || "unset",
    );
  }
  assert.deepEqual(
    resolveSorterEndpoint({ hostname: "wengindustries.com", href: "https://wengindustries.com/app/taxes/out/index.html" }, ""),
    { ok: true, url: "https://wengindustries.com/app/taxes/sorter/api.php" },
  );
});

test("locally the configured URL or the sibling sorter/api.php is used", () => {
  assert.deepEqual(resolveSorterEndpoint({ hostname: "localhost", href: "http://localhost:43123/" }, LOCAL_URL), { ok: true, url: LOCAL_URL });
  // 127.0.0.1 and localhost are different sites for the session cookie: keep the page's loopback name.
  assert.deepEqual(
    resolveSorterEndpoint({ hostname: "127.0.0.1", href: "http://127.0.0.1:43123/" }, LOCAL_URL),
    { ok: true, url: "http://127.0.0.1:8888/weng/app/taxes/sorter/api.php" },
  );
  assert.deepEqual(
    resolveSorterEndpoint({ hostname: "localhost", href: "http://localhost:43123/" }, "http://127.0.0.1:8888/x/sorter/api.php"),
    { ok: true, url: "http://localhost:8888/x/sorter/api.php" },
  );
  assert.deepEqual(
    resolveSorterEndpoint({ hostname: "localhost", href: "http://localhost:8888/weng/app/taxes/out/index.html" }, ""),
    { ok: true, url: LOCAL_URL },
  );
  const unset = resolveSorterEndpoint({ hostname: "127.0.0.1", href: "http://127.0.0.1:43123/" }, "");
  assert.equal(unset.ok, false);
  assert.match(!unset.ok ? unset.message : "", /SERVER_URL_UPLOAD_API_PHP/);
});

test("a public or relative configured URL is used on any host", () => {
  assert.deepEqual(
    resolveSorterEndpoint({ hostname: "localhost", href: "http://localhost:43123/" }, "https://example.com/sorter/api.php"),
    { ok: true, url: "https://example.com/sorter/api.php" },
  );
  assert.deepEqual(
    resolveSorterEndpoint({ hostname: "wengindustries.com", href: "https://wengindustries.com/app/taxes/out/" }, "../sorter/api.php"),
    { ok: true, url: "https://wengindustries.com/app/taxes/sorter/api.php" },
  );
});

test("a network failure gets the friendly message, a server error passes through", () => {
  assert.equal(unreachableMessage(new TypeError("Failed to fetch"), "http://localhost:8888/a.php"), "Could not reach http://localhost:8888/a.php. The PHP server must be running.");
  assert.equal(unreachableMessage(new Error("missing file"), "u"), "missing file");
});
