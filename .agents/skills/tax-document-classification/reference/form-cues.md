# Recognising documents from their content

`classify.py` scores these cues automatically from extracted text. Use the same cues when you read a page image
yourself (`needs_vision`: the text pipeline failed, so the agent reads the image), and when deciding whether a
low-confidence guess is right. Identify a document by its printed title, form number, OMB number and box labels.
The filename is supporting evidence (`classify.py` already scores its words and shows the resulting guess in
`plan.md`): use it to know what to look for, and let what is printed on the page decide.

## Information returns

| Form | Printed title | OMB No. | Distinctive content | Payer block label | Folder |
|---|---|---|---|---|---|
| W-2 | Wage and Tax Statement | 1545-0008 | boxes 1 "Wages, tips, other compensation", 3 "Social security wages", 5 "Medicare wages"; "Copy B"; employee SSN box a | "Employer's name, address, and ZIP code" | Income - Wages |
| W-2c | Corrected Wage and Tax Statement | 1545-0008 | "previously reported" / "correct information" columns | same | Income - Wages |
| W-2G | Certain Gambling Winnings | 1545-0238 | "Reportable winnings", "Type of wager" | Payer | Income - Other |
| 1099-NEC | Nonemployee Compensation | 1545-0116 | box 1 "Nonemployee compensation"; only 7 boxes | "PAYER'S name, street address…" | Income - Self-employment |
| 1099-MISC | Miscellaneous Information | 1545-0115 | box 1 Rents, 2 Royalties, 3 Other income | Payer | Income - Other (rents -> Income - Rental) |
| 1099-K | Payment Card and Third Party Network Transactions | 1545-2205 | box 1a gross amount, monthly boxes 5a-5l; filer is PayPal, Stripe, Square, Etsy… | "FILER'S name" | Income - Self-employment |
| 1099-INT | Interest Income | 1545-0112 | box 1 Interest income, 2 Early withdrawal penalty, 8 Tax-exempt interest | Payer | Income - Investments |
| 1099-DIV | Dividends and Distributions | 1545-0110 | 1a Total ordinary / 1b Qualified dividends, 2a Capital gain distributions, 5 Section 199A | Payer | Income - Investments |
| 1099-B | Proceeds From Broker and Barter Exchange Transactions | 1545-0715 | "Date acquired", "Date sold or disposed", "Cost or other basis", "Wash sale loss disallowed"; often a long table | Payer | Income - Investments |
| 1099-OID | Original Issue Discount | 1545-0117 | | Payer | Income - Investments |
| 1099-DA | Digital Asset Proceeds From Broker Transactions | | crypto broker; appears from tax year 2025 | Payer | Income - Investments |
| Consolidated 1099 | "Consolidated Form 1099", "Tax Reporting Statement", "Composite 1099" | | one brokerage package containing 1099-DIV + INT + B (+ OID, MISC); 10-60 pages with a summary first | brokerage name on the cover | Income - Investments |
| 1099-R | Distributions From Pensions, Annuities, Retirement or Profit-Sharing Plans, IRAs… | 1545-0119 | box 1 Gross distribution, 2a Taxable amount, 7 Distribution code | Payer | Income - Retirement |
| SSA-1099 | Social Security Benefit Statement | | boxes 3 Benefits paid, 4 Benefits repaid, 5 Net benefits; issued by SSA | always Social Security Administration | Income - Retirement |
| RRB-1099 | Payments by the Railroad Retirement Board | | | Railroad Retirement Board | Income - Retirement |
| 1099-G | Certain Government Payments | 1545-0120 | box 1 Unemployment compensation, 2 State or local income tax refunds | Payer (state agency) | Income - Other |
| 1099-C | Cancellation of Debt | 1545-1424 | "Amount of debt discharged" | Creditor | Income - Other |
| 1099-Q | Payments From Qualified Education Programs | | 529 / Coverdell | Payer/Trustee | Income - Other |
| 1099-S | Proceeds From Real Estate Transactions | 1545-0997 | "Date of closing", "Gross proceeds" | Filer | Income - Other |
| 1099-SA | Distributions From an HSA, Archer MSA, or Medicare Advantage MSA | | box 1 Gross distribution, 3 Distribution code | Trustee | Retirement & HSA |
| 5498 | IRA Contribution Information | 1545-0747 | box 1 IRA contributions, 2 Rollover, 5 FMV of account, 10 Roth, 12 RMD; arrives in May | "TRUSTEE'S/ISSUER'S name" | Retirement & HSA |
| 5498-SA | HSA, Archer MSA, or Medicare Advantage MSA Information | | total HSA contributions, FMV | Trustee | Retirement & HSA |
| 1098 | Mortgage Interest Statement | 1545-1380 | box 1 Mortgage interest received, 2 Outstanding mortgage principal, 3 Origination date, 5 Mortgage insurance premiums, 6 Points, property address | "RECIPIENT'S/LENDER'S name" | Deductions (rental with label -> Income - Rental) |
| 1098-T | Tuition Statement | 1545-1574 | box 1 Payments received for qualified tuition, 5 Scholarships or grants | "FILER'S name" | Credits |
| 1098-E | Student Loan Interest Statement | 1545-1576 | box 1 Student loan interest received by lender | Recipient/Lender | Deductions |
| 1098-C | Contributions of Motor Vehicles, Boats, and Airplanes | | | Donee | Deductions |
| 1095-A | Health Insurance Marketplace Statement | 1545-2232 | Part III monthly grid: A enrollment premiums, B SLCSP premium, C advance payment of PTC; "Marketplace identifier" | state Marketplace | Regulations - Health Insurance |
| 1095-B | Health Coverage | 1545-2252 | "Responsible individual", "Origin of the health coverage", covered individuals with month checkboxes | "Issuer or other coverage provider" | Regulations - Health Insurance |
| 1095-C | Employer-Provided Health Insurance Offer and Coverage | 1545-2251 | Part II line 14 "Offer of Coverage" codes, "Applicable Large Employer" | "Name of employer" | Regulations - Health Insurance |
| Schedule K-1 (1065) | Partner's Share of Income, Deductions, Credits, etc. | 1545-0123 | Part I partnership, Part II partner, boxes 1-21, "Guaranteed payments" | "Partnership's name" | Income - Partnerships and S-corps |
| Schedule K-1 (1120-S) | Shareholder's Share of Income, Deductions, Credits, etc. | 1545-0123 | "Form 1120-S", "Shareholder's percentage of stock ownership" | "Corporation's name" | Income - Partnerships and S-corps |
| Schedule K-1 (1041) | Beneficiary's Share of Income, Deductions, Credits, etc. | 1545-0092 | "Form 1041", fiduciary | "Estate's or trust's name" | Income - Partnerships and S-corps |

