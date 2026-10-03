import assert from "node:assert/strict";
import test from "node:test";
import { applyAnswer, assertGraphIntact, blankSession } from "../src/lib/graph/session";
import { applyCase, caseStudies } from "../src/lib/graph/cases";
import { buildChecklist } from "../src/lib/graph/checklist";
import { costReport } from "../src/lib/graph/cost";
import { mermaidSource } from "../src/lib/graph/mermaid";
import { tips } from "../src/lib/graph/tips";
import {
  federalBasicStandard,
  stateStandard,
  ten99kThreshold,
} from "../src/lib/graph/thresholds";

test("every question has an unknown path and every edge lands on a real node", () => {
  assert.deepEqual(assertGraphIntact(), []);
});

test("a blank start only preselects tax year 2025", () => {
  const session = blankSession();
  assert.equal(session.caseStudyId, null);
  assert.equal(session.quote, null);
  assert.deepEqual(session.answers, { year: { answerId: "y2025" } });
  assert.equal(session.revealed.includes("schedule_c"), false);
  assert.equal(session.revealed.includes("filing_status"), true);
});

test("Weng 2025 opens Schedule C, Schedule E, and Form 1040 without inventing the open facts", () => {
  const session = applyCase("weng-2025");
  for (const id of ["schedule_c", "schedule_e", "schedule_se", "form_1040", "check_manual", "flag_records"]) {
    assert.equal(session.revealed.includes(id), true, id);
  }
  assert.equal(session.answers.jurisdiction?.answerId, "unknown");
  assert.equal(session.answers.pay_amount?.answerId, "unknown");
  assert.equal(session.answers.rental_records?.answerId, "unknown");
  assert.equal(session.answers.rental_tenant, undefined);
  assert.equal(session.answers.rental_alloc, undefined);
  assert.equal(session.answers.rental_depr, undefined);
  assert.equal(session.revealed.includes("rental_tenant"), true);
  assert.equal(session.revealed.includes("rental_alloc"), true);
  assert.equal(session.revealed.includes("rental_depr"), true);
  assert.equal(session.quote, 975);
  assert.equal(session.answers.filing_status?.answerId, "single");
  assert.equal(session.answers.personal_mortgage?.answerId, "no");
  assert.equal(session.answers.se_entity?.answerId, "sole");
  assert.equal(session.answers.se_names?.text, "nursing and coding");
  assert.equal(session.answers.rental_count?.answerId, "one");
  assert.equal(session.answers.rental_history?.answerId, "prior_2019");

  const chart = mermaidSource(session);
  assert.match(chart, /nursing and coding/);
  assert.match(chart, /Schedule E is where rental property income and expenses go/);
  assert.match(chart, /flows onto/);
  assert.match(chart, /form_1040/);
  assert.doesNotMatch(chart, /-->\|"Louisiana"\|/);
  assert.match(chart, /class .*jurisdiction/);
  assert.match(chart, /pay_amount/);
  assert.match(chart, /rental_records/);
  assert.match(chart, /flag_records/);

  const cost = costReport(session);
  assert.equal(cost.direction, "same");
  assert.equal(cost.rows[0]?.amountLabel, "$975");
  assert.match(cost.quoteNote ?? "", /Nothing is added or subtracted/);
  assert.match(cost.framing ?? "", /rented since 2019/);
  assert.match(cost.framing ?? "", /doesn't change the price/);
  const turbo = cost.rows.find((row) => row.id === "tt-premium");
  assert.equal(turbo?.amountLabel, "$139");
  assert.equal(turbo?.unverified, false);
  const block = cost.rows.find((row) => row.id === "hrb");
  assert.equal(block?.unverified, true);
  assert.match(block?.amountLabel ?? "", /unverified/i);
  const nsa = cost.rows.find((row) => row.id === "nsa");
  assert.match(nsa?.note ?? "", /\$754/);
  assert.match(nsa?.note ?? "", /\$867/);
  assert.match(nsa?.note ?? "", /not a surveyed package price/);

  const state = stateStandard(2025, "single", "unknown");
  assert.equal(state.amount, null);
  const checklist = buildChecklist(session).map((item) => item.id);
  assert.ok(checklist.includes("sch-c"));
  assert.ok(checklist.includes("sch-e"));
  assert.ok(checklist.includes("1099k-manual"));
});

test("records problems do not invent a dollar adder on the quote", () => {
  const base = applyCase("weng-2025");
  const next = applyAnswer(base, "rental_records", "problems");
  const cost = costReport(next);
  assert.equal(cost.direction, "higher");
  assert.equal(cost.rows[0]?.amountLabel, "$975");
  assert.match(cost.quoteNote ?? "", /No dollar amount is added/);
});

test("the joint W-2 and crypto illustration is a different path", () => {
  const session = applyCase("joint-w2-crypto");
  assert.equal(session.quote, null);
  assert.equal(session.revealed.includes("schedule_e"), false);
  assert.equal(session.revealed.includes("schedule_c"), false);
  assert.equal(session.revealed.includes("check_w2"), true);
  assert.equal(session.revealed.includes("check_crypto"), true);
  assert.equal(session.revealed.includes("check_capgain"), true);
  assert.notEqual(session.caseStudyId, "weng-2025");
  assert.equal(costReport(session).direction, "none");
  assert.equal(costReport(session).rows.find((row) => row.id === "tt-premium")?.amountLabel, "$139");
});

test("sourced thresholds keep their year", () => {
  assert.equal(federalBasicStandard(2025, "single").amount, 15750);
  assert.equal(federalBasicStandard(2026, "mfj").amount, 32200);
  assert.equal(federalBasicStandard(2024, "single").amount, null);
  assert.equal(stateStandard(2025, "single", "louisiana").amount, 12500);
  assert.equal(stateStandard(2025, "hoh", "california").amount, 11412);
  assert.equal(ten99kThreshold.year, 2025);
  assert.equal(ten99kThreshold.grossExceeds, 20000);
  assert.equal(ten99kThreshold.transactionsExceed, 200);
  assert.match(ten99kThreshold.recalledMatches, /not flagged as a conflict/);
});

test("the self-employment tip uses the required toast", () => {
  assert.equal(
    tips.se_tax.toast,
    "There are calculations to figure out how much you owe in self employment (SE) tax. Read more",
  );
  const body = tips.se_tax.readMore?.({ year: 2025, quote: 975, caseStudyId: "weng-2025" });
  assert.match(body?.bullets?.join("\n") ?? "", /92\.35%/);
  assert.match(body?.bullets?.join("\n") ?? "", /15\.3%/);
  assert.match(body?.bullets?.join("\n") ?? "", /\$176,100/);
  const otherYear = tips.se_tax.readMore?.({ year: 2026, quote: null, caseStudyId: null });
  assert.doesNotMatch(otherYear?.bullets?.join("\n") ?? "", /176,100/);
});

test("case studies are labeled as examples and there is more than one", () => {
  assert.ok(caseStudies.length >= 2);
  assert.match(caseStudies.map((item) => item.summary).join(" "), /not tax advice|illustration/i);
});
