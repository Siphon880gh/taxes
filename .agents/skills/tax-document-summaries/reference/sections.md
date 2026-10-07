# Sections of Summaries.md

Each section below lists what belongs in it, which sorted document types feed it (the classification skill's
`doc_type` names), what the tax professional needs from it, and the layout to use. The questions only the
taxpayer can answer are printed by `gather_facts.py` under each section that has documents.

Line numbers on forms change from year to year, so the sections name the forms and schedules, not the lines;
the tax professional maps them.

## Where deductions and credits go

| Item | Section |
|---|---|
| Rental utilities, insurance, HOA, repairs, management fees, property tax (rental share), 1098 for a rental, depreciation, SCEP/RSO-type fees, travel to the property | Rental Property |
| Business receipts, invoices, mileage, home office, business insurance, software, phone/internet share, supplies, equipment, contractor payments, self-employed health insurance premiums (cross-reference Healthcare), SEP/SIMPLE/solo-401(k) contributions | Work Income / Businesses |
| Medical and dental bills, EOBs, premiums paid out of pocket, HSA contributions and distributions, long-term care | Healthcare |
| 1098-T, books and supplies, 1098-E student loan interest, 1099-Q; the education credits | Education |
| Childcare provider statements and the child and dependent care credit; dependent-care FSA; dependents | Dependents & Childcare |
| 1098 for the home, property tax (personal share), PMI, points; home energy improvements and their credit; sale of the home | Primary Residence |
| IRA contributions (deduction) and the saver's credit | Retirement & Social Security |
| Foreign tax paid on investments (credit), margin interest | Investments |
| Donations (cash and non-cash), vehicle registration (value-based part), state income tax paid with last year's return, gambling losses, educator expenses, alimony paid, casualty losses | **Misc Deductions** |
| Clean vehicle credit, home EV charger credit, adoption credit, credit for the elderly or disabled, anything not tied to a section above | **Misc Credits** |

## Things that need answering

- **Belongs:** every `[NEEDED: …]`, `[VERIFY]`, `[TODO]`, `[TBD]` and `[CONFIRM]` still open anywhere else in the
  summary. `finalize` rebuilds this section; do not write it by hand.
- **Where it sits:** first, above every other section, while it has questions. When nothing is left to answer it
  says `N/A` and moves below the sections that have information, with the other N/A sections.
- **How a question gets answered, on the next run:** the user writes under `Answer:`, and `finalize` copies that
  into the section that asked; or the user copies the document that has the answer into the folder (or says so)
  and the next run reads that document and fills the section in. An answer that only says "it's in the new
  documents" is not pasted in as a figure.
- **Layout:** one `###` per section that asked, then the question in bold and a blank `Answer:` line.

## Filing Information

- **Belongs:** tax year; filing status; taxpayer and spouse (names only); dependents (names, relationship);
  address and state(s) of residence, moves during the year; identity documents on file (say which, never the
  numbers); whether anyone can be claimed by someone else; this year's draft or filed return if one exists; a
  link to `SORTED.md`.
- **Documents:** `Driver License`, `Passport`, `Social Security Card`, `Birth Certificate`, `IP PIN Notice`,
  `ITIN Letter` (folder `_Proof of identity`); `Form 1040 Return` / `State Tax Return` for the target year
  (folder `_This year's return`).
- **Tax pro needs:** Form 1040 header information, dependents, state returns to prepare, IP PIN presence.
- **Layout:** a short paragraph, then a bullet list of the facts. Never write an SSN, ITIN or the IP PIN itself.

## Work Income / Businesses

- **Belongs:** `### W-2 Wages` (one block per employer: box 1 wages, box 2 federal withholding, state wages and
  withholding, box 12 codes, box 10 dependent care, box 14 notes); `### Self-Employment: <business label>` (one
  block per activity: what the work is, entity type and accounting method, every 1099-NEC / 1099-K with payer and
  amount, income not on a 1099, expenses by category with totals and receipts, mileage, home office, health
  insurance premiums paid, retirement contributions, equipment bought); `### Partnerships & S-Corps` (each K-1:
  entity, form type, ordinary income, rental income, guaranteed payments, distributions, final/amended flag).
- **Documents:** `W-2`, `W-2c`, `Pay Stub`; `1099-NEC`, `1099-K`, `Invoice`, `Receipt`, `Repair Invoice`
  (business), `Profit and Loss`, `Mileage Log`, `Payment App Statement`, business-labelled bills, `Bank Statement`
  / `Credit Card Statement` of a business account; `Schedule K-1 (1065)`, `Schedule K-1 (1120-S)`,
  `Schedule K-1 (1041)`.
- **Tax pro needs:** Form 1040 wages and withholding; Schedule C per activity (gross receipts, expenses by
  category, car and truck expenses, Form 8829 home office), Schedule SE, Form 8995 QBI; Schedule E Part II for
  K-1s. Payment-app goods-and-services receipts are Schedule C income even without a 1099-K.
- **Layout:** `###` per employer and per activity; bullets with bold figures; expense categories as a bullet list
  with the receipt links; totals say how many receipts they come from.

