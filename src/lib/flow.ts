/**
 * The guided flow over the bottom bar's tabs; the open tab's panel fills the page:
 *   Step 1  gather and sort documents (Document Sorter)
 *   Step 2  pick one route: (a) "Hand it to a pro:", (b) "AI calculate now:", (c) "Guide me on forms:".
 * Route (c), Path guide, is the only one that shows the path chart and its Path library; it works any time, with or
 * without documents. Forms Needed is not a route: the pill above the magnifier on Path guide opens it.
 */

export type FrameMode = "start" | "sorter" | "costs" | "audit" | "guide";

/** The short lead shown before each route's tab, card and link; the same words everywhere. */
export const ROUTE_LEADS = {
  costs: "Hand it to a pro:",
  audit: "AI calculate now:",
  guide: "Guide me on forms:",
} as const;

/** Groups of tabs that share a label over their own labels, such as the three routes under "then pick one:". */
export const FLOW_GROUPS = {
  routes: { label: "then pick one:" },
} as const;

export type FlowGroupId = keyof typeof FLOW_GROUPS;

/**
 * One tab in the bottom bar. `lead` is the label drawn on the bar's first row, over the tab's button on the
 * second row; `group` puts consecutive tabs under one group label. Adding a tab or a label is adding an entry here.
 */
export type FlowTab = { mode: FrameMode; label: string; step: string | null; lead: string | null; group?: FlowGroupId };

/** The tabs in flow order, with the step chip each one shows and the label over it. */
export const FLOW_TABS: FlowTab[] = [
  { mode: "start", label: "Start here", step: null, lead: "Begin:" },
  { mode: "sorter", label: "Document Sorter", step: "1", lead: "Gather docs:" },
  { mode: "costs", label: "Tax Pro Costs", step: "2a", lead: ROUTE_LEADS.costs, group: "routes" },
  { mode: "audit", label: "Return & Owe Audit", step: "2b", lead: ROUTE_LEADS.audit, group: "routes" },
  { mode: "guide", label: "Path guide", step: "2c", lead: ROUTE_LEADS.guide, group: "routes" },
];

export type FlowSegment = { group: FlowGroupId | null; label: string | null; tabs: FlowTab[] };

/** The bar's columns in order: a lone tab is its own segment; consecutive tabs of one group share a segment. */
export function flowSegments(tabs: FlowTab[] = FLOW_TABS): FlowSegment[] {
  const segments: FlowSegment[] = [];
  for (const tab of tabs) {
    const last = segments[segments.length - 1];
    if (tab.group && last?.group === tab.group) last.tabs.push(tab);
    else segments.push({ group: tab.group ?? null, label: tab.group ? FLOW_GROUPS[tab.group].label : null, tabs: [tab] });
  }
  return segments;
}

/** What a screen reader hears before the label: "Step 2a, Hand it to a pro: " (the chip and lead are drawn apart). */
export function spokenPrefix(tab: { step: string | null; lead: string | null }): string {
  return `${tab.step ? `Step ${tab.step}, ` : ""}${tab.lead ? `${tab.lead} ` : ""}`;
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
    lead: ROUTE_LEADS.guide,
    label: "Path guide",
    mode: "guide",
    summary:
      "Opens the path chart and its Path library. Click a box to answer it or leave a comment; each answer adds forms and lines to Forms Needed. Open it any time, even before any documents are staged.",
  },
];

/** One line under each panel heading: where this panel sits in the flow. */
export const PANEL_LEDES: Record<FrameMode, string> = {
  start: "Sort your documents first, then pick the route that fits. Path guide (2c) works any time.",
  sorter: "Step 1 · Upload your tax documents and sort them into folders. Every route reads them from here.",
  costs: `Step 2a · ${ROUTE_LEADS.costs} give the preparer Summaries.md, then check their quote against typical fees.`,
  audit: `Step 2b · ${ROUTE_LEADS.audit} the owed-audit skill checks the return's amount owed against your documents.`,
  guide: `Step 2c · ${ROUTE_LEADS.guide} the path chart asks one question at a time. Click a box to answer it or comment on it; Forms Needed keeps the forms and lines your answers add.`,
};

/** Under the Forms Needed heading. The list opens from the pill on Path guide. */
export const CHECKLIST_LEDE =
  "The forms and lines your answers on the path call for. Tick each one off as you confirm it on the return.";

export type StageOverview = { staged: number; summaries: boolean };

const APP_NOTES = new Set(["AGENTS.md", "Summaries.md", "Owed Audit.md", "Owe Audit Breakdown - Rent.md"]);

/** How many documents are staged and whether Summaries.md is anywhere in sorter, from an api.php status. */
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

/** Only Path guide (2c) shows the path chart and its Path library; every other route's panel gets the page. */
export function showsPath(mode: FrameMode): boolean {
  return mode === "guide";
}

/** Where this browser remembers whether Path guide was open. */
export const ROUTE_STORAGE_KEY = "taxes-route";

/**
 * The route to open on load: Path guide if it was open last time, else Start here. Other routes are not restored,
 * so a reload never lands on a grayed-out Return & Owe Audit before the sorter has answered.
 */
export function rememberedRoute(stored: string | null | undefined): FrameMode {
  return stored === "guide" ? "guide" : "start";
}
