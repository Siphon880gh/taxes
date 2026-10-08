import { mkdirSync, writeFileSync } from "node:fs";
import { DISCLAIMER } from "../src/lib/disclaimer";
import { applyCase, caseStudies } from "../src/lib/graph/cases";
import { costReport } from "../src/lib/graph/cost";
import { mermaidSource } from "../src/lib/graph/mermaid";
import { listNodes } from "../src/lib/graph/nodes";
import { edgeTips, tips } from "../src/lib/graph/tips";
import { citations } from "../src/lib/graph/sources";
import {
  federalAdditionalAgeBlind,
  federalBasicStandard,
  saltCap,
  seRates,
  socialSecurityWageBase,
  stateStandard,
  ten99kThreshold,
} from "../src/lib/graph/thresholds";
import type { FilingStatus, Jurisdiction } from "../src/lib/graph/thresholds";
import type { SectionId, TaxYear } from "../src/lib/graph/types";

const sectionOrder: SectionId[] = [
  "start",
  "income",
  "records",
  "se",
  "payments",
  "rental",
  "invest",
  "other",
  "deductions",
  "flow",
];

const sectionTitle: Record<SectionId, string> = {
  start: "Year and filing status",
  income: "W-2 wages",
  records: "IRS records and last year's return",
  se: "Self-employment",
  payments: "Payment apps and Form 1099-K",
  rental: "Rental real estate",
  invest: "Interest, capital gains, and digital assets",
  other: "Other income, credits, and payments",
  deductions: "Standard deduction and itemizing",
  flow: "How the schedules meet Form 1040",
};