Notes:

- OMB numbers are strong evidence but OCR often misreads them; the title is the primary cue.
- Every 1099 prints "CORRECTED (if checked)". Only a ticked box, the word CORRECTED alone, or a filename saying
  corrected means it is a correction.
- "Instructions for Recipient" / "Instructions for Employee" pages, blank forms and cover letters do not decide
  the type; find the filled-in page. A page with no payer name and no amounts is probably instructions.
- Employer packages often bundle W-2 copies B/C/2 and a 1095-C; brokerage packages are "Consolidated 1099";
  K-1 packets add state K-1s and footnotes; IRA custodians send 1099-R and 5498 together. Name by the main form or
  package, list the contents in the report.

## Returns, notices and identity

| Document | Cues | Folder |
|---|---|---|
| Form 1040 | "U.S. Individual Income Tax Return", "Form 1040"/"1040-SR", year at top right, "Filing Status", "Your first name and middle initial", "Adjusted gross income", "Paid Preparer Use Only"; software footer (TurboTax, FreeTaxUSA…) | `_Last year's return` if year < target, else `_This year's return` |
| State return | "Resident/Nonresident/Part-Year Income Tax Return", state form number (CA 540, NY IT-201, LA IT-540…), Franchise Tax Board / Department of Revenue | as above |
| IRS transcript | "Tax Return Transcript", "Wage and Income Transcript", "Account Transcript", "Record of Account", "Request Date", "Tax Period Ending" | `_Last year's return` |
| IP PIN notice | "CP01A", "Identity Protection Personal Identification Number" | `_Proof of identity` |
| ITIN letter | "CP565", "Individual Taxpayer Identification Number", Form W-7 | `_Proof of identity` |
| Driver license / state ID | "DRIVER'S LICENSE" / "IDENTIFICATION CARD", DL number, CLASS, DOB, EXP, ISS, SEX/HGT/EYES, REAL ID star | `_Proof of identity` (entity = person) |
| Passport | "PASSPORT", nationality, place of birth, date of issue, MRZ line `P<USA…` | `_Proof of identity` |
| Social Security card | "This number has been established for", "Signature of number holder", SSA seal | `_Proof of identity` |
| Birth certificate | "Certificate of Live Birth", registrar, vital records | `_Proof of identity` |
| IRS notice | notice number (CP2000, CP14, LTR 12C…), "Notice date", "Amount due by", "We changed/received/need" | review |

## Bills, receipts and statements

