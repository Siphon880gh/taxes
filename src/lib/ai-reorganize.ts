/**
 * Client side of "Ask AI to reorganize" in the Document Sorter. sorter/api.php holds the keys (read from the app's
 * .env) and talks to OpenAI or Anthropic; this file only reads its answers. Without a key the app points people at the
 * uploads folder so they can reorganize it with their own AI harness and refresh.
 */

export type AiProvider = "openai" | "anthropic";

export type AiStatus =
  | { configured: true; folder: string; provider: AiProvider; model: string }
  | { configured: false; folder: string; reason: string };

export type AiMove = { path: string; category: string; reason: string };

export type AiPlan = { moves: AiMove[]; skipped: number; summary: string; token: string; provider: AiProvider; model: string };

export type AiApplyResult = {
  moved: { from: string; path: string; category: string }[];
  failed: { path: string; error: string }[];
};

/** Shown when sorter/api.php has no key: the request's wording, with the folder named next to it. */
export const NO_AI_TITLE = "AI or billing is not set up in this app";
export const NO_AI_BODY =
  "No ChatGPT (OpenAI) or Claude (Anthropic) API key is configured in the app's .env, so the app cannot ask AI for you. Open the uploads folder below in your own AI harness (Cursor, Claude Code or another), ask it to reorganize the tax documents, then refresh the app.";

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
  if (!isObject(body) || body.ok !== true || typeof body.folder !== "string") return null;
  if (body.configured === true) {
    if (body.provider !== "openai" && body.provider !== "anthropic") return null;
    return { configured: true, folder: body.folder, provider: body.provider, model: String(body.model ?? "") };
  }
  return { configured: false, folder: body.folder, reason: typeof body.reason === "string" ? body.reason : "" };
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

/** Example prompt for an AI harness opened on the uploads folder. */
export function examplePrompt(folder: string): string {
  const where = folder ? ` in ${folder}` : "";
  return `Reorganize the tax documents${where}. Follow AGENTS.md in that folder (and the tax-document-classification skill if you have it): sort in place, move each file into its category folder such as "Income - Wages" or "Deductions", put anything unclear in "_Needs Human Review", and leave AGENTS.md, Summaries.md and Owed Audit.md where they are.`;
}
