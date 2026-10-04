import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sorter-test-"));
process.env.SORTER_ROOT = tmp;
const lib = await import("../sorter/lib.mjs");

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
  return fs.readFileSync(dest);
}

test("stores a file, keeps zip folders, rejects traversal, and places into a category", async () => {
  const plain = await lib.saveUpload("a1b2c3.pdf", Buffer.from("not really"));
  assert.deepEqual(plain.stored, ["a1b2c3.pdf"]);

  const zip = makeZip({
    "Income - Rental/Electric Bill.pdf": "bill",
    "notes/readme.txt": "hello",
  });
  const extracted = await lib.saveUpload("packet.zip", zip);
  assert.deepEqual(extracted.stored, ["Income - Rental/Electric Bill.pdf", "notes/readme.txt"]);
  assert.equal(fs.existsSync(path.join(lib.STAGE, "Income - Rental", "Electric Bill.pdf")), true);

  const hostile = makeZip({ "../evil.txt": "no", "kept/ok.txt": "yes" });
  await assert.rejects(() => lib.saveUpload("bad.zip", hostile), /path traversal/);
  assert.equal(fs.existsSync(path.join(tmp, "evil.txt")), false);
  assert.equal(fs.existsSync(path.join(lib.STAGE, "evil.txt")), false);

  const placed = lib.placeFile("notes/readme.txt", "Deductions");
  assert.equal(placed.path, "Deductions/readme.txt");
  assert.equal(fs.existsSync(path.join(tmp, "Deductions", "readme.txt")), true);
  assert.equal(lib.listStage().some((file) => file.path === "notes/readme.txt"), false);

  assert.throws(() => lib.placeFile("../package.json", "Deductions"), /path traversal|bad path|not found/);
});

test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
