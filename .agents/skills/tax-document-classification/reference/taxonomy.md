# Folder taxonomy and routing

The output root (`sorter/sorted/` by default) holds the folders below. The names are exact; `apply_plan.py`
reuses an existing folder whose name differs only by apostrophe style (`’` vs `'`), case or spacing, so a
pre-existing `_Last year’s return` is used rather than duplicated.

Ordering is deliberate: a leading underscore makes the identity, prior-return and human-review folders sort first
in Finder, Explorer and `ls`, so the files that still need a decision are always in view; `zz_` pushes the
duplicates folder to the bottom. Keep the prefixes when adding folders.

## Folders

| Folder | What goes in it | Typical documents |
|---|---|---|
| `_Last year's return` | Returns for years before the target tax year, IRS transcripts, prior-year e-file acceptance | Form 1040 (prior year), state return, Tax Return / Account / Wage & Income Transcript |
| `_Needs Human Review` | Files neither the scripts nor the agent's own reading of the page images could classify, plus files whose question only the user can answer; original names kept | Scans the agent looked at and recorded `--vision-failed` for, unknown document types, bills with no property/business label, information returns with no payer, IRS notices. Filled by `apply_plan.py` on every run unless `--leave-review` |
| `_Proof of identity` | Identity documents for the taxpayer, spouse and dependents | Driver license, passport, Social Security card, birth certificate, ITIN letter (CP565), IP PIN notice (CP01A) |
| `_This year's return` | Drafts and filed copies for the target tax year | Form 1040 draft, state return, e-file acceptance |
| `Credits` | Records that support a credit rather than a deduction | 1098-T, student account statements, childcare provider year-end statements, energy-improvement receipts, clean-vehicle purchase papers |
| `Deductions` | Schedule A and above-the-line deduction records for the household | 1098 Mortgage Interest, 1098-E, 1098-C, property tax bills for the personal home, mortgage statements, donation receipts, medical bills and EOBs, vehicle registration |
| `Estimated tax payments` | Proof of estimated payments to IRS and states | 1040-ES vouchers, IRS Direct Pay / EFTPS confirmations, state estimated-payment confirmations |
| `Income - Investments` | Taxable account income and sales, digital assets | 1099-B, 1099-DIV, 1099-INT, 1099-OID, 1099-DA, Consolidated 1099, brokerage statements, crypto gain/loss reports |
| `Income - Other` | Income that is none of the others | 1099-G, W-2G, 1099-C, 1099-Q, 1099-S, 1099-LTC, 1099-PATR, 1099-MISC (non-rental), unemployment statements |
| `Income - Partnerships and S-corps` | Pass-through packages | Schedule K-1 (Form 1065 / 1120-S / 1041) with their attachments and state K-1s |
| `Income - Rental` | Everything about a rental property, income and expenses | Owner statements, leases, rent receipts, 1099-MISC rents, and per-property bills: electric, gas, water, internet, insurance, HOA, repairs, property tax, 1098, closing disclosure, depreciation schedule |
| `Income - Retirement` | Retirement and Social Security income | 1099-R, SSA-1099, RRB-1099 |
| `Income - Self-employment` | Schedule C income and expenses | 1099-NEC, 1099-K, invoices issued, business receipts, payment-app statements, profit and loss, mileage log |
| `Income - Wages` | Employment income | W-2, W-2c, final pay stub |
| `Records - Statements` | Bank, credit card and loan statements that are not tied to a property or business | Checking/savings statements, credit card statements, auto/personal loan statements |
| `Regulations - Health Insurance` | ACA coverage forms and premium records | 1095-A, 1095-B, 1095-C, health insurance premium statements |
| `Retirement & HSA` | Contribution-side records and HSA activity (Forms 8889 / 5329 / 8606 support) | 5498, 5498-SA, 1099-SA, IRA/HSA contribution confirmations |
| `zz_Duplicates` | Byte-identical copies of files already sorted; original names kept | Created automatically |

