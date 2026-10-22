/**
 * Where the document sorter's PHP endpoint lives, decided in the browser.
 * The sorter reads and moves real tax documents, so it only runs when the app is opened on this computer.
 */

/** Set only for `next dev` (see next.config.ts). Static builds leave it empty and use the sibling sorter/ folder. */
export const CONFIGURED_SORTER_URL = process.env.SERVER_URL_UPLOAD_API_PHP ?? "";

export const LOCAL_ONLY_MESSAGE =
  "Available when running locally. The Document Sorter and the Return & Owe Audit read and move tax documents in sorter/stage on your own computer, so they are turned off on this site. Clone the repo and run it on your machine (see the README).";

export type SorterEndpoint =
  | { ok: true; url: string }
  | { ok: false; reason: "remote" | "unset"; message: string };

type PageLocation = { hostname: string; href: string };

export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host);
}

export function resolveSorterEndpoint(location: PageLocation, configured: string = CONFIGURED_SORTER_URL): SorterEndpoint {
  if (!isLocalHost(location.hostname)) {
    return { ok: false, reason: "remote", message: LOCAL_ONLY_MESSAGE };
  }
  if (configured) {
    let host = "";
    try {
      host = new URL(configured).hostname;
    } catch {
      return { ok: false, reason: "unset", message: `SERVER_URL_UPLOAD_API_PHP in .env is not a URL: ${configured}` };
    }
    if (!isLocalHost(host)) {
      return { ok: false, reason: "unset", message: "SERVER_URL_UPLOAD_API_PHP in .env must point at localhost; the sorter is local-only." };
    }
    return { ok: true, url: configured };
  }
  const page = new URL(location.href);
  const marker = page.pathname.lastIndexOf("/out/");
  if (marker !== -1) {
    return { ok: true, url: new URL(`${page.pathname.slice(0, marker)}/sorter/api.php`, page).toString() };
  }
  return {
    ok: false,
    reason: "unset",
    message: "Set SERVER_URL_UPLOAD_API_PHP in .env to the local URL that serves sorter/api.php, then restart npm run dev.",
  };
}

export function sorterEndpoint(): SorterEndpoint {
  if (typeof window === "undefined") return { ok: false, reason: "unset", message: "" };
  return resolveSorterEndpoint(window.location);
}

/** A network failure gets a plain explanation; a server message is passed through. */
export function unreachableMessage(err: unknown, url: string): string {
  if (err instanceof TypeError) return `Could not reach ${url}. The PHP server must be running.`;
  return err instanceof Error && err.message ? err.message : `Could not reach ${url}. The PHP server must be running.`;
}
