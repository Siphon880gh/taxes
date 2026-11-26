/**
 * Form names read inside staged PDFs by sorter/api.php (action=pdf-hints, smalot/pdfparser on the server).
 * Only short tags such as "W-2" or "1099-NEC" come back, never the text, and the files are not touched.
 * A PDF with no text layer (a scan or a phone photo) gets text "none", and coverage falls back to its name.
 */

import { sorterFetch } from "./sorter-client";

export type PdfText = "read" | "none" | "skipped" | "error";

export type PdfHint = { path: string; forms: string[]; text: PdfText };

/** Hints by staged path (relative to sorter). */
export type PdfHints = Record<string, PdfHint>;

export type PdfHintsResult = { available: boolean; hints: PdfHints };

const TEXT_STATES: PdfText[] = ["read", "none", "skipped", "error"];

/** Validates the api.php answer; anything malformed is dropped rather than trusted. */
export function parsePdfHints(body: unknown): PdfHintsResult {
  const value = (body ?? {}) as { ok?: unknown; available?: unknown; files?: unknown };
  if (value.ok !== true || !Array.isArray(value.files)) return { available: false, hints: {} };
  const hints: PdfHints = {};
  for (const item of value.files as unknown[]) {
    const file = (item ?? {}) as { path?: unknown; forms?: unknown; text?: unknown };
    if (typeof file.path !== "string" || file.path === "") continue;
    const text = TEXT_STATES.includes(file.text as PdfText) ? (file.text as PdfText) : "error";
    const forms = Array.isArray(file.forms) ? file.forms.filter((form): form is string => typeof form === "string" && form.length <= 20).slice(0, 8) : [];
    hints[file.path] = { path: file.path, forms, text };
  }
  return { available: value.available === true, hints };
}

/** Asks api.php to read the staged PDFs. Fails soft: no hints means coverage goes by names only. */
export async function fetchPdfHints(url: string, fetcher: typeof fetch = fetch): Promise<PdfHintsResult> {
  try {
    const body = new FormData();
    body.append("action", "pdf-hints");
    const response = await sorterFetch(url, { method: "POST", body }, fetcher);
    if (!response.ok) return { available: false, hints: {} };
    return parsePdfHints(await response.json());
  } catch {
    return { available: false, hints: {} };
  }
}

/** "Form W-2", "Forms 1099-INT, 1099-DIV", or "Schedule E" (no "Form" before schedules, FBAR, or letters). */
export function formsLabel(forms: string[]): string {
  if (forms.length === 0) return "";
  const numbered = forms.every((form) => /^(\d|W-|SSA-)/.test(form));
  return numbered ? `${forms.length === 1 ? "Form" : "Forms"} ${forms.join(", ")}` : forms.join(", ");
}

/** Short badge text for one staged file, or null when nothing useful was read. */
export function hintBadge(hint: PdfHint | undefined): string | null {
  if (!hint) return null;
  if (hint.text === "read") return hint.forms.length ? `Reads as ${formsLabel(hint.forms)}` : "Text read, no tax form found";
  if (hint.text === "none") return "No text layer; matched by name";
  if (hint.text === "skipped") return "Empty or over 25 MB, not read; matched by name";
  return "Could not read this PDF; matched by name";
}
