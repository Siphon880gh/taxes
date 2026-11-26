import { citations } from "./sources";
import type { Certainty, Citation, TaxYear } from "./types";

/**
 * Form line numbers per tax year. 2025 comes from the final IRS forms. 2026 comes from the IRS
 * early-release drafts, which can still change, so 2026 lines are marked verify. Lines that differ
 * between the years (Schedule 1-A, Form 1040 lines 13a and 13b) are the reason this table exists.
 */
export type FormLines = {
  year: TaxYear;
  /** True when the numbers come from a draft form. */
  draft: boolean;
  certainty: Certainty;
  form1040: {
    wages: string;
    capitalGain: string;
    agi: string;
    deduction: string;
    /** Charitable deduction for non-itemizers; not on the 2025 form. */
    charitableNonItemizer: string | null;
    qbi: string;
    schedule1A: string;
    taxableIncome: string;
    w2Withholding: string;
    estimatedPayments: string;
    eic: string;
    source: Citation;
  };
  schedule1A: {
    tips: string;
    overtime: string;
    carVin: string;
    car: string;
    senior: string;
    total: string;
    seniorBornBefore: string;
    source: Citation;
  };
  scheduleA: {
    salt: string;
    source: Citation;
  };
  /** Appended to checklist text when the line numbers need confirming. */
  note: string;
};

const lines2025: FormLines = {
  year: 2025,
  draft: false,
  certainty: "sourced",
  form1040: {
    wages: "1a",
    capitalGain: "7a",
    agi: "11b",
    deduction: "12e",
    charitableNonItemizer: null,
    qbi: "13a",
    schedule1A: "13b",
    taxableIncome: "15",
    w2Withholding: "25a",
    estimatedPayments: "26",
    eic: "27a",
    source: citations.form1040_2025,
  },
  schedule1A: {
    tips: "13",
    overtime: "21",
    carVin: "22",
    car: "30",
    senior: "37",
    total: "38",
    seniorBornBefore: "January 2, 1961",
    source: citations.schedule1a_2025,
  },
  scheduleA: { salt: "5e", source: citations.scheduleA_2025 },
  note: "",
};

const lines2026: FormLines = {
  year: 2026,
  draft: true,
  certainty: "verify",
  form1040: {
    wages: "1a",
    capitalGain: "7a",
    agi: "11b",
    deduction: "12e",
    charitableNonItemizer: "12f",
    qbi: "13b",
    schedule1A: "13a",
    taxableIncome: "15",
    w2Withholding: "25a",
    estimatedPayments: "26",
    eic: "27a",
    source: citations.form1040_2026_draft,
  },
  schedule1A: {
    tips: "15",
    overtime: "27",
    carVin: "28",
    car: "36",
    senior: "43",
    total: "44",
    seniorBornBefore: "January 2, 1962",
    source: citations.schedule1a_2026_draft,
  },
  scheduleA: { salt: "5e", source: citations.scheduleA_2026_draft },
  note: " These 2026 line numbers are from the IRS early-release draft; confirm them on the final form.",
};

/**
 * Line numbers for the selected year. With no year selected the 2025 final-form lines are shown,
 * marked verify, with a note to confirm them on the form for the year on the return.
 */
export function formLines(year: TaxYear | null): FormLines {
  if (year === 2026) return lines2026;
  if (year === 2025) return lines2025;
  return {
    ...lines2025,
    certainty: "verify",
    note: " The tax year is not selected, so these are the 2025 line numbers; confirm them on the form for the year on the return.",
  };
}
