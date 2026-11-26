/**
 * Cross-links the chart and the Document Sorter: which source documents the answers so far call for,
 * and whether something in sorter/stage looks like each one. A PDF whose text api.php could read counts by the form
 * names found inside it (see pdf-hints.ts); everything else (scans, photos, spreadsheets) counts by folder or file name.
 */

import type { Session } from "./graph/types";
import type { PdfHints } from "./pdf-hints";

export type ExpectedDocument = {
  id: string;
  /** What to look for, such as "Form W-2". */
  label: string;
  /** Why the chart expects it. */
  reason: string;
  /** Matched against the lower-cased path under sorter/stage (category folders plus file name). */
  pattern: RegExp;
  /** Form tags from pdf-hints that count as this document when read inside a PDF. */
  forms: string[];
};

export type DocumentMatch = ExpectedDocument & {
  files: string[];
  /** The subset of files matched by the text inside the PDF rather than by name. */
  byContent: string[];
};

export type CoverageReport = {
  expected: DocumentMatch[];
  found: number;
  missing: number;
};

type Rule = ExpectedDocument & { when: string[] };

/** Each rule applies when any of its chart boxes is on the path. */
const RULES: Rule[] = [
  { id: "w2", label: "Form W-2", reason: "W-2 wages are on this path.", when: ["check_w2"], forms: ["W-2"], pattern: /\bw-?2\b|wage/ },
  {
    id: "prior-return",
    label: "Last year's return",
    reason: "The chart compares against last year's return.",
    when: ["check_prior_return", "check_history"],
    forms: ["1040"],
    pattern: /last year|prior[- ]year|tax return|\b1040\b/,
  },
  {
    id: "1099-nec",
    label: "Form 1099-NEC or business income records",
    reason: "Schedule C is on this path.",
    when: ["schedule_c"],
    forms: ["1099-NEC", "1099-MISC"],
    pattern: /1099-?nec|1099-?misc|self-employ|business income|invoice|freelanc/,
  },
  {
    id: "business-expenses",
    label: "Business expense records (receipts, mileage, home office)",
    reason: "The path checks vehicle, meals, or home-office records.",
    when: ["check_se_records", "check_home_c"],
    forms: [],
    pattern: /receipt|mileage|expense|home office|vehicle|meal/,
  },
  { id: "1099-k", label: "Form 1099-K", reason: "A payment-app 1099-K is on this path.", when: ["check_1099k_form"], forms: ["1099-K"], pattern: /1099-?k\b|paypal|venmo|stripe|square/ },
  {
    id: "rental",
    label: "Rental income and expense records",
    reason: "Schedule E rental is on this path.",
    when: ["schedule_e"],
    forms: ["Schedule E"],
    pattern: /rent|lease|tenant|schedule e/,
  },
  {
    id: "depreciation",
    label: "Depreciation schedule (Form 4562 or last year's schedule)",
    reason: "Rental depreciation is checked on this path.",
    when: ["check_depr", "check_records_clean", "check_records_problem"],
    forms: ["4562"],
    pattern: /depreciation|4562/,
  },
  {
    id: "1099-int-div",
    label: "Form 1099-INT or 1099-DIV",
    reason: "Interest or dividends are on this path.",
    when: ["check_sch_b", "check_interest_small"],
    forms: ["1099-INT", "1099-DIV", "1099-OID"],
    pattern: /1099-?(int|div|oid)\b|interest|dividend/,
  },
  {
    id: "1099-b",
    label: "Form 1099-B or brokerage statement",
    reason: "Schedule D and Form 8949 are on this path.",
    when: ["check_capgain"],
    forms: ["1099-B"],
    pattern: /1099-?b\b|brokerage|capital gain|8949|stock sale/,
  },
  {
    id: "crypto",
    label: "Digital-asset records (Form 1099-DA or exchange reports)",
    reason: "Digital-asset sales are on this path.",
    when: ["check_crypto", "check_crypto_held"],
    forms: ["1099-DA"],
    pattern: /1099-?da\b|crypto|coinbase|digital asset|bitcoin/,
  },
  { id: "1099-r", label: "Form 1099-R", reason: "A retirement distribution is on this path.", when: ["check_retire"], forms: ["1099-R"], pattern: /1099-?r\b|retire|\bira\b|401\(?k/ },
  { id: "hsa", label: "Form 1099-SA or 5498-SA", reason: "Form 8889 (HSA) is on this path.", when: ["check_hsa"], forms: ["1099-SA", "5498-SA"], pattern: /1099-?sa\b|5498|\bhsa\b/ },
  {
    id: "education",
    label: "Form 1098-T or 1098-E",
    reason: "Education items are on this path.",
    when: ["check_edu"],
    forms: ["1098-T", "1098-E"],
    pattern: /1098-?[te]\b|tuition|student loan/,
  },
  {
    id: "estimates",
    label: "Estimated tax payment confirmations",
    reason: "Estimated tax payments are on this path.",
    when: ["check_est"],
    forms: ["1040-ES"],
    pattern: /1040-?es|estimated/,
  },
  { id: "1099-g", label: "Form 1099-G", reason: "Unemployment or a state refund is on this path.", when: ["check_1099g"], forms: ["1099-G"], pattern: /1099-?g\b|unemployment/ },
  { id: "1095-a", label: "Form 1095-A", reason: "Form 8962 (marketplace insurance) is on this path.", when: ["check_8962"], forms: ["1095-A"], pattern: /1095-?a\b|marketplace|covered california/ },
  { id: "1098", label: "Form 1098 (mortgage interest)", reason: "Home mortgage interest is on this path.", when: ["check_mortgage"], forms: ["1098"], pattern: /\b1098\b(?!-)|mortgage/ },
  {
    id: "dependent-care",
    label: "Dependent care provider statements",
    reason: "The dependent care credit is on this path.",
    when: ["check_care"],
    forms: ["2441"],
    pattern: /daycare|day care|dependent care|child ?care|2441/,
  },
  { id: "ip-pin", label: "IRS Identity Protection PIN letter", reason: "An IP PIN is on this path.", when: ["check_ip_pin"], forms: ["CP01A"], pattern: /ip ?pin|cp01a|identity protection/ },
  {
    id: "itemized",
    label: "Itemized deduction records (donations, medical, property tax)",
    reason: "Schedule A is on this path.",
    when: ["check_sch_a"],
    forms: [],
    pattern: /donation|charit|medical|property tax|schedule a/,
  },
  { id: "foreign", label: "Foreign account statements", reason: "Foreign accounts or income are on this path.", when: ["check_foreign", "check_foreign_income"], forms: ["8938", "FBAR"], pattern: /foreign|fbar|8938/ },
];

/** Source documents the chart's answers so far call for, in chart order. */
export function expectedDocuments(session: Pick<Session, "revealed">): ExpectedDocument[] {
  const revealed = new Set(session.revealed);
  return RULES.filter((rule) => rule.when.some((id) => revealed.has(id))).map(({ id, label, reason, pattern, forms }) => ({
    id,
    label,
    reason,
    pattern,
    forms,
  }));
}

/**
 * Match staged files (paths relative to sorter/stage) to what the chart expects. With hints, a PDF whose text named
 * one or more tax forms counts only by those forms, so "w2.pdf" that reads as a 1099-NEC is filed as a 1099-NEC.
 * Files with no hint, no text layer, or text without a known form fall back to the name match.
 */
export function documentCoverage(session: Pick<Session, "revealed">, stagedPaths: string[], hints: PdfHints = {}): CoverageReport {
  const documents = stagedPaths.filter((path) => {
    const name = path.slice(path.lastIndexOf("/") + 1);
    return !name.startsWith(".") && name !== "AGENTS.md" && name !== "Summaries.md";
  });
  const expected = expectedDocuments(session).map((doc) => {
    const files: string[] = [];
    const byContent: string[] = [];
    for (const path of documents) {
      const hint = Object.prototype.hasOwnProperty.call(hints, path) ? hints[path] : undefined;
      if (hint && hint.text === "read" && hint.forms.length > 0) {
        if (hint.forms.some((form) => doc.forms.includes(form))) {
          files.push(path);
          byContent.push(path);
        }
      } else if (doc.pattern.test(path.toLowerCase())) {
        files.push(path);
      }
    }
    return { ...doc, files, byContent };
  });
  const found = expected.filter((doc) => doc.files.length > 0).length;
  return { expected, found, missing: expected.length - found };
}