Next to the folders, `apply_plan.py` keeps `SORTED.md` at the output root: the file-count check of the last run
(before/after totals, every moved file re-hashed), the complete `original name → new location` map grouped by
folder, and a table of all runs. It is regenerated on every run and never sorted itself. `Summaries.md` (written
by the `tax-document-summaries` skill, by default in the inbox folder) is likewise skipped by `inventory.py` and
excluded from the file counts.

Optional subfolders: with `classify.py --group-by-entity` each property or business label becomes a subfolder
(`Income - Rental/Property 200/`, `Income - Self-employment/Nursing 1099/`). The flat layout, with the label in
the filename, is the default. Add a new top-level folder only when a real group of documents has no home; keep
the `Group - Detail` naming style (`Income - Farm`, `Deductions - Charitable`).

## Routing rules

Applied by `classify.py` in this order; the result can always be overridden with `edit_plan.py`.

1. **Document type decides the default folder** (table below).
2. **Property label match** (`--property "Property 200=200 Oak St|200 OAK STREET"`): a bill, receipt, invoice,
   insurance, HOA, property-tax, mortgage, 1098, closing disclosure, lease, owner statement, depreciation schedule
   or 1099-MISC that mentions a label or its keywords goes to `Income - Rental`, with the label as the entity.
3. **Business label match** (`--business "Nursing 1099=Travel Nurse Co|Metairie clinic"`): receipts, invoices,
   repair invoices, payment-app statements, utility bills, insurance, mileage logs, P&L, bank and card statements
   that mention the label go to `Income - Self-employment`. Information returns keep the payer as entity.
4. **Returns by year**: Form 1040, state returns and transcripts dated before the target tax year go to
   `_Last year's return`; dated the target year to `_This year's return`. Unknown year: review.
5. **No label for a context-dependent document** (utility bills, insurance, receipts, invoices, closing
   disclosures): status `review` with the best guess shown, because a personal utility bill is not a tax document.
6. **Property tax bills, 1098s and mortgage statements without a label** go to `Deductions` (personal home).
7. **Information returns without a payer** (W-2, 1099-x, 1098-x, 1095-x, 5498-x, K-1) stay in review until the
   payer is known: the filename would be ambiguous (`W-2 - 2025.pdf`) when there are several.
8. **Duplicates** (same SHA-256 as another inbox file or as a file sorted earlier) go to `zz_Duplicates`.
9. **Confidence below 0.75**, text the scripts could not read (`needs_vision`), unknown type or unknown tax year:
   review.

Status `review` means a person has to decide. `apply_plan.py` moves those files into `_Needs Human Review` with
their original names (the best guess stays in `plan.md`), and the report lists each one with the reason. The
manifest records them with status `review`, not as sorted, so running the pipeline again with
`<out>/_Needs Human Review` as the input and `--out <out>` classifies them afresh once labels or answers are
available. `--leave-review` keeps them in the inbox instead.

`needs_vision` items are the exception: they are `review` only as a placeholder. The flag means the text pipeline
failed, and the agent must read the page images itself (AI vision) and record a verdict with `edit_plan.py`:
`--status ready` with a `doc_type` when identified, or `--vision-failed "reason"` when the images cannot be read
either. `plan.json` carries this as `vision: pending | identified | failed`; `apply_plan.py` refuses to run (dry
run included) while any item is `pending`, so only `failed` ones ever reach `_Needs Human Review`. Failed verdicts
are kept in `<work>/vision.json` by file hash, so a re-run on the parked folder does not ask again for the same
bytes; a better scan has a new hash and is read afresh.

## Document types (`doc_type`) and default folders

The `doc_type` is the first segment of the filename. Use these spellings with `edit_plan.py --set doc_type=...`.

