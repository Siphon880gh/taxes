/**
 * Where the document sorter's PHP endpoint lives, decided in the browser.
 *
 * Hybrid deploy: the static out/ and the PHP endpoint sit side by side on the same PHP host,
 * for example https://wengindustries.com/app/taxes/out/ and https://wengindustries.com/app/taxes/sorter/api.php.
 * Locally the same layout works under MAMP (http://localhost:8888/weng/app/taxes/...), and `npm run dev`
 * uses SERVER_URL_UPLOAD_API_PHP from .env.
 */

/** SERVER_URL_UPLOAD_API_PHP from .env, inlined by next.config.ts for `npm run dev` and `npm run build`. */
export const CONFIGURED_SORTER_URL = process.env.SERVER_URL_UPLOAD_API_PHP ?? "";

export type SorterEndpoint = { ok: true; url: string } | { ok: false; message: string };

type PageLocation = { hostname: string; href: string };

export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host);
}

/**
 * 1. SERVER_URL_UPLOAD_API_PHP, if set (absolute, or relative to the page). A localhost URL is skipped when the
 *    page itself is on another host, because a visitor's browser cannot reach this computer's localhost.
 * 2. Otherwise, when the page is served from an out/ folder, the sibling sorter/api.php next to out/.
 */
export function resolveSorterEndpoint(location: PageLocation, configured: string = CONFIGURED_SORTER_URL): SorterEndpoint {
  const page = new URL(location.href);
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured, page);
    } catch {
      return { ok: false, message: `SERVER_URL_UPLOAD_API_PHP in .env is not a URL: ${configured}` };
    }
    const unreachableLocalhost = isLocalHost(url.hostname) && !isLocalHost(location.hostname);
    if (!unreachableLocalhost) return { ok: true, url: url.toString() };
  }
  const marker = page.pathname.lastIndexOf("/out/");
  if (marker !== -1) {
    return { ok: true, url: new URL(`${page.pathname.slice(0, marker)}/sorter/api.php`, page).toString() };
  }
  return {
    ok: false,
    message: "Set SERVER_URL_UPLOAD_API_PHP in .env to the URL where PHP serves sorter/api.php, then restart npm run dev.",
  };
}

export function sorterEndpoint(): SorterEndpoint {
  if (typeof window === "undefined") return { ok: false, message: "" };
  return resolveSorterEndpoint(window.location);
}

/** A network failure gets a plain explanation; a server message is passed through. */
export function unreachableMessage(err: unknown, url: string): string {
  if (err instanceof TypeError) return `Could not reach ${url}. The PHP server must be running.`;
  return err instanceof Error && err.message ? err.message : `Could not reach ${url}. The PHP server must be running.`;
}
