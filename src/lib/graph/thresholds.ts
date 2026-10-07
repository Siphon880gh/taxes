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
  if (answerId === "y2024") return 2024;
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
  if (year === 2024) {
    return {
      amount: null,
      year,
      unverified: true,
      note: "Tax year 2024 standard deduction amounts are not loaded in this tool. Verify them on the 2024 Form 1040 instructions before comparing the return.",
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
  if (year === 2026) {
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
  return {
    amount: null,
    year,
    unverified: true,
    note: "The 2024 additional standard deduction for age or blindness is not loaded. Verify it before using it.",
  };
}

export function saltCap(year: TaxYear | null, status: FilingStatus | null): MoneyFigure {
  if (year !== 2025 || !status) {
    return {
      amount: null,
      year,
      unverified: true,
      note:
        year === 2026
          ? "A tax year 2026 state-and-local-tax cap was not verified for this tool. Do not reuse the 2025 cap as if it were the 2026 cap."
          : "The state-and-local-tax cap is shown only for tax year 2025, where the Schedule A instructions were checked.",
    };
  }
  const mfs = status === "mfs";
  return {
    amount: mfs ? 20000 : 40000,
    year,
    citation: citations.scheduleA_2025,
    unverified: false,
    note: mfs
      ? "2025 Schedule A line 5e cap is $20,000 for married filing separately, before any modified-AGI phase-down. The floor of the phase-down is $5,000. This tool does not compute the phase-down."
      : "2025 Schedule A line 5e cap is $40,000 before any modified-AGI phase-down. The phase-down starts when Form 1040 line 11b is more than $500,000 and does not go below $10,000. This tool does not compute the phase-down.",
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
  if (year === 2024) {
    return {
      amount: null,
      year,
      unverified: true,
      note: "Tax year 2024 state standard deductions are not loaded.",
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
  return {
    amount: null,
    year,
    unverified: true,
    note: "The Social Security wage base stored here is the 2025 figure from Publication 334. A 2024 or 2026 wage base is not stored, so none is shown for the selected year.",
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
