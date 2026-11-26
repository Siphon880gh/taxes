import assert from "node:assert/strict";
import test from "node:test";
import { applyCase } from "../src/lib/graph/cases";
import { answerOf, applyAnswer, blankSession, importSession, sessionToJson } from "../src/lib/graph/session";
import { DEFAULT_TAX_YEAR_ID, isTaxYearId, TAX_YEARS, taxYearLabel } from "../src/lib/graph/tax-years";
import { federalBasicStandard, parseYear, saltCap, socialSecurityWageBase } from "../src/lib/graph/thresholds";
import { readStoredSession, writeStoredSession } from "../src/lib/session-storage";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

test("the selector offers 2025 and 2026 and a blank chart starts on 2026", () => {
  assert.deepEqual(TAX_YEARS.map((item) => item.label), ["2025", "2026"]);
  assert.equal(DEFAULT_TAX_YEAR_ID, "y2026");
  assert.equal(answerOf(blankSession(), "year"), "y2026");
  assert.equal(parseYear(answerOf(blankSession(), "year")), 2026);
  assert.equal(taxYearLabel("y2025"), "2025");
  assert.equal(taxYearLabel("unknown"), null);
  assert.equal(taxYearLabel(undefined), null);
  assert.equal(isTaxYearId("y2026"), true);
  assert.equal(isTaxYearId("y2024"), false);
});

test("switching the year keeps the other answers and changes the figures", () => {
  let session = applyAnswer(blankSession(), "filing_status", "mfj");
  session = applyAnswer(session, "deduction_choice", "itemized");
  const year26 = parseYear(answerOf(session, "year"));
  const switched = applyAnswer(session, "year", "y2025");
  const year25 = parseYear(answerOf(switched, "year"));
  assert.equal(answerOf(switched, "filing_status"), "mfj");
  assert.equal(answerOf(switched, "deduction_choice"), "itemized");
  assert.deepEqual(switched.revealed.filter((id) => id !== "year"), session.revealed.filter((id) => id !== "year"));
  assert.equal(federalBasicStandard(year26, "mfj").amount, 32200);
  assert.equal(federalBasicStandard(year25, "mfj").amount, 31500);
  assert.equal(saltCap(year26, "mfj").amount, 40400);
  assert.equal(saltCap(year25, "mfj").amount, 40000);
  assert.equal(socialSecurityWageBase(year26).amount, 184500);
  assert.equal(socialSecurityWageBase(year25).amount, 176100);
});

test("an example keeps its own year until you switch it", () => {
  const weng = applyCase("weng-2025");
  assert.equal(answerOf(weng, "year"), "y2025");
  assert.equal(answerOf(applyAnswer(weng, "year", "y2026"), "year"), "y2026");
});

test("the chosen year is saved in the browser and carried through Export and Import", () => {
  for (const id of ["y2025", "y2026"]) {
    const session = applyAnswer(applyAnswer(blankSession(), "year", id), "filing_status", "single");
    const store = memoryStore();
    writeStoredSession(session, store);
    assert.equal(answerOf(readStoredSession(store)!, "year"), id);
    const exported = sessionToJson(session);
    assert.match(exported, new RegExp(`"answerId": "${id}"`));
    assert.equal(answerOf(importSession(exported), "year"), id);
  }
});
