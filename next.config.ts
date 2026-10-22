import path from "node:path";
import type { NextConfig } from "next";

// Lockfiles in parent folders make Next guess a workspace root above this repo. Pin it here.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  output: "export",
  // One `out/` folder is served at two paths. scripts/set-export-basename.mjs
  // prefixes /_next assets after export. Leave basePath unset.
  turbopack: { root },
  outputFileTracingRoot: root,
  // Inlined for the client panel. Next does not expose other env names to the browser.
  env: {
    SERVER_URL_UPLOAD_API_PHP: process.env.SERVER_URL_UPLOAD_API_PHP ?? "",
  },
};

export default nextConfig;
