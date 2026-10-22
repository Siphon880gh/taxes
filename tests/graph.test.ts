import assert from "node:assert/strict";
import test from "node:test";
import {
  addInstance,
  applyAnswer,
  assertGraphIntact,
  blankSession,
  openQuestions,
  readAnswer,
  readComment,
  renameInstance,
  selectInstance,
  setNodeComment,
  visibleCommentNodeIds,
  answerOf,
  importSession,
  parseQuoteAmount,
  rebuild,
  sessionToJson,
  setQuote,
} from "../src/lib/graph/session";
import { applyCase, caseStudies } from "../src/lib/graph/cases";
import { buildChecklist } from "../src/lib/graph/checklist";
import { CPI_U, costReport, PRICE_STALE_AFTER_DAYS, proEstimate } from "../src/lib/graph/cost";
import { chartView, mermaidSource } from "../src/lib/graph/mermaid";
import { applyNodeReply, nodePrompt } from "../src/lib/graph/prompt";
import { numberEntryError } from "../src/lib/graph/allocate";
import { getNode } from "../src/lib/graph/nodes";
import { tips } from "../src/lib/graph/tips";
import { QUOTE_STORAGE_KEY, readStoredQuote, writeStoredQuote } from "../src/lib/quote-storage";
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
  assert.match(getNode("jurisdiction").prompt ?? "", /Only California is supported for now/);
  assert.match(getNode("jurisdiction").chart, /Only California is supported for now/);
  assert.match(chart, /pay_amount/);
  assert.match(chart, /rental_records/);
  assert.match(chart, /flag_records/);

  const cost = costReport(session);
  assert.equal(cost.direction, "same");
  assert.equal(cost.rows[0]?.amountLabel, "$975");
  assert.match(cost.quoteNote ?? "", /Nothing is added or subtracted/);
  assert.match(cost.framing ?? "", /rented since 2019/);
  assert.match(cost.framing ?? "", /doesn't change the price/);
  const ftu = cost.rows.find((row) => row.id === "freetaxusa");
  assert.equal(ftu?.amountLabel, "$0 + $15.99");
  assert.equal(ftu?.unverified, false);
  assert.match(ftu?.note ?? "", /Deluxe Support \$7\.99/);
  assert.match(ftu?.note ?? "", /Pro Support \$64\.99/);
  assert.match(ftu?.note ?? "", /Audit Defense \$19\.99/);
  assert.match(ftu?.note ?? "", /not added/);
  const turbo = cost.rows.find((row) => row.id === "tt-premium");
  assert.equal(turbo?.amountLabel, "$139");
  assert.equal(turbo?.unverified, false);
  const block = cost.rows.find((row) => row.id === "hrb");
  assert.equal(block?.unverified, false);
  assert.equal(block?.amountLabel, "$130 + $49 per state");
  assert.match(block?.label ?? "", /Self-Employed/);
  assert.match(block?.note ?? "", /October 21, 2026/);
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

test("a shared rental suggests the square-footage and occupant factors, then walks fees, repairs, and insurance", () => {
  let session = applyAnswer(blankSession(), "filing_status", "single");
  session = applyAnswer(session, "rental", "yes");
  session = applyAnswer(session, "rental_count", "one");
  session = applyAnswer(session, "rental_own", "whole");
  session = applyAnswer(session, "rental_debt", "paid_off");
  session = applyAnswer(session, "rental_history", "prior_2019");
  assert.equal(session.revealed.includes("rental_fees"), false);
  assert.equal(session.revealed.includes("alloc_sqft"), false);

  session = applyAnswer(session, "rental_alloc", "sqft");
  assert.equal(session.revealed.includes("alloc_sqft"), true);
  assert.equal(session.revealed.includes("alloc_occupants"), true);
  assert.equal(session.revealed.includes("rental_fees"), true);
  assert.equal(numberEntryError("alloc_sqft", "rentalSqft=2000;totalSqft=100"), "Enter the rental square feet and the whole property square feet. Rental square feet stay within the whole property.");

  session = applyAnswer(session, "alloc_sqft", "entered", "rentalSqft=27;totalSqft=100;taxBill=2140.70");
  session = applyAnswer(session, "alloc_occupants", "entered", "rentalPeople=4;totalPeople=6;waterBill=1988.34");
  const chart = mermaidSource(session);
  assert.match(chart, /Suggest multiplying USD 2,140\.70 by \.27 for Schedule E line 16/);
  assert.match(chart, /27 \/ 100 = \.27/);
  assert.match(chart, /Suggest multiplying USD 1,988\.34 by 4\/6 for Schedule E line 17/);
  assert.match(chart, /4 \/ 6 = \.67/);

  session = applyAnswer(session, "rental_fees", "entered", "rso=67;scep=10.50");
  session = applyAnswer(session, "rental_repairs", "entered", "repairs=1998;permits=150");
  session = applyAnswer(session, "rental_insurance", "entered", "premium=2365");
  const walked = mermaidSource(session);
  assert.match(walked, /Schedule E line 19/);
  assert.match(walked, /RSO USD 67\.00 and SCEP USD 10\.50/);
  assert.match(walked, /Schedule E line 14/);
  assert.match(walked, /permit costs USD 150\.00/);
  assert.match(walked, /Suggest multiplying USD 2,365\.00 by \.27 for Schedule E line 9/);

  const lines = buildChecklist(session).map((item) => item.line);
  assert.ok(lines.includes("16"));
  assert.ok(lines.includes("17"));
  assert.ok(lines.includes("19"));
  assert.ok(lines.includes("14"));
  assert.ok(lines.includes("9"));

  const whole = applyAnswer(session, "rental_alloc", "all_rental");
  assert.equal(whole.revealed.includes("alloc_sqft"), false);
  assert.equal(whole.revealed.includes("rental_fees"), true);
  const insured = applyAnswer(whole, "rental_insurance", "entered", "premium=2365");
  assert.match(mermaidSource(insured), /The whole property is rented/);
  assert.doesNotMatch(mermaidSource(insured), /by \.27 for Schedule E line 9/);
});

test("square-footage entry links to parcel maps by APN or address", () => {
  for (const id of ["alloc_sqft", "sqft_docs"]) {
    const links = getNode(id).links ?? [];
    assert.deepEqual(
      links.map((link) => link.href),
      [
        "https://portal.assessor.lacounty.gov/mapsearch",
        "https://zimas.lacity.org/",
        "https://www.google.com/maps",
      ],
    );
    assert.match(links.map((link) => link.detail).join(" "), /AIN|APN/);
    assert.match(links.map((link) => link.detail).join(" "), /feet/);
  }
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
  assert.equal(costReport(session).rows.find((row) => row.id === "freetaxusa")?.amountLabel, "$0 + $15.99");
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
  assert.match(chart, /Interest, capital gains, and digital assets<br\/>4 topics/);
  assert.match(chart, /Other income, credits, and payments<br\/>13 topics/);
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
  assert.match(opened, /\n  foreign\[/);
  assert.doesNotMatch(opened, /\n  dependents\[/);
});

test("the study notes' cross-checks open IRS records, Schedule C screens, carryforwards, Schedule A, and the renter's credit", () => {
  let session = applyAnswer(blankSession(), "filing_status", "single");
  for (const id of ["foreign", "ip_pin"]) {
    assert.equal(session.revealed.includes(id), true, id);
  }
  assert.equal(session.revealed.includes("info_returns"), false);

  session = applyAnswer(session, "w2", "no");
  assert.equal(session.revealed.includes("info_returns"), true);
  session = applyAnswer(session, "info_returns", "not_compared");
  assert.equal(session.revealed.includes("flag_info_returns"), true);
  assert.equal(session.revealed.includes("prior_return"), true);
  assert.deepEqual(
    (getNode("info_returns").links ?? []).map((link) => link.href),
    ["https://www.irs.gov/your-account", "https://sa.www4.irs.gov/ola/information_return"],
  );
  session = applyAnswer(session, "prior_return", "compared");
  assert.match(mermaidSource(session), /Compare this return's forms with last year's list/);
  assert.match(mermaidSource(session), /Form 1040 line 26/);

  session = applyAnswer(session, "se", "yes");
  session = applyAnswer(session, "se_entity", "sole");
  session = applyAnswer(session, "se_count", "one");
  session = applyAnswer(session, "se_names", "named", "coding");
  assert.equal(session.revealed.includes("se_records"), false);
  session = applyAnswer(session, "se_screen", "no");
  assert.equal(session.revealed.includes("se_records"), true);
  session = applyAnswer(session, "se_records", "yes");
  session = applyAnswer(session, "se_workers", "yes");
  session = applyAnswer(session, "se_loss", "hobby");
  session = applyAnswer(session, "se_de_minimis", "yes");
  session = applyAnswer(session, "se_resale", "checked");
  const seChart = mermaidSource(session, chartView(session).groups.map((group) => group.id));
  assert.match(seChart, /mileage log/);
  assert.match(seChart, /W-2 or a 1099-NEC/);
  assert.match(seChart, /report the income, and do not deduct the related expenses/);
  assert.match(seChart, /The IRS defines a legitimate business \(not a hobby\) as an activity that makes a profit in at least 3 of 5 consecutive years/);
  assert.match(seChart, /Form 5213/);
  assert.match(seChart, /de minimis safe harbor election statement/);
  assert.match(seChart, /1099-NEC box 2 is checked/);
  assert.match(getNode("schedule_c").help ?? "", /line A is the type of work/);
  assert.match(getNode("schedule_c").help ?? "", /Form 8300/);

  session = applyAnswer(session, "capgain", "yes");
  assert.equal(session.revealed.includes("capgain_loss"), true);
  session = applyAnswer(session, "capgain_loss", "yes");
  session = applyAnswer(session, "foreign", "both");
  session = applyAnswer(session, "ip_pin", "yes");
  session = applyAnswer(session, "deduction_choice", "itemized");
  assert.equal(session.revealed.includes("check_sch_a"), true);
  session = applyAnswer(session, "jurisdiction", "california");
  assert.equal(session.revealed.includes("ca_renter"), true);
  session = applyAnswer(session, "ca_renter", "rented");
  const chart = mermaidSource(session, chartView(session).groups.map((group) => group.id));
  assert.match(chart, /Capital Loss Carryforward Worksheet/);
  assert.match(chart, /FinCEN Form 114/);
  assert.match(chart, /Form 8938/);
  assert.match(chart, /six-digit IP PIN/);
  assert.match(chart, /Form 8283/);
  assert.match(chart, /line 5e/);
  assert.match(chart, /California renter's credit/);
  assert.match(getNode("age_blind").help ?? "", /Form 1040-SR/);
  assert.match(getNode("check_depr").help ?? "", /27\.5 years/);
  assert.match(getNode("check_records_problem").chart, /Form 3115/);
  assert.match(getNode("schedule_e").help ?? "", /line 1b/);

  const checklist = buildChecklist(session);
  const forms = checklist.map((item) => item.form).join("\n");
  for (const form of [
    "Returned Documents",
    "Last year's return",
    "Forms W-2, W-9, and 1099-NEC",
    "Form 5213",
    "De minimis safe harbor election statement",
    "Form 1099-NEC",
    "Capital Loss Carryforward Worksheet",
    "FinCEN Form 114",
    "Form 1040 e-file signature",
    "Form 8283",
    "California Form 540",
  ]) {
    assert.match(forms, new RegExp(form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), form);
  }
  assert.ok(checklist.every((item) => item.certainty === "verify" || item.source), "every sourced item carries a citation");
  assert.ok(levelCounts(chartView(session)).every((count) => count <= 7));
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

test("a comment on a downstream instance node stays with that instance", () => {
  let session = applyAnswer(blankSession(), "filing_status", "single");
  session = applyAnswer(session, "se", "yes");
  session = addInstance(session, "se");
  session = selectInstance(session, "se", 0);
  session = setNodeComment(session, "se_entity", "Mileage on the nursing job");
  session = setNodeComment(session, "filing_status", "Bring the W-2");
  assert.equal(readComment(session, "se_entity"), "Mileage on the nursing job");
  assert.equal(visibleCommentNodeIds(session).includes("se_entity"), true);
  const other = selectInstance(session, "se", 1);
  assert.equal(readComment(other, "se_entity"), undefined);
  assert.equal(visibleCommentNodeIds(other).includes("se_entity"), false);
  assert.equal(other.comments.filing_status, "Bring the W-2");
  assert.equal(visibleCommentNodeIds(other).includes("filing_status"), true);
  const back = selectInstance(other, "se", 0);
  assert.equal(readComment(back, "se_entity"), "Mileage on the nursing job");
  assert.equal(visibleCommentNodeIds(back).includes("se_entity"), true);
  const file = JSON.parse(sessionToJson(back));
  assert.equal(file.instanceComments.se["0:se_entity"], "Mileage on the nursing job");
  assert.equal(file.comments.se_entity, undefined);
  assert.equal(file.comments.filing_status, "Bring the W-2");
  const restored = importSession(sessionToJson(back));
  assert.equal(readComment(restored, "se_entity"), "Mileage on the nursing job");
  assert.equal(readComment(selectInstance(restored, "se", 1), "se_entity"), undefined);
  const legacy = importSession(JSON.stringify({
    answers: { year: { answerId: "y2025" }, filing_status: { answerId: "single" }, se: { answerId: "yes" } },
    instances: { se: ["Nursing", "Coding"] },
    activeInstance: { se: 1 },
    comments: { se_entity: "Only this business", filing_status: "W-2" },
  }));
  assert.equal(legacy.comments.se_entity, undefined);
  assert.equal(readComment(legacy, "se_entity"), "Only this business");
  assert.equal(readComment(selectInstance(legacy, "se", 0), "se_entity"), undefined);
  assert.equal(selectInstance(legacy, "se", 0).comments.filing_status, "W-2");
});

test("a chart session json keeps instances and comments and rejects a bad file", () => {
  let session = applyAnswer(blankSession(), "filing_status", "single");
  session = applyAnswer(session, "se", "yes");
  session = addInstance(session, "se");
  session = renameInstance(session, "se", 1, "Coding");
  session = setNodeComment(session, "se", "Ask about mileage");
  session = { ...session, quote: 400 };
  const file = JSON.parse(sessionToJson(session));
  assert.equal(file.revealed, undefined);
  const restored = importSession(sessionToJson(session));
  assert.deepEqual(restored.instances.se, session.instances.se);
  assert.equal(restored.comments.se, "Ask about mileage");
  assert.equal(restored.quote, 400);
  assert.equal(restored.answers.filing_status?.answerId, "single");
  assert.equal(restored.answers.se?.answerId, "yes");
  assert.equal(restored.revealed.includes("se_entity"), true);
  assert.throws(() => importSession("{"), /not JSON/);
  assert.throws(() => importSession("[]"), /not a chart session/);
  assert.throws(() => importSession("{}"), /no answers/);
});

test("a node prompt carries the session and a reply applies only that box", () => {
  const session = blankSession();
  const prompt = nodePrompt(session, getNode("filing_status"));
  assert.match(prompt, /filing_status/);
  assert.match(prompt, /Current session/);
  assert.match(prompt, /"answerId": "y2025"/);
  assert.match(prompt, /single/);
  assert.match(prompt, /not tax advice/);
  assert.match(prompt, /summarize the financial situation/);
  assert.match(prompt, /list the forms needed/);
  assert.match(prompt, /important lines/);
  assert.match(prompt, /still missing or unknown/);
  assert.match(prompt, /minimize taxable income and maximize deductions/);
  assert.doesNotMatch(prompt, /"revealed"/);
  const next = applyNodeReply(session, "filing_status", '{"nodeId":"filing_status","answerId":"single"}');
  assert.equal(next.answers.filing_status?.answerId, "single");
  assert.equal(session.answers.filing_status, undefined);
  assert.throws(() => applyNodeReply(session, "filing_status", '{"nodeId":"year","answerId":"y2024"}'), /different box/);
  assert.throws(() => applyNodeReply(session, "filing_status", "not json"), /not JSON/);
  assert.throws(() => applyNodeReply(session, "filing_status", '{"answerId":"nope"}'), /not one of this box/);
  const replaced = applyNodeReply(session, "filing_status", sessionToJson(applyAnswer(session, "filing_status", "mfj")));
  assert.equal(replaced.answers.filing_status?.answerId, "mfj");
});

test("filing notes open the forms and lines that were not already on the chart", () => {
  let session = applyAnswer(blankSession(), "filing_status", "single");
  session = applyAnswer(session, "w2", "yes");
  for (const id of ["unemployment", "marketplace", "eitc", "amt", "underpay", "installment", "extension"]) {
    assert.equal(session.revealed.includes(id), true, id);
  }

  session = applyAnswer(session, "se", "yes");
  session = applyAnswer(session, "se_entity", "sole");
  session = applyAnswer(session, "se_count", "one");
  session = applyAnswer(session, "se_names", "named", "coding");
  assert.equal(session.revealed.includes("se_screen"), true);
  session = applyAnswer(session, "se_screen", "both");
  const seChart = mermaidSource(session);
  assert.match(seChart, /Form 8995 or Form 8995-A/);
  assert.match(seChart, /line 5/);
  assert.match(seChart, /Schedule C line 25/);
  assert.match(seChart, /Schedule 1 line 15/);
  assert.match(seChart, /line 25a/);

  session = applyAnswer(session, "rental", "yes");
  session = applyAnswer(session, "rental_count", "one");
  session = applyAnswer(session, "rental_own", "whole");
  assert.equal(session.revealed.includes("rental_participation"), true);
  session = applyAnswer(session, "rental_debt", "paid_off");
  session = applyAnswer(session, "rental_participation", "passive");
  assert.match(mermaidSource(session, chartView(session).groups.map((group) => group.id)), /Do not treat Form 8995 as applying/);
  session = applyAnswer(session, "rental_participation", "active");
  session = applyAnswer(session, "rental_safe_harbor", "yes");
  const rentalChart = mermaidSource(session, chartView(session).groups.map((group) => group.id));
  assert.match(rentalChart, /line 21/);
  assert.match(rentalChart, /250 hours are logged/);

  session = applyAnswer(session, "marketplace", "yes");
  session = applyAnswer(session, "unemployment", "yes");
  session = applyAnswer(session, "eitc", "children");
  session = applyAnswer(session, "jurisdiction", "california");
  const forms = mermaidSource(session, chartView(session).groups.map((group) => group.id));
  assert.match(forms, /Form 1095-A and Form 8962/);
  assert.match(forms, /Form 1099-G box 1/);
  assert.match(forms, /Schedule EIC/);
  assert.match(forms, /California kept a state health-coverage rule/);

  const checklist = buildChecklist(session).map((item) => item.form).join("\n");
  assert.match(checklist, /Form 8995 or Form 8995-A/);
  assert.match(checklist, /Form 1095-A and Form 8962/);
  assert.match(checklist, /Form 1099-G/);
  assert.match(checklist, /Schedule EIC/);
});

test("case studies are labeled as examples and there is more than one", () => {
  assert.ok(caseStudies.length >= 2);
  assert.match(caseStudies.map((item) => item.summary).join(" "), /not tax advice|illustration/i);
});

test("an entered quote is parsed, named, priced, and kept through answers and a session file", () => {
  assert.equal(parseQuoteAmount("$1,250"), 1250);
  assert.equal(parseQuoteAmount(" 975.50 "), 975.5);
  assert.equal(parseQuoteAmount(""), null);
  assert.equal(parseQuoteAmount("-5"), null);
  assert.equal(parseQuoteAmount("abc"), null);
  assert.equal(parseQuoteAmount("12.345"), null);

  let session = applyAnswer(blankSession(), "filing_status", "single");
  assert.equal(session.quotePreparer, null);
  session = setQuote(session, 850, "Main Street CPA");
  assert.equal(session.quote, 850);
  assert.equal(session.quotePreparer, "Main Street CPA");
  session = applyAnswer(session, "se", "yes");
  session = addInstance(session, "se");
  session = selectInstance(session, "se", 0);
  assert.equal(session.quote, 850);
  assert.equal(session.quotePreparer, "Main Street CPA");

  const cost = costReport(session);
  assert.equal(cost.rows[0]?.id, "quote");
  assert.equal(cost.rows[0]?.vendor, "Quote from Main Street CPA");
  assert.equal(cost.rows[0]?.amountLabel, "$850");
  assert.match(cost.quoteNote ?? "", /\$850/);

  const restored = importSession(sessionToJson(session));
  assert.equal(restored.quote, 850);
  assert.equal(restored.quotePreparer, "Main Street CPA");
  assert.throws(() => importSession(JSON.stringify({ answers: {}, quotePreparer: 5 })), /not a chart session/);

  const cleared = setQuote(session, null, "  ");
  assert.equal(cleared.quote, null);
  assert.equal(cleared.quotePreparer, null);
  assert.equal(costReport(cleared).rows.some((row) => row.id === "quote"), false);
  assert.equal(costReport(setQuote(session, 900, null)).rows[0]?.vendor, "Independent firm quote");
  assert.equal(applyCase("weng-2025").quotePreparer, null);
});

test("the tax pro estimate is an inflation-only NSA range for the forms reached and is labeled an estimate", () => {
  const blank = proEstimate(blankSession());
  assert.ok(blank && blank.low < blank.high);
  assert.match(blank.note, /no schedule add-ons yet/);
  const factor = CPI_U.latest / CPI_U.surveyYearAverage2023;
  assert.ok(Math.abs(factor - 1.1058) < 0.001);
  assert.equal(blank.low, Math.round(279 * factor));
  assert.equal(blank.high, Math.round(392 * factor));

  const weng = applyCase("weng-2025");
  const estimate = costReport(weng).estimate;
  assert.ok(estimate);
  // Schedule C $221 + Schedule E $192 + Schedule SE $62 on either base, raised by CPI-U only.
  assert.equal(estimate.low, Math.round((279 + 221 + 192 + 62) * factor));
  assert.equal(estimate.high, Math.round((392 + 221 + 192 + 62) * factor));
  assert.equal(estimate.low, 834);
  assert.equal(estimate.high, 959);
  assert.equal(estimate.quotePosition, "above");
  assert.match(estimate.note, /Estimate only, not a quote/);
  assert.match(estimate.note, /CPI-U inflation/);
  assert.match(estimate.note, /averages, not a spread/);
  assert.doesNotMatch(estimate.note, /2020/);
  assert.deepEqual(estimate.citations.map((citation) => citation.url).sort(), [
    "https://img1.wsimg.com/blobby/go/a15c5ffb-9439-4993-b38e-4acbf6145e32/2023%2BComplete%2BIncome%2Band%2BFees%2BReport.pdf",
    "https://www.bls.gov/news.release/cpi.nr0.htm",
  ].sort());

  assert.equal(proEstimate(setQuote(weng, 500, null))?.quotePosition, "below");
  assert.equal(proEstimate(setQuote(weng, 900, null))?.quotePosition, "within");
  assert.equal(proEstimate(setQuote(weng, 2000, null))?.quotePosition, "above");
  assert.equal(proEstimate(setQuote(weng, null, null))?.quotePosition, null);

  const standard = rebuild({ ...weng.answers, deduction_choice: { answerId: "standard" } }, weng.quote, weng.caseStudyId, weng.instances);
  const itemized = rebuild({ ...weng.answers, deduction_choice: { answerId: "itemized" } }, weng.quote, weng.caseStudyId, weng.instances);
  assert.equal(answerOf(standard, "deduction_choice"), "standard");
  assert.equal(proEstimate(standard)?.low, 834);
  assert.equal(proEstimate(standard)?.high, 834);
  assert.match(proEstimate(standard)?.note ?? "", /single figure/);
  assert.equal(proEstimate(itemized)?.low, 959);
  assert.equal(proEstimate(itemized)?.high, 959);

  const crypto = proEstimate(applyCase("joint-w2-crypto"));
  assert.ok(crypto && crypto.low < crypto.high);
  assert.match(crypto.note, /Schedule D \/ Form 8949 \$126/);
  // Schedule D / Form 8949 $126 on the $279 or $392 base, raised by CPI-U only.
  assert.equal(crypto.low, Math.round((279 + 126) * factor));
  assert.equal(crypto.high, Math.round((392 + 126) * factor));
  assert.equal(crypto.low, 448);
  assert.equal(crypto.high, 573);
});

test("price rows show when they were last checked and flag a check older than the limit", () => {
  const weng = applyCase("weng-2025");
  const day91Hrb = () => costReport(weng, { today: new Date(2027, 0, 20) }).rows.find((row) => row.id === "hrb")?.staleDays;
  const fresh = costReport(weng, { today: new Date(2026, 9, 21) });
  assert.equal(fresh.staleAfterDays, PRICE_STALE_AFTER_DAYS);
  assert.equal(PRICE_STALE_AFTER_DAYS, 90);
  const premium = fresh.rows.find((row) => row.id === "tt-premium");
  assert.equal(premium?.checked, "2026-10-21");
  assert.equal(premium?.checkedLabel, "October 21, 2026");
  assert.equal(premium?.staleDays, null);
  assert.equal(fresh.rows.find((row) => row.id === "quote")?.checked, null);
  assert.equal(fresh.rows.find((row) => row.id === "nsa")?.checked, null);

  const state = fresh.rows.find((row) => row.id === "tt-state");
  assert.equal(state?.amountLabel, "$0–$64");
  assert.equal(state?.unverified, false);
  assert.match(state?.citation?.url ?? "", /tto-all-state-additional/);
  assert.match(premium?.note ?? "", /separate TurboTax Online state row/);

  const block = fresh.rows.find((row) => row.id === "hrb");
  assert.equal(block?.unverified, false);
  assert.equal(block?.checked, "2026-10-21");
  assert.equal(day91Hrb(), 91);

  const day90 = costReport(weng, { today: new Date(2027, 0, 19) });
  assert.equal(day90.rows.find((row) => row.id === "tt-premium")?.staleDays, null);
  const day91 = costReport(weng, { today: new Date(2027, 0, 20) });
  assert.equal(day91.rows.find((row) => row.id === "tt-premium")?.staleDays, 91);
  assert.equal(day91.rows.find((row) => row.id === "freetaxusa")?.staleDays, 91);
  assert.equal(day91.rows.find((row) => row.id === "quote")?.staleDays, null);

  const tight = costReport(weng, { today: new Date(2026, 9, 31), staleAfterDays: 7 });
  assert.equal(tight.staleAfterDays, 7);
  assert.equal(tight.rows.find((row) => row.id === "tt-premium")?.staleDays, 10);

  let simple = applyAnswer(blankSession(), "filing_status", "single");
  simple = applyAnswer(simple, "w2", "yes");
  simple = applyAnswer(simple, "se", "no");
  const simpleRows = costReport(simple).rows.map((row) => row.id);
  if (simpleRows.includes("tt-free")) assert.equal(simpleRows.includes("tt-state"), false);
});

test("the quote is saved to and read from browser storage, and storage problems are harmless", () => {
  const data = new Map<string, string>();
  const store = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  assert.equal(readStoredQuote(store), null);
  writeStoredQuote({ amount: 1250, preparer: "Main Street CPA" }, store);
  assert.deepEqual(readStoredQuote(store), { amount: 1250, preparer: "Main Street CPA" });
  writeStoredQuote({ amount: null, preparer: "Main Street CPA" }, store);
  assert.deepEqual(readStoredQuote(store), { amount: null, preparer: "Main Street CPA" });
  writeStoredQuote({ amount: null, preparer: "  " }, store);
  assert.equal(data.has(QUOTE_STORAGE_KEY), false);
  assert.equal(readStoredQuote(store), null);

  data.set(QUOTE_STORAGE_KEY, "{not json");
  assert.equal(readStoredQuote(store), null);
  data.set(QUOTE_STORAGE_KEY, JSON.stringify({ amount: -4, preparer: 7 }));
  assert.equal(readStoredQuote(store), null);

  assert.equal(readStoredQuote(null), null);
  assert.doesNotThrow(() => writeStoredQuote({ amount: 5, preparer: null }, null));
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readStoredQuote(broken), null);
  assert.doesNotThrow(() => writeStoredQuote({ amount: 5, preparer: null }, broken));
  // In Node there is no window, so the default store is absent rather than an error.
  assert.equal(readStoredQuote(), null);
});

test("H&R Block's online tier and state fee follow the forms reached", () => {
  const hrb = (session: ReturnType<typeof blankSession>) => costReport(session).rows.find((row) => row.id === "hrb");
  const weng = hrb(applyCase("weng-2025"));
  assert.equal(weng?.label, "Online Self-Employed, federal plus each state");
  assert.equal(weng?.amountLabel, "$130 + $49 per state");
  assert.match(weng?.citation?.url ?? "", /hrblock\.com\/online-tax-filing/);

  const crypto = hrb(applyCase("joint-w2-crypto"));
  assert.equal(crypto?.amountLabel, "$105 + $49 per state");
  assert.match(crypto?.label ?? "", /Premium/);

  let simple = applyAnswer(blankSession(), "filing_status", "single");
  simple = applyAnswer(simple, "w2", "yes");
  simple = applyAnswer(simple, "se", "no");
  assert.ok(costReport(simple).rows.some((row) => row.id === "tt-free"));
  assert.equal(hrb(simple)?.amountLabel, "$0 + $0 per state");
  assert.match(hrb(simple)?.label ?? "", /Free Online/);

  const itemized = rebuild(
    { year: { answerId: "y2025" }, filing_status: { answerId: "single" }, w2: { answerId: "yes" }, se: { answerId: "no" }, rental: { answerId: "no" }, deduction_choice: { answerId: "itemized" } },
    null,
    null,
    { w2: ["W-2 1"] },
  );
  assert.equal(answerOf(itemized, "deduction_choice"), "itemized");
  assert.equal(hrb(itemized)?.amountLabel, "$65 + $49 per state");
  assert.match(hrb(itemized)?.label ?? "", /Deluxe/);

  const open = hrb(blankSession());
  assert.equal(open?.amountLabel, "Not selected yet");
  assert.match(open?.note ?? "", /\$65 \+ \$49 per state/);
  assert.equal(open?.unverified, false);
});
