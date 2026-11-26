/** Keeps the whole chart session (answers, named records, comments, quote) in the browser so a reload picks up where you left off. */

import { importSession, sessionToJson } from "./graph/session";
import type { Session } from "./graph/types";
import { browserStore } from "./quote-storage";

export const SESSION_STORAGE_KEY = "taxes.session.v1";

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The saved session, or null when nothing is saved or the saved copy no longer matches the chart. */
export function readStoredSession(store: SessionStore | null = browserStore()): Session | null {
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return importSession(raw);
  } catch {
    return null;
  }
}

export function writeStoredSession(session: Session, store: SessionStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.setItem(SESSION_STORAGE_KEY, sessionToJson(session));
  } catch {
    // Storage can be full or blocked; Export still saves a copy.
  }
}

export function clearStoredSession(store: SessionStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
