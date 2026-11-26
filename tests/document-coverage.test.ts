import assert from "node:assert/strict";
import test from "node:test";
import { applyCase } from "../src/lib/graph/cases";
import { blankSession } from "../src/lib/graph/session";
import { documentCoverage, expectedDocuments } from "../src/lib/document-coverage";
import { fetchPdfHints, formsLabel, hintBadge, parsePdfHints, type PdfHints } from "../src/lib/pdf-hints";
import { resetSorterSessions } from "../src/lib/sorter-client";

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

test("a PDF read inside counts by its form, not its name; scans fall back to the name", () => {
  const paths = ["inbox/scan-0001.pdf", "inbox/w2.pdf", "inbox/phone-photo-w2.pdf", "inbox/brokerage.pdf", "inbox/receipt mileage.pdf"];
  const hints: PdfHints = {
    "inbox/scan-0001.pdf": { path: "inbox/scan-0001.pdf", forms: ["W-2"], text: "read" },
    "inbox/w2.pdf": { path: "inbox/w2.pdf", forms: ["1099-NEC"], text: "read" },
    "inbox/phone-photo-w2.pdf": { path: "inbox/phone-photo-w2.pdf", forms: [], text: "none" },
    "inbox/brokerage.pdf": { path: "inbox/brokerage.pdf", forms: ["1099-INT", "1099-DIV", "1099-B"], text: "read" },
    "inbox/receipt mileage.pdf": { path: "inbox/receipt mileage.pdf", forms: [], text: "read" },
  };
  const revealed = ["check_w2", "schedule_c", "check_se_records", "check_capgain", "check_sch_b", "check_8962"];
  const report = documentCoverage({ revealed }, paths, hints);
  const byId = Object.fromEntries(report.expected.map((doc) => [doc.id, doc]));
  assert.deepEqual(byId.w2.files, ["inbox/scan-0001.pdf", "inbox/phone-photo-w2.pdf"], "the W-2 scan by content, the photo by name");
  assert.deepEqual(byId.w2.byContent, ["inbox/scan-0001.pdf"]);
  assert.deepEqual(byId["1099-nec"].byContent, ["inbox/w2.pdf"], "w2.pdf reads as a 1099-NEC, so it is not a W-2");
  assert.deepEqual(byId["1099-b"].files, ["inbox/brokerage.pdf"]);
  assert.deepEqual(byId["1099-int-div"].files, ["inbox/brokerage.pdf"], "one composite statement covers several forms");
  assert.deepEqual(byId["business-expenses"].files, ["inbox/receipt mileage.pdf"], "text with no tax form still matches by name");
  assert.deepEqual(byId["business-expenses"].byContent, []);
  assert.deepEqual(byId["1095-a"].files, []);
  assert.equal(report.found, 5);
  assert.equal(report.missing, 1);
});

test("without hints, coverage is the name match it always was", () => {
  const withHints = documentCoverage(applyCase("weng-2025"), staged, {});
  const without = documentCoverage(applyCase("weng-2025"), staged);
  assert.deepEqual(withHints, without);
  assert.ok(without.expected.every((doc) => doc.byContent.length === 0));
});

test("pdf-hints answers are validated, labelled, and fail soft", async () => {
  assert.deepEqual(parsePdfHints({ ok: false }), { available: false, hints: {} });
  const parsed = parsePdfHints({
    ok: true,
    available: true,
    files: [
      { path: "a.pdf", forms: ["W-2", 7, "x".repeat(40)], text: "read" },
      { path: "", forms: ["W-2"], text: "read" },
      { path: "b.pdf", forms: "W-2", text: "weird" },
    ],
  });
  assert.equal(parsed.available, true);
  assert.deepEqual(parsed.hints, {
    "a.pdf": { path: "a.pdf", forms: ["W-2"], text: "read" },
    "b.pdf": { path: "b.pdf", forms: [], text: "error" },
  });
  assert.equal(formsLabel(["W-2"]), "Form W-2");
  assert.equal(formsLabel(["1099-INT", "1099-DIV"]), "Forms 1099-INT, 1099-DIV");
  assert.equal(formsLabel(["Schedule E"]), "Schedule E");
  assert.equal(hintBadge({ path: "a.pdf", forms: ["1098-T"], text: "read" }), "Reads as Form 1098-T");
  assert.equal(hintBadge({ path: "a.pdf", forms: [], text: "none" }), "No text layer; matched by name");
  assert.equal(hintBadge(undefined), null);
  assert.equal(hintBadge({ path: "big.pdf", forms: [], text: "skipped" }), "Empty or over 25 MB, not read; matched by name");
  assert.equal(hintBadge({ path: "bad.pdf", forms: [], text: "error" }), "Could not read this PDF; matched by name");

  resetSorterSessions();
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("action=handshake")) return new Response(JSON.stringify({ ok: true, csrf: "t" }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, available: true, files: [{ path: "w.pdf", forms: ["W-2"], text: "read" }] }), { status: 200 });
  }) as typeof fetch;
  const result = await fetchPdfHints("sorter/api.php", fake);
  assert.deepEqual(result.hints["w.pdf"].forms, ["W-2"]);
  const post = calls[calls.length - 1];
  assert.equal(post.init?.method, "POST");
  assert.equal((post.init?.body as FormData).get("action"), "pdf-hints");
  assert.equal(new Headers(post.init?.headers).get("X-Taxes-Csrf"), "t");

  resetSorterSessions();
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.deepEqual(await fetchPdfHints("sorter/api.php", down), { available: false, hints: {} });
});
