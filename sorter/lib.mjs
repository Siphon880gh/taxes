import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");
export const SORTER_ROOT = process.env.SORTER_ROOT
  ? path.resolve(process.env.SORTER_ROOT)
  : path.join(REPO_ROOT, "sorter");
export const STAGE = path.join(SORTER_ROOT, "stage");
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export const MAX_EXTRACT_BYTES = 256 * 1024 * 1024;

export const CATEGORIES = [
  "_Last year\u2019s return",
  "_Proof of identity",
  "Deductions",
  "Income - Investments",
  "Income - Rental",
  "Income - Self-employment",
  "Regulations - Health Insurance",
];

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function inside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    fail("path traversal", 400);
  }
  return resolved;
}

function sanitizeBase(name) {
  if (typeof name !== "string") name = "";
  name = path.basename(name.replaceAll("\\", "/").replaceAll("\0", ""));
  if (!name || name === "." || name === ".." || name === ".gitkeep" || name === ".incoming") {
    fail("bad filename", 400);
  }
  return name;
}

function archiveKind(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz") || lower.endsWith(".tar")) return "tar";
  if (lower.endsWith(".zip")) return "zip";
  return null;
}

function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n += 1;
    if (n > 1000) fail("too many name collisions", 409);
  }
  return candidate;
}

export function ensureStage() {
  fs.mkdirSync(STAGE, { recursive: true });
}

export function listStage() {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".gitkeep" || entry.name === ".incoming") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(STAGE, abs);
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
      files.push({ path: rel.split(path.sep).join("/"), bytes: fs.statSync(abs).size });
    }
  }
  walk(STAGE);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function relocateExtract(scratch) {
  const stored = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__MACOSX" || entry.name === ".DS_Store") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      const rel = path.relative(scratch, abs);
      if (rel.startsWith("..") || path.isAbsolute(rel)) fail("path traversal", 400);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const destDir = inside(STAGE, path.dirname(path.join(STAGE, rel)));
      fs.mkdirSync(destDir, { recursive: true });
      const dest = inside(STAGE, uniquePath(destDir, path.basename(abs)));
      fs.renameSync(abs, dest);
      stored.push(path.relative(STAGE, dest).split(path.sep).join("/"));
    }
  }
  walk(scratch);
  stored.sort((a, b) => a.localeCompare(b));
  return stored;
}

function runExtract(kind, archive, dest) {
  const script = path.join(REPO_ROOT, "sorter", "extract.py");
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, kind, archive, dest, String(MAX_EXTRACT_BYTES)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(Object.assign(new Error(stderr.trim() || "could not extract archive"), { status: 400 }));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(Object.assign(new Error("could not extract archive"), { status: 400 }));
      }
    });
  });
}

export async function saveUpload(rawName, bytes) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (body.length > MAX_UPLOAD_BYTES) fail("file is larger than 64MB", 413);
  const filename = sanitizeBase(rawName);
  ensureStage();
  const incoming = path.join(STAGE, ".incoming");
  fs.mkdirSync(incoming, { recursive: true });
  const temp = inside(STAGE, path.join(incoming, `${Date.now()}-${Math.random().toString(16).slice(2)}`));
  fs.writeFileSync(temp, body, { flag: "wx" });
  const scratch = inside(STAGE, path.join(incoming, `extract-${path.basename(temp)}`));
  try {
    const kind = archiveKind(filename);
    if (!kind) {
      const dest = inside(STAGE, uniquePath(STAGE, filename));
      fs.renameSync(temp, dest);
      return { archive: false, stored: [path.relative(STAGE, dest).split(path.sep).join("/")] };
    }
    fs.mkdirSync(scratch);
    await runExtract(kind, temp, scratch);
    const stored = relocateExtract(scratch);
    return { archive: true, stored };
  } finally {
    fs.rmSync(temp, { force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function placeFile(rel, category) {
  if (!CATEGORIES.includes(category)) fail("unknown category", 400);
  if (typeof rel !== "string" || !rel || rel.includes("\0") || path.isAbsolute(rel)) fail("bad path", 400);
  const source = inside(STAGE, path.join(STAGE, rel));
  const relCheck = path.relative(STAGE, source);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) fail("path traversal", 400);
  let st;
  try {
    st = fs.lstatSync(source);
  } catch {
    fail("staged file not found", 404);
  }
  if (st.isSymbolicLink() || !st.isFile()) fail("only a staged file can be placed", 400);
  const categoryDir = inside(SORTER_ROOT, path.join(SORTER_ROOT, category));
  fs.mkdirSync(categoryDir, { recursive: true });
  const dest = inside(categoryDir, uniquePath(categoryDir, path.basename(source)));
  fs.renameSync(source, dest);
  return { path: path.relative(SORTER_ROOT, dest).split(path.sep).join("/") };
}
