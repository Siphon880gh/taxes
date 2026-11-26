/**
 * The guided flow over the bottom panel's tabs:
 *   Step 1  gather and sort documents (Document Sorter)
 *   Step 2  pick one route: (a) hand off to a tax preparer, (b) AI owed audit, (c) file it yourself.
 * The chart above is the guided path itself; route (c) uses it any time, with or without documents.
 */

export type FrameMode = "start" | "sorter" | "costs" | "audit" | "checklist";

/** The tabs in flow order, with the step chip each one shows. */
export const FLOW_TABS: { mode: FrameMode; label: string; step: string | null; stepLabel: string }[] = [
  { mode: "start", label: "Start here", step: null, stepLabel: "Overview" },
  { mode: "sorter", label: "Document Sorter", step: "1", stepLabel: "Step 1" },
  { mode: "costs", label: "Tax Pro Costs", step: "2a", stepLabel: "Route 2a" },
  { mode: "audit", label: "Return & Owe Audit", step: "2b", stepLabel: "Route 2b" },
  { mode: "checklist", label: "Checklist", step: "2c", stepLabel: "Route 2c" },
];

export type Route = { id: "preparer" | "audit" | "self"; step: string; title: string; mode: FrameMode; summary: string };

export const ROUTES: Route[] = [
  {
    id: "preparer",
    step: "2a",
    title: "Hand off to a tax preparer",
    mode: "costs",
    summary: "Give the preparer Summaries.md, written from your sorted documents by the tax-document-summaries skill, then judge their quote in Tax Pro Costs.",
  },
  {
    id: "audit",
    step: "2b",
    title: "AI owed audit",
    mode: "audit",
    summary:
      "Already have the return? The I have my return - audit owed skill checks the amount owed against your documents and writes Owed Audit.md, plus a rent breakdown when there is rental income.",
  },
  {
    id: "self",
    step: "2c",
    title: "File it yourself",
    mode: "checklist",
    summary: "Answer the guided path on the chart and work through the Checklist of forms and lines. Open it any time, even before any documents are staged.",
  },
];

/** One line under each panel heading: where this panel sits in the flow. */
export const PANEL_LEDES: Record<FrameMode, string> = {
  start: "Sort your documents first, then pick the route that fits. The chart above works any time.",
  sorter: "Step 1 · Upload your tax documents and sort them into folders. Every route reads them from here.",
  costs: "Route 2a · Hand off to a tax preparer: give them Summaries.md, then check their quote against typical fees.",
  audit: "Route 2b · AI owed audit: the owed-audit skill checks the return's amount owed against your documents.",
  checklist: "Route 2c · File it yourself: the forms and lines your answers on the chart call for. Usable any time.",
};

export type StageOverview = { staged: number; summaries: boolean };

const APP_NOTES = new Set(["AGENTS.md", "Summaries.md", "Owed Audit.md", "Owe Audit Breakdown - Rent.md"]);

/** How many documents are staged and whether Summaries.md is anywhere in sorter/stage, from an api.php status. */
export function stageOverviewFrom(body: unknown): StageOverview | null {
  const value = (body ?? {}) as { ok?: unknown; files?: unknown; summaries?: unknown };
  if (value.ok !== true || !Array.isArray(value.files)) return null;
  let staged = 0;
  let summaries = value.summaries === true;
  for (const file of value.files as unknown[]) {
    const path = typeof (file as { path?: unknown })?.path === "string" ? (file as { path: string }).path : "";
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!name || name.startsWith(".")) continue;
    if (name === "Summaries.md") summaries = true;
    if (!APP_NOTES.has(name)) staged += 1;
  }
  return { staged, summaries };
}

/** "12 documents staged", "1 document staged", or "Nothing staged yet". */
export function stagedLabel(count: number): string {
  if (count === 0) return "Nothing staged yet";
  return `${count} ${count === 1 ? "document" : "documents"} staged`;
}
