import type { Citation, TaxYear } from "./types";
import { citations } from "./sources";

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh" | "qss";

export type Jurisdiction =
  | "federal"
  | "louisiana"
  | "california"
  | "other"
  | "unknown";

export type MoneyFigure = {
  amount: number | null;
  year: TaxYear | null;
  citation?: Citation;
  unverified: boolean;
  note: string;
};

const federal2025: Record<FilingStatus, number> = {
  single: 15750,
  mfs: 15750,
  mfj: 31500,
  qss: 31500,
  hoh: 23625,
};

const federal2026: Record<FilingStatus, number> = {
  single: 16100,
  mfs: 16100,
  mfj: 32200,
  qss: 32200,
  hoh: 24150,
};

const louisiana2025: Record<FilingStatus, number> = {
  single: 12500,
  mfs: 12500,
  mfj: 25000,
  qss: 25000,
  hoh: 25000,
};

const louisiana2026: Record<FilingStatus, number> = {
  single: 12838,
  mfs: 12838,
  mfj: 25676,
  qss: 25676,
  hoh: 25676,
};

const california2025: Record<FilingStatus, number> = {
  single: 5706,
  mfs: 5706,
  mfj: 11412,
  qss: 11412,
  hoh: 11412,
};

const california2026: Record<FilingStatus, number> = {
  single: 5900,
  mfs: 5900,
  mfj: 11800,
  qss: 11800,
  hoh: 11800,
};

export function parseYear(answerId: string | undefined): TaxYear | null {
  if (answerId === "y2025") return 2025;
  if (answerId === "y2026") return 2026;
  return null;
}

export function parseStatus(answerId: string | undefined): FilingStatus | null {
  if (
    answerId === "single" ||
    answerId === "mfj" ||
    answerId === "mfs" ||
    answerId === "hoh" ||
    answerId === "qss"
  ) {
    return answerId;
  }
  return null;
}

export function parseJurisdiction(answerId: string | undefined): Jurisdiction | null {
  if (answerId === "federal") return "federal";
  if (answerId === "louisiana") return "louisiana";
  if (answerId === "california") return "california";
  if (answerId === "other") return "other";
  if (answerId === "unknown") return "unknown";
  return null;
}

export function statusLabel(status: FilingStatus | null): string {
  switch (status) {
    case "single":
      return "Single";
    case "mfj":
      return "Married filing jointly";
    case "mfs":
      return "Married filing separately";
    case "hoh":
      return "Head of household";
    case "qss":
      return "Qualifying surviving spouse";
    default:
      return "Filing status not selected";
  }
}

/** Basic federal standard deduction. Additional age, blindness, and dependent limits are separate. */
export function federalBasicStandard(
  year: TaxYear | null,
  status: FilingStatus | null,
): MoneyFigure {
  if (!year || !status) {
    return {
      amount: null,
      year,
      unverified: true,
      note: "The federal standard deduction is not shown until both the tax year and the filing status are selected.",
    };
  }
  if (year === 2025) {
    return {
      amount: federal2025[status],
      year,
      citation: citations.form1040_2025,
      unverified: false,
      note: `Basic federal standard deduction for ${statusLabel(status)} in tax year 2025. This is not increased here for age or blindness, and it is not the dependent worksheet.`,
    };
  }
  return {
    amount: federal2026[status],
    year,
    citation: citations.rp2025_32,
    unverified: false,
    note: `Basic federal standard deduction for ${statusLabel(status)} in tax year 2026, from Rev. Proc. 2025-32. Confirm the figure still matches the form you are looking at.`,
  };
}

