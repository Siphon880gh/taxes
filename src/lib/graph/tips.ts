import { citations } from "./sources";
import { socialSecurityWageBase } from "./thresholds";
import type { Tip, TipContext } from "./types";

function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export const tips: Record<string, Tip> = {
  capital_gain: {
    id: "capital_gain",
    toast: "Capital gain means a profit from selling a capital asset. Read more",
    readMore: () => ({
      title: "Capital gains",
      paragraphs: [
        "A capital gain is the profit you make when you sell a capital asset—such as stocks, real estate, or crypto—for a price higher than your original purchase price.",
      ],
      citations: [],
    }),
  },
  se_tax: {
    id: "se_tax",
    toast: "There are calculations to figure out how much you owe in self employment (SE) tax. Read more",
    readMore: (ctx: TipContext) => {
      const wage = socialSecurityWageBase(ctx.year);
      const wageLine =
        wage.amount != null
          ? `For tax year ${wage.year}, Publication 334 puts the Social Security wage base at ${money(wage.amount)} of combined wages, tips, and net earnings. The 2.9% Medicare portion has no wage base in that publication.`
          : wage.note;
      return {
        title: "Self-employment tax — how the pieces fit",
        paragraphs: [
          "Start with net profit: Subtract deductible business expenses from business income.",
          "This outline is a cross-check of Schedule SE on a return you already prepared. It does not compute the tax and it is not tax advice.",
        ],
        bullets: [
          "Calculate the taxable amount: Generally, 92.35% of net self-employment profit is subject to self-employment tax.",
          "Apply the rate: The combined rate is 15.3%, 12.4% for Social Security and 2.9% for Medicare.",
          "Watch the Social Security limit: The 12.4% portion applies only up to the annual wage base; the Medicare portion has no wage base limit.",
          "Deduct half of the tax for income-tax purposes: This lowers income subject to income tax, not the self-employment tax you owe.",
          wageLine,
        ],
        citations: [citations.pub334_2025, citations.scheduleC_2025],
      };
    },
  },
  schedule_c: {
    id: "schedule_c",
    toast: "Schedule C is where self-employment income and expenses are checked, including 1099-NEC work. Read more",
    readMore: () => ({
      title: "Schedule C on the prepared return",
      paragraphs: [
        "Schedule C is for self-employment income and expenses, including 1099-NEC freelance jobs. On the 2025 form, line 1 is gross receipts and should include amounts properly shown on Forms 1099-NEC. A separate Schedule C is used for each business.",
        "Line 31, the net profit or loss, is included on Schedule 1 (Form 1040) line 3 and on Schedule SE line 2. Those schedules flow onto Form 1040. Verify what was already prepared. This is not an instruction to start a form.",
      ],
      citations: [citations.scheduleC_2025, citations.pub334_2025],
    }),
  },
  schedule_e: {
    id: "schedule_e",
    toast: "Schedule E is where rental income and expenses are checked: rent, repairs, insurance, and depreciation. Read more",
    readMore: () => ({
      title: "Schedule E on the prepared return",
      paragraphs: [
        "Schedule E is where rental property income and expenses go: rent collected and things like repairs, insurance, and depreciation. On the 2025 form, rents are line 3, utilities are line 17, depreciation is line 18, and the rental total is line 26.",
        "Publication 527 (2025) treats a tenant's payment of your expense as rental income when it is your expense, and it describes square footage as a common way to split mixed use. This chart does not compute a percentage and does not tell you to start Schedule E.",
      ],
      citations: [citations.scheduleE_2025, citations.pub527_2025],
    }),
  },
  ten99k: {
    id: "ten99k",
    toast: "A payment app may not issue Form 1099-K, and goods-and-services income can still be reportable. Read more",
    readMore: () => ({
      title: "Form 1099-K and payment apps",
      paragraphs: [
        "For tax year 2025, a third party settlement organization such as a payment app is not required to file Form 1099-K unless the gross amount of payments for goods or services exceeds $20,000 and the number of transactions exceeds 200. The platform may still send a form below that line. Personal friends-and-family transfers are not the same payments.",
        "If the activity is goods and services and no form was generated, the income is still reportable and has to be entered on the return manually. An unknown dollar amount is not treated as “under the threshold.” A state may use a lower threshold; Louisiana and California thresholds are not stored here, so none is applied.",
      ],
      citations: [citations.ir2025_107],
    }),
  },
  std_vs_item: {
    id: "std_vs_item",
    toast: "The check compares the sourced standard deduction with what the prepared return already did. Read more",
    readMore: () => ({
      title: "Standard deduction and itemizing",
      paragraphs: [
        "The comparison uses the tax year, filing status, and jurisdiction you select. Federal and state amounts are different. Louisiana's 2025 return uses a standard deduction on IT-540 line 8 and reaches lines 9A–9D only if the federal return was itemized. California's 2025 instructions say to use the larger of California itemized deductions or the California standard deduction on Form 540 line 18.",
        "If a spouse itemizes on a separate return, the standard deduction is not available. A dependent uses a limited worksheet. Age or blindness can add an amount on top of the basic standard deduction. None of that is a recommendation to change the return. Unverified figures stay flagged.",
      ],
      citations: [citations.form1040_2025, citations.topic551, citations.la_rs_294, citations.ftb_2025],
    }),
  },
  depr_records: {
    id: "depr_records",
    toast: "The age of the depreciation schedule does not change the preparation fee. Clean records do. Read more",
    readMore: (ctx) => ({
      title: "Depreciation records and the preparation quote",
      paragraphs: [
        "The age of the depreciation schedule itself doesn't change the price. What matters is whether the preparer has clean records for the rental. If the rental has been on returns since 2019, previous returns should already show the carry-forward depreciation schedule. If those are missing, or if something was done incorrectly, that can add extra work and a higher fee. If things have been reported consistently, the depreciation schedule shouldn't be too much extra work.",
        ctx.quote
          ? `The quote on this path stays at $${ctx.quote.toLocaleString("en-US")} unless you are only reading the qualitative note. No dollar amount is added or subtracted.`
          : "No preparation quote is loaded on this path, so no dollar figure is changed.",
        "Publication 527 (2025) says to continue the same depreciation method for rental property placed in service before 2025. The chart still asks whether a carry-forward schedule is on the prior returns. It does not assume the schedule started in 2019.",
      ],
      citations: [citations.pub527_2025, citations.scheduleE_2025],
    }),
  },
  estimates: {
    id: "estimates",
    toast: "Estimated tax is tax paid during the year when withholding does not cover it, including self-employment tax. Read more",
    readMore: () => ({
      title: "Estimated tax payments on the return",
      paragraphs: [
        "This question asks whether the prepared return already includes estimated tax payments. It does not tell you to start paying estimates or to file Form 1040-ES.",
        "The IRS says tax is paid as you earn income, either by withholding or by estimated payments. Payments are common when tax was not withheld, including on self-employment income, interest, dividends, or capital gains. Estimated tax can cover income tax and self-employment tax. On the return, payments already made are a credit against the tax, separate from withholding. Confirm that line on the form in front of you. Quarterly vouchers are Form 1040-ES.",
        "The IRS page says individuals, including sole proprietors, generally have to make estimated payments if they expect to owe $1,000 or more when they file. That is about whether payments were required. It is not a finding that this return includes them. Yes only means the prepared return has payments to verify. This chart does not compute an underpayment penalty.",
      ],
      citations: [citations.estimated_taxes],
    }),
  },
  form_1040: {
    id: "form_1040",
    toast: "Schedules on this path are checked where they land on Form 1040. Read more",
    readMore: () => ({
      title: "How the schedules meet Form 1040",
      paragraphs: [
        "Schedule C and Schedule E, and any other schedule this path turns up, flow onto the main Form 1040. On the 2025 form, Schedule C line 31 is included on Schedule 1 line 3. Schedule E's rental total is line 26; confirm on the form where that total is carried. Form 1040 line 11b is adjusted gross income and line 12e is the deduction.",
        "Every one of these is a line to verify on the prepared return. The chart is not an instruction to start a form.",
      ],
      citations: [citations.form1040_2025, citations.scheduleC_2025, citations.scheduleE_2025],
    }),
  },
};

export const edgeTips: { from: string; to: string; tipId: string }[] = [
  { from: "se_names", to: "schedule_se", tipId: "se_tax" },
  { from: "se_count", to: "schedule_se", tipId: "se_tax" },
  { from: "schedule_c", to: "form_1040", tipId: "form_1040" },
  { from: "schedule_e", to: "form_1040", tipId: "form_1040" },
  { from: "schedule_se", to: "form_1040", tipId: "se_tax" },
  { from: "check_manual", to: "form_1040", tipId: "ten99k" },
  { from: "check_1099k_form", to: "form_1040", tipId: "ten99k" },
  { from: "deduction_result", to: "form_1040", tipId: "std_vs_item" },
  { from: "rental_history", to: "rental_records", tipId: "depr_records" },
];
