/**
 * Calls sorter/api.php the way its app-only gate expects (see the header of sorter/api.php):
 * a handshake once per endpoint, which sets the session cookie and returns a CSRF token,
 * then the X-Taxes-App header on every call and X-Taxes-Csrf on every POST.
 * A 403 (expired or missing session) triggers one fresh handshake and one retry.
 */

export const APP_HEADER = "X-Taxes-App";
export const CSRF_HEADER = "X-Taxes-Csrf";

export const REFUSED_MESSAGE =
  "The document sorter refused this page. Its address must be listed in sorter/app-config.php on the server.";

type Fetch = typeof fetch;

const tokens = new Map<string, Promise<string>>();

function baseOf(url: string): string {
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
}

/** Same-origin calls send cookies by default; the dev server (another port) needs credentials: "include". */
export function credentialsFor(url: string, pageOrigin: string): RequestCredentials {
  try {
    return new URL(url, pageOrigin).origin === pageOrigin ? "same-origin" : "include";
  } catch {
    return "same-origin";
  }
}

function pageOrigin(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

async function handshake(base: string, fetcher: Fetch): Promise<string> {
  const response = await fetcher(`${base}?action=handshake`, {
    headers: { [APP_HEADER]: "1" },
    credentials: credentialsFor(base, pageOrigin()),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; csrf?: string };
  if (!response.ok || !body.ok || typeof body.csrf !== "string") throw new Error(REFUSED_MESSAGE);
  return body.csrf;
}

function token(base: string, fetcher: Fetch, fresh: boolean): Promise<string> {
  if (fresh) tokens.delete(base);
  let pending = tokens.get(base);
  if (!pending) {
    pending = handshake(base, fetcher);
    pending.catch(() => tokens.delete(base));
    tokens.set(base, pending);
  }
  return pending;
}

/** fetch() for sorter/api.php. Network failures still throw TypeError, so unreachableMessage() applies. */
export async function sorterFetch(url: string, init: RequestInit = {}, fetcher: Fetch = fetch): Promise<Response> {
  const base = baseOf(url);
  for (let attempt = 0; ; attempt += 1) {
    const csrf = await token(base, fetcher, attempt > 0);
    const headers = new Headers(init.headers);
    headers.set(APP_HEADER, "1");
    if ((init.method ?? "GET").toUpperCase() === "POST") headers.set(CSRF_HEADER, csrf);
    const response = await fetcher(url, { ...init, headers, credentials: credentialsFor(url, pageOrigin()), cache: "no-store" });
    if (response.status !== 403 || attempt > 0) return response;
  }
}

/** Test hook: forget cached CSRF tokens. */
export function resetSorterSessions(): void {
  tokens.clear();
}
