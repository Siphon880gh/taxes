import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const categories = JSON.parse(readFileSync(new URL("../sorter/categories.json", import.meta.url), "utf8")) as string[];

function php(root: string, args: string[]) {
  return spawnSync("php", [path.join(process.cwd(), "sorter/api.php"), ...args], {
    cwd: process.cwd(),
    env: { ...process.env, SORTER_ROOT: root },
    encoding: "utf8",
  });
}

test("category folders keep the underscore prefix that sorts the two named folders first", () => {
  assert.deepEqual(categories, [
    "_Last year's return",
    "_Proof of identity",
    "Deductions",
    "Income - Investments",
    "Income - Rental",
    "Income - Self-employment",
    "Regulations - Health Insurance",
  ]);
  assert.equal(categories[0]?.startsWith("_"), true);
  assert.equal(categories[1]?.startsWith("_"), true);
});

test("upload stages a file, status lists it, and place moves it into a category", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sorter-"));
  try {
    const source = path.join(root, "sample.pdf");
    writeFileSync(source, "%PDF-1.4\n");
    const uploaded = php(root, ["upload", source]);
    assert.equal(uploaded.status, 0, uploaded.stderr);
    assert.deepEqual(JSON.parse(uploaded.stdout).staged, ["sample.pdf"]);
    assert.equal(readFileSync(path.join(root, "stage", "sample.pdf"), "utf8"), "%PDF-1.4\n");

    const status = JSON.parse(php(root, ["status"]).stdout) as {
      files: { name: string }[];
      categories: { name: string; files: { name: string }[] }[];
    };
    assert.deepEqual(status.files.map((file) => file.name), ["sample.pdf"]);
    assert.deepEqual(status.categories.map((category) => category.name), categories);

    const placed = php(root, ["place", "sample.pdf", "Income - Self-employment"]);
    assert.equal(placed.status, 0, placed.stderr);
    const after = JSON.parse(php(root, ["status"]).stdout) as {
      files: { name: string }[];
      categories: { name: string; files: { name: string }[] }[];
    };
    assert.deepEqual(after.files, []);
    const selfEmployment = after.categories.find((category) => category.name === "Income - Self-employment");
    assert.deepEqual(selfEmployment?.files.map((file) => file.name), ["sample.pdf"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("place rejects a category outside the named folders", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sorter-"));
  try {
    const source = path.join(root, "note.txt");
    writeFileSync(source, "id");
    assert.equal(php(root, ["upload", source]).status, 0);
    const rejected = php(root, ["place", "../stage/note.txt", "../stage"]);
    assert.equal(rejected.status, 1);
    assert.match(JSON.parse(rejected.stdout).error, /Unknown category|Unknown staged file/);
    assert.equal(readFileSync(path.join(root, "stage", "note.txt"), "utf8"), "id");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the http endpoint stages, reports status, and places a file", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sorter-http-"));
  const port = 44991;
  const server = spawn(
    "php",
    ["-d", "upload_max_filesize=32M", "-d", "post_max_size=40M", "-S", `127.0.0.1:${port}`, "-t", path.join(process.cwd(), "sorter")],
    { env: { ...process.env, SORTER_ROOT: root }, stdio: "ignore" },
  );
  try {
    let up = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const ping = await fetch(`http://127.0.0.1:${port}/api.php?action=status`);
        if (ping.ok) {
          up = true;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    assert.equal(up, true);

    const body = new FormData();
    body.set("action", "upload");
    body.append("files[]", new Blob(["w2"]), "w2.pdf");
    const uploaded = await fetch(`http://127.0.0.1:${port}/api.php`, { method: "POST", body });
    const uploadPayload = (await uploaded.json()) as { ok: boolean; staged: string[] };
    assert.equal(uploadPayload.ok, true);
    assert.deepEqual(uploadPayload.staged, ["w2.pdf"]);

    const status = (await (await fetch(`http://127.0.0.1:${port}/api.php?action=status`)).json()) as {
      files: { name: string }[];
    };
    assert.deepEqual(status.files.map((file) => file.name), ["w2.pdf"]);

    const placed = await fetch(`http://127.0.0.1:${port}/api.php`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "place", file: "w2.pdf", category: "_Proof of identity" }),
    });
    assert.equal((await placed.json()).ok, true);
    const after = (await (await fetch(`http://127.0.0.1:${port}/api.php?action=status`)).json()) as {
      files: { name: string }[];
      categories: { name: string; files: { name: string }[] }[];
    };
    assert.deepEqual(after.files, []);
    assert.deepEqual(after.categories.find((category) => category.name === "_Proof of identity")?.files.map((file) => file.name), ["w2.pdf"]);
  } finally {
    server.kill();
    rmSync(root, { recursive: true, force: true });
  }
});
