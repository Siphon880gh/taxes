// Not sorter/api.php: this Next app does not run PHP, and output:export cannot host a POST route. The panel calls http://127.0.0.1:43124.
import http from "node:http";
import { CATEGORIES, listStage, placeFile, saveUpload, MAX_UPLOAD_BYTES } from "./lib.mjs";

const PORT = Number(process.env.SORTER_PORT || 43124);
const HOST = "127.0.0.1";

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Filename",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        reject(Object.assign(new Error("file is larger than 64MB"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Filename",
    });
    res.end();
    return;
  }
  try {
    const url = new URL(req.url || "/", `http://${HOST}`);
    if (req.method === "GET" && url.pathname === "/status") {
      send(res, 200, { ok: true, root: "sorter/stage", files: listStage(), categories: CATEGORIES });
      return;
    }
    if (req.method === "POST" && url.pathname === "/upload") {
      const header = req.headers["x-filename"];
      const raw = Array.isArray(header) ? header[0] : header;
      if (!raw) {
        send(res, 400, { ok: false, error: "missing file name" });
        return;
      }
      let filename = raw;
      try {
        filename = decodeURIComponent(raw);
      } catch {
        send(res, 400, { ok: false, error: "bad file name" });
        return;
      }
      const bytes = await readBody(req);
      const result = await saveUpload(filename, bytes);
      send(res, 200, { ok: true, ...result });
      return;
    }
    if (req.method === "POST" && url.pathname === "/place") {
      const bytes = await readBody(req);
      let body;
      try {
        body = JSON.parse(bytes.toString("utf8"));
      } catch {
        send(res, 400, { ok: false, error: "expected JSON" });
        return;
      }
      const result = placeFile(body.path, body.category);
      send(res, 200, { ok: true, ...result });
      return;
    }
    send(res, 404, { ok: false, error: "not found" });
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    const message = error instanceof Error ? error.message : "sorter error";
    if (!res.headersSent && !res.writableEnded) send(res, status, { ok: false, error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`document sorter listening on http://${HOST}:${PORT}`);
});
