import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const hasPhp = spawnSync("php", ["-v"], { stdio: "ignore" }).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sorter-php-"));
const sorterDir = path.join(tmp, "sorter");
fs.mkdirSync(sorterDir);
fs.copyFileSync(new URL("../sorter/api.php", import.meta.url), path.join(sorterDir, "api.php"));
// The allowlist comes from app-config.php beside api.php; this one replaces the defaults.
const APP_ORIGIN = "http://localhost:8888";
// The vendored PDF reader, where the build puts it beside out/sorter/api.php.
fs.symlinkSync(fileURLToPath(new URL("../public/sorter/vendor", import.meta.url)), path.join(sorterDir, "vendor"));
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

/** A one-page PDF with a real text layer (Helvetica text objects); no lines gives a page with no text, like a scan. */
function makePdf(lines) {
  const escape = (text) => text.replace(/[()\\]/g, "\\$&");
  const content = lines.length
    ? `BT /F1 11 Tf 72 720 Td ${lines.map((line, i) => `${i ? "0 -16 Td " : ""}(${escape(line)}) Tj`).join(" ")} ET`
    : "0 0 1 rg 72 72 200 200 re f";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
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
  assert.deepEqual(withAudit.rentBreakdowns, [], "no rent breakdown yet");
  fs.writeFileSync(path.join(sorterDir, "stage", "Tax Year", "Owe Audit Breakdown - Rent.md"), "| Piece | From rental |\n|---|---|\n| Income tax | $610 |\n");
  fs.writeFileSync(path.join(sorterDir, "stage", "Tax Year", "Owe Audit Breakdown - Rent (copy).md"), "not this one");
  const withRent = await (await app(base)).json();
  assert.deepEqual(withRent.rentBreakdowns, ["Tax Year/Owe Audit Breakdown - Rent.md"], "exact name only");
  assert.deepEqual(withRent.owedAudits, ["Tax Year/Owed Audit.md"]);
  assert.equal(withRent.files.some((file) => file.path === "Tax Year/Owe Audit Breakdown - Rent.md"), false, "the report is not a document");
  const rent = await (await app(`${base}?owed=${encodeURIComponent("Tax Year/Owe Audit Breakdown - Rent.md")}`)).json();
  assert.equal(rent.ok, true);
  assert.equal(rent.path, "Tax Year/Owe Audit Breakdown - Rent.md");
  assert.match(rent.markdown, /\$610/);
  const copy = await (await app(`${base}?owed=${encodeURIComponent("Tax Year/Owe Audit Breakdown - Rent (copy).md")}`)).json();
  assert.equal(copy.ok, false, "only the exact report names can be opened");
  const climb = await (await app(`${base}?owed=${encodeURIComponent("../Owe Audit Breakdown - Rent.md")}`)).json();
  assert.equal(climb.ok, false);
  const noCookieRent = await fetch(`${base}?owed=${encodeURIComponent("Tax Year/Owe Audit Breakdown - Rent.md")}`, { headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1" } });
  assert.equal(noCookieRent.status, 403, "opening a report keeps the app-only gate");
  fs.rmSync(path.join(sorterDir, "stage", "Tax Year", "Owe Audit Breakdown - Rent (copy).md"));
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

test("api.php pdf-hints reads form names inside staged PDFs without touching them", { skip: hasPhp ? false : "php is not installed" }, async () => {
  await ready();
  assert.equal(
    fs.readFileSync(new URL("../sorter/api.php", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../public/sorter/api.php", import.meta.url), "utf8"),
    "sorter/api.php and public/sorter/api.php stay identical",
  );
  const stageDir = path.join(sorterDir, "stage");
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(stageDir, "inbox"), { recursive: true });
  const fixtures = {
    "inbox/scan-0001.pdf": makePdf(["Form W-2 Wage and Tax Statement 2026", "Copy B To Be Filed With Employee's FEDERAL Tax Return"]),
    "inbox/brokerage.pdf": makePdf(["2026 Form 1099-DIV Dividends and Distributions", "Form 1099-B Proceeds From Broker and Barter Exchange Transactions", "Form 1099-INT"]),
    "inbox/statement.pdf": makePdf(["Form 1098 Mortgage Interest Statement"]),
    "inbox/tuition.pdf": makePdf(["Form 1098-T Tuition Statement"]),
    "inbox/marketplace.pdf": makePdf(["Form 1095-A Health Insurance Marketplace Statement"]),
    "inbox/contractor.pdf": makePdf(["Form 1099-NEC Nonemployee Compensation"]),
    "inbox/last-year.pdf": makePdf(["Form 1040 U.S. Individual Income Tax Return 2025", "Attach Form(s) W-2 here. Also attach Forms W-2G and 1099-R if tax was withheld.", "Child and dependent care expenses"]),
    "inbox/phone-photo.pdf": makePdf([]),
    "inbox/broken.pdf": "not a pdf at all",
    "inbox/truncated.pdf": "%PDF-1.4\n1 0 obj\n<< /Type /Catalog",
    "inbox/notes.txt": "Form W-2",
  };
  for (const [rel, body] of Object.entries(fixtures)) fs.writeFileSync(path.join(stageDir, rel), body);
  const before = Object.keys(fixtures).map((rel) => {
    const stat = fs.statSync(path.join(stageDir, rel));
    return [rel, stat.size, stat.mtimeMs, fs.readFileSync(path.join(stageDir, rel), "utf8")];
  });

  const forbidden = await fetch(base, { method: "POST", headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1" }, body: form("pdf-hints", {}) });
  assert.equal(forbidden.status, 403, "pdf-hints keeps the app-only gate");

  const response = await app(base, { method: "POST", body: form("pdf-hints", {}) });
  const text = await response.text();
  const payload = JSON.parse(text);
  assert.equal(payload.ok, true, payload.error);
  assert.equal(payload.available, true);
  assert.equal(payload.library, "smalot/pdfparser");
  const byPath = Object.fromEntries(payload.files.map((f) => [f.path, f]));
  assert.deepEqual(Object.keys(byPath).sort(), Object.keys(fixtures).filter((rel) => rel.endsWith(".pdf")).sort(), "only PDFs");
  assert.deepEqual(byPath["inbox/scan-0001.pdf"], { path: "inbox/scan-0001.pdf", forms: ["W-2"], text: "read" });
  assert.deepEqual(byPath["inbox/brokerage.pdf"].forms, ["1099-INT", "1099-DIV", "1099-B"]);
  assert.deepEqual(byPath["inbox/statement.pdf"].forms, ["1098"]);
  assert.deepEqual(byPath["inbox/tuition.pdf"].forms, ["1098-T"], "1098-T is not also a 1098");
  assert.deepEqual(byPath["inbox/marketplace.pdf"].forms, ["1095-A"]);
  assert.deepEqual(byPath["inbox/contractor.pdf"].forms, ["1099-NEC"]);
  assert.deepEqual(byPath["inbox/last-year.pdf"].forms, ["1040"], "forms a return mentions are not counted");
  assert.deepEqual(byPath["inbox/phone-photo.pdf"], { path: "inbox/phone-photo.pdf", forms: [], text: "none" });
  assert.equal(byPath["inbox/broken.pdf"].text, "error");
  assert.deepEqual(byPath["inbox/truncated.pdf"], { path: "inbox/truncated.pdf", forms: [], text: "error" }, "a damaged PDF is reported, not fatal");
  assert.doesNotMatch(text, /Wage and Tax Statement|Nonemployee/, "the extracted text never leaves the server");
  assert.doesNotMatch(text, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "no server paths");

  // Cached answers match, and nothing in stage/ moved or changed.
  const again = await (await app(base, { method: "POST", body: form("pdf-hints", {}) })).json();
  assert.deepEqual(again.files, payload.files);
  for (const [rel, size, mtime, body] of before) {
    const stat = fs.statSync(path.join(stageDir, rel));
    assert.equal(stat.size, size, rel);
    assert.equal(stat.mtimeMs, mtime, rel);
    assert.equal(fs.readFileSync(path.join(stageDir, rel), "utf8"), body, rel);
  }
  assert.deepEqual(fs.readdirSync(path.join(stageDir, "inbox")).sort(), Object.keys(fixtures).map((rel) => rel.slice(6)).sort());
});

test("api.php AI reorganize: .env parsing, no-key warning, validated plan, one-time apply", { skip: hasPhp ? false : "php is not installed" }, async () => {
  await ready();
  const http = await import("node:http");
  const envFile = path.join(tmp, ".env");
  const stageDir = path.join(sorterDir, "stage");
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(stageDir, "inbox"), { recursive: true });
  fs.writeFileSync(path.join(stageDir, "inbox", "w2.pdf"), makePdf(["Form W-2 Wage and Tax Statement 2026"]));
  fs.writeFileSync(path.join(stageDir, "1099.pdf"), "1099");
  fs.writeFileSync(path.join(stageDir, "Summaries.md"), "# notes");
  fs.writeFileSync(path.join(stageDir, "AGENTS.md"), "# guide");
  fs.writeFileSync(path.join(stageDir, "inbox", "Owe Audit Breakdown - Rent.md"), "# rent");
  fs.writeFileSync(path.join(stageDir, "inbox", ".DS_Store"), "");
  const listed = await (await app(base)).json();
  assert.equal(listed.files.some((f) => f.path === "AGENTS.md"), false, "the uploads guide is not a document");

  // No .env: not configured, and the uploads folder is named.
  fs.rmSync(envFile, { force: true });
  const none = await (await app(`${base}?action=ai-status`)).json();
  assert.equal(none.ok, true);
  assert.equal(none.configured, false);
  assert.equal(none.reason, "No OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.");
  assert.equal(none.folder, "sorter/stage", "relative to the app folder");
  assert.equal(none.root, undefined);
  assert.doesNotMatch(JSON.stringify(none), new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const noCookie = await fetch(`${base}?action=ai-status`, { headers: { Origin: APP_ORIGIN, "X-Taxes-App": "1" } });
  assert.equal(noCookie.status, 403, "the AI actions keep the app-only gate");
  const refused = await app(base, { method: "POST", body: form("ai-plan", {}) });
  assert.equal(refused.status, 409);

  // A fake provider that answers with a plan full of bad moves and two good ones.
  const seen = [];
  const plan = {
    summary: "Sorted by form",
    moves: [
      { path: "inbox/w2.pdf", category: "Income - Wages", reason: "W-2" },
      { path: "1099.pdf", category: "../outside" },
      { path: "../api.php", category: "Deductions" },
      { path: "missing.pdf", category: "Deductions" },
      { path: "Summaries.md", category: "Deductions" },
      { path: "1099.pdf", category: ".hidden" },
      { path: "1099.pdf", category: "Income - Investments/", reason: "1099" },
      { path: "inbox/w2.pdf", category: "Deductions" },
    ],
  };
  const fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      seen.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
      const text = JSON.stringify(plan);
      const reply = req.url.endsWith("/chat/completions")
        ? { choices: [{ message: { content: text } }] }
        : { content: [{ type: "text", text: "```json\n" + text + "\n```" }] };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const fakeUrl = `http://127.0.0.1:${fake.address().port}`;
  try {
    fs.writeFileSync(
      envFile,
      [
        "# AI settings",
        "SERVER_URL_UPLOAD_API_PHP=http://localhost:8888/sorter/api.php",
        "export AI_PROVIDER=chatgpt   # alias for openai",
        'AI_MODEL="test-model # kept"',
        "OPENAI_API_KEY='sk-test-openai'",
        `OPENAI_BASE_URL=${fakeUrl}/v1/`,
        "",
      ].join("\n"),
    );
    const statusResponse = await app(`${base}?action=ai-status`);
    const statusText = await statusResponse.text();
    assert.doesNotMatch(statusText, /sk-test/);
    const status = JSON.parse(statusText);
    assert.equal(status.configured, true);
    assert.equal(status.provider, "openai");
    assert.equal(status.model, "test-model # kept");

    const planned = await (await app(base, { method: "POST", body: form("ai-plan", {}) })).json();
    assert.equal(planned.ok, true, planned.error);
    assert.deepEqual(
      planned.moves.map((m) => [m.path, m.category]),
      [
        ["inbox/w2.pdf", "Income - Wages"],
        ["1099.pdf", "Income - Investments"],
      ],
    );
    assert.equal(planned.skipped, 6);
    assert.equal(planned.summary, "Sorted by form");
    assert.equal(seen[0].url, "/v1/chat/completions");
    assert.equal(seen[0].headers.authorization, "Bearer sk-test-openai");
    assert.equal(seen[0].body.model, "test-model # kept");
    const prompt = JSON.stringify(seen[0].body.messages);
    assert.match(prompt, /inbox\/w2\.pdf  \(\d+ bytes\)  reads as: W-2/, "the plan input carries the form read inside the PDF");
    assert.doesNotMatch(prompt, /Wage and Tax Statement 2026/, "only the hint goes out, not the PDF text");
    assert.match(prompt, /1099\.pdf  \(4 bytes\)\\n|1099\.pdf  \(4 bytes\)"/, "a file that is not a readable PDF gets no hint");
    assert.doesNotMatch(prompt, /Summaries\.md/);
    assert.doesNotMatch(prompt, /Owe Audit Breakdown/, "the rent breakdown stays where the skill wrote it");
    assert.doesNotMatch(prompt, /\.DS_Store/);

    const apply = (moves, token, keep) => {
      const payload = form("ai-apply", {});
      payload.append("plan", JSON.stringify(moves));
      payload.append("token", token);
      payload.append("keep", keep);
      return app(base, { method: "POST", body: payload });
    };
    const tampered = planned.moves.map((m) => ({ ...m, category: "../escape" }));
    assert.equal((await apply(tampered, planned.token, "0,1")).status, 409);
    assert.equal(fs.existsSync(path.join(sorterDir, "escape")), false);

    const applied = await (await apply(planned.moves, planned.token, "0")).json();
    assert.equal(applied.ok, true, applied.error);
    assert.deepEqual(applied.moved.map((m) => m.path), ["Income - Wages/w2.pdf"]);
    assert.equal(fs.existsSync(path.join(stageDir, "Income - Wages", "w2.pdf")), true);
    assert.equal(fs.existsSync(path.join(stageDir, "1099.pdf")), true, "unchecked moves stay put");
    const replay = await apply(planned.moves, planned.token, "1");
    assert.equal(replay.status, 409, "a plan token works once");
    assert.equal(fs.existsSync(path.join(stageDir, "1099.pdf")), true);

    // Claude: provider alias, x-api-key header, and a fenced JSON reply.
    fs.writeFileSync(envFile, `AI_PROVIDER=claude\nANTHROPIC_API_KEY=sk-ant-test\nANTHROPIC_BASE_URL=${fakeUrl}\n`);
    const claudeStatus = await (await app(`${base}?action=ai-status`)).json();
    assert.equal(claudeStatus.provider, "anthropic");
    assert.equal(claudeStatus.model, "claude-sonnet-4-5");
    const claudePlan = await (await app(base, { method: "POST", body: form("ai-plan", {}) })).json();
    assert.equal(claudePlan.ok, true, claudePlan.error);
    assert.deepEqual(claudePlan.moves.map((m) => m.path), ["1099.pdf"]);
    const last = seen[seen.length - 1];
    assert.equal(last.url, "/v1/messages");
    assert.equal(last.headers["x-api-key"], "sk-ant-test");

    fs.writeFileSync(envFile, "AI_PROVIDER=anthropic\nOPENAI_API_KEY=sk-test\n");
    const missing = await (await app(`${base}?action=ai-status`)).json();
    assert.equal(missing.configured, false);
    assert.equal(missing.reason, "ANTHROPIC_API_KEY is not set in .env.");
  } finally {
    fake.close();
    fs.rmSync(envFile, { force: true });
  }
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
