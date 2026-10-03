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
};

export type CostReport = {
  rows: PriceRow[];
  quoteNote: string | null;
  framing: string | null;
  direction: "same" | "higher" | "lower-work" | "none";
};

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

export function costReport(session: Session): CostReport {
  const tags = complexityTags(session);
  const needsPremium =
    tags.includes("Schedule C") || tags.includes("Schedule E") || tags.includes("investments");
  const simple =
    tags.includes("W-2") &&
    !needsPremium &&
    answerOf(session, "deduction_choice") !== "itemized" &&
    !tags.includes("Schedule C");
  const rows: PriceRow[] = [];

  if (session.revealed.length > 1) {
    if (needsPremium) {
      rows.push({
        id: "tt-premium",
        vendor: "TurboTax",
        label: "Do It Yourself Premium, federal",
        amountLabel: "$139",
        yearLabel: citations.turbotax_premium.yearLabel,
        unverified: false,
        note: "Published federal price for the online product that covers rental property and self-employment, including Schedule C and Schedule E. The online state add-on was not a fixed published dollar on the page retrieved October 3, 2026, so no state fee is added.",
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
        note: "Published federal price for the online deductions product. State fee not verified as a fixed dollar, so it is not added. If the return also needs Schedule E or a full Schedule C, Deluxe is the wrong tier — Premium is $139 federal.",
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
        note: "The published tiers are Free Edition $0 for a simple Form 1040, Deluxe $79 federal for deductions, and Premium $139 federal for rental, investments, and self-employment. Finish the income questions before treating one of them as the estimate. State add-on for paid online products was not verified.",
        citation: citations.turbotax_premium,
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
      note: needsPremium
        ? "H&R Block's pages describe Self-Employed as including Premium features, and Premium as covering rental income and investments. That is the tier description that matches Schedule C plus Schedule E or investments. The dollar price was not in the HTML retrieved October 3, 2026, so none is shown."
        : "H&R Block's pages describe Free Online, Deluxe for itemized deductions, Premium for rental and investments, and Self-Employed for business income. Dollar prices were not in the HTML retrieved October 3, 2026, so none is shown.",
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
      vendor: "Independent firm quote",
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

  return { rows, quoteNote, framing, direction };
}
