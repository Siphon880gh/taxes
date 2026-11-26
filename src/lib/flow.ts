/**
 * The guided flow over the bottom panel's tabs:
 *   Step 1  gather and sort documents (Document Sorter)
 *   Step 2  pick one route: (a) "Hand it to a pro:", (b) "AI calculate now:", (c) "Guide me on forms:".
 * The chart above is the guided path itself; route (c) uses it any time, with or without documents.
 */

export type FrameMode = "start" | "sorter" | "costs" | "audit" | "checklist";

/** The short lead shown before each route's tab, card and link; the same words everywhere. */
export const ROUTE_LEADS = {
  costs: "Hand it to a pro:",
  audit: "AI calculate now:",
  checklist: "Guide me on forms:",
} as const;

export type FlowTab = { mode: FrameMode; label: string; step: string | null; lead: string | null };

/** The tabs in flow order, with the step chip each one shows and, for the routes, the lead before it. */
export const FLOW_TABS: FlowTab[] = [
  { mode: "start", label: "Start here", step: null, lead: null },
  { mode: "sorter", label: "Document Sorter", step: "1", lead: null },
  { mode: "costs", label: "Tax Pro Costs", step: "2a", lead: ROUTE_LEADS.costs },
  { mode: "audit", label: "Return & Owe Audit", step: "2b", lead: ROUTE_LEADS.audit },
  { mode: "checklist", label: "Checklist", step: "2c", lead: ROUTE_LEADS.checklist },
];

/** What a screen reader hears before the label: "Step 2a, Hand it to a pro: " (the chip and lead are drawn apart). */
export function spokenPrefix(tab: { step: string | null; lead: string | null }): string {
  if (!tab.step) return "";
  return `Step ${tab.step}, ${tab.lead ? `${tab.lead} ` : ""}`;
}

export type Route = { id: "preparer" | "audit" | "self"; step: string; lead: string; label: string; mode: FrameMode; summary: string };

/** "Hand it to a pro: Tax Pro Costs". */
export function routeName(route: Route): string {
  return `${route.lead} ${route.label}`;
}

export const ROUTES: Route[] = [
  {
    id: "preparer",
    step: "2a",
    lead: ROUTE_LEADS.costs,
    label: "Tax Pro Costs",
    mode: "costs",
    summary: "Give the preparer Summaries.md, written from your sorted documents by the tax-document-summaries skill, then judge their quote in Tax Pro Costs.",
  },
  {
    id: "audit",
    step: "2b",
    lead: ROUTE_LEADS.audit,
    label: "Return & Owe Audit",
    mode: "audit",
    summary:
      "Already have the return? The I have my return - audit owed skill checks the amount owed against your documents and writes Owed Audit.md, plus a rent breakdown when there is rental income.",
  },
  {
    id: "self",
    step: "2c",
    lead: ROUTE_LEADS.checklist,
    label: "Checklist",
    mode: "checklist",
    summary: "Answer the guided path on the chart and work through the Checklist of forms and lines. Open it any time, even before any documents are staged.",
  },
];

/** One line under each panel heading: where this panel sits in the flow. */
export const PANEL_LEDES: Record<FrameMode, string> = {
  start: "Sort your documents first, then pick the route that fits. The chart above works any time.",
  sorter: "Step 1 · Upload your tax documents and sort them into folders. Every route reads them from here.",
  costs: `Step 2a · ${ROUTE_LEADS.costs} give the preparer Summaries.md, then check their quote against typical fees.`,
  audit: `Step 2b · ${ROUTE_LEADS.audit} the owed-audit skill checks the return's amount owed against your documents.`,
  checklist: `Step 2c · ${ROUTE_LEADS.checklist} the forms and lines your answers on the chart call for. Usable any time.`,
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