const sectionIntro: Record<SectionId, string> = {
  start:
    "The walk starts with the tax year on the prepared return, then the filing status. Every status opens the same topic gates. Married filing separately also asks whether the spouse itemizes, because that can remove the standard deduction.",
  income:
    "W-2 wages are their own question. A yes answer points at Form 1040 line 1a. The filing notes also map W-2 box 2 to line 25a; that line stays flagged until it is read on the form. No wages and an unknown answer do not invent a W-2. Every W-2 answer continues to the records cross-checks below.",
  records:
    "Two cross-checks from the filing notes. The first asks whether the return was compared with the information returns on the IRS online account, which the notes call Returned Documents: the W-2s, 1099s, and other statements employers, banks, and platforms already sent to the IRS. The notes' example is a W-2 a shuttered employer reported but never mailed. The second asks whether last year's return was available, because the notes use its form list as a baseline when the situation is similar and say the preparer needs it for the capital-loss carryforward, the depreciation schedule, and any overpayment applied on Form 1040 line 26. Not compared and unknown both stay flagged; nothing is added from either answer.",
  se:
    "Self-employment asks whether the work is a sole proprietorship or an entity, how many activities there are, and what they are called. It then asks whether Form 8995 or Form 8995-A is on that activity, whether Schedule C line 25 has a work-from-home share, or both. Every QBI answer continues to the Schedule C screens the filing notes' audit triggers call for: vehicle, meal, and home-office records; workers paid $600 or more (W-2, W-9, 1099-NEC); a loss on line 31 and the hobby-loss rule with Form 5213; the de minimis safe harbor election statement; and 1099-NEC box 2 for resale relationships. Nursing and coding are names a case study can supply. They are not built into a blank start. A separate Schedule C is the 2025 instruction for each business. Schedule C and Schedule SE flow onto Form 1040. Schedule 2 and Schedule SE line 7 are named in the filing notes and stay flagged, as are the Schedule C expense lines the notes do not number.",
  payments:
    "Venmo, PayPal, and similar apps are split into personal transfers and goods-and-services payments. A belief that the amount is too low is not a conclusion. If no Form 1099-K was issued, the income can still be reportable and entered manually. An unknown amount does not get compared with the threshold.",
  rental:
    "The rental branch asks how many properties, who owns them, and whether the rental is day-to-day work or passive. Passive stays on Schedule E and does not open Form 8995. Active opens Form 8995 or Form 8995-A and the 250-hour safe-harbor question. It still asks whether a mortgage remains, whether the activity was on an earlier return, tenant-paid expenses, owner-use allocation including square footage, whether this return claims depreciation, and whether the carry-forward schedule looks clean. The Schedule E node names the Part I header the filing notes fill (line 1a address, line 1b type-of-property code), and the depreciation check carries the notes' Form 4562 description: 27.5-year residential property, mid-month convention, straight-line method, placed-in-service date on page 2, and a basis of the building's assessed value in the year the rental started times the rental share. A missing or inconsistent carry-forward names Form 3115, which the notes use to catch up depreciation that was never taken. Activity that began in 2019 does not set the depreciation start year. The preparation fee moves only as a qualitative note from the records answer.",
  invest:
    "Interest and dividends, including tax-exempt interest on Form 1099-INT, and ordinary dividends on Form 1099-DIV, open only when the answer says they apply. Schedule B uses the 2025 $1,500 test when the amount is known to be over or under. An unknown amount does not get that test applied as a conclusion. Capital-asset sales open Form 1099-B, Form 8949, and Schedule D, then ask about a net loss or a carryforward from last year: Schedule D Part III, the Capital Loss Carryforward Worksheet, and the filing notes' $3,000 ($1,500 married filing separately) limit against other income. The filing notes put the net on Form 1040 line 7; that line stays flagged. Crypto disposals also open those forms as items to verify. The digital-asset checkbox position is flagged rather than guessed. A separate gate asks about foreign financial accounts or foreign income: the Schedule B foreign-account question, FinCEN Form 114 over $10,000, and Form 8938 over $50,000 are the forms the notes name; the foreign-income form is not named and stays flagged.",
  other:
    "Retirement distributions, HSA, education, estimated tax, and dependents are separate gates. So are Form 1099-G, Form 1095-A with Form 8962, the earned income credit, Form 6251, Form 2210, Form 9465, Form 4868, and the IRS Identity Protection PIN. A dependent care credit is asked only after dependents are claimed, and it points at Schedule 3. The estimated-tax check carries the filing notes' label for Form 1040 line 26 and the payment dates to gather. The earned income credit checks mention CA 3514, which the notes' prior-year form list pairs with an EIC worksheet on a California return. Line numbers that were not read off the form stay flagged.",
  deductions:
    "The deduction comparison uses the selected year, filing status, and jurisdiction. Unknown applies no state figure. The tool compares sourced amounts with what the prepared return already did. It does not choose a deduction for the filer. No personal mortgage does not decide standard versus itemized. An itemized answer opens the Schedule A check: Form 1098, the sourced 2025 line 5e cap, 501(c)(3) receipts, and Form 8283 for noncash donations over $500 from the filing notes. Selecting California also asks whether a home was rented, because the notes' state screens lead to the California renter's credit and its exempt-from-property-tax question. The age question names Form 1040-SR, the optional form for filers 65 and older.",
  flow:
    "Schedule C, Schedule E, and any other schedule the path turns up are drawn into Form 1040. Schedule 1, Schedule 2, and Schedule 3 are named there because the filing notes treat them as the adjustments, additional taxes, and credits. The sentences on those nodes are the forms to verify. They are not an instruction to start a form.",
};