## Rental Property

- **Belongs:** per property: owner and ownership share, property address and rental unit, type, whether there is
  a mortgage, tenants and since when, days rented / personal-use days; income (monthly rent, months collected,
  annual total, security deposits held); depreciation (basis, land, rental-use %, method, recovery period,
  convention, in-service date, prior depreciation, last year's depreciation, link to the prior schedule);
  expenses by category with the allocation basis and rental share computed.
- **Documents:** everything in `Income - Rental`: `Rental Income Statement`, `Lease Agreement`, `Rent Receipt`,
  `1099-MISC` (rents), `Depreciation Schedule`, `Electric Bill`, `Gas Bill`, `Water Bill`, `Internet Bill`,
  `Phone Bill`, `Insurance Premium`, `HOA Statement`, `Repair Invoice`, `Property Tax Bill`,
  `1098 Mortgage Interest`, `Mortgage Statement`, `Closing Disclosure`.
- **Tax pro needs:** Schedule E per property (address, type, fair-rental and personal-use days, rents received,
  each expense category, depreciation from Form 4562), ownership percentage, active participation, passive-loss
  carryovers (see Prior-Year Return & Carryovers).
- **Layout:** with one property, follow the model exactly: `### Property and Rental Information`,
  `### <year> Rental Income`, `### Rental Depreciation`, `### <year> Rental Expenses` with a `####` per category.
  With several properties, one `### <Property label> — <address>` block per property and the four parts as
  `####` headings with bold run-in labels for the categories. Show each allocation as
  `**total × share = rental share**` and name the basis (square footage, occupants, days).

## Investments

- **Belongs:** interest per payer (1099-INT box 1, early-withdrawal penalty, tax-exempt interest); dividends per
  payer (1a ordinary, 1b qualified, 2a capital gain distributions, section 199A, foreign tax paid); sales
  (proceeds, cost basis, short/long term, wash sales, noncovered securities needing basis); consolidated 1099
  packages (name the package once, list the forms it contains); digital assets (exchange reports, 1099-DA);
  margin interest; foreign accounts (yes/no).
- **Documents:** `1099-INT`, `1099-DIV`, `1099-B`, `1099-OID`, `1099-DA`, `Consolidated 1099`,
  `Brokerage Statement`, `Crypto Tax Statement`.
- **Tax pro needs:** Schedule B, Schedule D and Form 8949, Form 1116 for foreign tax, capital-loss carryover.
- **Layout:** `### Interest`, `### Dividends`, `### Sales`, `### Digital Assets` as needed; bullets per payer;
  a total line per category.

## Retirement & Social Security

- **Belongs:** each 1099-R (payer, gross, taxable amount, distribution code, withholding, IRA/pension, rollover
  yes/no); SSA-1099 / RRB-1099 (net benefits, Medicare premiums deducted, voluntary withholding); IRA
  contributions for the year (traditional/Roth, amounts, dates, Form 5498), conversions, RMDs; saver's credit
  eligibility facts.
- **Documents:** `1099-R`, `SSA-1099`, `RRB-1099`, `5498 IRA Contributions`.
- **Tax pro needs:** Form 1040 pension/IRA and Social Security lines, Form 8606 (nondeductible IRA / Roth),
  Form 5329 (early distributions, excess), Form 8880 (saver's credit).

## Healthcare

- **Belongs:** `### Marketplace Coverage (Form 1095-A)` (months covered and who, enrollment premiums, SLCSP,
  advance credit, household size, income changes reported); `### Other Coverage` (1095-B / 1095-C months);
  `### Premiums Paid` (out of pocket, including self-employed premiums with a cross-reference to the business);
  `### HSA` (5498-SA contributions incl. employer, 1099-SA distributions and what they paid, eligible months);
  `### Medical Expenses` (bills, EOBs, prescriptions, mileage; only if itemizing).
- **Documents:** `1095-A`, `1095-B`, `1095-C`, `Health Insurance Premium Statement`,
  `5498-SA HSA Contributions`, `1099-SA HSA Distributions`, `Medical Bill`, `Explanation of Benefits`.
- **Tax pro needs:** Form 8962 (premium tax credit) whenever a 1095-A exists, Form 8889 (HSA), Schedule A
  medical, Schedule 1 self-employed health insurance deduction.

## Education

- **Belongs:** per student: who they are and relationship, school, program, half-time status, 1098-T box 1
  payments and box 5 scholarships, books and supplies paid elsewhere, 1098-E interest, 529 distributions and
  qualified expenses they covered, prior years the American Opportunity credit was claimed.
- **Documents:** `1098-T Tuition`, `Student Account Statement`, `1098-E Student Loan Interest`, `1099-Q`.
- **Tax pro needs:** Form 8863 (education credits), Schedule 1 student loan interest, Form 1099-Q reconciliation.

## Dependents & Childcare

- **Belongs:** each dependent (name, relationship, months in the home, student/disabled status, whether anyone
  else could claim them); childcare providers (name and address, amount paid per child, why care was needed;
  the provider's tax ID stays on the statement); dependent-care FSA amounts (W-2 box 10).
- **Documents:** `Childcare Statement`.
- **Tax pro needs:** Form 2441, child tax credit / credit for other dependents eligibility, head-of-household
  qualification.

## Primary Residence

- **Belongs:** mortgage interest (1098 box 1, outstanding principal, origination date, points, PMI; whether any
  refinance proceeds were not used on the home); property tax (total and the personal share when part of the
  property is rented; cross-reference Rental Property); energy improvements (what, when, cost, certification);
  sale of the home (dates owned and lived in, price, selling costs, basis); home office is in the business section.
- **Documents:** `1098 Mortgage Interest`, `Mortgage Statement`, `Property Tax Bill` (no property label),
  `Energy Improvement Receipt`, `1099-S` for the home.
- **Tax pro needs:** Schedule A mortgage interest and SALT, Form 5695 (residential energy credits), Form 8949 /
  Schedule D and the Section 121 exclusion for a sale; standard-vs-itemized comparison.

## Other Income

- **Belongs:** unemployment (1099-G box 1, repaid amounts), state/local refunds (1099-G box 2, whether last year
  was itemized), gambling winnings (W-2G) and losses, cancelled debt (1099-C, insolvency), real estate sales
  other than the home (1099-S), 1099-MISC other income, jury duty, prizes, hobby income, alimony received,
  1099-Q not used for education.
- **Documents:** `1099-G`, `Unemployment Statement`, `W-2G`, `1099-C`, `1099-S`, `1099-MISC` (non-rental),
  `1099-Q`, `1099-LTC`, `1099-PATR`.
- **Tax pro needs:** Schedule 1 additional income, Form 982 for cancelled debt, Schedule A gambling losses.

## Estimated Tax Payments & Withholding

- **Belongs:** each federal estimated payment (quarter, date, amount, confirmation on file), each state estimated
  payment, prior-year overpayment applied, payment made with an extension, and a withholding recap (W-2 box 2,
  1099-R box 4, SSA voluntary withholding, 1099 backup withholding) with document links.
- **Documents:** `1040-ES Voucher`, `Estimated Tax Payment Confirmation`; withholding figures come from the
  income forms already cited in their sections.
- **Tax pro needs:** Form 1040 payments section, Form 2210 (underpayment) facts, state payments.
- **Layout:** a table or bullets per payment: `Q1 — paid 2025-04-14 — **$2,500.00** — [confirmation](…)`.

## Misc Deductions

- **Belongs:** deductions tied to no other section: cash donations by organization with dates and acknowledgment
  letters, non-cash donations (items, condition, fair market value, date, Form 8283 above $500), vehicle
  registration value-based part, state income tax paid with last year's return or balance due, sales tax on large
  purchases (if electing sales tax), educator expenses, alimony paid (agreement date), gambling losses, casualty
  losses in a declared disaster, tax preparation fees (state returns that allow them). State whether the taxpayer
  expects to itemize.
- **Documents:** `Donation Receipt`, `1098-C Vehicle Donation`, `Vehicle Registration`.
- **Tax pro needs:** Schedule A, Form 8283, Schedule 1 adjustments.

## Misc Credits

- **Belongs:** credits tied to no other section: clean vehicle (make/model, date, price, whether the credit was
  transferred to the dealer; the VIN stays on the seller report), home EV charger, adoption, credit for the
  elderly or disabled, anything else.
- **Documents:** `Clean Vehicle Purchase`.
- **Tax pro needs:** Form 8936, Form 8911, Form 8839, Schedule R.

## Prior-Year Return & Carryovers

- **Belongs:** last year's return (year, filing status, AGI, taxable income, total tax, refund or balance due,
  preparer or software; link); transcripts; carryovers (capital loss, passive activity losses per rental,
  charitable, NOL, QBI loss, foreign tax credit, AMT credit, depreciation schedules); IRS or state notices
  received (notice number and what it concerns, link); whether the prior return was amended.
- **Documents:** `Form 1040 Return` (prior year), `State Tax Return` (prior year), `Tax Return Transcript`,
  `IRS Notice`.
- **Tax pro needs:** prior-year AGI for e-filing, carryover worksheets, consistency of depreciation and passive
  losses, state refund taxability.

## Open Items & Missing Documents

- **Belongs:** documents the tax professional usually needs that are not on file, months missing from monthly
  bills, files parked in `_Needs Human Review` and files left in the inbox, totals that came from fewer documents
  than expected. The questions themselves are not repeated here; they are at the top, under Things that need
  answering.
- **Layout:** bullets; one item per line; name the document or the section each item concerns. This section is
  the last one with information; when nothing is open it is `N/A` like the others.

## Custom sections

Add a `## Title` section when a group of documents fits none of the above (farm income, foreign income, trust or
estate, sale of a business, cryptocurrency mining as a business, a second rental business…). Use the same
layout rules. `summaries.py` keeps custom sections and orders them with the standard ones (information first,
N/A last).
