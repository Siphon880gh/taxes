import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const hasPhp = spawnSync("php", ["-v"], { stdio: "ignore" }).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sorter-php-"));
const sorterDir = path.join(tmp, "sorter");
fs.mkdirSync(sorterDir);
fs.copyFileSync(new URL("../sorter/api.php", import.meta.url), path.join(sorterDir, "api.php"));
// The allowlist comes from app-config.php beside api.php; this one replaces the defaults.
const APP_ORIGIN = "http://localhost:8888";
fs.writeFileSync(path.join(sorterDir, "app-config.php"), `<?php return ["origins" => ["${APP_ORIGIN}", "https://app.test"]];\n`);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function makeZip(entries) {
  const dest = path.join(tmp, "fixture.zip");
  const script = `
import json, sys, zipfile
entries = json.loads(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], "w") as zf:
    for name, text in entries.items():
        zf.writestr(name, text)
`;
  const run = spawnSync("python3", ["-c", script, JSON.stringify(entries), dest], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  return dest;
}

const port = await freePort();
const php = hasPhp ? spawn("php", ["-S", `127.0.0.1:${port}`, "-t", tmp], { stdio: "ignore" }) : null;
const base = `http://127.0.0.1:${port}/sorter/api.php`;

async function ready() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(base);
      if (response.status) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("php server did not start");
}

// The app's side of the gate: Origin + X-Taxes-App on every call, a handshake cookie, and the CSRF token on POSTs.
const jar = { cookie: "", csrf: "" };
function cookieOf(response) {
  const line = response.headers.getSetCookie().find((c) => c.startsWith("taxes_sorter="));
  return line ? line.split(";")[0] : "";
}
async function handshake(headers = { Origin: APP_ORIGIN, "X-Taxes-App": "1" }) {
  return fetch(`${base}?action=handshake`, { headers });
}
async function app(url, init = {}) {
  if (!jar.cookie) {
    const response = await handshake();
    jar.cookie = cookieOf(response);
    jar.csrf = (await response.json()).csrf;
  }
  const headers = { Origin: APP_ORIGIN, "X-Taxes-App": "1", Cookie: jar.cookie, ...(init.headers || {}) };
  if ((init.method || "GET") === "POST") headers["X-Taxes-Csrf"] = jar.csrf;
  return fetch(url, { ...init, headers });
}
function sign(purpose, payload) {
  const secret = fs.readFileSync(path.join(sorterDir, ".app-secret.php"), "utf8").match(/'([0-9a-f]{64})'/)[1];
  return crypto.createHmac("sha256", secret).update(`${purpose}|${payload}`).digest("hex");
}

