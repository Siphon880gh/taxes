/** Which checklist items you have confirmed on the return, saved in this browser and carried in Export. */

import type { ChecklistItem } from "./graph/types";
import { browserStore } from "./quote-storage";

export const CONFIRMED_STORAGE_KEY = "taxes.checklist-confirmed.v1";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keep only string ids, once each. */
export function cleanConfirmed(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.trim() !== ""))];
}

export function readConfirmed(store: Store | null = browserStore()): string[] {
  if (!store) return [];
  try {
    const raw = store.getItem(CONFIRMED_STORAGE_KEY);
    return raw ? cleanConfirmed(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeConfirmed(ids: string[], store: Store | null = browserStore()): void {
  if (!store) return;
  try {
    if (ids.length === 0) store.removeItem(CONFIRMED_STORAGE_KEY);
    else store.setItem(CONFIRMED_STORAGE_KEY, JSON.stringify(cleanConfirmed(ids)));
  } catch {
    // Storage can be full or blocked; the marks still show until reload.
  }
}

export function toggleConfirmed(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/**
 * Ticks are saved per tax year ("y2026|w2"), since confirming a line on the 2025 return says nothing about 2026.
 * A tick saved before ticks had a year (a plain "w2") counts for every year until it is unticked.
 */
export function confirmKey(itemId: string, yearId?: string | null): string {
  return yearId ? `${yearId}|${itemId}` : itemId;
}

/** The item ids ticked for one tax year, out of every saved tick. */
export function confirmedForYear(keys: string[], yearId?: string | null): string[] {
  const prefix = yearId ? `${yearId}|` : null;
  const ids = keys.flatMap((key) => (!key.includes("|") ? [key] : prefix && key.startsWith(prefix) ? [key.slice(prefix.length)] : []));
  return [...new Set(ids)];
}

/** Tick or untick one item for one tax year; unticking also drops an old tick saved without a year. */
export function toggleConfirmedForYear(keys: string[], itemId: string, yearId?: string | null): string[] {
  const key = confirmKey(itemId, yearId);
  return confirmedForYear(keys, yearId).includes(itemId) ? keys.filter((k) => k !== key && k !== itemId) : [...keys, key];
}

/** How many of the items on the checklist now are confirmed. Marks for items no longer listed are not counted. */
export function checklistProgress(items: ChecklistItem[], confirmed: string[]): { done: number; total: number } {
  const marked = new Set(confirmed);
  return { done: items.filter((item) => marked.has(item.id)).length, total: items.length };
}

/** Read the confirmed ids out of an exported chart file; files from before this feature have none. */
export function confirmedFromExport(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? cleanConfirmed((parsed as Record<string, unknown>).confirmed) : [];
  } catch {
    return [];
  }
}

/** The checklist as Markdown, for a download, a print-out, or pasting into notes for a preparer. */
export function checklistMarkdown(options: {
  title: string;
  returnYear: string;
  items: ChecklistItem[];
  confirmed: string[];
  openQuestions: number;
  disclaimer: string;
}): string {
  const { title, returnYear, items, confirmed, openQuestions, disclaimer } = options;
  const marked = new Set(confirmed);
  const progress = checklistProgress(items, confirmed);
  const lines = [`# ${title}`, "", `Tax year: ${returnYear}`, `Confirmed: ${progress.done} of ${progress.total}`];
  if (openQuestions > 0) lines.push(`Open questions on the chart: ${openQuestions}`);
  lines.push("");
  if (items.length === 0) lines.push("Nothing is listed yet. Answer a question on the chart to list forms and lines.");
  for (const item of items) {
    const heading = `${item.form}${item.line ? ` · ${item.line}` : ""}`;
    lines.push(`- [${marked.has(item.id) ? "x" : " "}] **${heading}**`);
    lines.push(`  ${item.summary}`);
    const certainty = item.certainty === "sourced" ? "Line cited for the year shown" : "Verify on the form";
    lines.push(`  _${certainty}${item.source ? ` · ${item.source.yearLabel}` : ""}_`);
    if (item.source) lines.push(`  Source: [${item.source.title}](${item.source.url})`);
  }
  lines.push("", `> ${disclaimer}`, "");
  return lines.join("\n");
}
