import assert from "node:assert/strict";
import test from "node:test";
import { applyCase } from "../src/lib/graph/cases";
import { blankSession } from "../src/lib/graph/session";
import { documentCoverage, expectedDocuments } from "../src/lib/document-coverage";

const staged = [
  "Tax Year 2025/Income - Self-employment/2025_1099-NEC_Client A.pdf",
  "Tax Year 2025/Regulations - Health Insurance/2025_1095-A_Plan.pdf",
  "Tax Year 2025/Income - Investments and savings/Savings-Account-Interest-in-2025.pdf",
  "Tax Year 2025/Income - Rental/Lease 2025.pdf",
  "Tax Year 2025/.DS_Store",
  "AGENTS.md",
];

test("a blank chart expects nothing yet", () => {
  assert.deepEqual(expectedDocuments(blankSession()), []);
  assert.deepEqual(documentCoverage(blankSession(), staged), { expected: [], found: 0, missing: 0 });
});

test("the Coder/Nurse example expects 1099-NEC and rental records and finds them by name", () => {
  const report = documentCoverage(applyCase("weng-2025"), staged);
  const byId = Object.fromEntries(report.expected.map((doc) => [doc.id, doc]));
  assert.ok(byId["1099-nec"], "Schedule C path expects a 1099-NEC");
  assert.deepEqual(byId["1099-nec"].files, ["Tax Year 2025/Income - Self-employment/2025_1099-NEC_Client A.pdf"]);
  assert.ok(byId.rental, "Schedule E path expects rental records");
  assert.equal(byId.rental.files.length, 1);
  assert.equal(report.found + report.missing, report.expected.length);
});

test("dotfiles and the app's own notes never count as documents", () => {
  const report = documentCoverage({ revealed: ["check_w2", "check_prior_return"] }, [".DS_Store", "AGENTS.md", "Summaries.md"]);
  assert.equal(report.found, 0);
  assert.equal(report.missing, 2);
});

test("form names match on word boundaries, not inside other numbers", () => {
  const report = documentCoverage({ revealed: ["check_mortgage", "check_edu"] }, ["Deductions/1098-T Tuition.pdf"]);
  const byId = Object.fromEntries(report.expected.map((doc) => [doc.id, doc.files.length]));
  assert.equal(byId.education, 1);
  assert.equal(byId["1098"], 0);
});