| Folder | doc_type values (trailing segment: Y = tax year, D = date, – = none) |
|---|---|
| `Income - Wages` | `W-2` Y, `W-2c` Y, `Pay Stub` D |
| `Income - Self-employment` | `1099-NEC` Y, `1099-K` Y, `Invoice` D, `Receipt` D, `Profit and Loss` Y, `Mileage Log` Y, `Payment App Statement` D |
| `Income - Rental` | `Rental Income Statement` D, `Lease Agreement` D, `Rent Receipt` D, `HOA Statement` D, `Depreciation Schedule` Y, `Electric Bill` D, `Gas Bill` D, `Water Bill` D, `Internet Bill` D, `Phone Bill` D, `Insurance Premium` D, `Repair Invoice` D, `Closing Disclosure` D |
| `Income - Investments` | `1099-B` Y, `1099-DIV` Y, `1099-INT` Y, `1099-OID` Y, `1099-DA` Y, `Consolidated 1099` Y, `Brokerage Statement` D, `Crypto Tax Statement` Y |
| `Income - Retirement` | `1099-R` Y, `SSA-1099` Y, `RRB-1099` Y |
| `Income - Partnerships and S-corps` | `Schedule K-1 (1065)` Y, `Schedule K-1 (1120-S)` Y, `Schedule K-1 (1041)` Y |
| `Income - Other` | `1099-G` Y, `W-2G` Y, `1099-C` Y, `1099-Q` Y, `1099-S` Y, `1099-LTC` Y, `1099-MISC` Y, `1099-PATR` Y, `Unemployment Statement` D |
| `Deductions` | `1098 Mortgage Interest` Y, `1098-E Student Loan Interest` Y, `1098-C Vehicle Donation` Y, `Property Tax Bill` D, `Mortgage Statement` D, `Donation Receipt` D, `Medical Bill` D, `Explanation of Benefits` D, `Vehicle Registration` D |
| `Credits` | `1098-T Tuition` Y, `Student Account Statement` D, `Childcare Statement` Y, `Energy Improvement Receipt` D, `Clean Vehicle Purchase` D |
| `Retirement & HSA` | `5498 IRA Contributions` Y, `5498-SA HSA Contributions` Y, `1099-SA HSA Distributions` Y |
| `Regulations - Health Insurance` | `1095-A` Y, `1095-B` Y, `1095-C` Y, `Health Insurance Premium Statement` D |
| `Estimated tax payments` | `1040-ES Voucher` D, `Estimated Tax Payment Confirmation` D |
| `_Last year's return` / `_This year's return` | `Form 1040 Return` Y, `State Tax Return` Y, `Tax Return Transcript` Y |
| `_Proof of identity` | `Driver License` –, `Passport` –, `Social Security Card` –, `Birth Certificate` –, `IP PIN Notice` Y, `ITIN Letter` D |
| `Records - Statements` | `Bank Statement` D, `Credit Card Statement` D, `Loan Statement` D |
| `_Needs Human Review` | `IRS Notice` D (decide which return it belongs to), `Unknown` |

Entity for identity documents is the person's name; the scripts never guess it, set it with
`edit_plan.py --set entity="Jane Doe"`.

## Judgement calls

- **1099-MISC**: box 1 rents belongs with the rental (label match routes it there); royalties or other income go to
  `Income - Other`.
- **1098 for a rental** is a rental expense, not Schedule A: give the property label so it lands in `Income - Rental`.
- **Health insurance premiums paid by a self-employed person** are still filed under `Regulations - Health Insurance`;
  mention the self-employed health insurance deduction in the report instead of moving the file.
- **HSA**: 1099-SA is a distribution but lives with the other HSA paperwork in `Retirement & HSA` (Form 8889 needs
  both sides).
- **Bank statements for a business account** go to `Income - Self-employment` when the business label matches;
  otherwise `Records - Statements`.
- **IRS notices** (CP2000, CP14, letters): review; file with the return year they refer to once known, usually
  `_Last year's return`.
- **Several tax years in the inbox**: sort the target year first; park the others in review or use a second output
  root (`--out sorter/sorted/TY2024 --tax-year 2024`).
