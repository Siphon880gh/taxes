import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";

export const SORTER_PHP_PORT = 43124;
export const SORTER_PHP_ORIGIN = `http://127.0.0.1:${SORTER_PHP_PORT}`;

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(400, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(port: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await canConnect(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The document sorter did not start.");
}

let booting: Promise<void> | null = null;
let child: ChildProcess | null = null;

async function boot(): Promise<void> {
  if (await canConnect(SORTER_PHP_PORT)) return;
  const root = path.join(process.cwd(), "sorter");
  child = spawn(
    "php",
    [
      "-d", "upload_max_filesize=32M",
      "-d", "post_max_size=40M",
      "-d", "max_file_uploads=20",
      "-S", `127.0.0.1:${SORTER_PHP_PORT}`,
      "-t", root,
    ],
    { stdio: "ignore" },
  );
  child.on("exit", () => {
    child = null;
    booting = null;
  });
  await waitForPort(SORTER_PHP_PORT);
}

export function ensureSorterPhp(): Promise<void> {
  if (!booting) {
    booting = boot().catch((error: unknown) => {
      booting = null;
      throw error;
    });
  }
  return booting;
}
