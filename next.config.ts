import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Lockfiles in parent folders make Next guess a workspace root above this repo. Pin it here.
const root = path.resolve(__dirname);

export default function nextConfig(phase: string): NextConfig {
  return {
    output: "export",
    // One `out/` folder is served at two paths. scripts/set-export-basename.mjs
    // prefixes /_next assets after export. Leave basePath unset.
    turbopack: { root },
    outputFileTracingRoot: root,
    // Inlined for the sorter panels during `next dev` only. A static build never carries a localhost URL:
    // out/ finds sorter/api.php next to itself, and only when opened on this computer (src/lib/sorter-endpoint.ts).
    env: {
      SERVER_URL_UPLOAD_API_PHP: phase === PHASE_DEVELOPMENT_SERVER ? (process.env.SERVER_URL_UPLOAD_API_PHP ?? "") : "",
    },
  };
}
