import assert from "node:assert/strict";
import test from "node:test";
import { AiUnavailableError, aiUnavailableFrom, harnessPrompt, harnessSnag, readAiJson, taxYearFromFolder } from "../src/lib/ai-tasks";

test("the snag names the skill, the year, and the folder", () => {
  const folder = "Tax Year 2025 - Extended to Oct 15";
  const text = harnessSnag("tax-return-owed-audit", folder);
  assert.match(text, /API key or billing is not set up/);
  assert.match(text, /tax-return-owed-audit skill/);
  assert.match(text, /Tax Year 2025/);
  assert.match(text, /sorter\/Tax Year 2025 - Extended to Oct 15/);
  assert.equal(taxYearFromFolder(folder), "Tax Year 2025");
  assert.equal(taxYearFromFolder(null), null);
  const open = harnessSnag("tax-document-classification", null);
  assert.match(open, /applicable tax year/);
  assert.match(open, /tax-year folder under sorter/);
});

test("the harness prompt stays relative to the app folder", () => {
  const prompt = harnessPrompt("tax-document-summaries", "Tax Year 2026 - Return");
  assert.match(prompt, /tax-document-summaries/);
  assert.match(prompt, /sorter\/Tax Year 2026 - Return/);
  assert.match(prompt, /\.agents\/skills\/tax-document-summaries\/SKILL\.md/);
  assert.doesNotMatch(prompt, /\/Users\/|\\\\/);
});

test("an unavailable AI response becomes the snag error", async () => {
  assert.deepEqual(aiUnavailableFrom({ ok: false, code: "ai-unavailable", skill: "tax-document-classification", folder: "Tax Year 2025 - Return" }), {
    skill: "tax-document-classification",
    folder: "Tax Year 2025 - Return",
  });
  assert.equal(aiUnavailableFrom({ ok: false, error: "bad plan" }), null);
  const response = new Response(JSON.stringify({ ok: false, code: "ai-unavailable", skill: "freetaxusa-walkthrough", folder: "" }), { status: 409 });
  await assert.rejects(readAiJson(response), (error: unknown) => {
    assert.ok(error instanceof AiUnavailableError);
    assert.equal(error.skill, "freetaxusa-walkthrough");
    return true;
  });
});
