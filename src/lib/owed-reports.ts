/**
 * The reports the tax-return-owed-audit skill writes into sorter/stage, as sorter/api.php lists them:
 * Owed Audit.md, and Owe Audit Breakdown - Rent.md when the return has rental income.
 * The Return & Owe Audit tab is grayed out until one of them exists.
 */

export const OWED_AUDIT_NAME = "Owed Audit.md";
export const RENT_BREAKDOWN_NAME = "Owe Audit Breakdown - Rent.md";
export const OWED_SKILL_LABEL = "I have my return - audit owed";

export type OwedReports = { audits: string[]; rentBreakdowns: string[] };

export type OwedReportsState =
  | { status: "loading" }
  | { status: "ready"; reports: OwedReports }
  | { status: "error"; message: string };

function namedPaths(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((path): path is string => typeof path === "string" && (path === name || path.endsWith(`/${name}`)));
}

/** The reports in an api.php status answer, or null when the answer is not a status. */
export function owedReportsFrom(body: unknown): OwedReports | null {
  const value = (body ?? {}) as { ok?: unknown; owedAudits?: unknown; rentBreakdowns?: unknown };
  if (value.ok !== true) return null;
  return { audits: namedPaths(value.owedAudits, OWED_AUDIT_NAME), rentBreakdowns: namedPaths(value.rentBreakdowns, RENT_BREAKDOWN_NAME) };
}

export const NO_AUDIT_HINT = `No ${OWED_AUDIT_NAME} yet; run the ${OWED_SKILL_LABEL} skill on sorter/stage, then refresh.`;

/** Whether the Return & Owe Audit tab is usable, and the hint to show when it is not. Still checking counts as usable. */
export function auditTab(state: OwedReportsState): { disabled: boolean; hint: string | null } {
  if (state.status === "loading") return { disabled: false, hint: null };
  if (state.status === "error") return { disabled: true, hint: `Could not check for ${OWED_AUDIT_NAME}. ${state.message}` };
  const { audits, rentBreakdowns } = state.reports;
  return audits.length + rentBreakdowns.length > 0 ? { disabled: false, hint: null } : { disabled: true, hint: NO_AUDIT_HINT };
}

/** "sorter/stage" for a report at the top, otherwise its folder under sorter/stage. */
export function reportFolder(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "sorter/stage" : path.slice(0, slash);
}
