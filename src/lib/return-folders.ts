/**
 * A return's documents live in one folder under sorter named "Tax Year YYYY - NAME",
 * for example "Tax Year 2025 - Extended to Oct 15". Choosing 2025 loads only those folders.
 * .taxes inside that folder is sort metadata, not a document.
 * sort-state.json in that folder lists the filenames already sorted. Anything else, except junk
 * like .DS_Store, is unsorted.
 */

import { browserStore } from "./quote-storage";

export const RETURN_FOLDER_KEY = "taxes.return-folder.v1";
export const SORT_STATE_NAME = "sort-state.json";

const IGNORED_NAMES = new Set([
  ".DS_Store",
  "AGENTS.md",
  "Summaries.md",
  "SORTED.md",
  "Owed Audit.md",
  "Owe Audit Breakdown - Rent.md",
  SORT_STATE_NAME,
  ".gitkeep",
  ".htaccess",
]);

export type StageFile = { path: string; category: string };
export type SortState = { sorted: boolean; filenames: string[] };

type Store = Pick<Storage, "getItem" | "setItem">;

function prefix(year: string): string {
  return `Tax Year ${year} - `;
}

/** "Tax Year 2026 - Return", then "Tax Year 2026 - Return 2". */
export function defaultReturnName(existing: readonly string[], year: string): string {
  const base = `${prefix(year)}Return`;
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/** A typed name becomes "Tax Year 2026 - Weng". A blank name gets the next default. */
export function normalizeReturnName(input: string, year: string, existing: readonly string[]): string {
  const cleaned = input.trim().replace(/[\\/]+/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return defaultReturnName(existing, year);
  const lead = prefix(year);
  if (cleaned.startsWith(lead)) return cleaned;
  return `${lead}${cleaned}`;
}

/** Top folders named "Tax Year {year} - …". */
export function returnFolderNames(categories: readonly string[], year: string): string[] {
  const lead = prefix(year);
  const names = new Set<string>();
  for (const category of categories) {
    const top = category.split("/")[0] ?? "";
    if (top.startsWith(lead)) names.add(top);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** The name after "Tax Year 2026 - ". */
export function returnFolderLabel(folder: string, year: string): string {
  const lead = prefix(year);
  return folder.startsWith(lead) ? folder.slice(lead.length) : folder;
}

export function inReturnFolder(category: string, folder: string): boolean {
  return category === folder || category.startsWith(`${folder}/`);
}

/** A path relative to the return folder. Dotfiles, .taxes metadata, and the folder's own notes are not documents to sort. */
export function isIgnoredDocument(relativePath: string): boolean {
  const parts = relativePath.split("/");
  if (parts.some((part) => part === "" || part.startsWith("."))) return true;
  return IGNORED_NAMES.has(parts[parts.length - 1] ?? "");
}

/** Documents in this return folder whose path is not in sort-state.json. No state means nothing is recorded as sorted. */
export function unsortedFiles(files: readonly StageFile[], folder: string, state: SortState | null): string[] {
  const recorded = new Set(state?.filenames ?? []);
  const found: string[] = [];
  for (const file of files) {
    if (!inReturnFolder(file.category, folder) && !file.path.startsWith(`${folder}/`)) continue;
    const relative = file.path.startsWith(`${folder}/`) ? file.path.slice(folder.length + 1) : file.path;
    if (isIgnoredDocument(relative) || recorded.has(relative)) continue;
    found.push(relative);
  }
  return found.sort((a, b) => a.localeCompare(b));
}

function sortStateOf(value: unknown): SortState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as { sorted?: unknown; filenames?: unknown };
  const filenames = Array.isArray(record.filenames)
    ? record.filenames.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
  return { sorted: record.sorted === true, filenames };
}

/** Files, category folders, and each return folder's sort-state.json from an api.php status. */
export function stageListingFrom(body: unknown): { files: StageFile[]; categories: string[]; sortStates: Record<string, SortState>; summaryFolders: string[] } | null {
  const value = (body ?? {}) as { ok?: unknown; files?: unknown; categories?: unknown; sortStates?: unknown; summaryFolders?: unknown };
  if (value.ok !== true) return null;
  const files: StageFile[] = [];
  if (Array.isArray(value.files)) {
    for (const file of value.files) {
      const item = file as { path?: unknown; category?: unknown };
      if (typeof item.path !== "string") continue;
      files.push({ path: item.path, category: typeof item.category === "string" ? item.category : "" });
    }
  }
  const categories = Array.isArray(value.categories)
    ? value.categories.filter((item): item is string => typeof item === "string")
    : [];
  const sortStates: Record<string, SortState> = {};
  if (typeof value.sortStates === "object" && value.sortStates !== null) {
    for (const [folder, state] of Object.entries(value.sortStates)) {
      const parsed = sortStateOf(state);
      if (parsed) sortStates[folder] = parsed;
    }
  }
  const summaryFolders = Array.isArray(value.summaryFolders)
    ? value.summaryFolders.filter((item): item is string => typeof item === "string")
    : [];
  return { files, categories, sortStates, summaryFolders };
}

export function readReturnFolders(store: Store | null = browserStore()): Record<string, string> {
  if (!store) return {};
  try {
    const raw = store.getItem(RETURN_FOLDER_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const saved: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) saved[key] = value;
    }
    return saved;
  } catch {
    return {};
  }
}

export function writeReturnFolder(yearId: string, folder: string, store: Store | null = browserStore()): void {
  if (!store) return;
  try {
    const saved = readReturnFolders(store);
    saved[yearId] = folder;
    store.setItem(RETURN_FOLDER_KEY, JSON.stringify(saved));
  } catch {
    // Storage can be blocked; the choice still applies for this visit.
  }
}
