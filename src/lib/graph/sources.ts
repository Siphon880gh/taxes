import { CPI_U, cpiFactor, dayLabel, monthLabel } from "./cpi";
import type { Citation } from "./types";

const cpiMonth = monthLabel(CPI_U.latestMonth);

export const retrieved = "October 3, 2026";

export const citations = {
  form1040_2025: {
    title: "2025 Form 1040 and 2025 Instructions for Form 1040",
    url: "https://www.irs.gov/instructions/i1040gi",
    yearLabel: "Tax year 2025",
    citation:
      "IRS 2025 Form 1040 instructions: standard deduction $15,750 single or married filing separately; $31,500 married filing jointly or qualifying surviving spouse; $23,625 head of household. Form 1040 line 1a is W-2 box 1 wages; line 11b is adjusted gross income; line 12e is the standard deduction or itemized deductions; line 13b is additional deductions from Schedule 1-A.",
  } satisfies Citation,
  ir2025_103: {
    title: "IRS news release IR-2025-103",
    url: "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
    yearLabel: "Tax years 2025 and 2026",
    citation:
      "IR-2025-103 (October 9, 2025). Tax year 2025 standard deduction under the One, Big, Beautiful Bill: $15,750 single or married filing separately; $31,500 married filing jointly; $23,625 head of household. Tax year 2026: $16,100; $32,200; $24,150. Details are in Revenue Procedure 2025-32.",
  } satisfies Citation,
  rp2025_32: {
    title: "Revenue Procedure 2025-32",
    url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
    yearLabel: "Tax year 2026",
    citation:
      "Rev. Proc. 2025-32, section 4.14 (standard deduction). For taxable years beginning in 2026: $32,200 married filing jointly and surviving spouses; $24,150 heads of household; $16,100 unmarried individuals and married filing separately. Additional amount for aged or blind: $1,650, or $2,050 if unmarried and not a surviving spouse. Dependent limitation: greater of $1,350 or $450 plus earned income.",
  } satisfies Citation,
  topic551: {
    title: "IRS Topic no. 551, Standard deduction",
    url: "https://www.irs.gov/taxtopics/tc551",
    yearLabel: "Tax year 2025",
    citation:
      "Topic 551, page last reviewed September 24, 2026. For 2025, the additional standard deduction for age or blindness is $1,600, or $2,000 if unmarried and not a surviving spouse. A dependent's 2025 standard deduction is limited to the greater of $1,350 or earned income plus $450, and cannot exceed the basic standard deduction. You cannot take the standard deduction if you itemize. A married person filing separately whose spouse itemizes cannot take the standard deduction. The enhanced senior deduction of $6,000 is separate and is claimed on Schedule 1-A.",
  } satisfies Citation,
  form1040_senior: {
    title: "2025 Instructions for Form 1040 — enhanced senior deduction",
    url: "https://www.irs.gov/instructions/i1040gi",
    yearLabel: "Tax year 2025",
    citation:
      "2025 Form 1040 instructions: the enhanced deduction for seniors is limited if modified adjusted gross income is more than $75,000 ($150,000 if married filing jointly). The maximum is $6,000 ($12,000 if both spouses qualify). It is claimed on Schedule 1-A, not instead of the standard deduction or Schedule A.",
  } satisfies Citation,
  scheduleA_2025: {
    title: "2025 Instructions for Schedule A (Form 1040)",
    url: "https://www.irs.gov/instructions/i1040sca",
    yearLabel: "Tax year 2025",
    citation:
      "2025 Schedule A instructions, line 5e. The state and local tax deduction is generally limited to $40,000 ($20,000 if married filing separately). If Form 1040 line 11b is more than $500,000 ($250,000 if married filing separately), the limit is reduced but not below $10,000 ($5,000 if married filing separately).",
  } satisfies Citation,
  scheduleB_2025: {
    title: "2025 Instructions for Schedule B (Form 1040)",
    url: "https://www.irs.gov/instructions/i1040sb",
    yearLabel: "Tax year 2025",
    citation:
      "2025 Instructions for Schedule B: file Schedule B if you had over $1,500 of taxable interest or ordinary dividends, and in the other listed cases (seller-financed mortgage, accrued bond interest, OID or bond premium adjustments, savings bond exclusion, or a foreign account or trust).",
  } satisfies Citation,
  scheduleC_2025: {
    title: "2025 Instructions for Schedule C (Form 1040)",
    url: "https://www.irs.gov/instructions/i1040sc",
    yearLabel: "Tax year 2025",
    citation:
      "Line A: if you owned more than one business, complete a separate Schedule C for each business. Line 1: gross receipts, including amounts properly shown on Forms 1099-NEC. Line 31: net profit or loss, included on Schedule 1 (Form 1040), line 3, and on Schedule SE, line 2. One-half of self-employment tax is deducted on Schedule 1, line 15.",
  } satisfies Citation,
  estimated_taxes: {
    title: "IRS estimated taxes",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes",
    yearLabel: "Page last reviewed September 25, 2026",
    citation:
      "IRS, Estimated taxes, page last reviewed or updated September 25, 2026. Tax is paid as income is earned, through withholding or estimated tax payments. Estimated tax covers income tax and other taxes such as self-employment tax. Individuals, including sole proprietors, generally must make estimated payments if they expect to owe $1,000 or more when the return is filed. Individuals generally use Form 1040-ES. Paying too little through withholding and estimated payments can bring a penalty. This page does not name the Form 1040 line where payments already made are entered.",
  } satisfies Citation,
  scheduleE_2025: {
    title: "2025 Schedule E (Form 1040) and instructions",
    url: "https://www.irs.gov/instructions/i1040se",
    yearLabel: "Tax year 2025",
    citation:
      "2025 Schedule E Part I: line 2 fair rental and personal use days; line 3 rents received; line 9 insurance; line 12 mortgage interest paid to banks; line 14 repairs; line 16 taxes; line 17 utilities; line 18 depreciation; line 19 other expenses not listed on lines 5 through 18; line 26 total rental real estate and royalty income or loss. Line 14 is repairs and maintenance that keep the property in ordinary operating condition, not improvements. Form 4562 is attached only for depreciation on property first placed in service in 2025, listed property, or a section 179 or amortization claim that began in 2025. The instructions also refer to Form 1040 line 26 for an estimated-tax amount credited from a trust.",
  } satisfies Citation,
  pub527_2025: {
    title: "Publication 527 (2025), Residential Rental Property",
    url: "https://www.irs.gov/pub/irs-pdf/p527.pdf",
    yearLabel: "Tax year 2025",
    citation:
      "Pub. 527 (2025). If your tenant pays any of your expenses, those payments are rental income, and the expense can also be deducted if it is a deductible rental expense. Divide mixed-use expenses by any reasonable method; square footage and number of rooms are the two most common methods. For property placed in service before 2025, continue the same depreciation method. Part interest: deduct expenses you paid according to your percentage of ownership.",
  } satisfies Citation,
  pub334_2025: {
    title: "Publication 334 (2025), Tax Guide for Small Business",
    url: "https://www.irs.gov/pub/irs-prior/p334--2025.pdf",
    yearLabel: "Tax year 2025",
    citation:
      "Pub. 334 (2025). Net earnings for self-employment tax are generally 92.35% (0.9235) of net profit (Schedule SE line 4a under the regular method). The 2025 self-employment tax rate is 15.3% (12.4% Social Security plus 2.9% Medicare). Only the first $176,100 of combined wages, tips, and net earnings in 2025 is subject to the 12.4% Social Security portion. File Schedule SE if net earnings from self-employment are $400 or more. A separate Schedule C is filed for each business.",
  } satisfies Citation,
  ir2025_107: {
    title: "IRS news release IR-2025-107 and Fact Sheet 2025-08",
    url: "https://www.irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000",
    yearLabel: "Tax year 2025",
    citation:
      "IR-2025-107 (October 23, 2025) and Fact Sheet 2025-08. A third party settlement organization is not required to file Form 1099-K unless the gross amount of reportable payment transactions to a payee exceeds $20,000 and the number of transactions exceeds 200. A platform may still send a form below that threshold. Income from goods or services is reportable whether or not a form is issued. Personal transfers are not the same as payments for goods or services. A state may set a lower threshold; no state threshold is stored in this tool.",
  } satisfies Citation,
  rp2024_40: {
    title: "Revenue Procedure 2024-40",
    url: "https://www.irs.gov/pub/irs-drop/rp-24-40.pdf",
    yearLabel: "Tax year 2025 (retrieved October 21, 2026)",
    checked: "2026-10-21",
    citation:
      "Rev. Proc. 2024-40, section 3.27 (Qualified Business Income). For taxable years beginning in 2025, the § 199A threshold amount is $394,600 for married individuals filing joint returns (phase-in range ends at $494,600) and $197,300 for married filing separately and all other returns (phase-in range ends at $247,300).",
  } satisfies Citation,
  rp2025_32_more: {
    title: "Revenue Procedure 2025-32 (QBI, dependent standard deduction, information-return threshold)",
    url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
    yearLabel: "Tax year 2026 (retrieved October 21, 2026)",
    checked: "2026-10-21",
    citation:
      "Rev. Proc. 2025-32. Section 4.26: for taxable years beginning in 2026, the § 199A threshold amount is $403,500 for married filing jointly (phase-in range ends at $553,500), $201,775 for married filing separately (ends at $276,775), and $201,750 for all other returns (ends at $276,750). Section 4.14(2): a dependent's 2026 standard deduction cannot exceed the greater of $1,350 or $450 plus earned income. Section 2.15: for payments made after December 31, 2025, the base threshold under § 6041(a) is $2,000.",
  } satisfies Citation,
  irs_salt_2026: {
    title: "IRS: Correction to the state and local income tax deduction amount in the 2026 Form 1040-ES",
    url: "https://www.irs.gov/forms-pubs/correction-to-state-and-local-income-tax-deduction-amount-in-the-2026-form-1040-es",
    yearLabel: "Tax year 2026 (page updated March 16, 2026; retrieved October 21, 2026)",
    checked: "2026-10-21",
    citation:
      "For 2026, the limit on the deduction for state and local income, sales, and property taxes is $40,400 ($20,200 if married filing separately). The limit is reduced if modified adjusted gross income is more than $505,000 ($252,500 if married filing separately), but not below $10,000 ($5,000 if married filing separately).",
  } satisfies Citation,
  ssa_wage_base: {
    title: "SSA, Contribution and Benefit Base",
    url: "https://www.ssa.gov/oact/cola/cbb.html",
    yearLabel: "Earnings years 2025 to 2027 (retrieved October 21, 2026)",
    checked: "2026-10-21",
    citation:
      "Social Security Administration, Office of the Chief Actuary. Contribution and benefit base (the maximum earnings subject to the 12.4% Social Security portion): $176,100 for 2025, $184,500 for 2026, and $192,300 for 2027. Medicare (HI) has no taxable maximum.",
  } satisfies Citation,
  pub15_2026: {
    title: "Publication 15 (2026), Employer's Tax Guide",
    url: "https://www.irs.gov/publications/p15",
    yearLabel: "Payments made in 2025 and 2026 (retrieved October 21, 2026)",
    checked: "2026-10-21",
    citation:
      "Pub. 15 (2026). Form 1099-NEC reports payments of $600 or more made in 2025 ($2,000 or more for payments made in 2026) to people not treated as employees. For payments made after calendar year 2025, P.L. 119-21 raises the information-reporting threshold from $600 to $2,000, and the W-2 wage-reporting threshold to $2,000 when no federal income, Social Security, or Medicare tax was withheld. The threshold is adjusted for inflation after 2026.",
  } satisfies Citation,
  fs2025_03: {
    title: "IRS Fact Sheet FS-2025-03: Tax deductions for working Americans and seniors",
    url: "https://www.irs.gov/newsroom/one-big-beautiful-bill-act-tax-deductions-for-working-americans-and-seniors",
    yearLabel: "Tax years 2025 through 2028 (retrieved October 21, 2026)",
    checked: "2026-10-21",
    citation:
      "FS-2025-03 (July 14, 2025; updated July 25, 2025). Each deduction is effective for 2025 through 2028 and is available whether or not the taxpayer itemizes. No tax on tips: up to $25,000 of qualified tips; for the self-employed, not more than the net income from the trade or business; phases out above $150,000 modified AGI ($300,000 joint); not available in a specified service trade or business; SSN required and married taxpayers must file jointly. No tax on overtime: the FLSA-required premium portion, up to $12,500 ($25,000 joint); phases out above $150,000 ($300,000 joint); SSN and joint filing required. Car loan interest: up to $10,000 of interest on a loan originated after December 31, 2024 for a new, personal-use vehicle under 14,000 pounds with final assembly in the United States, secured by a lien; leases do not qualify; VIN required on the return; phases out above $100,000 ($200,000 joint). Seniors: $6,000 per individual 65 or older by the end of the year ($12,000 if both spouses qualify); phases out above $75,000 ($150,000 joint); SSN and joint filing required.",
  } satisfies Citation,
  schedule1a_2025: {
    title: "2025 Schedule 1-A (Form 1040), Additional Deductions",
    url: "https://www.irs.gov/pub/irs-pdf/f1040s1a.pdf",
    yearLabel: "Tax year 2025 (retrieved October 21, 2026)",
    checked: "2026-10-21",
    citation:
      "2025 Schedule 1-A. Part II no tax on tips: line 7 is the smaller of qualified tips or $25,000; above $150,000 ($300,000 married filing jointly) of line 3 modified AGI, the deduction drops $100 for each full $1,000 (line 11 rounds down); line 13 is the deduction. Part III overtime: line 15 caps at $12,500 ($25,000 MFJ), same $150,000/$300,000 start and $100 per full $1,000; line 21. Part IV car loan interest: line 24 caps at $10,000; above $100,000 ($200,000 MFJ) it drops $200 per $1,000 or part of $1,000 (line 28 rounds up); line 30. Part V seniors: $6,000 less 6% of modified AGI over $75,000 ($150,000 MFJ), per qualifying person born before January 2, 1961; line 37. Line 38 totals the parts and goes to Form 1040 line 13b.",
  } satisfies Citation,
  la_rs_294: {
    title: "Louisiana Revised Statutes 47:294 and 2025 IT-540 instructions",
    url: "https://www.legis.la.gov/legis/Law.aspx?d=101761",
    yearLabel: "Tax year 2025",
    citation:
      "La. R.S. 47:294(A), as amended by Act 11 of the 2024 Third Extraordinary Session: for tax year 2025, the standard deduction is $12,500 for single and married filing separately, and 200% of that amount ($25,000) for married filing jointly, qualifying surviving spouse, and head of household. 2025 IT-540 instructions, line 8, repeat those amounts. Lines 9A through 9D are used only if the federal return was itemized; otherwise skip them. Filing status must match the federal return.",
  } satisfies Citation,
  la_rib_2026: {
    title: "Louisiana Revenue Information Bulletin 26-019",
    url: "https://dam.ldr.la.gov/lawspolicies/RIB%2026-019.pdf",
    yearLabel: "Tax year 2026",
    citation:
      "LDR Revenue Information Bulletin No. 26-019 (September 28, 2026), under La. R.S. 47:294. Tax year 2026 standard deduction after a 2.7% CPI-U adjustment: $12,838 single or married filing separately; $25,676 married filing jointly, head of household, or qualifying surviving spouse. 2026 IT-540 line numbers were not in this bulletin and are not treated as confirmed.",
  } satisfies Citation,
  ftb_2025: {
    title: "2025 Instructions for California Form 540",
    url: "https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html",
    yearLabel: "Tax year 2025",
    citation:
      "FTB 2025 Form 540 instructions, line 18. California standard deduction: $5,706 single or married/RDP filing separately; $11,412 married/RDP filing jointly, head of household, or qualifying surviving spouse/RDP. FTB says the tax is lower if you take the larger of California itemized deductions or the California standard deduction. The California standard deduction is less than the federal standard deduction.",
  } satisfies Citation,
  ftb_2026: {
    title: "FTB Tax News — 2026 indexing",
    url: "https://www.ftb.ca.gov/about-ftb/newsroom/tax-news/index.html",
    yearLabel: "Tax year 2026",
    citation:
      "Franchise Tax Board Tax News index, “2026 Indexing,” page last updated September 30, 2026. Standard deduction $5,900 single or married filing separate; $11,800 joint, surviving spouse, or head of household. The CCPI change cited on the page is 3.4% from June 2025 to June 2026. FTB said the complete 2026 tax rates and exemption amounts would be posted in late December.",
  } satisfies Citation,
  turbotax_premium: {
    title: "TurboTax Do It Yourself Premium online, 2025–2026",
    url: "https://turbotax.intuit.com/personal-taxes/online/premium/",
    yearLabel: "Tax year 2025 (product year 2025–2026)",
    citation:
      "Intuit product page retrieved October 3, 2026. TurboTax Do It Yourself Premium is listed at $139 federal and is described as covering rental property income and deductions and self-employment. Schedule E and Schedule C appear in that product's forms list. A separate fixed dollar for the online state return was not published on the page. Rechecked October 21, 2026: still $139 federal.",
    checked: "2026-10-21",
  } satisfies Citation,
  turbotax_deluxe: {
    title: "TurboTax Do It Yourself Deluxe online, 2025–2026",
    url: "https://turbotax.intuit.com/personal-taxes/online/deluxe.jsp",
    yearLabel: "Tax year 2025 (product year 2025–2026)",
    citation:
      "Intuit product page retrieved October 3, 2026. Deluxe is listed at $79 federal and is marketed for deductions, including mortgage interest and property taxes. The same page's forms notes say Schedule E and a full Schedule C are not the Deluxe scope; adding Schedule D, E, or F can require an upgrade. Rechecked October 21, 2026: still $79 federal.",
    checked: "2026-10-21",
  } satisfies Citation,
  turbotax_free: {
    title: "TurboTax Free Edition, 2025–2026",
    url: "https://turbotax.intuit.com/personal-taxes/online/free-edition.jsp",
    yearLabel: "Tax year 2025 (product year 2025–2026)",
    citation:
      "Intuit product page retrieved October 3, 2026. Free Edition is $0 federal, $0 state, and $0 to file for a simple Form 1040 only (no schedules except as needed for the earned income credit, child tax credit, student loan interest, and Schedule 1-A). Intuit says roughly 37% of taxpayers qualify and the offer can change. Rechecked October 21, 2026: the Intuit pricing notes still read $0 Federal + $0 State + $0 To File.",
    checked: "2026-10-21",
  } satisfies Citation,
  turbotax_state: {
    title: "TurboTax Online State additional, 2025–2026",
    url: "https://turbotax.intuit.com/headless/static/modals/tto-all-state-additional-en/",
    yearLabel: "Tax year 2025 (Intuit State additional page retrieved October 21, 2026)",
    citation:
      "Intuit's TurboTax Online State additional page, opened from the “State additional” link on the Deluxe and Premium pages, retrieved October 21, 2026. Price per state is listed as $0–$64, and $0 for state only if you qualify for a free federal return. The page does not say which fee applies to which product or filing date, so no single state dollar is added.",
    checked: "2026-10-21",
  } satisfies Citation,
  turbotax_desktop: {
    title: "TurboTax Desktop pricing, 2025–2026",
    url: "https://turbotax.intuit.com/desktop-pricing/",
    yearLabel: "Tax year 2025 (product year 2025–2026)",
    citation:
      "Intuit desktop pricing page retrieved October 3, 2026. Listed federal prices: Deluxe $84, Premier $119, Home & Business $134, Business $194. Personal state e-file is listed at $25, except New York and Washington. These desktop prices are not added to the online Premium estimate. Which desktop SKU includes both Schedule C and Schedule E was not confirmed on that page. Rechecked October 21, 2026: the same prices and the $25 state e-file fee are listed.",
    checked: "2026-10-21",
  } satisfies Citation,
  hrblock_online: {
    title: "H&R Block online tax filing prices",
    url: "https://www.hrblock.com/online-tax-filing/",
    yearLabel: "Online filing page rendered in a browser, October 21, 2026 (no tax year printed)",
    citation:
      "H&R Block online filing page, rendered in a browser October 21, 2026. The prices fill in only after the page's scripts run; the raw HTML read October 3 and October 16, 2026 showed none. Online filing options: Free Online $0 + $0 per state filed; Deluxe $65 + $49 per state filed; Premium $105 + $49 per state filed; Self-Employed $130 + $49 per state filed. The page prints no tax year and no “starting at” wording. Free Online is for simple returns only: Form 1040 and no schedules except the Earned Income Tax Credit, Child Tax Credit, student loan interest, and retirement plan distributions, with interest and dividends up to $1,500. The comparison table adds a Health Savings Account from Deluxe up, rental and investment income from Premium up, and 1099 income with expenses only in Self-Employed. The FAQ lists Schedule A (itemized deductions) among the forms in Deluxe, Premium, and Self-Employed.",
    checked: "2026-10-21",
  } satisfies Citation,
  freetaxusa_pricing: {
    title: "FreeTaxUSA upfront pricing",
    url: "https://www.freetaxusa.com/pricing/",
    yearLabel: "Tax year 2025 (pricing page retrieved October 16, 2026)",
    citation:
      "FreeTaxUSA pricing page retrieved October 16, 2026, 2025 returns table. Federal tax returns are free for every situation listed, including investments, rental property, and self-employment. A state tax return is $15.99. An amended tax return is $16.98. Optional products on the same page: Deluxe Support $7.99, Pro Support $64.99, Audit Defense $19.99. Basic support is free. Prior-year state returns are listed at $17.99 and are not the current-year price. Rechecked October 21, 2026: federal is still $0 and a state return is still $15.99.",
    checked: "2026-10-21",
  } satisfies Citation,
  nsa_2023: {
    title: "National Society of Accountants, 2023 Income and Fees report",
    url: "https://img1.wsimg.com/blobby/go/a15c5ffb-9439-4993-b38e-4acbf6145e32/2023%2BComplete%2BIncome%2Band%2BFees%2BReport.pdf",
    yearLabel: "Survey year 2023 (report © 2024)",
    citation:
      "NSA 2023 Income & Fees complete report, national average column. Form 1040 not itemized with a state return $279; Form 1040 itemized with a state return $392; Schedule C $221; Schedule E (rental) $192; Schedule D/Form 8949 $126; Schedule B $64; Schedule SE $62. These are separate averages. The report does not publish a 2025 Los Angeles or Louisiana package price. The 2025 NSA fee tables were not public when this tool was built. The fee tables give averages for each form, not a range or percentiles, so the fee estimate's only spread is the not-itemized versus itemized Form 1040 base.",
  } satisfies Citation,
  bls_cpi_u: {
    title: `BLS Consumer Price Index, ${cpiMonth} (CPI-U, U.S. city average)`,
    url: "https://www.bls.gov/news.release/cpi.nr0.htm",
    yearLabel: `CPI-U ${cpiMonth} against the 2023 annual average (retrieved ${dayLabel(CPI_U.checked)})`,
    checked: CPI_U.checked,
    citation: `Bureau of Labor Statistics CPI release for ${cpiMonth}, retrieved ${dayLabel(CPI_U.checked)}. CPI-U all items, U.S. city average, not seasonally adjusted (series CUUR0000SA0, https://data.bls.gov/timeseries/CUUR0000SA0): ${CPI_U.latest.toFixed(3)} (1982-84=100). The 2023 annual average of the same series is ${CPI_U.surveyYearAverage2023}. ${CPI_U.latest.toFixed(3)} ÷ ${CPI_U.surveyYearAverage2023} = ${cpiFactor().toFixed(3)}, so prices rose about ${((cpiFactor() - 1) * 100).toFixed(1)}% from the 2023 survey year to ${cpiMonth}. CPI measures consumer prices in general, not tax-preparation fees. Updated by hand; see docs/UPDATE_INFLATION.md.`,
  } satisfies Citation,
} as const;
