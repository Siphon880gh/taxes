/**
 * Client side of "Ask AI to sort" in the Document Sorter. sorter/api.php holds the keys (read from the app's
 * .env), reads the tax-document-classification skill, and talks to OpenAI or Anthropic. This file only reads its
 * answers. A missing key or a billing refusal is reported as ai-unavailable; the dialog then names the skill and folder.
 */

export type AiProvider = "openai" | "anthropic";

/** The uploads folder, relative to the app's folder. The app never shows where that folder lives on disk. */
export const UPLOADS_FOLDER = "sorter";

export type AiStatus = { configured: true; provider: AiProvider; model: string } | { configured: false; reason: string };

export type AiMove = { path: string; category: string; reason: string };

export type AiPlan = { moves: AiMove[]; skipped: number; summary: string; token: string; provider: AiProvider; model: string };

export type AiApplyResult = {
  moved: { from: string; path: string; category: string }[];
  failed: { path: string; error: string }[];
};

export function providerLabel(provider: AiProvider): string {
  return provider === "openai" ? "ChatGPT (OpenAI)" : "Claude (Anthropic)";
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A relative path under the upload root: no leading slash or drive, no empty, "." or ".." segments. */
export function isSafeRelativePath(value: string): boolean {
  if (value === "" || value.startsWith("/") || value.includes("\\") || value.includes("\0") || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function parseAiStatus(body: unknown): AiStatus | null {
  if (!isObject(body) || body.ok !== true) return null;
  if (body.configured === true) {
    if (body.provider !== "openai" && body.provider !== "anthropic") return null;
    return { configured: true, provider: body.provider, model: String(body.model ?? "") };
  }
  return { configured: false, reason: typeof body.reason === "string" ? body.reason : "" };
}

/** The plan from ai-plan. Moves with an unsafe path or folder are dropped here too and counted as skipped. */
export function parseAiPlan(body: unknown): AiPlan | null {
  if (!isObject(body) || body.ok !== true || !Array.isArray(body.moves) || typeof body.token !== "string") return null;
  if (body.provider !== "openai" && body.provider !== "anthropic") return null;
  const moves: AiMove[] = [];
  let skipped = typeof body.skipped === "number" ? body.skipped : 0;
  for (const move of body.moves) {
    const ok =
      isObject(move) &&
      typeof move.path === "string" &&
      typeof move.category === "string" &&
      isSafeRelativePath(move.path) &&
      isSafeRelativePath(move.category);
    if (!ok) {
      skipped += 1;
      continue;
    }
    moves.push({ path: move.path as string, category: move.category as string, reason: typeof move.reason === "string" ? move.reason : "" });
  }
  return {
    moves,
    skipped,
    summary: typeof body.summary === "string" ? body.summary : "",
    token: body.token,
    provider: body.provider,
    model: String(body.model ?? ""),
  };
}

/** Indexes of the kept moves, as ai-apply expects them ("0,2,3"). */
export function keepParam(kept: boolean[]): string {
  return kept.flatMap((on, index) => (on ? [String(index)] : [])).join(",");
}

/**
 * Example prompt for an AI harness opened on the app's folder. The path is relative, never an absolute one.
 * Year and folder are the ones selected in the top right. With no folder, the prompt asks what to call the project.
 */
export function examplePrompt(year?: string | null, folder?: string | null): string {
  const place = folder
    ? `the "${folder}" folder`
    : `the selected Tax Year ${year?.trim() || "YYYY"} folder`;
  const body = `Reorganize the tax documents in ${UPLOADS_FOLDER}. Follow AGENTS.md at the app root (and the tax-document-classification skill if you have it): sort in place inside ${place}, move each file into its category folder such as "Income - Wages" or "Deductions", put anything unclear in "_Needs Human Review", and leave Summaries.md, Owed Audit.md, Owe Audit Breakdown - Rent.md, and sort-state.json where they are.`;
  if (folder) return body;
  return `${body} Ask me what year and the name of your tax project should it be called?`;
}
