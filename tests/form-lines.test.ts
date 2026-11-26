import assert from "node:assert/strict";
import test from "node:test";
import { buildChecklist } from "../src/lib/graph/checklist";
import { formLines } from "../src/lib/graph/form-lines";
import { applyAnswer, blankSession } from "../src/lib/graph/session";
import type { Session } from "../src/lib/graph/types";

function path(year: "y2025" | "y2026", answers: [string, string][]): Session {
  return answers.reduce((session, [id, answerId]) => applyAnswer(session, id, answerId), applyAnswer(blankSession(), "year", year));
}

test("2025 uses the final form lines and 2026 the draft lines", () => {
  const y25 = formLines(2025);
  const y26 = formLines(2026);
  assert.equal(y25.certainty, "sourced");
  assert.equal(y26.certainty, "verify");
  assert.equal(y25.form1040.schedule1A, "13b");
  assert.equal(y25.form1040.qbi, "13a");
  assert.equal(y26.form1040.schedule1A, "13a");
  assert.equal(y26.form1040.qbi, "13b");
  assert.equal(y25.form1040.charitableNonItemizer, null);
  assert.equal(y26.form1040.charitableNonItemizer, "12f");
  assert.deepEqual([y25.schedule1A.tips, y25.schedule1A.overtime, y25.schedule1A.car, y25.schedule1A.senior, y25.schedule1A.total], ["13", "21", "30", "37", "38"]);
  assert.deepEqual([y26.schedule1A.tips, y26.schedule1A.overtime, y26.schedule1A.car, y26.schedule1A.senior, y26.schedule1A.total], ["15", "27", "36", "43", "44"]);
  assert.match(y26.form1040.source.url, /irs-dft\/f1040--dft\.pdf/);
  assert.match(y26.schedule1A.source.url, /irs-dft\/f1040s1a--dft\.pdf/);
  assert.equal(formLines(null).certainty, "verify");
  assert.match(formLines(null).note, /not selected/);
});

test("switching the year moves the Schedule 1-A and Form 1040 lines in the checklist", () => {
  const answers: [string, string][] = [["filing_status", "single"], ["schedule_1a", "yes"], ["s1a_tips", "yes"], ["s1a_car", "yes"], ["s1a_senior", "yes"]];
  const byId = (session: Session) => new Map(buildChecklist(session).map((item) => [item.id, item]));
  const c25 = byId(path("y2025", answers));
  const c26 = byId(path("y2026", answers));
  assert.equal(c25.get("s1a-tips")?.line, "13");
  assert.equal(c26.get("s1a-tips")?.line, "15");
  assert.equal(c25.get("s1a-car")?.line, "22 (VIN) and 30");
  assert.equal(c26.get("s1a-car")?.line, "28 (VIN) and 36");
  assert.equal(c25.get("s1a-total")?.line, "38 → Form 1040 line 13b");
  assert.equal(c26.get("s1a-total")?.line, "44 → Form 1040 line 13a");
  assert.match(c25.get("s1a-senior")?.summary ?? "", /born before January 2, 1961/);
  assert.match(c26.get("s1a-senior")?.summary ?? "", /born before January 2, 1962/);
  assert.equal(c25.get("s1a-tips")?.certainty, "sourced");
  assert.equal(c26.get("s1a-tips")?.certainty, "verify");
});

test("Form 1040 rows read the selected year's lines and 2026 notes the new line 12f", () => {
  const answers: [string, string][] = [["filing_status", "single"], ["claimed_dependent", "no"], ["age_blind", "no"], ["deduction_choice", "standard"]];
  const deduction = (year: "y2025" | "y2026") => buildChecklist(path(year, answers)).find((item) => item.id === "deduction");
  const d25 = deduction("y2025");
  const d26 = deduction("y2026");
  assert.equal(d25?.line, "12e");
  assert.equal(d26?.line, "12e and 12f");
  assert.match(d26?.summary ?? "", /line 12f, a charitable contribution deduction/);
  assert.doesNotMatch(d25?.summary ?? "", /12f/);
  assert.match(d26?.source?.url ?? "", /irs-dft/);
});
