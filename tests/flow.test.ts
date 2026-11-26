import assert from "node:assert/strict";
import test from "node:test";
import { FLOW_TABS, PANEL_LEDES, ROUTE_LEADS, ROUTES, routeName, spokenPrefix, stagedLabel, stageOverviewFrom } from "../src/lib/flow";

test("the tabs follow the flow: start, step 1, then the three routes", () => {
  assert.deepEqual(
    FLOW_TABS.map((tab) => `${tab.step ?? "-"} ${tab.label}`),
    ["- Start here", "1 Document Sorter", "2a Tax Pro Costs", "2b Return & Owe Audit", "2c Checklist"],
  );
  assert.deepEqual(
    ROUTES.map((route) => [route.step, route.mode]),
    [
      ["2a", "costs"],
      ["2b", "audit"],
      ["2c", "checklist"],
    ],
  );
  for (const tab of FLOW_TABS) assert.ok(PANEL_LEDES[tab.mode], `${tab.mode} has a lede`);
});

test("each route has one lead, the same on its tab, card, link and panel lede", () => {
  assert.deepEqual(
    FLOW_TABS.map((tab) => tab.lead),
    [null, null, "Hand it to a pro:", "AI calculate now:", "Guide me on forms:"],
  );
  for (const route of ROUTES) {
    const tab = FLOW_TABS.find((item) => item.mode === route.mode)!;
    assert.equal(route.lead, tab.lead);
    assert.equal(route.label, tab.label);
    assert.ok(route.lead.endsWith(":"), `${route.lead} ends with a colon`);
    assert.ok(PANEL_LEDES[route.mode].includes(route.lead), `${route.mode} lede uses ${route.lead}`);
  }
  assert.equal(Object.keys(ROUTE_LEADS).length, 3);
  assert.deepEqual(ROUTES.map(routeName), ["Hand it to a pro: Tax Pro Costs", "AI calculate now: Return & Owe Audit", "Guide me on forms: Checklist"]);
});

test("screen readers hear the step and the lead before the label", () => {
  const [start, sorter, costs, audit, checklist] = FLOW_TABS;
  assert.equal(spokenPrefix(start), "");
  assert.equal(spokenPrefix(sorter), "Step 1, ");
  assert.equal(`${spokenPrefix(costs)}${costs.label}`, "Step 2a, Hand it to a pro: Tax Pro Costs");
  assert.equal(`${spokenPrefix(audit)}${audit.label}`, "Step 2b, AI calculate now: Return & Owe Audit");
  assert.equal(`${spokenPrefix(checklist)}${checklist.label}`, "Step 2c, Guide me on forms: Checklist");
});

test("the stage overview counts documents, not the app's own notes, and finds Summaries.md anywhere", () => {
  assert.equal(stageOverviewFrom({ ok: false }), null);
  assert.deepEqual(stageOverviewFrom({ ok: true, files: [] }), { staged: 0, summaries: false });
  assert.deepEqual(
    stageOverviewFrom({
      ok: true,
      summaries: false,
      files: [{ path: "inbox/w2.pdf" }, { path: "inbox/Summaries.md" }, { path: "AGENTS.md" }, { path: "x/.DS_Store" }, { path: "Income - Rental/lease.pdf" }],
    }),
    { staged: 2, summaries: true },
  );
  assert.deepEqual(stageOverviewFrom({ ok: true, summaries: true, files: [] }), { staged: 0, summaries: true });
  assert.equal(stagedLabel(0), "Nothing staged yet");
  assert.equal(stagedLabel(1), "1 document staged");
  assert.equal(stagedLabel(12), "12 documents staged");
});
