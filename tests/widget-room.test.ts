import assert from "node:assert/strict";
import test from "node:test";
import { railPillStack, widgetCrowded } from "../src/lib/widget-room";

test("the chart widget shows until it has been measured", () => {
  assert.equal(widgetCrowded(null, true), false);
  assert.equal(widgetCrowded(null, false), false);
});

test("the open widget hides when the pills and magnifier would meet the Path library", () => {
  const open = 136 + 24 + railPillStack;
  assert.equal(widgetCrowded(0, true), true);
  assert.equal(widgetCrowded(open - 1, true), true);
  assert.equal(widgetCrowded(open, true), false);
  assert.equal(widgetCrowded(open + 200, true), false);
});

test("the collapsed widget needs less room", () => {
  const collapsed = 48 + 24 + railPillStack;
  assert.equal(widgetCrowded(collapsed - 1, false), true);
  assert.equal(widgetCrowded(collapsed, false), false);
  assert.equal(widgetCrowded(collapsed + 80, false), false);
});
