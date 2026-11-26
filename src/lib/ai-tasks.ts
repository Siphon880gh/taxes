/**
 * In-app ChatGPT (OpenAI) and Claude (Anthropic) tasks. sorter/api.php holds the keys and reads the matching
 * skill from .agents/skills/. When the key or billing is missing, the attempt fails and the UI names that skill,
 * the tax year, and the folder so the same work can be done in an AI harness.
 */

import { sorterFetch } from "@/lib/sorter-client";
import { sorterEndpoint } from "@/lib/sorter-endpoint";

export const AI_UNAVAILABLE_TITLE = "AI or billing is not set up";

export const AI_TASKS = {
  sort: {
    id: "sort",
    skill: "tax-document-classification",
    title: "Ask AI to sort",
    doing: "Sorting with ChatGPT or Claude…",
  },
  summaries: {
    id: "summaries",
    skill: "tax-document-summaries",
    title: "Ask AI to write Summaries.md",
    doing: "Writing Summaries.md with ChatGPT or Claude…",
  },
  audit: {
    id: "audit",
    skill: "tax-return-owed-audit",
    title: "Ask AI to audit owed",
    doing: "Auditing the return with ChatGPT or Claude…",
  },
  walkthrough: {
    id: "walkthrough",
    skill: "freetaxusa-walkthrough",
    title: "Ask AI to walk through FreeTaxUSA",
    doing: "Reading the walkthrough skill with ChatGPT or Claude…",
  },
} as const;

export type AiTaskId = keyof typeof AI_TASKS;

export class AiUnavailableError extends Error {
  readonly skill: string;
  readonly folder: string;

  constructor(skill: string, folder: string) {
    super("The API key or billing is not set up.");
    this.name = "AiUnavailableError";
    this.skill = skill;
    this.folder = folder;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** "Tax Year 2025" from a return folder name, or null. */
export function taxYearFromFolder(folder: string | null | undefined): string | null {
  const match = folder?.match(/Tax Year (?:19|20)\d{2}/);
  return match ? match[0] : null;
}

/**
 * Shown after an AI attempt fails because no key is configured or the provider refused it for billing.
 * Names the skill, the year, and the folder the attempt was for.
 */
export function harnessSnag(skill: string, folder: string | null | undefined): string {
  const year = taxYearFromFolder(folder) ?? "the applicable tax year";
  const place = folder ? `in the folder sorter/${folder}` : "in the tax-year folder under sorter/";
  return `The API key or billing is not set up. Use your AI harness (Cursor, Claude Code, or another) to use the ${skill} skill on ${year}, ${place}. Then refresh.`;
}

/** A prompt to paste into that harness. Relative to the app folder, never an absolute path. */
export function harnessPrompt(skill: string, folder: string | null | undefined): string {
  const place = folder ? `sorter/${folder}` : "sorter/";
  return `Use the ${skill} skill on ${place}. Follow .agents/skills/${skill}/SKILL.md.`;
}

export function aiUnavailableFrom(body: unknown): { skill: string; folder: string } | null {
  if (!isObject(body) || body.code !== "ai-unavailable") return null;
  return {
    skill: typeof body.skill === "string" && body.skill !== "" ? body.skill : "",
    folder: typeof body.folder === "string" ? body.folder : "",
  };
}

/** Reads a sorter JSON body. A missing key or a billing refusal throws AiUnavailableError. */
export async function readAiJson(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const unavailable = aiUnavailableFrom(body);
  if (unavailable) throw new AiUnavailableError(unavailable.skill, unavailable.folder);
  const record = isObject(body) ? body : {};
  if (!response.ok || record.ok !== true) {
    throw new Error(typeof record.error === "string" ? record.error : "The sorter refused that request.");
  }
  return record;
}

export async function postAi(fields: Record<string, string>): Promise<Record<string, unknown>> {
  const endpoint = sorterEndpoint();
  if (!endpoint.ok) throw new Error(endpoint.message);
  const payload = new FormData();
  for (const [key, value] of Object.entries(fields)) payload.append(key, value);
  const response = await sorterFetch(endpoint.url, { method: "POST", body: payload });
  return readAiJson(response);
}
