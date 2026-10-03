import { rebuild } from "./session";
import type { CaseStudy, Session } from "./types";

export const caseStudies: CaseStudy[] = [
  {
    id: "weng-2025",
    title: "Weng — 2025 example",
    summary:
      "Single, no mortgage, 1099-NECs for nursing and coding with no LLC, Venmo/PayPal goods and services with the amount unknown, one paid-off rental with the same tenants since 2019, and a $975 independent-firm quote. Louisiana versus Los Angeles, the Venmo amount, and whether the depreciation records are clean stay on the unknown path.",
    quote: 975,
    answers: {
      year: { answerId: "y2025" },
      filing_status: { answerId: "single" },
      personal_mortgage: { answerId: "no" },
      se: { answerId: "yes" },
      se_entity: { answerId: "sole" },
      se_count: { answerId: "two" },
      se_names: { answerId: "named", text: "nursing and coding" },
      payapps: { answerId: "yes" },
      pay_class: { answerId: "goods" },
      pay_1099k: { answerId: "no_form" },
      pay_amount: { answerId: "unknown" },
      rental: { answerId: "yes" },
      rental_count: { answerId: "one" },
      rental_own: { answerId: "whole" },
      rental_debt: { answerId: "paid_off" },
      rental_history: { answerId: "prior_2019" },
      rental_records: { answerId: "unknown" },
      jurisdiction: { answerId: "unknown" },
    },
  },
  {
    id: "joint-w2-crypto",
    title: "Illustration — joint W-2 and crypto",
    summary:
      "A short second path: married filing jointly, W-2 wages, no self-employment, no rental, and a crypto sale. It is an illustration so the tool is not only the 2025 single-filer rental example. It is not tax advice and it is not a real person's return.",
    quote: null,
    answers: {
      year: { answerId: "y2025" },
      filing_status: { answerId: "mfj" },
      w2: { answerId: "yes" },
      se: { answerId: "no" },
      rental: { answerId: "no" },
      crypto: { answerId: "sold" },
      jurisdiction: { answerId: "unknown" },
    },
  },
];

export function applyCase(id: string): Session {
  const study = caseStudies.find((item) => item.id === id);
  if (!study) throw new Error(`Unknown case study: ${id}`);
  return rebuild(study.answers, study.quote, study.id);
}
