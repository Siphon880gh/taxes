/** Keeps the user's preparation quote in the browser so it survives a reload without exporting the session. */

export const QUOTE_STORAGE_KEY = "taxes.quote.v1";

export type StoredQuote = { amount: number | null; preparer: string | null };

type QuoteStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's localStorage, or null during prerender or when storage is blocked. */
export function browserStore(): QuoteStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredQuote(store: QuoteStore | null = browserStore()): StoredQuote | null {
  if (!store) return null;
  try {
    const raw = store.getItem(QUOTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { amount, preparer } = parsed as Record<string, unknown>;
    const quote: StoredQuote = {
      amount: typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : null,
      preparer: typeof preparer === "string" && preparer.trim() ? preparer : null,
    };
    return quote.amount == null && quote.preparer == null ? null : quote;
  } catch {
    return null;
  }
}

/** Save the quote, or remove the stored copy when both fields are empty. */
export function writeStoredQuote(quote: StoredQuote, store: QuoteStore | null = browserStore()): void {
  if (!store) return;
  try {
    if (quote.amount == null && !quote.preparer?.trim()) store.removeItem(QUOTE_STORAGE_KEY);
    else store.setItem(QUOTE_STORAGE_KEY, JSON.stringify({ amount: quote.amount, preparer: quote.preparer }));
  } catch {
    // Storage can be full or blocked; the quote still lives in the session.
  }
}