test("api.php answers only the app: origin allowlist, app header, session cookie, CSRF on POST", { skip: hasPhp ? false : "php is not installed" }, async () => {
  await ready();
  const expectForbidden = async (response, label) => {
    assert.equal(response.status, 403, label);
    assert.deepEqual(await response.json(), { ok: false, error: "forbidden" }, label);
    assert.match(response.headers.get("cache-control") || "", /no-store/, label);
  };
  await expectForbidden(await fetch(base), "no origin, no header, no cookie");
  await expectForbidden(await fetch(base, { headers: { Origin: APP_ORIGIN } }), "no app header");
  await expectForbidden(await fetch(base, { headers: { "X-Taxes-App": "1" } }), "no origin or referer");
  const foreign = await fetch(base, { headers: { Origin: "https://evil.example", "X-Taxes-App": "1" } });
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
  await expectForbidden(foreign, "foreign origin");
  await expectForbidden(await fetch(base, { headers: { Origin: "https://wengindustries.com", "X-Taxes-App": "1" } }), "default origin replaced by app-config.php");
  await expectForbidden(await fetch(base, { headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1" } }), "no session cookie");

  const badPreflight = await fetch(base, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Headers": "x-taxes-app" } });
  assert.equal(badPreflight.status, 403);
  const preflight = await fetch(base, { method: "OPTIONS", headers: { Origin: "https://app.test", "Access-Control-Request-Headers": "x-taxes-app" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://app.test");
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
  assert.match(preflight.headers.get("access-control-allow-headers") || "", /X-Taxes-App/);

  const refusedShake = await handshake({ Origin: "https://evil.example", "X-Taxes-App": "1" });
  assert.equal(cookieOf(refusedShake), "");
  await expectForbidden(refusedShake, "handshake from a foreign origin");
  await expectForbidden(await handshake({ Origin: APP_ORIGIN }), "handshake without the app header");

  const shake = await handshake();
  assert.equal(shake.status, 200);
  const setCookie = shake.headers.getSetCookie().find((c) => c.startsWith("taxes_sorter=")) || "";
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\/sorter\//i);
  assert.doesNotMatch(setCookie, /Secure/i, "plain http: no Secure flag");
  const { csrf } = await shake.json();
  const cookie = cookieOf(shake);
  assert.equal(fs.existsSync(path.join(sorterDir, ".app-secret.php")), true);

  const listed = await fetch(base, { headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1", Cookie: cookie } });
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).ok, true);
  const viaReferer = await fetch(base, { headers: { Referer: `${APP_ORIGIN}/weng/app/taxes/out/index.html`, "X-Taxes-App": "1", Cookie: cookie } });
  assert.equal(viaReferer.status, 200, "same-origin GET without Origin uses the Referer");
  await expectForbidden(await fetch(base, { headers: { Referer: "https://evil.example/x", "X-Taxes-App": "1", Cookie: cookie } }), "foreign referer");
  await expectForbidden(await fetch(base, { headers: { Origin: "https://evil.example", "X-Taxes-App": "1", Cookie: cookie } }), "valid cookie, foreign origin");

  const post = (headers) => fetch(base, { method: "POST", body: form("status", {}), headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1", Cookie: cookie, ...headers } });
  await expectForbidden(await post({}), "POST without CSRF");
  await expectForbidden(await post({ "X-Taxes-Csrf": "0".repeat(64) }), "POST with a wrong CSRF token");
  assert.equal((await post({ "X-Taxes-Csrf": csrf })).status, 200);
  await expectForbidden(await fetch(base, { method: "POST", body: form("status", {}), headers: { Referer: `${APP_ORIGIN}/`, "X-Taxes-App": "1", Cookie: cookie, "X-Taxes-Csrf": csrf } }), "POST must carry Origin");

  const [, issued, nonce] = cookie.match(/^taxes_sorter=(\d+)\.([0-9a-f]{32})\.[0-9a-f]{64}$/);
  const tampered = `taxes_sorter=${Number(issued) + 1}.${nonce}.${cookie.slice(-64)}`;
  await expectForbidden(await fetch(base, { headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1", Cookie: tampered } }), "tampered cookie");
  const old = `${Math.floor(Date.now() / 1000) - 13 * 60 * 60}.${nonce}`;
  await expectForbidden(await fetch(base, { headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1", Cookie: `taxes_sorter=${old}.${sign("session", old)}` } }), "expired cookie");
  const recent = `${Math.floor(Date.now() / 1000) - 60}.${nonce}`;
  const fresh = await fetch(base, { headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1", Cookie: `taxes_sorter=${recent}.${sign("session", recent)}` } });
  assert.equal(fresh.status, 200, "a correctly signed, unexpired cookie passes");
});

test("php api stores a file, keeps archive folders, rejects traversal, and places a category", { skip: hasPhp ? false : "php is not installed" }, async () => {
  await ready();
  const empty = await (await app(base)).json();
  assert.equal(empty.summaries, false);
  assert.equal(empty.folders, false);

  const plain = path.join(tmp, "a1b2c3.pdf");
  fs.writeFileSync(plain, "not really");
  const uploaded = await app(base, { method: "POST", body: form("upload", { file: plain }) });
  const uploadedBody = await uploaded.json();
  assert.equal(uploadedBody.ok, true);
  assert.deepEqual(uploadedBody.stored, ["a1b2c3.pdf"]);
  const loose = await (await app(base)).json();
  assert.equal(loose.folders, false);
  assert.equal(loose.summaries, false);

  const zip = makeZip({
    "Income - Rental/Electric Bill.pdf": "bill",
    "notes/readme.txt": "hello",
  });
  const extracted = await app(base, { method: "POST", body: form("upload", { file: zip, filename: "packet.zip" }) });
  const extractedBody = await extracted.json();
  assert.equal(extractedBody.ok, true);
  assert.deepEqual(extractedBody.stored, ["Income - Rental/Electric Bill.pdf", "notes/readme.txt"]);

  const hostile = makeZip({ "../evil.txt": "no", "kept/ok.txt": "yes" });
  const rejected = await app(base, { method: "POST", body: form("upload", { file: hostile, filename: "bad.zip" }) });
  const rejectedBody = await rejected.json();
  assert.equal(rejectedBody.ok, false);
  assert.match(rejectedBody.error, /path traversal/);
  assert.equal(fs.existsSync(path.join(tmp, "evil.txt")), false);
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "evil.txt")), false);

  const tgz = path.join(tmp, "docs.tgz");
  const tar = spawnSync("python3", ["-c", `
import io, tarfile, sys
with tarfile.open(sys.argv[1], "w:gz") as tf:
    data = b"bill"
    info = tarfile.TarInfo("Income - Rental/Property 200/Electric Bill.pdf")
    info.size = len(data)
    tf.addfile(info, io.BytesIO(data))
`, tgz], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(tar.stderr);
  const tarRes = await app(base, { method: "POST", body: form("upload", { file: tgz, filename: "docs.tgz" }) });
  const tarBody = await tarRes.json();
  assert.equal(tarBody.ok, true);
  assert.deepEqual(tarBody.stored, ["Income - Rental/Property 200/Electric Bill.pdf"]);

  const status = await (await app(base)).json();
  assert.equal(status.files.some((file) => file.path === "notes/readme.txt"), true);
  assert.equal(status.files.find((file) => file.path === "notes/readme.txt").category, "notes");
  assert.equal(status.categories.includes("Income - Rental"), true);
  assert.equal(status.categories.includes("Income - Rental/Property 200"), true);
  assert.equal(status.categories.includes("notes"), true);
  assert.equal(status.folders, true);
  assert.equal(status.summaries, false);
  fs.writeFileSync(path.join(sorterDir, "stage", "Summaries.md"), "# Tax year\n");
  const withSummary = await (await app(base)).json();
  assert.equal(withSummary.summaries, true);
  assert.equal(withSummary.folders, true);
  assert.deepEqual(withSummary.owedAudits, []);
  fs.mkdirSync(path.join(sorterDir, "stage", "Tax Year"), { recursive: true });
  fs.writeFileSync(path.join(sorterDir, "stage", "Tax Year", "Owed Audit.md"), "# Owed\n\n**$4**\n");
  const withAudit = await (await app(base)).json();
  assert.deepEqual(withAudit.owedAudits, ["Tax Year/Owed Audit.md"]);
  assert.equal(withAudit.files.some((file) => file.path.endsWith("Owed Audit.md")), false);
  const opened = await (await app(`${base}?owed=${encodeURIComponent("Tax Year/Owed Audit.md")}`)).json();
  assert.equal(opened.ok, true);
  assert.match(opened.markdown, /\$4/);
  const refused = await (await app(`${base}?owed=${encodeURIComponent("notes/readme.txt")}`)).json();
  assert.equal(refused.ok, false);
  const blocked = await app(base, {
    method: "POST",
    body: form("remove", { category: "notes" }),
  });
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.ok, false);
  assert.match(blockedBody.error, /Move every document out/);
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "notes")), true);

  const placed = await app(base, {
    method: "POST",
    body: form("place", { path: "notes/readme.txt", category: "Medical" }),
  });
  const placedBody = await placed.json();
  assert.equal(placedBody.ok, true);
  assert.equal(placedBody.path, "Medical/readme.txt");
  assert.equal(placedBody.category, "Medical");
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "Medical", "readme.txt")), true);
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "notes", "readme.txt")), false);

  // Hybrid deploy: the endpoint answers any host, including requests that came through a proxy.
  const proxied = await app(base, { headers: { "X-Forwarded-For": "203.0.113.9" } });
  assert.equal(proxied.status, 200);
  assert.equal((await proxied.json()).ok, true);

  const removed = await app(base, {
    method: "POST",
    body: form("remove", { category: "notes" }),
  });
  const removedBody = await removed.json();
  assert.equal(removedBody.ok, true);
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "notes")), false);

  const escaped = await app(base, {
    method: "POST",
    body: form("place", { path: "../api.php", category: "Medical" }),
  });
  const escapedBody = await escaped.json();
  assert.equal(escapedBody.ok, false);

  const badCategory = await app(base, {
    method: "POST",
    body: form("place", { path: "Medical/readme.txt", category: "../outside" }),
  });
  const badCategoryBody = await badCategory.json();
  assert.equal(badCategoryBody.ok, false);
  assert.equal(fs.existsSync(path.join(sorterDir, "outside")), false);

  const stageDir = path.join(sorterDir, "stage");
  fs.renameSync(stageDir, path.join(tmp, "parked-stage"));
  fs.mkdirSync(stageDir);
  const placedCategory = await (await app(base)).json();
  assert.equal(placedCategory.folders, false);
  assert.equal(placedCategory.summaries, false);

  const cleared = await (await app(base)).json();
  assert.equal(cleared.folders, false);
  assert.equal(cleared.summaries, false);

  fs.mkdirSync(path.join(sorterDir, "sorted", "Income - Rental"), { recursive: true });
  const sortedFolders = await (await app(base)).json();
  assert.equal(sortedFolders.folders, true);
  assert.equal(sortedFolders.summaries, false);

  fs.rmSync(path.join(sorterDir, "sorted"), { recursive: true, force: true });
  fs.mkdirSync(path.join(sorterDir, "sorted", ".tax-sorter"), { recursive: true });
  const hiddenWork = await (await app(base)).json();
  assert.equal(hiddenWork.folders, false);
});

function form(action, fields) {
  const payload = new FormData();
  payload.append("action", action);
  if (fields.file) {
    const bytes = fs.readFileSync(fields.file);
    const name = fields.filename || path.basename(fields.file);
    payload.append("file", new Blob([bytes]), name);
  }
  if (fields.path) payload.append("path", fields.path);
  if (fields.category) payload.append("category", fields.category);
  return payload;
}

test.after(() => {
  php?.kill("SIGTERM");
  fs.rmSync(tmp, { recursive: true, force: true });
});