function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function design(): string {
  const lines: string[] = [];
  for (const section of sectionOrder) {
    lines.push(`### ${sectionTitle[section]}`, "", sectionIntro[section], "");
    for (const node of listNodes().filter((item) => item.section === section)) {
      lines.push(`#### ${node.title} (\`${node.id}\`)`, "");
      if (node.kind === "question") {
        lines.push(node.prompt ?? node.chart, "");
        if (node.help) lines.push(node.help, "");
        for (const link of node.links ?? []) {
          lines.push(`- [${link.label}](${link.href}): ${link.detail}`);
        }
        if (node.links?.length) lines.push("");
        if (node.textInput) {
          lines.push(
            `- Entered text continues to ${node.textInput.next.map((id) => `\`${id}\``).join(", ")}.`,
            "",
          );
        }
        if (node.numberInputs) {
          lines.push(
            `- Entered numbers (${node.numberInputs.fields.map((field) => field.label).join("; ")}) continue to ${node.numberInputs.next.map((id) => `\`${id}\``).join(", ")}.`,
            "",
          );
        }
        for (const answer of node.answers ?? []) {
          const next = answer.next.length ? answer.next.map((id) => `\`${id}\``).join(", ") : "stops";
          lines.push(`- **${answer.label}** → ${next}`);
        }
        lines.push("");
      } else {
        lines.push(node.chart, "");
        if (node.help) lines.push(node.help, "");
        if (node.flowsTo?.length) {
          lines.push(`Flows onto ${node.flowsTo.map((id) => `\`${id}\``).join(", ")}.`, "");
        }
      }
    }
  }
  return lines.join("\n");
}

function thresholdTables(): string {
  const years: TaxYear[] = [2024, 2025, 2026];
  const statuses: FilingStatus[] = ["single", "mfj", "mfs", "hoh", "qss"];
  const federal = ["| Year | Status | Basic standard deduction | Age/blind add-on |", "| --- | --- | --- | --- |"];
  for (const year of years) {
    for (const status of statuses) {
      const basic = federalBasicStandard(year, status);
      const extra = federalAdditionalAgeBlind(year, status);
      federal.push(
        `| ${year} | ${status} | ${basic.amount == null ? "Not loaded — verify" : money(basic.amount)} | ${extra.amount == null ? "Not loaded — verify" : money(extra.amount)} |`,
      );
    }
  }
  const jurisdictions: Jurisdiction[] = ["louisiana", "california"];
  const state = ["| Year | Jurisdiction | Status | Standard deduction |", "| --- | --- | --- | --- |"];
  for (const year of [2025, 2026] as TaxYear[]) {
    for (const jurisdiction of jurisdictions) {
      for (const status of statuses) {
        const figure = stateStandard(year, status, jurisdiction);
        state.push(
          `| ${year} | ${jurisdiction} | ${status} | ${figure.amount == null ? "Not loaded — verify" : money(figure.amount)} |`,
        );
      }
    }
  }
  const salt2025 = saltCap(2025, "single");
  const saltMfs = saltCap(2025, "mfs");
  const wage = socialSecurityWageBase(2025);
  return [
    federal.join("\n"),
    "",
    "The 2025 basic amounts are the post-OBBBA figures in the 2025 Form 1040 instructions and IR-2025-103. The 2026 basic amounts and the 2026 age add-on are from Rev. Proc. 2025-32. Tax year 2024 amounts are not loaded.",
    "",
    state.join("\n"),
    "",
    "Louisiana 2025 is La. R.S. 47:294 and the 2025 IT-540 instructions. Louisiana 2026 is LDR RIB 26-019; the 2026 IT-540 line number is not confirmed in that bulletin. California 2025 is the 2025 Form 540 instructions. California 2026 is the FTB indexing announcement (page updated September 30, 2026), not a final 2026 Form 540 booklet.",
    "",
    `State and local tax cap for 2025 Schedule A line 5e: ${money(salt2025.amount ?? 0)} generally, ${money(saltMfs.amount ?? 0)} if married filing separately, before the modified-AGI phase-down. The phase-down is not computed here. A 2026 cap is not stored.`,
    "",
    `Self-employment, Publication 334 (2025): ${seRates.multiplier} of net profit, combined rate ${seRates.combined} (${seRates.socialSecurity} Social Security and ${seRates.medicare} Medicare). Social Security wage base for 2025: ${wage.amount == null ? "not stored" : money(wage.amount)}. The 2024 and 2026 wage bases are not stored.`,
    "",
    `Form 1099-K for tax year ${ten99kThreshold.year}: a third party settlement organization is not required to file the form unless gross payments for goods or services exceed ${money(ten99kThreshold.grossExceeds)} and the number of transactions exceeds ${ten99kThreshold.transactionsExceed}. ${ten99kThreshold.recalledMatches} Goods-and-services income remains reportable when no form is generated. No Louisiana or California 1099-K threshold is stored.`,
  ].join("\n");
}

function sources(): string {
  return Object.values(citations)
    .map((item) => `- ${item.title} (${item.yearLabel}): ${item.url}`)
    .join("\n");
}

function caseBlock(id: string): string {
  const study = caseStudies.find((item) => item.id === id);
  if (!study) return "";
  const session = applyCase(id);
  const cost = costReport(session);
  return [
    `### ${study.title}`,
    "",
    study.summary,
    "",
    "Saved answers:",
    "",
    ...Object.entries(study.answers).map(
      ([nodeId, stored]) => `- \`${nodeId}\`: ${stored.answerId}${stored.text ? ` (${stored.text})` : ""}`,
    ),
    "",
    study.quote == null ? "No preparation quote is attached." : `Preparation quote on this path: $${study.quote}.`,
    "",
    cost.framing ?? "",
    "",
    cost.quoteNote ?? "",
    "",
    "```mermaid",
    mermaidSource(session),
    "```",
    "",
  ].join("\n");
}

