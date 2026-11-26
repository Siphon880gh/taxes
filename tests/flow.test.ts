import assert from "node:assert/strict";
import test from "node:test";
import { FLOW_TABS, PANEL_LEDES, ROUTES, stagedLabel, stageOverviewFrom } from "../src/lib/flow";

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
