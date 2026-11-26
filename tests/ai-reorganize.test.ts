import assert from "node:assert/strict";
import test from "node:test";
import { examplePrompt, isSafeRelativePath, keepParam, parseAiPlan, parseAiStatus, UPLOADS_FOLDER } from "../src/lib/ai-reorganize";

test("parseAiStatus reads both the configured and the no-key answer", () => {
  assert.deepEqual(parseAiStatus({ ok: true, configured: false, folder: "sorter/stage", reason: "No key" }), {
    configured: false,
    reason: "No key",
  });
  assert.deepEqual(parseAiStatus({ ok: true, configured: true, folder: "sorter/stage", provider: "anthropic", model: "m" }), {
    configured: true,
    provider: "anthropic",
    model: "m",
  });
  assert.equal(parseAiStatus({ ok: true, configured: true, provider: "other" }), null);
  assert.equal(parseAiStatus({ ok: false, error: "forbidden" }), null);
});

test("isSafeRelativePath keeps paths under the upload root", () => {
  assert.equal(isSafeRelativePath("Tax Year 2025/Income - Wages"), true);
  assert.equal(isSafeRelativePath("../outside"), false);
  assert.equal(isSafeRelativePath("a/../b"), false);
  assert.equal(isSafeRelativePath("/etc"), false);
  assert.equal(isSafeRelativePath("C:/x"), false);
  assert.equal(isSafeRelativePath("a//b"), false);
  assert.equal(isSafeRelativePath(""), false);
});

test("parseAiPlan drops unsafe moves and counts them as skipped", () => {
  const plan = parseAiPlan({
    ok: true,
    token: "t",
    provider: "openai",
    model: "m",
    skipped: 2,
    summary: "s",
    moves: [
      { path: "w2.pdf", category: "Income - Wages", reason: "W-2" },
      { path: "../x.pdf", category: "Deductions" },
      { path: "a.pdf", category: "../up" },
      { path: "b.pdf" },
    ],
  });
  assert.ok(plan);
  assert.deepEqual(plan.moves, [{ path: "w2.pdf", category: "Income - Wages", reason: "W-2" }]);
  assert.equal(plan.skipped, 5);
  assert.equal(parseAiPlan({ ok: true, moves: [] }), null, "a plan needs its token");
});

test("keepParam lists the kept indexes", () => {
  assert.equal(keepParam([true, false, true]), "0,2");
  assert.equal(keepParam([false]), "");
});

test("examplePrompt names the uploads folder relative to the app, never an absolute path", () => {
  const prompt = examplePrompt();
  assert.match(prompt, /^Reorganize the tax documents in sorter\/stage\./);
  assert.match(prompt, /AGENTS\.md/);
  assert.doesNotMatch(prompt, /\/Users\/|taxes\//);
  assert.equal(UPLOADS_FOLDER, "sorter/stage");
});