export function federalAdditionalAgeBlind(
  year: TaxYear | null,
  status: FilingStatus | null,
): MoneyFigure {
  if (!year || !status) {
    return {
      amount: null,
      year,
      unverified: true,
      note: "Age or blindness add-on is not shown without a year and filing status.",
    };
  }
  const unmarried = status === "single" || status === "hoh";
  if (year === 2025) {
    return {
      amount: unmarried ? 2000 : 1600,
      year,
      citation: citations.topic551,
      unverified: false,
      note: unmarried
        ? "For 2025, Topic 551 sets the additional standard deduction at $2,000 for a person who is unmarried and not a surviving spouse, for each qualifying age or blindness box."
        : "For 2025, Topic 551 sets the additional standard deduction at $1,600 for each qualifying age or blindness box when the filer is married or a qualifying surviving spouse.",
    };
  }
  return {
    amount: unmarried ? 2050 : 1650,
    year,
    citation: citations.rp2025_32,
    unverified: false,
    note: unmarried
      ? "Rev. Proc. 2025-32: for 2026 the additional amount is $2,050 if unmarried and not a surviving spouse."
      : "Rev. Proc. 2025-32: for 2026 the additional amount is $1,650 if married or a surviving spouse.",
  };
}

/** The state-and-local-tax cap and where its modified-AGI phase-down starts. */
export function saltCap(year: TaxYear | null, status: FilingStatus | null): MoneyFigure & { phaseDownOver: number | null } {
  if (!year || !status) {
    return {
      amount: null,
      phaseDownOver: null,
      year,
      unverified: true,
      note: "The state-and-local-tax cap is shown once the tax year and filing status are selected.",
    };
  }
  const mfs = status === "mfs";
  if (year === 2025) {
    return {
      amount: mfs ? 20000 : 40000,
      phaseDownOver: mfs ? 250000 : 500000,
      year,
      citation: citations.scheduleA_2025,
      unverified: false,
      note: mfs
        ? "2025 Schedule A line 5e cap is $20,000 for married filing separately. It is reduced when modified AGI is more than $250,000 but not below $5,000. This tool does not compute the phase-down."
        : "2025 Schedule A line 5e cap is $40,000. It is reduced when Form 1040 line 11b is more than $500,000 but not below $10,000. This tool does not compute the phase-down.",
    };
  }
  return {
    amount: mfs ? 20200 : 40400,
    phaseDownOver: mfs ? 252500 : 505000,
    year,
    citation: citations.irs_salt_2026,
    unverified: false,
    note: mfs
      ? "For 2026 the state-and-local-tax cap is $20,200 for married filing separately. It is reduced when modified AGI is more than $252,500 but not below $5,000. The 2026 Schedule A line number is not confirmed here. This tool does not compute the phase-down."
      : "For 2026 the state-and-local-tax cap is $40,400. It is reduced when modified AGI is more than $505,000 but not below $10,000. The 2026 Schedule A line number is not confirmed here. This tool does not compute the phase-down.",
  };
}

export function stateStandard(
  year: TaxYear | null,
  status: FilingStatus | null,
  jurisdiction: Jurisdiction | null,
): MoneyFigure {
  if (!jurisdiction || jurisdiction === "unknown") {
    return {
      amount: null,
      year,
      unverified: true,
      note: "No state standard deduction is applied until a state is selected.",
    };
  }
  if (jurisdiction === "federal") {
    return {
      amount: null,
      year,
      unverified: false,
      note: "Federal-only check. No state standard deduction is part of this path.",
    };
  }
  if (jurisdiction === "other") {
    return {
      amount: null,
      year,
      unverified: true,
      note: "This tool has sourced standard deductions only for federal, Louisiana, and California. The other state's figure is flagged, not invented.",
    };
  }
  if (!year || !status) {
    return {
      amount: null,
      year,
      unverified: true,
      note: "Select a tax year and filing status before a state standard deduction is shown.",
    };
  }
  if (jurisdiction === "louisiana") {
    const table = year === 2025 ? louisiana2025 : louisiana2026;
    return {
      amount: table[status],
      year,
      citation: year === 2025 ? citations.la_rs_294 : citations.la_rib_2026,
      unverified: false,
      note:
        year === 2025
          ? "Louisiana standard deduction for tax year 2025. On the 2025 IT-540 this is line 8. Lines 9A–9D are reached only if the federal return was itemized. This is not a federal-style choice to itemize on the Louisiana return."
          : "Louisiana standard deduction for tax year 2026 from RIB 26-019. The 2026 form's line number is not confirmed here, so verify the line on the form rather than assuming it is still line 8.",
    };
  }
  const table = year === 2025 ? california2025 : california2026;
  return {
    amount: table[status],
    year,
    citation: year === 2025 ? citations.ftb_2025 : citations.ftb_2026,
    unverified: false,
    note:
      year === 2025
        ? "California standard deduction for tax year 2025, entered on Form 540 line 18 if that is the larger of California itemized deductions or this standard deduction. Do not substitute the federal standard deduction or federal Schedule A."
        : "California standard deduction announced in FTB's 2026 indexing note. FTB said the complete 2026 rate schedules would be posted later; use this figure as the indexing announcement, and verify it against the final 2026 Form 540 instructions.",
  };
}

