import assert from "node:assert/strict";
import test from "node:test";
import { CHECKLIST_LEDE, FLOW_TABS, flowSegments, PANEL_LEDES, rememberedRoute, showsPath, ROUTE_LEADS, ROUTES, routeName, spokenPrefix, stagedLabel, stageOverviewFrom, type FlowTab } from "../src/lib/flow";

test("the tabs follow the flow: start, step 1, then the three routes", () => {
  assert.deepEqual(
    FLOW_TABS.map((tab) => `${tab.step ?? "-"} ${tab.label}`),
    ["- Start here", "1 Document Sorter", "2a Tax Pro Costs", "2b Return & Owe Audit", "2c Path guide"],
  );
  assert.deepEqual(
    ROUTES.map((route) => [route.step, route.mode]),
    [
      ["2a", "costs"],
      ["2b", "audit"],
      ["2c", "guide"],
    ],
  );
  for (const tab of FLOW_TABS) assert.ok(PANEL_LEDES[tab.mode], `${tab.mode} has a lede`);
});

test("each route has one lead, the same on its tab, card, link and panel lede", () => {
  assert.deepEqual(
    FLOW_TABS.map((tab) => tab.lead),
    ["Begin:", "Gather docs:", "Hand it to a pro:", "AI calculate now:", "Guide me on forms:"],
  );
  for (const route of ROUTES) {
    const tab = FLOW_TABS.find((item) => item.mode === route.mode)!;
    assert.equal(route.lead, tab.lead);
    assert.equal(route.label, tab.label);
    assert.ok(route.lead.endsWith(":"), `${route.lead} ends with a colon`);
    assert.ok(PANEL_LEDES[route.mode].includes(route.lead), `${route.mode} lede uses ${route.lead}`);
  }
  assert.equal(Object.keys(ROUTE_LEADS).length, 3);
  assert.deepEqual(ROUTES.map(routeName), ["Hand it to a pro: Tax Pro Costs", "AI calculate now: Return & Owe Audit", "Guide me on forms: Path guide"]);
});

test("screen readers hear the step and the lead before the label", () => {
  const [start, sorter, costs, audit, guide] = FLOW_TABS;
  assert.equal(`${spokenPrefix(start)}${start.label}`, "Begin: Start here");
  assert.equal(`${spokenPrefix(sorter)}${sorter.label}`, "Step 1, Gather docs: Document Sorter");
  for (const tab of FLOW_TABS) assert.ok(tab.lead?.endsWith(":"), `${tab.mode} has a label ending in a colon`);
  assert.equal(`${spokenPrefix(costs)}${costs.label}`, "Step 2a, Hand it to a pro: Tax Pro Costs");
  assert.equal(`${spokenPrefix(audit)}${audit.label}`, "Step 2b, AI calculate now: Return & Owe Audit");
  assert.equal(`${spokenPrefix(guide)}${guide.label}`, "Step 2c, Guide me on forms: Path guide");
});

test("the bar's columns: lone tabs, then the routes under one group label", () => {
  assert.deepEqual(
    flowSegments().map((segment) => [segment.label, segment.tabs.map((tab) => tab.mode)]),
    [
      [null, ["start"]],
      [null, ["sorter"]],
      ["then pick one:", ["costs", "audit", "guide"]],
    ],
  );
  // More labels are more entries: a new grouped tab joins its group, and a lone tab after it starts a new column.
  const more: FlowTab[] = [
    ...FLOW_TABS,
    { mode: "guide", label: "Extra route", step: "2d", lead: "Something else:", group: "routes" },
    { mode: "start", label: "After", step: "3", lead: "Then:" },
  ];
  assert.deepEqual(
    flowSegments(more).map((segment) => segment.tabs.length),
    [1, 1, 4, 1],
  );
});

test("only Path guide shows the chart; the Checklist is a side panel, not a route", () => {
  assert.deepEqual(
    FLOW_TABS.filter((tab) => showsPath(tab.mode)).map((tab) => tab.label),
    ["Path guide"],
  );
  assert.ok(!FLOW_TABS.some((tab) => /Checklist/.test(tab.label)), "no Checklist tab");
  assert.ok(!ROUTES.some((route) => route.label === "Checklist"));
  assert.ok(/Click a box to answer it/.test(PANEL_LEDES.guide));
  assert.ok(/Tick each one off/.test(CHECKLIST_LEDE));
  assert.ok(!/any route/.test(CHECKLIST_LEDE));
});

test("a reload reopens Path guide if it was open, and otherwise Start here", () => {
  assert.equal(rememberedRoute("guide"), "guide");
  for (const other of ["start", "sorter", "costs", "audit", "checklist", "", null, undefined]) assert.equal(rememberedRoute(other), "start");
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
