import assert from "node:assert/strict";
import test from "node:test";
import {
  addInstance,
  applyAnswer,
  assertGraphIntact,
  blankSession,
  openQuestions,
  readAnswer,
  renameInstance,
  selectInstance,
  setNodeComment,
} from "../src/lib/graph/session";
import { applyCase, caseStudies } from "../src/lib/graph/cases";
import { buildChecklist } from "../src/lib/graph/checklist";
import { costReport } from "../src/lib/graph/cost";
import { chartView, mermaidSource } from "../src/lib/graph/mermaid";
import { getNode } from "../src/lib/graph/nodes";
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

test("switching self-employment instances redraws the active branch and preserves each answer", () => {
  let session = applyAnswer(blankSession(), "filing_status", "single");
  session = applyAnswer(session, "se", "yes");
  session = applyAnswer(session, "se_entity", "sole");
  session = addInstance(session, "se");
  session = applyAnswer(session, "se_entity", "partnership");

  assert.deepEqual(session.instances.se, ["Business activity 1", "Business activity 2"]);
  assert.equal(session.activeInstance.se, 1);
  assert.equal(readAnswer(session, "se_entity")?.answerId, "partnership");
  assert.equal(session.revealed.includes("check_entity_k1"), true);
  assert.equal(session.revealed.includes("se_count"), false);
  assert.match(mermaidSource(session), /Checking Business activity 2/);

  session = selectInstance(session, "se", 0);
  assert.equal(readAnswer(session, "se_entity")?.answerId, "sole");
  assert.equal(session.revealed.includes("check_entity_k1"), false);
  assert.equal(session.revealed.includes("se_count"), true);
  assert.match(mermaidSource(session), /Checking Business activity 1/);

  session = selectInstance(session, "se", 1);
  assert.equal(readAnswer(session, "se_entity")?.answerId, "partnership");
});

test("a blank instance name can still be switched to and renamed", () => {
  let session = applyAnswer(blankSession(), "filing_status", "single");
  session = applyAnswer(session, "se", "yes");
  session = addInstance(session, "se");
  session = renameInstance(session, "se", 1, "");
  session = selectInstance(session, "se", 0);
  session = selectInstance(session, "se", 1);

  assert.equal(session.activeInstance.se, 1);
  session = renameInstance(session, "se", 1, "Consulting");
  assert.equal(session.instances.se[1], "Consulting");
});

test("selecting Single groups a fan-out of more than 7 topics by section", () => {
  const session = applyAnswer(blankSession(), "filing_status", "single");
  assert.equal(session.revealed.includes("crypto"), true);
  const chart = mermaidSource(session);
  assert.match(chart, /group_filing_status_invest\[/);
  assert.match(chart, /Interest, capital gains, and digital assets<br\/>3 topics/);
  assert.match(chart, /Retirement, HSA, education, estimates, and dependents<br\/>5 topics/);
  assert.match(chart, /Standard deduction and itemizing<br\/>5 topics/);
  assert.doesNotMatch(chart, /\n  interest\[/);
  assert.doesNotMatch(chart, /\n  dependents\[/);
  assert.doesNotMatch(chart, /\n  deduction_choice\[/);
  assert.match(chart, /\n  w2\[/);
  assert.match(chart, /\n  se\[/);
  assert.match(chart, /\n  payapps\[/);
  assert.match(chart, /\n  rental\[/);

  const opened = mermaidSource(session, ["group_filing_status_invest"]);
  assert.match(opened, /\n  interest\[/);
  assert.match(opened, /\n  capgain\[/);
  assert.match(opened, /\n  crypto\[/);
  assert.match(opened, /group_filing_status_invest --> interest/);
  assert.doesNotMatch(opened, /\n  dependents\[/);
});

function levelCounts(view: ReturnType<typeof chartView>): number[] {
  const depth = new Map<string, number>([["year", 0]]);
  const present = new Set(view.ids);
  const queue = ["year"];
  while (queue.length) {
    const from = queue.shift()!;
    const level = depth.get(from)!;
    for (const edge of view.edges) {
      if (edge.from !== from || !present.has(edge.to) || depth.has(edge.to)) continue;
      depth.set(edge.to, level + 1);
      queue.push(edge.to);
    }
  }
  const counts = new Map<number, number>();
  for (const id of view.ids) {
    const level = depth.get(id) ?? 0;
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return [...counts.values()];
}

function answerAll(prefer: string) {
  let session = applyAnswer(blankSession(), "filing_status", "single");
  for (let guard = 0; guard < 80; guard++) {
    const open = openQuestions(session);
    if (!open.length) break;
    let progressed = false;
    for (const id of open) {
      const node = getNode(id);
      const choice = node.answers?.find((answer) => answer.id === prefer) ?? node.answers?.[0];
      if (!choice && node.textInput) {
        session = applyAnswer(session, id, node.textInput.answerId, "sample");
        progressed = true;
        continue;
      }
      if (!choice) continue;
      session = applyAnswer(session, id, choice.id);
      progressed = true;
    }
    if (!progressed) break;
  }
  return session;
}

test("a chart level wider than 7 collapses into section clusters", () => {
  const session = answerAll("no");
  const view = chartView(session);
  assert.ok(levelCounts(view).every((count) => count <= 7));
  assert.equal(view.groups.find((group) => group.id === "group_filing_status_invest")?.open, false);
  assert.equal(view.ids.includes("interest"), false);
  const opened = chartView(session, ["group_filing_status_invest"]);
  assert.equal(opened.ids.includes("interest"), true);
  assert.ok(levelCounts(chartView(answerAll("yes"))).every((count) => count <= 7));
  assert.ok(levelCounts(chartView(applyCase("joint-w2-crypto"))).every((count) => count <= 7));
});

test("a node comment stays on the session and clears when the text is empty", () => {
  const noted = setNodeComment(blankSession(), "filing_status", "Bring the W-2");
  assert.equal(noted.comments.filing_status, "Bring the W-2");
  const answered = applyAnswer(noted, "filing_status", "single");
  assert.equal(answered.comments.filing_status, "Bring the W-2");
  assert.equal(answered.answers.filing_status?.answerId, "single");
  const other = setNodeComment(answered, "year", "Extension year");
  assert.equal(other.comments.filing_status, "Bring the W-2");
  assert.equal(other.comments.year, "Extension year");
  const cleared = setNodeComment(other, "filing_status", "   ");
  assert.equal(cleared.comments.filing_status, undefined);
  assert.equal(cleared.comments.year, "Extension year");
});

test("case studies are labeled as examples and there is more than one", () => {
  assert.ok(caseStudies.length >= 2);
  assert.match(caseStudies.map((item) => item.summary).join(" "), /not tax advice|illustration/i);
});
