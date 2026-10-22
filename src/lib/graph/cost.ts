import { citations } from "./sources";
import { answerOf } from "./session";
import type { Citation, Session } from "./types";

export type PriceRow = {
  id: string;
  vendor: string;
  label: string;
  amountLabel: string;
  yearLabel: string;
  unverified: boolean;
  note: string;
  citation?: Citation;
  /** Day the price was last read on its source, as YYYY-MM-DD, or null when it has no price page. */
  checked: string | null;
  checkedLabel: string | null;
  /** Days since the check when that is past the staleness limit; otherwise null. */
  staleDays: number | null;
};

/** A price whose last check is older than this many days is flagged as stale. */
export const PRICE_STALE_AFTER_DAYS = 90;

export type CostOptions = {
  /** Defaults to the current date. */
  today?: Date;
  /** Defaults to PRICE_STALE_AFTER_DAYS. */
  staleAfterDays?: number;
};

type DraftRow = Omit<PriceRow, "checked" | "checkedLabel" | "staleDays">;

function checkedDate(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Add the last-checked date and a staleness count to a price row. */
export function withFreshness(row: DraftRow, today: Date, staleAfterDays: number): PriceRow {
  const iso = row.citation?.checked ?? null;
  const date = iso ? checkedDate(iso) : null;
  if (!iso || !date) return { ...row, checked: null, checkedLabel: null, staleDays: null };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((start.getTime() - date.getTime()) / 86_400_000);
  return {
    ...row,
    checked: iso,
    checkedLabel: date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    staleDays: days > staleAfterDays ? days : null,
  };
}

export type ProEstimate = {
  low: number;
  high: number;
  /** CPI-U ratio from the 2023 survey year to the latest month used. */
  cpiFactor: number;
  /** Where an entered or loaded quote sits against the range. */
  quotePosition: "below" | "within" | "above" | null;
  note: string;
  citations: Citation[];
};

export type CostReport = {
  rows: PriceRow[];
  quoteNote: string | null;
  framing: string | null;
  direction: "same" | "higher" | "lower-work" | "none";
  estimate: ProEstimate | null;
  staleAfterDays: number;
};

/** CPI-U, all items, U.S. city average, not seasonally adjusted. See citations.bls_cpi_u. */
export const CPI_U = { surveyYearAverage2023: 304.702, latest: 336.94, latestLabel: "September 2026" } as const;

type NsaFee = { label: string; y2023: number; y2020: number };

/** NSA national averages for the 2023 and 2020 surveys. See citations.nsa_2023. */
const NSA = {
  notItemized: { label: "Form 1040 not itemized, with a state return", y2023: 279, y2020: 220 },
  itemized: { label: "Form 1040 itemized, with a state return", y2023: 392, y2020: 323 },
  scheduleC: { label: "Schedule C", y2023: 221, y2020: 192 },
  scheduleE: { label: "Schedule E rental", y2023: 192, y2020: 145 },
  scheduleSE: { label: "Schedule SE", y2023: 62, y2020: 41 },
  scheduleD: { label: "Schedule D / Form 8949", y2023: 126, y2020: 118 },
  scheduleB: { label: "Schedule B", y2023: 64, y2020: 42 },
} satisfies Record<string, NsaFee>;

/**
 * Estimated independent-preparer fee for the forms reached so far.
 * Low end: the lower matching 2023 base plus add-ons, raised by CPI-U.
 * High end: the higher matching base plus add-ons, each raised by the larger of CPI-U or that fee's own 2020→2023 growth.
 */
export function proEstimate(session: Session): ProEstimate | null {
  if (session.revealed.length <= 1) return null;
  const tags = complexityTags(session);
  const choice = answerOf(session, "deduction_choice");
  const addOns: NsaFee[] = [
    tags.includes("Schedule C") ? NSA.scheduleC : null,
    tags.includes("Schedule E") ? NSA.scheduleE : null,
    tags.includes("Schedule SE") ? NSA.scheduleSE : null,
    tags.includes("investments") ? NSA.scheduleD : null,
    has(session, "check_sch_b") ? NSA.scheduleB : null,
  ].filter((fee): fee is NsaFee => fee !== null);
  const lowBase = choice === "itemized" ? NSA.itemized : NSA.notItemized;
  const highBase = choice === "standard" ? NSA.notItemized : NSA.itemized;
  const cpiFactor = CPI_U.latest / CPI_U.surveyYearAverage2023;
  const low = Math.round([lowBase, ...addOns].reduce((sum, fee) => sum + fee.y2023, 0) * cpiFactor);
  const high = Math.round(
    [highBase, ...addOns].reduce((sum, fee) => sum + fee.y2023 * Math.max(cpiFactor, fee.y2023 / fee.y2020), 0),
  );
  const quotePosition =
    session.quote == null ? null : session.quote < low ? "below" : session.quote > high ? "above" : "within";
  const baseText =
    lowBase === highBase
      ? `${lowBase.label} ($${lowBase.y2023} in 2023)`
      : `${lowBase.label} ($${lowBase.y2023}) at the low end and ${highBase.label.replace("Form 1040 ", "")} ($${highBase.y2023}) at the high end, because this path has not said whether the return itemizes`;
  const addOnText = addOns.length
    ? addOns.map((fee) => `${fee.label} $${fee.y2023}`).join(", ")
    : "no schedule add-ons yet";
  return {
    low,
    high,
    cpiFactor,
    quotePosition,
    note: `Estimate only, not a quote. It starts from the NSA 2023 national averages: ${baseText}, plus ${addOnText}. The low end raises the 2023 total by CPI-U inflation from the 2023 average to ${CPI_U.latestLabel} (×${cpiFactor.toFixed(3)}). The high end assumes each fee keeps growing as it did from the 2020 to the 2023 survey, or by CPI-U if that is higher. National averages are not Los Angeles or Louisiana prices, and a preparer can charge well outside this range.`,
    citations: [citations.nsa_2023, citations.bls_cpi_u],
  };
}

function has(session: Session, id: string): boolean {
  return session.revealed.includes(id);
}

export function complexityTags(session: Session): string[] {
  const tags: string[] = [];
  if (has(session, "schedule_c")) tags.push("Schedule C");
  if (has(session, "schedule_e")) tags.push("Schedule E");
  if (has(session, "schedule_se")) tags.push("Schedule SE");
  if (has(session, "check_capgain") || has(session, "check_crypto")) tags.push("investments");
  if (answerOf(session, "deduction_choice") === "itemized") tags.push("itemized");
  if (has(session, "check_w2")) tags.push("W-2");
  return tags;
}

function nsaSum(parts: { label: string; amount: number }[]): number {
  return parts.reduce((sum, part) => sum + part.amount, 0);
}

export function costReport(session: Session, options: CostOptions = {}): CostReport {
  const today = options.today ?? new Date();
  const staleAfterDays = options.staleAfterDays ?? PRICE_STALE_AFTER_DAYS;
  const tags = complexityTags(session);
  const needsPremium =
    tags.includes("Schedule C") || tags.includes("Schedule E") || tags.includes("investments");
  const simple =
    tags.includes("W-2") &&
    !needsPremium &&
    answerOf(session, "deduction_choice") !== "itemized" &&
    !tags.includes("Schedule C");
  const rows: DraftRow[] = [];

  if (session.revealed.length > 1) {
    rows.push({
      id: "freetaxusa",
      vendor: "FreeTaxUSA",
      label: "Federal return, plus one state return",
      amountLabel: "$0 + $15.99",
      yearLabel: citations.freetaxusa_pricing.yearLabel,
      unverified: false,
      note: "Published prices retrieved October 16, 2026. Federal filing is $0 for every situation on the pricing page, including wages, itemized deductions, investments, rental property, and self-employment, so the forms reached on this path do not change it. A state return is $15.99. Optional products on the same page are not added: Deluxe Support $7.99, Pro Support $64.99, and Audit Defense $19.99. An amended return is listed at $16.98, or included with Deluxe or Pro Support.",
      citation: citations.freetaxusa_pricing,
    });

    if (needsPremium) {
      rows.push({
        id: "tt-premium",
        vendor: "TurboTax",
        label: "Do It Yourself Premium, federal",
        amountLabel: "$139",
        yearLabel: citations.turbotax_premium.yearLabel,
        unverified: false,
        note: "Published federal price for the online product whose forms include rental property, investments, and self-employment. The state fee is the separate TurboTax Online state row and is not added here.",
        citation: citations.turbotax_premium,
      });
    } else if (answerOf(session, "deduction_choice") === "itemized") {
      rows.push({
        id: "tt-deluxe",
        vendor: "TurboTax",
        label: "Do It Yourself Deluxe, federal",
        amountLabel: "$79",
        yearLabel: citations.turbotax_deluxe.yearLabel,
        unverified: false,
        note: "Published federal price for the online deductions product. The state fee is the separate TurboTax Online state row and is not added here. If the return also needs Schedule E or a full Schedule C, Deluxe is the wrong tier — Premium is $139 federal.",
        citation: citations.turbotax_deluxe,
      });
    } else if (simple && answerOf(session, "w2") === "yes" && answerOf(session, "se") === "no") {
      rows.push({
        id: "tt-free",
        vendor: "TurboTax",
        label: "Free Edition, federal and state",
        amountLabel: "$0",
        yearLabel: citations.turbotax_free.yearLabel,
        unverified: false,
        note: "Published price for a simple Form 1040 only. Intuit limits who qualifies. If another schedule is on the return, do not treat $0 as the price.",
        citation: citations.turbotax_free,
      });
    } else {
      rows.push({
        id: "tt-open",
        vendor: "TurboTax",
        label: "Online federal price",
        amountLabel: "Not selected yet",
        yearLabel: citations.turbotax_premium.yearLabel,
        unverified: true,
        note: "The published tiers are Free Edition $0 for a simple Form 1040, Deluxe $79 federal for deductions, and Premium $139 federal for rental, investments, and self-employment. Finish the income questions before treating one of them as the estimate. The state fee for paid online products is the separate TurboTax Online state row.",
        citation: citations.turbotax_premium,
      });
    }

    if (!rows.some((row) => row.id === "tt-free")) {
      rows.push({
        id: "tt-state",
        vendor: "TurboTax Online state",
        label: "Per state return with a paid online federal product",
        amountLabel: "$0–$64",
        yearLabel: citations.turbotax_state.yearLabel,
        unverified: false,
        note: "Intuit's State additional page lists $0–$64 per state, and $0 only with a free federal return. It does not say which fee applies to which product or filing date, so this range is shown and no single state dollar is added to the TurboTax federal price.",
        citation: citations.turbotax_state,
      });
    }

    rows.push({
      id: "tt-desktop",
      vendor: "TurboTax desktop",
      label: "Desktop list prices (not added to the estimate)",
      amountLabel: "$84 / $119 / $134",
      yearLabel: citations.turbotax_desktop.yearLabel,
      unverified: false,
      note: "Deluxe $84, Premier $119, Home & Business $134. State e-file $25 except New York and Washington. Not added to the online estimate. Coverage of both Schedule C and Schedule E on a desktop SKU was not confirmed.",
      citation: citations.turbotax_desktop,
    });

    rows.push({
      id: "hrb",
      vendor: "H&R Block",
      label: "Online tier for this complexity",
      amountLabel: "Price unverified",
      yearLabel: citations.hrblock_online.yearLabel,
      unverified: true,
      note: tags.includes("Schedule C")
        ? "H&R Block's pages describe Self-Employed as including Premium features plus business income. That is the tier description that matches Schedule C. The dollar price was not in the HTML retrieved October 3, 2026, and the same page retrieved October 16, 2026 and October 21, 2026 still prints no dollar amount, so none is shown."
        : tags.includes("Schedule E") || tags.includes("investments")
          ? "H&R Block's pages describe Premium as covering rental income and investments. That is the tier description that matches this path. The dollar price was not in the HTML retrieved October 3, 2026, and the same page retrieved October 16, 2026 and October 21, 2026 still prints no dollar amount, so none is shown."
          : "H&R Block's pages describe Free Online, Deluxe for itemized deductions, Premium for rental and investments, and Self-Employed for business income. Dollar prices were not in the HTML retrieved October 3, 2026, and the same page retrieved October 16, 2026 and October 21, 2026 still prints no dollar amount, so none is shown.",
      citation: citations.hrblock_online,
    });

    const nsaParts = [
      { label: "Schedule C", amount: 221, on: tags.includes("Schedule C") },
      { label: "Schedule E rental", amount: 192, on: tags.includes("Schedule E") },
      { label: "Schedule SE", amount: 62, on: tags.includes("Schedule SE") },
      { label: "Schedule D / Form 8949", amount: 126, on: tags.includes("investments") },
      { label: "Schedule B", amount: 64, on: has(session, "check_sch_b") },
    ].filter((part) => part.on);
    const baseNote =
      answerOf(session, "deduction_choice") === "itemized"
        ? "Itemized Form 1040 with a state return, 2023 average $392."
        : answerOf(session, "deduction_choice") === "standard"
          ? "Form 1040 not itemized, with a state return, 2023 average $279."
          : "The survey's 2023 base is $279 if the Form 1040 was not itemized and $392 if it was, both with a state return. This path has not said which, so both bases stay visible.";

    rows.push({
      id: "nsa",
      vendor: "Independent firms (NSA survey)",
      label: "Published national averages, not a package price",
      amountLabel:
        nsaParts.length === 0
          ? "Base only"
          : `Add-ons ${nsaParts.map((part) => part.label + " $" + part.amount).join(", ")}`,
      yearLabel: citations.nsa_2023.yearLabel,
      unverified: false,
      note: `${baseNote} Schedule add-ons that match this path: ${
        nsaParts.length
          ? nsaParts.map((part) => `${part.label} $${part.amount}`).join("; ")
          : "none yet"
      }. An arithmetic sum of those published pieces is not a surveyed package price, not a 2025 price, and not a Louisiana or Los Angeles price. ${
        answerOf(session, "deduction_choice") === "itemized"
          ? `Sum of the itemized base plus these add-ons: $${nsaSum([{ label: "base", amount: 392 }, ...nsaParts])}.`
          : answerOf(session, "deduction_choice") === "standard"
            ? `Sum of the non-itemized base plus these add-ons: $${nsaSum([{ label: "base", amount: 279 }, ...nsaParts])}.`
            : `If not itemized, the pieces sum to $${nsaSum([{ label: "base", amount: 279 }, ...nsaParts])}. If itemized, they sum to $${nsaSum([{ label: "base", amount: 392 }, ...nsaParts])}.`
      }`,
      citation: citations.nsa_2023,
    });
  }

  let quoteNote: string | null = null;
  let framing: string | null = null;
  let direction: CostReport["direction"] = "none";
  if (session.quote != null) {
    const records = answerOf(session, "rental_records");
    const since2019 = answerOf(session, "rental_history") === "prior_2019";
    framing = since2019
      ? "The age of the depreciation schedule itself doesn't change the price. What matters is whether the preparer has clean records for the rental. The user has rented since 2019, so previous returns should already show the carry-forward depreciation schedule. If those are missing, or if something was done incorrectly, that can add extra work and a higher fee. If things have been reported consistently since 2019, the depreciation schedule shouldn't be too much extra work."
      : "The age of the depreciation schedule itself doesn't change the price. What matters is whether the preparer has clean records. Missing or incorrect records can mean extra work and a higher fee. Consistent records should not be much extra work. No dollar amount is added or subtracted.";
    if (records === "problems") {
      direction = "higher";
      quoteNote = `Missing or incorrect carry-forward records can mean extra work and a higher fee than the $${session.quote.toLocaleString("en-US")} quote. No dollar amount is added.`;
    } else if (records === "clean" || records === "no_prior") {
      direction = "lower-work";
      quoteNote = `If the records have been consistent, the depreciation schedule should not be much extra work. The quote stays $${session.quote.toLocaleString("en-US")}. Nothing is subtracted.`;
    } else {
      direction = "same";
      quoteNote = `The depreciation-records answer is unknown, so the comparison stays at the $${session.quote.toLocaleString("en-US")} quote. Nothing is added or subtracted.`;
    }
    rows.unshift({
      id: "quote",
      vendor: session.quotePreparer?.trim() ? `Quote from ${session.quotePreparer.trim()}` : "Independent firm quote",
      label: "Quote for this situation",
      amountLabel: `$${session.quote.toLocaleString("en-US")}`,
      yearLabel:
        answerOf(session, "year") === "y2025"
          ? "Quote for the 2025 return on this path — not a published rate card"
          : "Quote on this path — not a published rate card",
      unverified: false,
      note: "This is the preparation quote offered for this situation. It is not rent, not an expense, and not income. “LA” in any note about a normal local range is not resolved as Louisiana or Los Angeles.",
    });
  }

  return {
    rows: rows.map((row) => withFreshness(row, today, staleAfterDays)),
    quoteNote,
    framing,
    direction,
    estimate: proEstimate(session),
    staleAfterDays,
  };
}
