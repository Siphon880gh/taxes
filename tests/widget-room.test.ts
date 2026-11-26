import assert from "node:assert/strict";
import test from "node:test";
import { widgetCrowded } from "../src/lib/widget-room";

test("the chart widget shows until it has been measured", () => {
  assert.equal(widgetCrowded(null, true), false);
  assert.equal(widgetCrowded(null, false), false);
});

test("the open widget hides when there is less than its height between the Path library and the dock", () => {
  assert.equal(widgetCrowded(0, true), true);
  assert.equal(widgetCrowded(159, true), true);
  assert.equal(widgetCrowded(160, true), false);
  assert.equal(widgetCrowded(400, true), false);
});

test("the collapsed widget needs less room", () => {
  assert.equal(widgetCrowded(71, false), true);
  assert.equal(widgetCrowded(72, false), false);
  assert.equal(widgetCrowded(120, false), false);
});