function tipIndex(): string {
  const lines = ["| Tip | Where it sits | Toast |", "| --- | --- | --- |"];
  const nodeSites = listNodes()
    .filter((node) => node.tipId)
    .map((node) => `${node.tipId}: node \`${node.id}\``);
  for (const tip of Object.values(tips)) {
    const nodes = nodeSites.filter((site) => site.startsWith(`${tip.id}:`)).map((site) => site.slice(tip.id.length + 2));
    const edges = edgeTips
      .filter((edge) => edge.tipId === tip.id)
      .map((edge) => `edge \`${edge.from}\` → \`${edge.to}\``);
    lines.push(`| ${tip.id} | ${[...nodes, ...edges].join("; ")} | ${tip.toast.replace(/\|/g, "/")} |`);
  }
  return lines.join("\n");
}

const weng = applyCase("weng-2025");
const wengCost = costReport(weng);

const doc = `# Decision graph

${DISCLAIMER}

This document and the interactive chart are generated from the same node list. A blank session answers only the tax year (2025, the return someone would still be final-checking in early October 2026). Case studies are optional saved paths.

## How a session walks

1. Start at the tax year.
2. An answer reveals only the nodes named on that answer.
3. Check nodes have no question. They name a form, schedule, or line to verify, with a short explanation.
4. Every question has an unknown answer. Unknown does not borrow a yes.
5. \`flowsTo\` draws a "flows onto" line when both nodes are already revealed. Schedule C and Schedule E use that line into Form 1040.
6. The checklist and the cost comparison read the revealed nodes. Uncertain lines stay flagged. Prices that were not on a retrieved page stay flagged.

## Full graph

\`\`\`mermaid
${mermaidSource(null)}
\`\`\`

## Written design

${design()}

## Thresholds and the 1099-K test

${thresholdTables()}

## Preparation prices

The cost panel shows a TurboTax published tier for the complexity on the path, an H&R Block tier description with the dollar amount unverified, desktop TurboTax list prices that are not added to the estimate, and 2023 NSA national averages. An arithmetic sum of NSA pieces is not a surveyed package price, not a 2025 price, and not a Louisiana or Los Angeles price.

On the Weng 2025 case the independent-firm quote is $975. That number is a preparation quote, not rent, not an expense, and not income. The records note beside it:

${wengCost.framing}

${wengCost.quoteNote}

H&R Block's online dollar price was not in the HTML retrieved October 3, 2026, so the panel says the price is unverified. TurboTax Do It Yourself Premium is $139 federal for a path with Schedule C or Schedule E. The online state add-on was not a fixed published dollar, so it is not added. The state is unknown, so no state price is applied to the quote.

## Case studies

These are saved answers. They are not tax advice.

${caseBlock("weng-2025")}
${caseBlock("joint-w2-crypto")}

## Notes on the chart

An "i" on a node or on a line opens a toast. If the note has a longer explanation, the toast and its Read more control open a modal. Answering a question does not open the note.

The self-employment toast is: "${tips.se_tax.toast}"

The modal starts from net profit, then 92.35% of that profit, the 15.3% split, the Social Security wage base for the selected year when that year's figure is stored, and the deduction of half the self-employment tax on the income-tax side. For 2025 those figures are cited to Publication 334 (2025). A different year does not reuse $176,100.

${tipIndex()}

## Sources

Retrieved October 3, 2026, unless a page itself carries another date.

${sources()}
`;

mkdirSync("docs", { recursive: true });
writeFileSync("docs/DECISION_GRAPH.md", doc);
console.log(`Wrote docs/DECISION_GRAPH.md (${doc.length} characters)`);
