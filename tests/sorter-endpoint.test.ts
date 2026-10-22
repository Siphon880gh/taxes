import assert from "node:assert/strict";
import test from "node:test";
import { isLocalHost, LOCAL_ONLY_MESSAGE, resolveSorterEndpoint, unreachableMessage } from "../src/lib/sorter-endpoint";

test("the sorter endpoint is local-only and never used from a public host", () => {
  for (const host of ["localhost", "127.0.0.1", "127.0.0.2", "::1", "[::1]", "app.localhost"]) assert.equal(isLocalHost(host), true, host);
  for (const host of ["wengindustries.com", "192.168.1.5", "10.0.0.2", "localhost.evil.com", "127.0.0.1.nip.io"]) assert.equal(isLocalHost(host), false, host);

  const remote = resolveSorterEndpoint({ hostname: "wengindustries.com", href: "https://wengindustries.com/app/taxes/out/" }, "http://localhost:8888/x/sorter/api.php");
  assert.deepEqual(remote, { ok: false, reason: "remote", message: LOCAL_ONLY_MESSAGE });
  assert.match(LOCAL_ONLY_MESSAGE, /^Available when running locally/);

  assert.deepEqual(
    resolveSorterEndpoint({ hostname: "localhost", href: "http://localhost:8888/weng/app/taxes/out/index.html" }, ""),
    { ok: true, url: "http://localhost:8888/weng/app/taxes/sorter/api.php" },
  );
  assert.deepEqual(
    resolveSorterEndpoint({ hostname: "127.0.0.1", href: "http://127.0.0.1:43123/" }, "http://localhost:8888/weng/app/taxes/sorter/api.php"),
    { ok: true, url: "http://localhost:8888/weng/app/taxes/sorter/api.php" },
  );
  const unset = resolveSorterEndpoint({ hostname: "127.0.0.1", href: "http://127.0.0.1:43123/" }, "");
  assert.equal(unset.ok, false);
  assert.match(!unset.ok ? unset.message : "", /SERVER_URL_UPLOAD_API_PHP/);
  const publicConfigured = resolveSorterEndpoint({ hostname: "localhost", href: "http://localhost:43123/" }, "https://example.com/sorter/api.php");
  assert.match(!publicConfigured.ok ? publicConfigured.message : "", /must point at localhost/);
});

test("a network failure gets the friendly message, a server error passes through", () => {
  assert.equal(unreachableMessage(new TypeError("Failed to fetch"), "http://localhost:8888/a.php"), "Could not reach http://localhost:8888/a.php. The PHP server must be running.");
  assert.equal(unreachableMessage(new Error("missing file"), "u"), "missing file");
});
