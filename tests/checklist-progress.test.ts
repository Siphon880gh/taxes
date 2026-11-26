import assert from "node:assert/strict";
import test from "node:test";
import { applyCase } from "../src/lib/graph/cases";
import { buildChecklist } from "../src/lib/graph/checklist";
import { sessionFile } from "../src/lib/graph/session";
import {
  checklistMarkdown,
  checklistProgress,
  cleanConfirmed,
  CONFIRMED_STORAGE_KEY,
  confirmedFromExport,
  readConfirmed,
  toggleConfirmed,
  writeConfirmed,
} from "../src/lib/checklist-progress";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const items = buildChecklist(applyCase("weng-2025"));

test("progress counts only marks for items that are on the checklist now", () => {
  assert.ok(items.length > 2);
  const marks = [items[0].id, items[1].id, "gone-item"];
  assert.deepEqual(checklistProgress(items, marks), { done: 2, total: items.length });
});

test("toggle adds and removes one id", () => {
  assert.deepEqual(toggleConfirmed([], "w2"), ["w2"]);
  assert.deepEqual(toggleConfirmed(["w2", "sch-c"], "w2"), ["sch-c"]);
});

test("confirmations save, reload, and clear in the browser store", () => {
  const store = memoryStore();
  writeConfirmed(["w2", "w2", "sch-c"], store);
  assert.deepEqual(readConfirmed(store), ["w2", "sch-c"]);
  writeConfirmed([], store);
  assert.equal(store.data.has(CONFIRMED_STORAGE_KEY), false);
  store.setItem(CONFIRMED_STORAGE_KEY, "nope");
  assert.deepEqual(readConfirmed(store), []);
});

test("an exported chart carries its confirmations; older files carry none", () => {
  const file = JSON.stringify({ ...sessionFile(applyCase("weng-2025")), confirmed: ["w2", 7, ""] });
  assert.deepEqual(confirmedFromExport(file), ["w2"]);
  assert.deepEqual(confirmedFromExport(JSON.stringify(sessionFile(applyCase("weng-2025")))), []);
  assert.deepEqual(confirmedFromExport("not json"), []);
  assert.deepEqual(cleanConfirmed("w2"), []);
});

test("the Markdown checklist ticks confirmed items and keeps sources and the disclaimer", () => {
  const markdown = checklistMarkdown({
    title: "Confirmation checklist",
    returnYear: "2025",
    items,
    confirmed: [items[0].id],
    openQuestions: 3,
    disclaimer: "Not tax advice.",
  });
  assert.match(markdown, /^# Confirmation checklist/);
  assert.match(markdown, new RegExp(`Confirmed: 1 of ${items.length}`));
  assert.match(markdown, /Open questions on the chart: 3/);
  assert.equal((markdown.match(/- \[x\]/g) ?? []).length, 1);
  assert.equal((markdown.match(/- \[ \]/g) ?? []).length, items.length - 1);
  assert.match(markdown, /> Not tax advice\./);
});
