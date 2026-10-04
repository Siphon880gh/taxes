import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sorter = spawn(process.execPath, [path.join(root, "sorter", "server.mjs")], {
  cwd: root,
  stdio: "inherit",
});
const next = spawn(
  process.execPath,
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "--turbopack", "-p", "43123", "-H", "0.0.0.0"],
  { cwd: root, stdio: "inherit" },
);

let exiting = false;
function shutdown(code) {
  if (exiting) return;
  exiting = true;
  sorter.kill("SIGTERM");
  next.kill("SIGTERM");
  setTimeout(() => process.exit(code ?? 0), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
next.on("exit", (code) => shutdown(code ?? 0));
sorter.on("exit", (code) => {
  if (!exiting && code) console.error(`document sorter exited (${code}). The panel calls http://127.0.0.1:43124.`);
});
