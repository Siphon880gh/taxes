import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sorter-php-"));
const sorterDir = path.join(tmp, "sorter");
fs.mkdirSync(sorterDir);
fs.copyFileSync(new URL("../sorter/api.php", import.meta.url), path.join(sorterDir, "api.php"));

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
const php = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", tmp], { stdio: "ignore" });
const base = `http://127.0.0.1:${port}/sorter/api.php`;

async function ready() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("php server did not start");
}

test("php api stores a file, keeps archive folders, rejects traversal, and places a category", async () => {
  await ready();
  const empty = await (await fetch(base)).json();
  assert.equal(empty.summaries, false);
  assert.equal(empty.folders, false);

  const plain = path.join(tmp, "a1b2c3.pdf");
  fs.writeFileSync(plain, "not really");
  const uploaded = await fetch(base, { method: "POST", body: form("upload", { file: plain }) });
  const uploadedBody = await uploaded.json();
  assert.equal(uploadedBody.ok, true);
  assert.deepEqual(uploadedBody.stored, ["a1b2c3.pdf"]);
  const loose = await (await fetch(base)).json();
  assert.equal(loose.folders, false);
  assert.equal(loose.summaries, false);

  const zip = makeZip({
    "Income - Rental/Electric Bill.pdf": "bill",
    "notes/readme.txt": "hello",
  });
  const extracted = await fetch(base, { method: "POST", body: form("upload", { file: zip, filename: "packet.zip" }) });
  const extractedBody = await extracted.json();
  assert.equal(extractedBody.ok, true);
  assert.deepEqual(extractedBody.stored, ["Income - Rental/Electric Bill.pdf", "notes/readme.txt"]);

  const hostile = makeZip({ "../evil.txt": "no", "kept/ok.txt": "yes" });
  const rejected = await fetch(base, { method: "POST", body: form("upload", { file: hostile, filename: "bad.zip" }) });
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
  const tarRes = await fetch(base, { method: "POST", body: form("upload", { file: tgz, filename: "docs.tgz" }) });
  const tarBody = await tarRes.json();
  assert.equal(tarBody.ok, true);
  assert.deepEqual(tarBody.stored, ["Income - Rental/Property 200/Electric Bill.pdf"]);

  const status = await (await fetch(base)).json();
  assert.equal(status.files.some((file) => file.path === "notes/readme.txt"), true);
  assert.equal(status.files.find((file) => file.path === "notes/readme.txt").category, "notes");
  assert.equal(status.categories.includes("Income - Rental"), true);
  assert.equal(status.categories.includes("Income - Rental/Property 200"), true);
  assert.equal(status.categories.includes("notes"), true);
  assert.equal(status.folders, true);
  assert.equal(status.summaries, false);
  fs.writeFileSync(path.join(sorterDir, "stage", "Summaries.md"), "# Tax year\n");
  const withSummary = await (await fetch(base)).json();
  assert.equal(withSummary.summaries, true);
  assert.equal(withSummary.folders, true);
  const blocked = await fetch(base, {
    method: "POST",
    body: form("remove", { category: "notes" }),
  });
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.ok, false);
  assert.match(blockedBody.error, /Move every document out/);
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "notes")), true);

  const placed = await fetch(base, {
    method: "POST",
    body: form("place", { path: "notes/readme.txt", category: "Medical" }),
  });
  const placedBody = await placed.json();
  assert.equal(placedBody.ok, true);
  assert.equal(placedBody.path, "Medical/readme.txt");
  assert.equal(placedBody.category, "Medical");
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "Medical", "readme.txt")), true);
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "notes", "readme.txt")), false);

  const removed = await fetch(base, {
    method: "POST",
    body: form("remove", { category: "notes" }),
  });
  const removedBody = await removed.json();
  assert.equal(removedBody.ok, true);
  assert.equal(fs.existsSync(path.join(sorterDir, "stage", "notes")), false);

  const escaped = await fetch(base, {
    method: "POST",
    body: form("place", { path: "../api.php", category: "Medical" }),
  });
  const escapedBody = await escaped.json();
  assert.equal(escapedBody.ok, false);

  const badCategory = await fetch(base, {
    method: "POST",
    body: form("place", { path: "Medical/readme.txt", category: "../outside" }),
  });
  const badCategoryBody = await badCategory.json();
  assert.equal(badCategoryBody.ok, false);
  assert.equal(fs.existsSync(path.join(sorterDir, "outside")), false);

  const stageDir = path.join(sorterDir, "stage");
  fs.renameSync(stageDir, path.join(tmp, "parked-stage"));
  fs.mkdirSync(stageDir);
  const placedCategory = await (await fetch(base)).json();
  assert.equal(placedCategory.folders, false);
  assert.equal(placedCategory.summaries, false);

  const cleared = await (await fetch(base)).json();
  assert.equal(cleared.folders, false);
  assert.equal(cleared.summaries, false);

  fs.mkdirSync(path.join(sorterDir, "sorted", "Income - Rental"), { recursive: true });
  const sortedFolders = await (await fetch(base)).json();
  assert.equal(sortedFolders.folders, true);
  assert.equal(sortedFolders.summaries, false);

  fs.rmSync(path.join(sorterDir, "sorted"), { recursive: true, force: true });
  fs.mkdirSync(path.join(sorterDir, "sorted", ".tax-sorter"), { recursive: true });
  const hiddenWork = await (await fetch(base)).json();
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
  php.kill("SIGTERM");
  fs.rmSync(tmp, { recursive: true, force: true });
});
