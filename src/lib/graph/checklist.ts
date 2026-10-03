import { citations } from "./sources";
import { answerOf } from "./session";
import { ten99kThreshold } from "./thresholds";
import type { ChecklistItem, Session } from "./types";
import { getNode } from "./nodes";
import { readAnswer } from "./session";

function has(session: Session, id: string): boolean {
  return session.revealed.includes(id);
}

function yearIs2025(session: Session): boolean {
  return answerOf(session, "year") === "y2025";
}

export function buildChecklist(session: Session): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const lineCertainty = yearIs2025(session) ? "sourced" : "verify";
  const yearNote = yearIs2025(session)
    ? ""
    : " The line number was confirmed on the 2025 form, so confirm it again for the year you selected.";

  if (has(session, "check_w2")) {
    items.push({
      id: "w2",
      form: "Form 1040",
      line: "1a",
      summary: `Verify W-2 box 1 wages on Form 1040 line 1a.${yearNote}`,
      certainty: lineCertainty,
      source: citations.form1040_2025,
    });
  }
  if (has(session, "schedule_c")) {
    const names = session.answers.se_names?.text;
    items.push({
      id: "sch-c",
      form: "Schedule C (Form 1040)",
      line: "1 and 31",
      summary: names
        ? `Verify a separate Schedule C for each activity (${names}). Line 1 should include the 1099-NEC amounts. Line 31 flows to Schedule 1 line 3.${yearNote}`
        : `Verify Schedule C line 1 (1099-NEC gross receipts) and line 31 (net profit to Schedule 1 line 3).${yearNote}`,
      certainty: lineCertainty,
      source: citations.scheduleC_2025,
    });
  }
  if (has(session, "schedule_se")) {
    items.push({
      id: "sch-se",
      form: "Schedule SE (Form 1040)",
      line: "2 and 4a",
      summary:
        "Verify Schedule SE. Net profit from Schedule C line 31 is included on Schedule SE line 2. The 92.35% computation is line 4a under the regular method in Publication 334 (2025). Net earnings were not entered, so the $400 filing threshold is not applied as a conclusion.",
      certainty: yearIs2025(session) ? "sourced" : "verify",
      source: citations.pub334_2025,
    });
  }
  if (has(session, "check_no_entity")) {
    items.push({
      id: "no-entity",
      form: "Form 1065 / Form 1120-S",
      summary: "Verify these activities are not reported on a partnership or S corporation return.",
      certainty: "verify",
    });
  }
  if (has(session, "check_1099k_form")) {
    items.push({
      id: "1099k-form",
      form: "Form 1099-K",
      summary: "A Form 1099-K was issued. Verify that form against the income already on the return.",
      certainty: "sourced",
      source: citations.ir2025_107,
    });
  }
  if (has(session, "check_manual")) {
    const amount = session.answers.pay_amount?.text;
    items.push({
      id: "1099k-manual",
      form: "Form 1040 / Schedule C",
      line: "Schedule C line 1, if the payments belong to a sole proprietorship",
      summary: amount
        ? `Goods-and-services payments are reportable even without Form 1099-K. You entered: ${amount}. Compare that with the ${ten99kThreshold.year} threshold only if it includes both a dollar total and a transaction count. Verify the manual entry.`
        : `Goods-and-services payments are reportable even when no Form 1099-K is generated. The amount is unknown, so the ${ten99kThreshold.year} threshold (over $${ten99kThreshold.grossExceeds.toLocaleString("en-US")} and over ${ten99kThreshold.transactionsExceed} transactions) is not applied to a guessed number. Verify the manual entry on the prepared return.`,
      certainty: amount ? "verify" : "verify",
      source: citations.ir2025_107,
    });
  }
  if (has(session, "check_personal")) {
    items.push({
      id: "personal-transfers",
      form: "Form 1040",
      summary: "Personal / friends-and-family transfers are not goods-and-services payments. Verify they were not included as business income.",
      certainty: "verify",
      source: citations.ir2025_107,
    });
  }
  if (has(session, "schedule_e")) {
    items.push({
      id: "sch-e",
      form: "Schedule E (Form 1040)",
      line: "2, 3, 12, 17, 18, 26",
      summary: `Verify rents (line 3), days (line 2), utilities (line 17), depreciation (line 18), mortgage interest (line 12), and the total (line 26).${yearNote}`,
      certainty: lineCertainty,
      source: citations.scheduleE_2025,
    });
  }
  if (has(session, "check_paid_off")) {
    items.push({
      id: "paid-off",
      form: "Schedule E (Form 1040)",
      line: "12",
      summary: "The rental is described as paid off. Verify line 12 is not claiming mortgage interest for it.",
      certainty: lineCertainty,
      source: citations.scheduleE_2025,
    });
  }
  if (has(session, "check_one_property")) {
    items.push({
      id: "one-property",
      form: "Schedule E (Form 1040)",
      summary: "Exactly one property. Verify only one column is used.",
      certainty: "verify",
      source: citations.scheduleE_2025,
    });
  }
  if (has(session, "check_whole")) {
    items.push({
      id: "whole",
      form: "Schedule E (Form 1040)",
      line: "Ownership percentage — line flagged",
      summary: "Wholly owned. Verify the ownership percentage on the property section. The precise line was not separately confirmed, so it stays flagged. Verify there is no Form 1065 for this rental.",
      certainty: "verify",
      source: citations.scheduleE_2025,
    });
  }
  if (has(session, "check_tenant") || has(session, "flag_tenant")) {
    items.push({
      id: "tenant",
      form: "Schedule E (Form 1040)",
      line: "3 and 17",
      summary:
        "Tenant-paid water or other expenses: Publication 527 says a tenant's payment of your expense is rental income, and the expense can be deducted if it is deductible. Verify how the prepared return treated it. Unknown does not assume an amount.",
      certainty: has(session, "flag_tenant") ? "verify" : "sourced",
      source: citations.pub527_2025,
    });
  }
  if (has(session, "check_alloc") || has(session, "check_sqft") || has(session, "flag_alloc")) {
    items.push({
      id: "alloc",
      form: "Schedule E (Form 1040)",
      line: "2",
      summary: "Verify the split between rental and owner use, including square footage if that method was used. No percentage is computed here.",
      certainty: "verify",
      source: citations.pub527_2025,
    });
  }
  if (has(session, "check_depr") || has(session, "flag_depr") || has(session, "flag_records") || has(session, "check_records_clean") || has(session, "check_records_problem")) {
    items.push({
      id: "depr",
      form: "Schedule E (Form 1040) and Form 4562",
      line: "18",
      summary:
        "Verify depreciation on line 18 and whether a carry-forward worksheet matches the prior year. Form 4562 is attached for the 2025 reasons in the Schedule E instructions, not automatically. The start year is not assumed.",
      certainty: "verify",
      source: citations.scheduleE_2025,
    });
  }
  if (has(session, "check_sch_b")) {
    items.push({
      id: "sch-b",
      form: "Schedule B (Form 1040)",
      summary: "Verify Schedule B. The 2025 instructions require it when taxable interest or ordinary dividends are over $1,500, and in the other listed cases.",
      certainty: yearIs2025(session) ? "sourced" : "verify",
      source: citations.scheduleB_2025,
    });
  }
  if (has(session, "check_capgain")) {
    items.push({
      id: "8949",
      form: "Form 8949 and Schedule D",
      summary: "Verify sales already reported on Form 8949 and Schedule D. Do not start those forms from this chart.",
      certainty: "verify",
    });
  }
  if (has(session, "check_crypto") || has(session, "check_crypto_held") || has(session, "flag_crypto")) {
    items.push({
      id: "crypto",
      form: "Form 1040",
      line: "Digital-asset question — line flagged",
      summary: "Verify the digital-asset question on Form 1040. The checkbox position is flagged so it is read off the prepared return.",
      certainty: "verify",
    });
  }
  if (has(session, "check_retire") || has(session, "flag_retire")) {
    items.push({
      id: "1099r",
      form: "Form 1099-R",
      line: "IRA and pension lines — flagged",
      summary: "Verify retirement distributions. Line numbers are flagged rather than guessed.",
      certainty: "verify",
    });
  }
  if (has(session, "check_hsa") || has(session, "flag_hsa")) {
    items.push({
      id: "8889",
      form: "Form 8889",
      summary: "Verify Form 8889. HSA contribution limits are not stored, so no cap is shown.",
      certainty: "verify",
    });
  }
  if (has(session, "check_edu") || has(session, "flag_edu")) {
    items.push({
      id: "edu",
      form: "Form 8863 / Schedule 1",
      line: "Flagged",
      summary: "Verify an education credit or student loan interest already on the return. Line numbers are flagged.",
      certainty: "verify",
    });
  }
  if (has(session, "check_est")) {
    items.push({
      id: "est",
      form: "Form 1040",
      line: "26",
      summary:
        "Verify estimated tax payments. The 2025 Schedule E instructions refer to Form 1040 line 26 for an estimated-tax amount. Read that line on the form you have open.",
      certainty: lineCertainty,
      source: citations.scheduleE_2025,
    });
  }
  if (has(session, "check_dependents")) {
    items.push({
      id: "deps",
      form: "Form 1040 and Schedule 8812",
      line: "Flagged",
      summary: "Verify dependents already claimed. This chart does not add a dependent.",
      certainty: "verify",
    });
  }
  if (has(session, "check_no_mortgage")) {
    items.push({
      id: "no-mtg",
      form: "Schedule A (Form 1040)",
      line: "Home mortgage interest — flagged",
      summary: "No personal mortgage was described. If the return itemizes, verify mortgage interest is not claimed. This does not choose the standard deduction.",
      certainty: "verify",
    });
  }
  if (has(session, "deduction_result")) {
    items.push({
      id: "deduction",
      form: "Form 1040",
      line: "12e",
      summary: "Verify the standard deduction or itemized deduction on line 12e against the sourced amount for the year, status, and jurisdiction. See the comparison panel.",
      certainty: "verify",
      source: citations.form1040_2025,
    });
  }
  if (has(session, "form_1040")) {
    items.push({
      id: "1040-flow",
      form: "Form 1040",
      line: "11b and 12e",
      summary: "Schedules on this path flow onto Form 1040. Verify line 11b (AGI) and line 12e (deduction) on the 2025 form, and confirm the lines if the year is different.",
      certainty: lineCertainty,
      source: citations.form1040_2025,
    });
  }

  return items;
}

export function checklistTitle(session: Session): string {
  const open = session.revealed.filter((id) => getNode(id).kind === "question" && !readAnswer(session, id)).length;
  return open ? `Confirmation checklist — ${open} question${open === 1 ? "" : "s"} still open` : "Confirmation checklist";
}
