import { suggestionText } from "./allocate";
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
    items.push({
      id: "w2-withheld",
      form: "Form 1040",
      line: "25a — confirm on the form",
      summary:
        "The filing notes map W-2 box 2 (federal income tax withheld) to Form 1040 line 25a. Boxes 16 and 17 go on the state return. Confirm line 25a on the form in front of you.",
      certainty: "verify",
    });
  }
  if (has(session, "schedule_c")) {
    const names = session.answers.se_names?.text;
    items.push({
      id: "sch-c",
      form: "Schedule C (Form 1040)",
      line: "1 and 31",
      summary: names
        ? `Verify a separate Schedule C for each activity (${names}). Line B is the activity code. Line 1 should include the 1099-NEC amounts and any income that never came with a 1099-NEC. Line 31 flows to Schedule 1 line 3. The filing notes also name line 8 (advertising), line 18 (office), and line 27a (other); confirm those lines.${yearNote}`
        : `Verify Schedule C line B (activity code), line 1 (1099-NEC gross receipts, plus income with no 1099-NEC), and line 31 (net profit to Schedule 1 line 3). The filing notes also name line 8, line 18, and line 27a; confirm those lines.${yearNote}`,
      certainty: lineCertainty,
      source: citations.scheduleC_2025,
    });
    items.push({
      id: "sch-c-header",
      form: "Schedule C (Form 1040)",
      line: "A, C, and D — confirm on the form",
      summary:
        "The filing notes fill the header: line A is the type of work (their example is UNCLASSIFIED ESTABLISHMENTS UNABLE TO CLASSIFY, code 999000 on line B), line C is the business name and may be blank for a freelancer, and line D is the EIN, left blank when the SSN is the taxpayer ID. The notes' audit hot spots add Form 8300 for a business that receives more than $10,000 in cash.",
      certainty: "verify",
    });
  }
  if (has(session, "check_se_records")) {
    items.push({
      id: "sch-c-records",
      form: "Schedule C (Form 1040)",
      line: "Vehicle, meals, and home office — lines flagged",
      summary:
        "Verify the mileage log (business miles only, with the notes' daily log columns), the meal records (who, what, why), and exclusive-and-regular use of a home office. The filing notes do not number these Schedule C lines, so they stay flagged. Receipts, not bank statements, back the amounts.",
      certainty: "verify",
    });
  }
  if (has(session, "check_se_workers")) {
    items.push({
      id: "sch-c-workers",
      form: "Forms W-2, W-9, and 1099-NEC",
      line: "Schedule C Forms 1099 questions — line letters flagged",
      summary:
        "A worker was paid $600 or more. Verify a W-2 (employee, W-4 on file) or a 1099-NEC (contractor, W-9 collected) was issued, and that the Schedule C questions about Forms 1099 were answered. The line letters are not named in the filing notes.",
      certainty: "verify",
    });
  }
  if (has(session, "check_hobby")) {
    items.push({
      id: "sch-c-loss",
      form: "Schedule C (Form 1040) and Form 5213",
      line: "31",
      summary:
        "Schedule C line 31 is a loss. Verify the profit-motive facts the filing notes use (profit in 3 of 5 years, 2 of 7 for horse activities) and whether Form 5213 was filed for a new activity. Line 31 still flows to Schedule 1 line 3. This chart does not decide hobby versus business.",
      certainty: lineCertainty,
      source: citations.scheduleC_2025,
    });
  }
  if (has(session, "check_de_minimis")) {
    items.push({
      id: "de-minimis",
      form: "De minimis safe harbor election statement",
      summary:
        "Verify the signed election statement under Treas. Reg. § 1.263(a)-1(f) is attached: taxpayer, the Schedule C or E it covers, the tax year, and the $2,500 per-item limit ($5,000 only with audited financials and a written policy). Items that were capitalized instead belong on Form 4562.",
      certainty: "verify",
    });
  }
  if (has(session, "check_resale")) {
    items.push({
      id: "1099nec-box2",
      form: "Form 1099-NEC",
      line: "Box 2",
      summary:
        "Box 2 (direct sales of $5,000 or more of consumer products for resale) is checked. Verify that resale income and any inventory cost on Schedule C match the products received. The filing notes say the IRS watches these relationships for unreported sales and inventory write-offs.",
      certainty: "verify",
    });
  }
  if (has(session, "schedule_se")) {
    items.push({
      id: "sch-se",
      form: "Schedule SE (Form 1040)",
      line: "2 and 4a",
      summary:
        "Verify Schedule SE. Net profit from Schedule C line 31 is included on Schedule SE line 2. The 92.35% computation is line 4a under the regular method in Publication 334 (2025). One-half of the tax is Schedule 1 line 15. Net earnings were not entered, so the $400 filing threshold is not applied as a conclusion.",
      certainty: yearIs2025(session) ? "sourced" : "verify",
      source: citations.pub334_2025,
    });
    items.push({
      id: "sch-se-extra",
      form: "Schedule 2 and Schedule SE",
      line: "Schedule SE line 7 — confirm on the form",
      summary:
        "The filing notes place self-employment tax on Schedule 2 and call the Social Security wage-base cap Schedule SE line 7. Confirm both on the form. The 2025 wage base in Publication 334 is stored separately and is not applied as a tax computation.",
      certainty: "verify",
      source: citations.pub334_2025,
    });
  }
  if (has(session, "check_se_both")) {
    items.push({
      id: "se-both",
      form: "Form 8995 or Form 8995-A, and Schedule C line 25",
      line: "5 and 25 — confirm on the form",
      summary:
        "Verify Form 8995 or Form 8995-A, including the 20% figure on line 5, and Schedule C line 25 for the work share of utilities. Neither amount is computed here.",
      certainty: "verify",
    });
  }
  if (has(session, "check_8995") || has(session, "flag_qbi")) {
    items.push({
      id: "8995",
      form: "Form 8995 or Form 8995-A",
      line: "5 — confirm on the form",
      summary: has(session, "flag_qbi")
        ? "Qualified business income is unknown. Form 8995 is not assumed, and the 20% deduction is not computed."
        : "Verify Form 8995 or Form 8995-A. The filing notes show the 20% deduction, subject to limits, on line 5. Confirm that line. The notes enter the business name (or Unclassified Establishments Unable to Classify) and the SSN as the taxpayer identification number for a sole proprietor; an EIN is used only for a pass-through entity on a K-1. The notes' 2024 income cutoffs are not applied.",
      certainty: "verify",
    });
  }
  if (has(session, "check_home_c")) {
    items.push({
      id: "sch-c-25",
      form: "Schedule C (Form 1040)",
      line: "25",
      summary:
        "Verify Schedule C line 25 for the work share of utilities. A home-office share of insurance, taxes, or mortgage is a separate proportion. Neither share is computed here.",
      certainty: "verify",
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
      line: "2, 3, 9, 12, 14, 16, 17, 18, 19, 26",
      summary: `Verify rents (line 3), days (line 2), insurance (line 9), repairs (line 14), taxes (line 16), utilities (line 17), other expenses such as rental fees (line 19), depreciation (line 18), mortgage interest (line 12), and the total (line 26).${yearNote}`,
      certainty: lineCertainty,
      source: citations.scheduleE_2025,
    });
    items.push({
      id: "sch-e-21",
      form: "Schedule E (Form 1040)",
      line: "21 — confirm on the form",
      summary: "The filing notes name line 21 for net rental income or loss. Confirm that line on the form. It is not in the stored 2025 line list.",
      certainty: "verify",
    });
    items.push({
      id: "sch-e-1b",
      form: "Schedule E (Form 1040)",
      line: "1a and 1b — confirm on the form",
      summary:
        "The filing notes fill Part I line 1a with the property address and line 1b with the type-of-property code (their example is 2 for a multi-family residence, confirmed on the county assessor's property search). Confirm both on the form.",
      certainty: "verify",
    });
  }
  if (has(session, "check_rental_passive")) {
    items.push({
      id: "rental-passive",
      form: "Schedule E (Form 1040)",
      summary:
        "This rental is passive in the filing notes. Keep it on Schedule E. Do not treat Form 8995 as applying, and do not move it onto Schedule C.",
      certainty: "verify",
    });
  }
  if (has(session, "check_rental_active")) {
    items.push({
      id: "rental-qbi",
      form: "Form 8995 or Form 8995-A",
      line: "5 — confirm on the form",
      summary:
        "Active rental: verify Form 8995 or Form 8995-A against Schedule E. Confirm line 21 on Schedule E and line 5 on the QBI form. The notes' 2024 income cutoffs are not applied.",
      certainty: "verify",
    });
  } else if (has(session, "flag_rental_qbi")) {
    items.push({
      id: "rental-qbi",
      form: "Form 8995 or Form 8995-A",
      summary: "Whether the rental is passive or active is unknown. Form 8995 is not assumed.",
      certainty: "verify",
    });
  }
  if (has(session, "check_safe_harbor") || has(session, "check_qbi_no_harbor")) {
    items.push({
      id: "rental-harbor",
      form: "Rental real estate QBI safe-harbor statement",
      summary: has(session, "check_safe_harbor")
        ? "Verify the signed statement: not a residence, separate books, 250 hours logged, not a triple-net lease, and no home-office deduction on this property."
        : "No safe-harbor statement on this path. If Form 8995 is claimed, be ready to show material participation. Do not create the 250-hour statement from this chart.",
      certainty: "verify",
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
      summary: "Verify the split between rental and owner use, including square footage if that method was used. A factor is suggested only from square feet or occupant counts you enter.",
      certainty: "verify",
      source: citations.pub527_2025,
    });
  }
  for (const id of ["check_sqft_factor", "check_water_factor", "check_rental_fees", "check_repairs", "check_insurance"] as const) {
    const summary = has(session, id) ? suggestionText(id, session) : null;
    if (!summary) continue;
    const line = id === "check_sqft_factor" ? "16" : id === "check_water_factor" ? "17" : id === "check_rental_fees" ? "19" : id === "check_repairs" ? "14" : "9";
    items.push({
      id,
      form: "Schedule E (Form 1040)",
      line,
      summary: `${summary}${yearNote}`,
      certainty: lineCertainty,
      source: id === "check_water_factor" || id === "check_sqft_factor" ? citations.pub527_2025 : citations.scheduleE_2025,
    });
  }
  if (has(session, "check_depr") || has(session, "flag_depr") || has(session, "flag_records") || has(session, "check_records_clean") || has(session, "check_records_problem")) {
    items.push({
      id: "depr",
      form: "Schedule E (Form 1040) and Form 4562",
      line: "18",
      summary:
        "Verify depreciation on line 18 and whether a carry-forward worksheet matches the prior year. Form 4562 is attached for the 2025 reasons in the Schedule E instructions, not automatically. The filing notes describe the Form 4562 entries as 27.5-year residential rental property (39 commercial), mid-month convention, straight-line method, with the placed-in-service date on page 2, and a basis of the building or improvement assessed value in the year the rental started times the rental share. The start year is not assumed.",
      certainty: "verify",
      source: citations.scheduleE_2025,
    });
  }
  if (has(session, "check_records_problem")) {
    items.push({
      id: "form-3115",
      form: "Form 3115",
      summary:
        "The carry-forward schedule is missing or inconsistent. If depreciation was never taken in earlier years, the filing notes call it allowed or allowable and name Form 3115 (change in accounting method) to catch up on the skipped years. This chart does not prepare that form and does not change the quote.",
      certainty: "verify",
    });
  }
  if (has(session, "check_sch_b")) {
    items.push({
      id: "sch-b",
      form: "Schedule B (Form 1040)",
      summary:
        "Verify Schedule B, including Forms 1099-INT and 1099-DIV. Tax-exempt interest is Form 1040 line 2a. On the 2025 form, taxable interest is line 2b and ordinary dividends are line 3b. The 2025 instructions require Schedule B when taxable interest or ordinary dividends are over $1,500, and in the other listed cases.",
      certainty: yearIs2025(session) ? "sourced" : "verify",
      source: citations.scheduleB_2025,
    });
  }
  if (has(session, "check_capgain")) {
    items.push({
      id: "8949",
      form: "Form 8949 and Schedule D",
      summary:
        "Verify Form 1099-B, Form 8949, and Schedule D, including a capital-loss carryforward. The filing notes put the net gain or loss on Form 1040 line 7. Confirm line 7 on the form. Do not start those forms from this chart.",
      certainty: "verify",
    });
  }
  if (has(session, "check_capital_loss") || has(session, "flag_capital_loss")) {
    items.push({
      id: "capital-loss",
      form: "Schedule D (Form 1040) Part III and the Capital Loss Carryforward Worksheet",
      line: "Form 1040 line 7 — confirm on the form",
      summary: has(session, "flag_capital_loss")
        ? "Whether there is a net capital loss or a carryforward is unknown. Nothing is assumed; last year's return is where the carryforward comes from."
        : "Verify Schedule D Part III, the Capital Loss Carryforward Worksheet in the Schedule D instructions, and Form 1040 line 7. The filing notes cap the loss against other income at $3,000 a year ($1,500 married filing separately) and carry the rest forward; confirm those figures. The carryforward comes from last year's return.",
      certainty: "verify",
    });
  }
  if (has(session, "check_foreign")) {
    items.push({
      id: "foreign-accounts",
      form: "Schedule B (Form 1040), FinCEN Form 114, and Form 8938",
      line: "Schedule B foreign-account question",
      summary:
        "Verify the Schedule B foreign-account question, FinCEN Form 114 if the accounts exceeded $10,000 in total, and Form 8938 if foreign assets exceeded $50,000. The dollar figures are from the filing notes; confirm them. A foreign account or trust is a 2025 Schedule B trigger regardless of the $1,500 test.",
      certainty: "verify",
      source: citations.scheduleB_2025,
    });
  }
  if (has(session, "check_foreign_income")) {
    items.push({
      id: "foreign-income",
      form: "Foreign income — form flagged",
      summary:
        "Foreign income is on this path. The filing notes handle it on a FreeTaxUSA Misc screen and do not name the form, so it stays flagged. Verify the prepared return reports it.",
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
      summary:
        "Verify Form 1098-T and Form 8863 for an education credit. American Opportunity and Lifetime Learning cannot both be claimed for the same student. Student loan interest is on Schedule 1. The filing notes place credits on Schedule 3. Line numbers are flagged.",
      certainty: "verify",
    });
  }
  if (has(session, "check_est")) {
    items.push({
      id: "est",
      form: "Form 1040",
      line: "26",
      summary:
        "Verify estimated tax payments on Form 1040 line 26, which the filing notes label estimated tax payments and amount applied from prior year return. Gather the IRS payment confirmations with the amounts and dates (April, June, September, January) and any overpayment applied from last year. The 2025 Schedule E instructions also refer to line 26 for an estimated-tax amount. Read that line on the form you have open.",
      certainty: lineCertainty,
      source: citations.scheduleE_2025,
    });
  }
  if (has(session, "check_sch_a")) {
    items.push({
      id: "sch-a",
      form: "Schedule A (Form 1040), Form 1098, and Form 8283",
      line: "5e; other lines flagged",
      summary:
        "Itemized return. Verify Form 1098 for home mortgage interest, the 2025 line 5e state-and-local-tax cap ($40,000, or $20,000 married filing separately, before the modified-AGI phase-down), receipts from registered 501(c)(3)s for charitable gifts, and Form 8283 for noncash donations over $500 (filing notes). The Schedule A total is the Form 1040 line 12e figure. Not a recommendation to itemize.",
      certainty: "verify",
      source: citations.scheduleA_2025,
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
      summary:
        "No personal mortgage was described. If the return itemizes, verify Form 1098 and mortgage interest are not claimed. This does not choose the standard deduction.",
      certainty: "verify",
    });
  }
  if (has(session, "check_mortgage")) {
    items.push({
      id: "mtg",
      form: "Form 1098 and Schedule A (Form 1040)",
      line: "Home mortgage interest — flagged",
      summary: "A personal mortgage was described. If the return itemizes, verify Form 1098 and the Schedule A mortgage-interest line. This does not start Schedule A.",
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
    items.push({
      id: "1040-schedules",
      form: "Schedules 1, 2, and 3 (Form 1040)",
      line: "15 — confirm on the form",
      summary:
        "Schedule 1 is adjustments, Schedule 2 is additional taxes, and Schedule 3 is credits. The filing notes use Form 1040 line 15 for taxable income. Confirm line 15 on the form.",
      certainty: "verify",
    });
  }
  const flaggedForms: { id: string; when: string; form: string; line?: string; summary: string }[] = [
    {
      id: "1099g",
      when: "check_1099g",
      form: "Form 1099-G",
      line: "Box 1; Form 1040 line flagged",
      summary:
        "Verify Form 1099-G box 1 (unemployment compensation) and box 4 if federal tax was withheld. The Form 1040 line is not named in the filing notes.",
    },
    {
      id: "8962",
      when: "check_8962",
      form: "Form 1095-A and Form 8962",
      line: "Schedule 3 — confirm on the form",
      summary: "Verify Form 1095-A and Form 8962. The filing notes place the net premium tax credit on Schedule 3. The credit is not computed here.",
    },
    {
      id: "eitc-kids",
      when: "check_eitc_kids",
      form: "Form 1040 and Schedule EIC",
      line: "27 — confirm on the form",
      summary: "Verify the earned income credit and Schedule EIC. The filing notes place the credit on Form 1040 line 27. Confirm that line.",
    },
    {
      id: "eitc",
      when: "check_eitc",
      form: "Form 1040",
      line: "27 — confirm on the form",
      summary: "Verify the earned income credit. The filing notes place it on Form 1040 line 27. Confirm that line. Schedule EIC is not opened from a no-child answer.",
    },
    {
      id: "6251",
      when: "check_6251",
      form: "Form 6251",
      summary: "Verify Form 6251. Exemption amounts are not stored, so no cap is shown.",
    },
    {
      id: "2210",
      when: "check_2210",
      form: "Form 2210",
      summary: "Verify Form 2210. This chart does not compute an underpayment penalty.",
    },
    {
      id: "9465",
      when: "check_9465",
      form: "Form 9465",
      summary: "Verify Form 9465, the installment agreement request. This chart does not compute a payment.",
    },
    {
      id: "4868",
      when: "check_4868",
      form: "Form 4868",
      summary: "Verify Form 4868. It extends time to file, not time to pay.",
    },
    {
      id: "care",
      when: "check_care",
      form: "Schedule 3 (Form 1040)",
      line: "Form number flagged",
      summary: "Verify the dependent care credit on Schedule 3. The filing notes do not name a separate form number.",
    },
    {
      id: "ca-health",
      when: "check_ca_health",
      form: "California return",
      summary:
        "California kept a state health-coverage rule. Verify the state return's coverage questions. This chart does not compute a penalty.",
    },
    {
      id: "ca-renter",
      when: "check_ca_renter",
      form: "California Form 540",
      line: "Renter's credit — line flagged",
      summary:
        "Verify the California renter's credit and that the return says the rented property was not exempt from property tax. The Form 540 line is not named in the filing notes. This chart does not compute the credit.",
    },
    {
      id: "info-returns",
      when: "check_info_returns",
      form: "IRS account — Returned Documents (information returns)",
      summary:
        "Information returns were compared. Verify each W-2, 1099-NEC, 1099-K, 1099-INT, 1099-DIV, 1099-B, 1099-G, and 1095-A on the IRS account is on the return in the exact amount shown. Not an instruction to add income.",
    },
    {
      id: "info-returns-open",
      when: "flag_info_returns",
      form: "IRS account — Returned Documents (information returns)",
      summary:
        "The return was not compared with the information returns on the IRS account. The filing notes say a mismatch with what employers, banks, and platforms already sent is an easy audit flag. Compare them before filing.",
    },
    {
      id: "prior-return",
      when: "check_prior_return",
      form: "Last year's return",
      line: "Form 1040 line 26 (amount applied from prior year) — confirm on the form",
      summary:
        "Compare this return's forms with last year's list and verify the carryforwards: the Schedule D capital-loss carryforward, the Schedule E depreciation schedule, and any prior-year overpayment applied on Form 1040 line 26. A form that dropped off is a question to ask, not a finding.",
    },
    {
      id: "prior-return-open",
      when: "flag_prior_return",
      form: "Last year's return",
      summary:
        "Last year's return was not available. The filing notes say it tells the preparer how much capital loss is still available and whether the depreciation schedule carries forward. The form list and the carryforwards stay unverified.",
    },
    {
      id: "ip-pin",
      when: "check_ip_pin",
      form: "Form 1040 e-file signature",
      line: "IP PIN entry — flagged",
      summary:
        "Verify the current-year six-digit Identity Protection PIN is entered for each person who has one. The filing notes say it is valid for one calendar year and that a California PIN is separate. The entry spot is not named in the notes.",
    },
  ];
  for (const item of flaggedForms) {
    if (!has(session, item.when)) continue;
    items.push({
      id: item.id,
      form: item.form,
      line: item.line,
      summary: item.summary,
      certainty: "verify",
    });
  }

  return items;
}

export function checklistTitle(session: Session): string {
  const open = session.revealed.filter((id) => getNode(id).kind === "question" && !readAnswer(session, id)).length;
  return open ? `Confirmation checklist — ${open} question${open === 1 ? "" : "s"} still open` : "Confirmation checklist";
}
