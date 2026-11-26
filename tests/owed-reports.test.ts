import assert from "node:assert/strict";
import test from "node:test";
import { auditTab, NO_AUDIT_HINT, owedReportsFrom, reportFolder } from "../src/lib/owed-reports";

test("reports come from the api.php status, exact names only", () => {
  assert.equal(owedReportsFrom({ ok: false }), null);
  assert.deepEqual(owedReportsFrom({ ok: true }), { audits: [], rentBreakdowns: [] }, "an older api.php without rentBreakdowns");
  assert.deepEqual(
    owedReportsFrom({
      ok: true,
      owedAudits: ["Tax Year 2025/Owed Audit.md", "notes.txt", 4],
      rentBreakdowns: ["Tax Year 2025/Owe Audit Breakdown - Rent.md", "Owe Audit Breakdown - Rent (copy).md"],
    }),
    { audits: ["Tax Year 2025/Owed Audit.md"], rentBreakdowns: ["Tax Year 2025/Owe Audit Breakdown - Rent.md"] },
  );
});

test("the Return & Owe Audit tab is grayed out until a report exists", () => {
  assert.deepEqual(auditTab({ status: "loading" }), { disabled: false, hint: null }, "no flicker while checking");
  assert.deepEqual(auditTab({ status: "ready", reports: { audits: [], rentBreakdowns: [] } }), { disabled: true, hint: NO_AUDIT_HINT });
  assert.match(NO_AUDIT_HINT, /No Owed Audit\.md yet\. Ask AI to audit owed for this tax-year folder/);
  assert.deepEqual(auditTab({ status: "ready", reports: { audits: ["Owed Audit.md"], rentBreakdowns: [] } }), { disabled: false, hint: null });
  assert.equal(auditTab({ status: "ready", reports: { audits: [], rentBreakdowns: ["x/Owe Audit Breakdown - Rent.md"] } }).disabled, false);
  const down = auditTab({ status: "error", message: "Could not reach the document sorter (sorter/api.php)." });
  assert.equal(down.disabled, true);
  assert.match(down.hint ?? "", /Could not check for Owed Audit\.md/);
});

test("report folders are shown relative to sorter", () => {
  assert.equal(reportFolder("Owed Audit.md"), "sorter");
  assert.equal(reportFolder("Tax Year 2025/Owe Audit Breakdown - Rent.md"), "Tax Year 2025");
});