export function socialSecurityWageBase(year: TaxYear | null): MoneyFigure {
  if (year === 2025) {
    return {
      amount: 176100,
      year,
      citation: citations.pub334_2025,
      unverified: false,
      note: "For 2025, Publication 334 says only the first $176,100 of combined wages, tips, and net earnings is subject to the 12.4% Social Security portion of self-employment tax. The 2.9% Medicare portion has no wage base in that publication.",
    };
  }
  if (year === 2026) {
    return {
      amount: 184500,
      year,
      citation: citations.ssa_wage_base,
      unverified: false,
      note: "For 2026, SSA's contribution and benefit base is $184,500: only that much of combined wages and net earnings is subject to the 12.4% Social Security portion. Medicare has no taxable maximum.",
    };
  }
  return {
    amount: null,
    year,
    unverified: true,
    note: "The Social Security wage base is shown once the tax year is selected.",
  };
}

/** Form 1099-NEC (and no-withholding W-2) reporting threshold for payments made in the tax year. */
export function infoReturnThreshold(year: TaxYear | null): MoneyFigure {
  if (year === 2026) {
    return {
      amount: 2000,
      year,
      citation: citations.pub15_2026,
      unverified: false,
      note: "For payments made in 2026, Form 1099-NEC is required at $2,000 or more, and a W-2 is required at $2,000 or more when no income, Social Security, or Medicare tax was withheld (any withholding still requires a W-2).",
    };
  }
  return {
    amount: 600,
    year,
    citation: citations.pub15_2026,
    unverified: year == null,
    note:
      year === 2025
        ? "For payments made in 2025, Form 1099-NEC is required at $600 or more, and a W-2 is required at $600 or more when no income, Social Security, or Medicare tax was withheld (any withholding still requires a W-2)."
        : "The tax year is not selected. The threshold is $600 for payments made in 2025 and $2,000 for payments made in 2026.",
  };
}

/** Dependent standard deduction floor: the greater of `floor` or earned income plus `plus`, capped at the basic amount. */
export function dependentStandard(year: TaxYear | null): { floor: number; plus: number; year: TaxYear | null; citation: Citation; note: string } {
  const citation = year === 2026 ? citations.rp2025_32_more : citations.topic551;
  const label = year ?? "2025 and 2026";
  return {
    floor: 1350,
    plus: 450,
    year,
    citation,
    note: `For ${label}, a filer someone else can claim has a standard deduction of the greater of $1,350 or earned income plus $450, capped at the basic standard deduction (${year === 2026 ? "Rev. Proc. 2025-32" : "Topic 551"}).`,
  };
}

