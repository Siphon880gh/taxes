import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Lockfiles in parent folders make Next guess a workspace root above this repo. Pin it here.
const root = path.resolve(__dirname);

/** True for a localhost / loopback URL, which only `npm run dev` on this computer can use. */
function isLocalUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "::1" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

export default function config(phase: string): NextConfig {
  const configured = process.env.SERVER_URL_UPLOAD_API_PHP ?? "";
  // The built out/ finds ../sorter/api.php next to itself, so a localhost URL (which carries this computer's
  // folder layout) is left out of the build; `npm run dev` still gets it.
  const inlined = phase === PHASE_PRODUCTION_BUILD && isLocalUrl(configured) ? "" : configured;
  return {
    output: "export",
    // One `out/` folder is served at two paths. scripts/set-export-basename.mjs
    // prefixes /_next assets after export. Leave basePath unset.
    turbopack: { root },
    outputFileTracingRoot: root,
    // Inlined for the client panel. Next does not expose other env names to the browser.
    env: {
      SERVER_URL_UPLOAD_API_PHP: inlined,
    },
  };
}
