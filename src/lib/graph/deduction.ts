import { answerOf } from "./session";
import {
  federalAdditionalAgeBlind,
  federalBasicStandard,
  parseJurisdiction,
  parseStatus,
  parseYear,
  saltCap,
  stateStandard,
  statusLabel,
} from "./thresholds";
import type { Session } from "./types";

function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function deductionNarrative(session: Session): string[] {
  const year = parseYear(answerOf(session, "year"));
  const status = parseStatus(answerOf(session, "filing_status"));
  const jurisdiction = parseJurisdiction(answerOf(session, "jurisdiction"));
  const lines: string[] = [];
  const basic = federalBasicStandard(year, status);
  if (basic.amount == null) {
    lines.push(basic.note);
  } else {
    lines.push(
      `${basic.note} Amount: ${money(basic.amount)}. Source: ${basic.citation?.title} (${basic.citation?.yearLabel}).`,
    );
  }

  const age = answerOf(session, "age_blind");
  if (!age) {
    lines.push("Age or blindness is still open, so no additional standard deduction is added.");
  } else if (age === "unknown") {
    lines.push("Age or blindness is unknown, so the additional amount is flagged and not added.");
  } else if (age !== "no") {
    const boxes = age === "both" ? 2 : 1;
    const extra = federalAdditionalAgeBlind(year, status);
    if (extra.amount == null) {
      lines.push(extra.note);
    } else {
      lines.push(
        `${extra.note} Boxes on this path: ${boxes}. Added amount if each box qualifies: ${money(extra.amount)} each (${money(extra.amount * boxes)} together). Source: ${extra.citation?.title}.`,
      );
    }
  }

  if (answerOf(session, "claimed_dependent") === "yes") {
    lines.push(
      "Someone else can claim this filer. For 2025, Topic 551 limits the standard deduction to the greater of $1,350 or earned income plus $450, capped at the basic standard deduction. Earned income was not entered, so the full basic amount above is not this person's deduction.",
    );
  }

  if (answerOf(session, "mfs_spouse") === "yes") {
    lines.push(
      "The spouse itemizes on a separate return. Topic 551 says the standard deduction is not available in that case. Verify the return did not take it.",
    );
  } else if (status === "mfs" && !answerOf(session, "mfs_spouse")) {
    lines.push("Married filing separately: whether the spouse itemizes is still open, so the standard deduction may be unavailable.");
  }

  if (age === "age" || age === "both") {
    if (year === 2025) {
      lines.push(
        "Tax year 2025 also has an enhanced senior deduction of up to $6,000 ($12,000 if both spouses qualify), claimed on Schedule 1-A, and limited if MAGI is more than $75,000 ($150,000 married filing jointly). MAGI was not entered, so the phaseout is not computed. It is separate from the standard deduction.",
      );
    } else {
      lines.push("An enhanced senior deduction for the selected year was not verified here, so no dollar amount is shown.");
    }
  }

  const choice = answerOf(session, "deduction_choice");
  const itemizedText = session.answers.itemized_amount?.text;
  if (!choice) {
    lines.push("The prepared return's choice — standard or itemized — is still open. The figures above are what you would compare with line 12e. They are not a recommendation.");
  } else if (choice === "unknown") {
    lines.push("The return's deduction choice is unknown. Verify Form 1040 line 12e. Do not treat the standard deduction as the amount on the return.");
  } else if (choice === "standard") {
    lines.push("This path says the prepared return uses the standard deduction. Verify line 12e matches the sourced basic amount, plus any age or blindness add-on that applies, and not a Schedule A total.");
  } else if (choice === "itemized") {
    const cap = saltCap(year, status);
    lines.push(
      itemizedText
        ? `The prepared Schedule A total entered here is ${itemizedText}. Compare it with the sourced standard deduction yourself on line 12e. If one is larger, verify which one the return used. This is a flag for review, not an instruction to amend.`
        : "The return itemizes, but the Schedule A total was not entered. The comparison cannot say which path is larger.",
    );
    lines.push(cap.note + (cap.amount != null ? ` Cap stored for this status: ${money(cap.amount)}.` : ""));
  }

  if (!jurisdiction) {
    lines.push("Jurisdiction is still open. No state standard deduction is applied. LA is not guessed.");
  } else {
    const state = stateStandard(year, status, jurisdiction);
    lines.push(state.note + (state.amount != null ? ` Amount: ${money(state.amount)} (${state.citation?.yearLabel}).` : ""));
    if (jurisdiction === "california") {
      const ca = session.answers.ca_itemized?.text;
      lines.push(
        ca
          ? `California itemized total entered from the prepared return: ${ca}. FTB says to verify the larger of that California total or the California standard deduction. Federal Schedule A is not a substitute.`
          : "The California itemized total is unknown, so which California path is larger stays flagged.",
      );
    }
    if (jurisdiction === "louisiana" && choice === "itemized") {
      lines.push("Because the federal return itemized, verify Louisiana IT-540 lines 9A–9D for 2025. If the federal return used the standard deduction, the 2025 instructions say to skip those lines.");
    }
  }

  lines.push(`Filing status used for the lookup: ${statusLabel(status)}.`);
  return lines;
}