| Document | Cues | Default folder |
|---|---|---|
| Electric bill | kWh, kilowatt, "electric service", utility name (Entergy, PG&E, SCE, LADWP, Duke, Con Edison, National Grid…), service address, meter number | Income - Rental when a property label matches, else review |
| Gas bill | therms, CCF/MCF, "natural gas", SoCalGas, Atmos, CenterPoint… | same |
| Water / sewer / trash bill | gallons, HCF, sewer, sanitation, stormwater, "Department of Water", municipal utilities | same |
| Internet / cable | Mbps, modem/gateway fee, Xfinity, Spectrum, Cox, AT&T Fiber, Verizon Fios, Starlink… | same |
| Phone | wireless/mobile plan, lines, Verizon Wireless, T-Mobile, AT&T… | same |
| Insurance premium | "Declarations page", policy number, named insured, premium, landlord/dwelling/DP-3/HO-3/umbrella/renters; State Farm, Allstate, Steadily… | Income - Rental with label; landlord/dwelling wording means a rental |
| HOA statement | Homeowners/Condominium Association, dues, assessments | Income - Rental |
| Property tax bill | "Property tax", parcel/APN, assessed value, tax collector/treasurer/assessor, installments, millage, amount due. This is the assessment, not proof it was paid | Deductions for the personal home (`Property Tax Bill`). Income - Rental for a rental, named `Rent-Income-Deduction-Home-Property-Tax-Bill` (one rental) or `Rent-Income-200-Lake-Ave-Deduction-Home-Property-Tax-Bill` (more than one rental) |
| Property tax receipts | paid stamp, "payment received", bank or card payment of the tax, receipt or confirmation, $0 balance after payment. A receipt is not the bill | Income - Rental, named `Rent-Income-Deduction-Home-Property-Tax-Receipts` (one rental) or `Rent-Income-200-Lake-Ave-Deduction-Home-Property-Tax-Receipts` (more than one rental). Same property as the bill, with `Receipts` in place of `Bill` |
| Mortgage statement | "Mortgage statement", escrow, principal/interest, servicer name (Rocket, Mr. Cooper, PennyMac…) | Deductions; Income - Rental with label |
| Closing disclosure / settlement statement | "Closing Disclosure", "Settlement Statement", HUD-1, cash to close, prorations | Income - Rental with label, else review |
| Owner / property management statement | "Owner statement", management fee, rent received, tenant, security deposit | Income - Rental |
| Lease | "Residential Lease Agreement", landlord, tenant, monthly rent, lease term | Income - Rental |
| Repair invoice | plumbing, HVAC, roofing, electrician, handyman, "work order", labor/parts | Income - Rental or Income - Self-employment by label |
| Invoice (issued or received) | "Invoice", invoice number/date, "Bill to", "Remit to", net 30, hours/rate | Income - Self-employment by label, else review |
| Store receipt | store name, subtotal, sales tax, total, card brand, auth code, "Thank you for shopping"; often a photo | Income - Self-employment / Income - Rental by label, else review |
| Donation receipt | 501(c)(3), "no goods or services were provided", "thank you for your donation", charity name, in-kind FMV | Deductions |
| Medical bill / EOB | patient, date of service, provider, copay, CPT; "Explanation of Benefits — This is not a bill" | Deductions |
| Vehicle registration | "Registration renewal", plate, VIN, vehicle license fee, DMV | Deductions |
| Childcare statement | daycare/preschool/after-school, provider tax ID, "Form 2441", tuition paid | Credits |
| Energy improvement | solar, heat pump, insulation, ENERGY STAR, "Form 5695", manufacturer certification | Credits |
| Clean vehicle | time-of-sale report, Form 15400/8936, VIN, EV make | Credits |
| Estimated tax | "1040-ES" voucher, IRS Direct Pay / EFTPS confirmation number, "estimated tax", tax period | Estimated tax payments |
| Bank statement | checking/savings, statement period, beginning/ending balance, deposits and withdrawals, FDIC | Records - Statements (business label -> Income - Self-employment) |
| Credit card statement | minimum payment due, credit limit, APR, new balance, account ending in | Records - Statements |
| Brokerage statement | account/portfolio statement, holdings, market value, broker name | Income - Investments |
| Crypto report | exchange name, gain/loss report, transaction history, cost basis, Form 8949 | Income - Investments |
| Payment app statement | PayPal/Venmo/Cash App/Stripe/Square transaction history, goods and services | Income - Self-employment |
| Pay stub | earnings statement, pay period, gross/net pay, YTD, federal withholding | Income - Wages |
| Profit and loss | "Profit and Loss", total income, total expenses, net income (QuickBooks, Wave…) | Income - Self-employment |
| Mileage log | odometer, business miles, trip purpose, MileIQ/Everlance | Income - Self-employment |

## What to look for in a page image

When OCR failed or you doubt the result, open the PNG and answer, in order: (1) what is the printed title or form
number; (2) who issued it (letterhead, payer block, logo); (3) which year or date is printed; (4) which address,
account or property it refers to; (5) is this the filled-in form or a cover letter / instructions. Then set the
item with `edit_plan.py --set doc_type=... --set entity=... --set tax_year=... / --set date=... --status ready`.
If the image is too blurry or cropped to answer (1) and (2), record `edit_plan.py --item N --vision-failed "blurry;
title and payer unreadable"` so the file goes to `_Needs Human Review`, and ask the user for a better copy.
`apply_plan.py` will not run while a `needs_vision` item has neither verdict.
