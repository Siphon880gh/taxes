/**
 * Folder-path memory for the "Add / edit with AI" helper (harness-first: no built-in AI).
 * Keys are namespaced by the app's path under the weng folder (harnessAi:app/taxes:*) so apps that share an origin
 * never overwrite each other. Same scheme and quoting rules as the shared harness-ai.js / harness-fab.js helpers.
 */
export const HARNESS_APP_ID = "app/taxes";
const NS = `harnessAi:${HARNESS_APP_ID}:`;

export type HarnessTile = "about" | "path";
export type HarnessMode = "path" | "command";

/** "uploadsPath" and "uploadsMode" belong to the Document Sorter's "Ask AI to reorganize" dialog. */
export type HarnessKey = "path" | "mode" | "openTile" | "uploadsPath" | "uploadsMode";

export function loadHarness(key: HarnessKey): string | null {
  try {
    return window.localStorage.getItem(NS + key);
  } catch {
    return null;
  }
}

export function saveHarness(key: HarnessKey, value: string | null): void {
  try {
    if (value === null || value === "") window.localStorage.removeItem(NS + key);
    else window.localStorage.setItem(NS + key, value);
  } catch {
    /* storage unavailable (private mode, blocked): keep working without memory */
  }
}

/** Trim and drop one pair of surrounding quotes (Windows "Copy as path" adds them). */
export function cleanPath(value: string): string {
  let v = value.trim();
  if (v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** A `cd` command that survives spaces and shell metacharacters. */
export function cdCommand(path: string): string {
  let p = path;
  if (!p) return "";
  if (/^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p)) return `cd /d "${p}"`; // Windows cmd
  if (p === "~") return "cd ~";
  let home = "";
  if (p.startsWith("~/")) {
    home = "~/";
    p = p.slice(2);
  }
  if (p.includes("!")) return `cd ${home}'${p.replace(/'/g, "'\\''")}'`; // avoid history expansion
  return `cd ${home}"${p.replace(/(["\\$`])/g, "\\$1")}"`;
}