/** Section 199A threshold: at or below it (taxable income before the QBI deduction), Form 8995 is generally used. */
export function qbiThreshold(
  year: TaxYear | null,
  status: FilingStatus | null,
): { threshold: number | null; phaseInEnd: number | null; year: TaxYear | null; citation?: Citation; note: string } {
  if (!year || !status) {
    return {
      threshold: null,
      phaseInEnd: null,
      year,
      note: "QBI income thresholds are shown once the tax year and filing status are selected: 2025 is $197,300 ($394,600 married filing jointly); 2026 is $201,750 ($403,500 married filing jointly, $201,775 married filing separately).",
    };
  }
  const table =
    year === 2025
      ? { mfj: [394600, 494600], mfs: [197300, 247300], other: [197300, 247300] }
      : { mfj: [403500, 553500], mfs: [201775, 276775], other: [201750, 276750] };
  const [threshold, phaseInEnd] = status === "mfj" ? table.mfj : status === "mfs" ? table.mfs : table.other;
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  return {
    threshold,
    phaseInEnd,
    year,
    citation: year === 2025 ? citations.rp2024_40 : citations.rp2025_32_more,
    note: `For ${year}, the QBI threshold for ${statusLabel(status)} is ${money(threshold)} of taxable income before the QBI deduction (phase-in range ends at ${money(phaseInEnd)}). At or below the threshold, Form 8995 is generally used; above it, or for a patron of a cooperative, Form 8995-A. Taxable income is not entered here, so the form choice is not concluded.`,
  };
}

/** Schedule 1-A deductions, 2025 through 2028 (FS-2025-03). Amounts are set by statute and are not indexed. */
export const schedule1A = {
  years: [2025, 2026] as TaxYear[],
  tips: { max: 25000, phaseOutOver: { mfj: 300000, other: 150000 }, perThousand: 100, round: "down" as const },
  overtime: { max: { mfj: 25000, other: 12500 }, phaseOutOver: { mfj: 300000, other: 150000 }, perThousand: 100, round: "down" as const },
  carLoan: { max: 10000, phaseOutOver: { mfj: 200000, other: 100000 }, perThousand: 200, round: "up" as const },
  senior: { perPerson: 6000, phaseOutOver: { mfj: 150000, other: 75000 }, rate: 0.06 },
  citation: citations.fs2025_03,
  form2025: citations.schedule1a_2025,
};

/** Enhanced senior deduction (Schedule 1-A Part V), 2025 through 2028. */
export function seniorDeduction(year: TaxYear | null, status: FilingStatus | null): MoneyFigure {
  if (!year) {
    return { amount: null, year, unverified: true, note: "The enhanced senior deduction is shown once the tax year is selected." };
  }
  const mfj = status === "mfj";
  const over = mfj ? "$150,000" : "$75,000";
  return {
    amount: schedule1A.senior.perPerson,
    year,
    citation: year === 2025 ? citations.schedule1a_2025 : citations.fs2025_03,
    unverified: false,
    note:
      status === "mfs"
        ? `Tax year ${year} has an enhanced senior deduction of up to $6,000 per person 65 or older, but married taxpayers must file jointly to claim it, so a married-filing-separately return should not show it.`
        : `Tax year ${year} also has an enhanced senior deduction of up to $6,000 per person 65 or older${mfj ? " ($12,000 if both spouses qualify)" : ""}, claimed on Schedule 1-A Part V and reduced by 6% of modified AGI over ${over}. MAGI was not entered, so the phaseout is not computed. It is separate from the standard deduction's age add-on and is available whether or not the return itemizes.`,
  };
}

export const seRates = {
  year: 2025 as const,
  multiplier: 0.9235,
  combined: 0.153,
  socialSecurity: 0.124,
  medicare: 0.029,
  citation: citations.pub334_2025,
};

export const ten99kThreshold = {
  year: 2025 as const,
  grossExceeds: 20000,
  transactionsExceed: 200,
  citation: citations.ir2025_107,
  recalledMatches:
    "The recalled trigger — over $20,000 and over 200 transactions, including the written “$200,00” — matches this sourced test (exceeds $20,000 and exceeds 200 transactions). It is not flagged as a conflict.",
};
