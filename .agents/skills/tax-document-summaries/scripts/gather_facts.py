#!/usr/bin/env python3
"""Step 1: gather the facts a tax professional needs from the sorted documents.

Reads the tax-document-classification work folder (<out>/.tax-sorter: manifest, plan, extracted text, labels,
tax year), walks the document folders, reads the key amounts out of each document (box values on IRS forms,
totals on bills and receipts, dates, percentages), groups everything by Summaries.md section, totals each
expense category for the tax year, lists the months each monthly bill covers, flags what still needs AI vision,
and compares with the existing Summaries.md (which documents are not mentioned yet).

Files that the classification skill has not processed (left in the inbox, or a folder organised by hand) are
read here with the same extraction and classification code, without moving anything.

Writes <work>/summaries/facts.json and facts.md, and prints facts.md.

Usage:
  python3 gather_facts.py [FOLDER] [--tax-year YYYY] [--summaries PATH] [--max-chars 40000] [--quiet]
"""
import argparse
import re
import sys
from collections import Counter, OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from summaries_common import (SECTIONS, SECTION_BY_KEY, SECTION_ORDER, SORTED_FILENAME, SUMMARIES_FILENAME, die,
                              fmt_money, iter_documents, load_json, now_iso, parse_summaries, header_tax_year,
                              rel_link, resolve, save_json, sibling, warn)

# --------------------------------------------------------------------------
# value patterns
# --------------------------------------------------------------------------

AMOUNT = r"\(?-?\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?|\(?-?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\)?|\(?-?\d+\.\d{2}\)?"
AMOUNT_RE = re.compile(AMOUNT)
NUMBER_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
PCT_RE = re.compile(r"\d{1,3}(?:\.\d+)?\s?%")
CODE_RE = re.compile(r"\b([1-9A-Z]{1,2})\b")
DATE_RES = [
    (re.compile(r"\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d\d|\d\d)\b"), "mdy"),
    (re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b", re.I), "Mdy"),
    (re.compile(r"\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d\d)\b", re.I), "dMy"),
]
MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
NEXT_BOX_RE = re.compile(r"(?<=\s)\d{1,2}[a-z]?\s+[A-Z][a-z]")  # "2 Federal income tax withheld" -> stop the value window there


def F(key: str, label: str, pattern: str, kind: str = "amount") -> Tuple[str, str, str, str]:
    return (key, label, pattern, kind)


FED_WH = F("fed_withheld", "Federal income tax withheld", r"federal\s+income\s+tax\s+withheld")
STATE_WH = F("state_tax", "State income tax withheld", r"state\s+(?:income\s+)?tax\s+withheld")
GENERIC_TOTALS = [
    F("total_due", "Total amount due", r"total\s+amount\s+due"),
    F("amount_due", "Amount due", r"amount\s+(?:now\s+)?due(?!\s+(?:date|by))"),
    F("total_paid", "Total / amount paid", r"total\s+(?:amount\s+)?paid|amount\s+paid|payment\s+amount|paid\s+amount|total\s+payments?"),
    F("balance_due", "Balance due", r"balance\s+due"),
    F("grand_total", "Grand total", r"grand\s+total"),
    F("total", "Total", r"(?<![a-z])total(?!\s+(?:occupants|miles|hours|pages|items|tax(?:es)?\b|savings|credit|balance\s+due|due\s+by|contributions|benefits|income|expenses|closing))\b"),
    F("current_charges", "Current / new charges", r"current\s+charges|(?:total\s+)?new\s+charges"),
    F("period", "Service / billing period", r"(?:service|billing|statement)\s+period\s*:?", "text"),
]
INT_DIV_B = [
    F("interest", "1099-INT box 1 Interest income", r"\binterest\s+income\b"),
    F("penalty", "1099-INT box 2 Early withdrawal penalty", r"early\s+withdrawal\s+penalty"),
    F("savings_bonds", "1099-INT box 3 Interest on U.S. Savings Bonds / Treasury", r"savings\s+bonds"),
    F("tax_exempt", "1099-INT box 8 Tax-exempt interest", r"tax-?exempt\s+interest"),
    F("ordinary", "1099-DIV box 1a Total ordinary dividends", r"total\s+ordinary\s+dividends"),
    F("qualified", "1099-DIV box 1b Qualified dividends", r"qualified\s+dividends"),
    F("cap_gain", "1099-DIV box 2a Total capital gain distributions", r"total\s+capital\s+gain\s+distr"),
    F("sec199a", "1099-DIV box 5 Section 199A dividends", r"section\s+199a\s+dividends"),
    F("foreign_tax", "Foreign tax paid", r"foreign\s+tax\s+paid"),
    F("exempt_div", "1099-DIV box 12 Exempt-interest dividends", r"exempt-?interest\s+dividends"),
    F("proceeds", "1099-B Proceeds (total)", r"(?:total\s+)?proceeds(?!\s+from\s+broker)"),
    F("basis", "1099-B Cost or other basis (total)", r"cost\s+or\s+other\s+basis|cost\s+basis"),
    F("wash", "Wash sale loss disallowed", r"wash\s+sale\s+loss\s+disallowed"),
    F("gain", "Gain or loss (net)", r"(?:net\s+)?(?:realized\s+)?gain\s+or\s+\(?loss\)?|gain/\(?loss\)?"),
    FED_WH,
]

FIELDS: Dict[str, List[Tuple[str, str, str, str]]] = {
    "W-2": [
        F("wages", "Box 1 Wages, tips, other compensation", r"wages,?\s+tips,?\s+other\s+comp\w*"),
        F("fed_withheld", "Box 2 Federal income tax withheld", r"federal\s+income\s+tax\s+withheld"),
        F("ss_wages", "Box 3 Social security wages", r"social\s+security\s+wages"),
        F("ss_tax", "Box 4 Social security tax withheld", r"social\s+security\s+tax\s+withheld"),
        F("medicare_wages", "Box 5 Medicare wages and tips", r"medicare\s+wages\s+and\s+tips"),
        F("medicare_tax", "Box 6 Medicare tax withheld", r"medicare\s+tax\s+withheld"),
        F("state_wages", "Box 16 State wages", r"state\s+wages,?\s+tips"),
        F("state_tax", "Box 17 State income tax", r"\b17\s+state\s+income\s+tax|state\s+income\s+tax(?!\s+withheld)"),
    ],
    "W-2G": [F("winnings", "Box 1 Reportable winnings", r"reportable\s+winnings"), FED_WH,
             F("wager", "Box 7 Type of wager", r"type\s+of\s+wager\s*:?", "text")],
    "1099-NEC": [F("nec", "Box 1 Nonemployee compensation", r"nonemployee\s+compensation"), FED_WH, STATE_WH],
    "1099-MISC": [F("rents", "Box 1 Rents", r"\brents\b"), F("royalties", "Box 2 Royalties", r"\broyalties\b"),
                  F("other_income", "Box 3 Other income", r"\bother\s+income\b"), FED_WH],
    "1099-K": [F("gross", "Box 1a Gross amount of payment card / third party network transactions", r"gross\s+amount\s+of\s+payment"),
               F("transactions", "Box 3 Number of payment transactions", r"number\s+of\s+payment\s+transactions", "number"), FED_WH],
    "1099-INT": INT_DIV_B[:4] + [F("foreign_tax", "Box 6 Foreign tax paid", r"foreign\s+tax\s+paid"), FED_WH],
    "1099-DIV": INT_DIV_B[4:10] + [FED_WH],
    "1099-B": INT_DIV_B[10:],
    "Consolidated 1099": INT_DIV_B,
    "Brokerage Statement": [F("ending_value", "Ending account value", r"(?:ending|closing)\s+(?:account\s+)?value|total\s+account\s+value"),
                            F("dividends", "Dividends (period / YTD)", r"dividends?\s+(?:received|income|ytd)|total\s+dividends"),
                            F("interest", "Interest (period / YTD)", r"interest\s+(?:received|income|earned|ytd)")],
    "1099-OID": [F("oid", "Box 1 Original issue discount", r"original\s+issue\s+discount(?!\s+for)"), FED_WH],
    "1099-DA": [F("proceeds", "Proceeds", r"(?:gross\s+|total\s+)?proceeds"), F("basis", "Cost basis", r"cost\s+(?:or\s+other\s+)?basis"),
                F("gain", "Gain or loss", r"gain\s+or\s+\(?loss\)?|gain/\(?loss\)?")],
    "Crypto Tax Statement": [F("proceeds", "Total proceeds", r"(?:total\s+)?proceeds"), F("basis", "Total cost basis", r"(?:total\s+)?cost\s+basis"),
                             F("gain", "Net gain or loss", r"(?:net\s+|total\s+)?(?:gain|gains)\s*(?:/|or)\s*\(?loss(?:es)?\)?"),
                             F("short", "Short-term", r"short-?term(?:\s+(?:gain|loss|net|total))?"),
                             F("long", "Long-term", r"long-?term(?:\s+(?:gain|loss|net|total))?")],
    "1099-R": [F("gross", "Box 1 Gross distribution", r"gross\s+distribution"), F("taxable", "Box 2a Taxable amount", r"taxable\s+amount(?!\s+not)"),
               FED_WH, F("code", "Box 7 Distribution code", r"distribution\s+code\(?s?\)?", "code"), STATE_WH],
    "SSA-1099": [F("paid", "Box 3 Benefits paid", r"benefits\s+paid\s+in\s+20\d\d"), F("repaid", "Box 4 Benefits repaid", r"benefits\s+repaid"),
                 F("net", "Box 5 Net benefits", r"net\s+benefits\s+for\s+20\d\d"),
                 F("medicare", "Medicare Part B premiums deducted", r"medicare\s+part\s+b\s+premiums"),
                 F("fed_withheld", "Voluntary federal income tax withheld", r"(?:voluntary\s+)?federal\s+income\s+tax\s+withheld")],
    "RRB-1099": [F("net", "Net Social Security Equivalent Benefit", r"net\s+social\s+security\s+equivalent")],
    "1099-G": [F("unemployment", "Box 1 Unemployment compensation", r"unemployment\s+compensation"),
               F("refund", "Box 2 State or local income tax refunds", r"state\s+or\s+local\s+income\s+tax\s+refunds"), FED_WH],
    "1099-C": [F("discharged", "Box 2 Amount of debt discharged", r"amount\s+of\s+debt\s+discharged"),
               F("interest", "Box 3 Interest, if included in box 2", r"interest,?\s+if\s+included")],
    "1099-Q": [F("gross", "Box 1 Gross distribution", r"gross\s+distribution"), F("earnings", "Box 2 Earnings", r"\bearnings\b"),
               F("basis", "Box 3 Basis", r"\bbasis\b")],
    "1099-S": [F("proceeds", "Box 2 Gross proceeds", r"gross\s+proceeds"), F("closing", "Box 1 Date of closing", r"date\s+of\s+closing", "date")],
    "1099-LTC": [F("gross", "Box 1 Gross long-term care benefits paid", r"gross\s+long-?term\s+care\s+benefits")],
    "1099-PATR": [F("patronage", "Box 1 Patronage dividends", r"patronage\s+dividends")],
    "1099-SA HSA Distributions": [F("gross", "Box 1 Gross distribution", r"gross\s+distribution"),
                                  F("code", "Box 3 Distribution code", r"distribution\s+code", "code")],
    "5498 IRA Contributions": [F("ira", "Box 1 IRA contributions (traditional)", r"ira\s+contributions"),
                               F("rollover", "Box 2 Rollover contributions", r"rollover\s+contributions"),
                               F("roth_conv", "Box 3 Roth IRA conversion amount", r"roth\s+ira\s+conversion"),
                               F("recharacterized", "Box 4 Recharacterized contributions", r"recharacterized\s+contributions"),
                               F("fmv", "Box 5 Fair market value of account", r"fair\s+market\s+value\s+of\s+account"),
                               F("roth", "Box 10 Roth IRA contributions", r"roth\s+ira\s+contributions"),
                               F("rmd", "Box 12b RMD amount", r"rmd\s+amount")],
    "5498-SA HSA Contributions": [F("total", "Box 2 Total contributions made in the year", r"total\s+contributions\s+made\s+in"),
                                  F("prior_year", "Box 3 Contributions made in the following year for this year", r"total\s+hsa\s+or\s+archer\s+msa\s+contributions"),
                                  F("rollover", "Box 4 Rollover contributions", r"rollover\s+contributions"),
                                  F("fmv", "Box 5 Fair market value", r"fair\s+market\s+value")],
    "1098 Mortgage Interest": [F("interest", "Box 1 Mortgage interest received", r"mortgage\s+interest\s+received"),
                               F("principal", "Box 2 Outstanding mortgage principal", r"outstanding\s+mortgage\s+principal"),
                               F("origination", "Box 3 Mortgage origination date", r"mortgage\s+origination\s+date", "date"),
                               F("refund", "Box 4 Refund of overpaid interest", r"refund\s+of\s+overpaid\s+interest"),
                               F("mip", "Box 5 Mortgage insurance premiums", r"mortgage\s+insurance\s+premiums"),
                               F("points", "Box 6 Points paid on purchase", r"points\s+paid\s+on\s+purchase"),
                               F("taxes", "Property taxes paid from escrow (box 10 / other)", r"property\s+tax(?:es)?\s+paid|real\s+estate\s+taxes?\s+paid|\b10\s+other\b")],
    "Mortgage Statement": [F("ytd_interest", "Year-to-date interest paid", r"(?:ytd|year-?to-?date)\s+interest(?:\s+paid)?"),
                           F("ytd_principal", "Year-to-date principal paid", r"(?:ytd|year-?to-?date)\s+principal"),
                           F("ytd_taxes", "Year-to-date taxes / escrow paid", r"(?:ytd|year-?to-?date)\s+(?:taxes|escrow)"),
                           F("principal_balance", "Principal balance", r"(?:unpaid\s+)?principal\s+balance"),
                           F("payment", "Payment due", r"(?:total\s+)?(?:payment|amount)\s+due")],
    "1098-T Tuition": [F("payments", "Box 1 Payments received for qualified tuition", r"payments\s+received\s+for\s+qualified\s+tuition"),
                       F("adjust", "Box 4 Adjustments for a prior year", r"adjustments\s+made\s+for\s+a\s+prior\s+year"),
                       F("scholarships", "Box 5 Scholarships or grants", r"scholarships\s+or\s+grants")],
    "1098-E Student Loan Interest": [F("interest", "Box 1 Student loan interest received by lender", r"student\s+loan\s+interest\s+received")],
    "1098-C Vehicle Donation": [F("gross", "Box 4c Gross proceeds from sale", r"gross\s+proceeds\s+from\s+sale"),
                                F("fmv", "Fair market value", r"fair\s+market\s+value")],
    "1095-C": [F("employee_contribution", "Line 15 Employee required contribution (monthly)", r"employee\s+required\s+contribution")],
    "Health Insurance Premium Statement": [F("premium", "Premium", r"(?:monthly\s+|total\s+|annual\s+)?premium(?:\s+(?:amount|due|paid))?")] + GENERIC_TOTALS,
    "Schedule K-1 (1065)": [F("ordinary", "Box 1 Ordinary business income (loss)", r"ordinary\s+business\s+income"),
                            F("rental", "Box 2 Net rental real estate income", r"net\s+rental\s+real\s+estate\s+income"),
                            F("guaranteed", "Box 4 Guaranteed payments", r"guaranteed\s+payments"),
                            F("interest", "Box 5 Interest income", r"\binterest\s+income\b"),
                            F("dividends", "Box 6a Ordinary dividends", r"ordinary\s+dividends"),
                            F("se", "Box 14 Self-employment earnings", r"self-?employment\s+earnings"),
                            F("distributions", "Box 19 Distributions", r"\bdistributions\b")],
    "Schedule K-1 (1120-S)": [F("ordinary", "Box 1 Ordinary business income (loss)", r"ordinary\s+business\s+income"),
                              F("rental", "Box 2 Net rental real estate income", r"net\s+rental\s+real\s+estate\s+income"),
                              F("interest", "Box 4 Interest income", r"\binterest\s+income\b"),
                              F("dividends", "Box 5a Ordinary dividends", r"ordinary\s+dividends"),
                              F("distributions", "Box 16 Distributions", r"\bdistributions\b")],
    "Schedule K-1 (1041)": [F("interest", "Box 1 Interest income", r"\binterest\s+income\b"),
                            F("dividends", "Box 2a Ordinary dividends", r"ordinary\s+dividends"),
                            F("st_gain", "Box 3 Net short-term capital gain", r"net\s+short-?term\s+capital\s+gain"),
                            F("lt_gain", "Box 4a Net long-term capital gain", r"net\s+long-?term\s+capital\s+gain")],
    "Form 1040 Return": [F("filing_status", "Filing status", r"filing\s+status\s*:?", "text"),
                         F("agi", "Adjusted gross income", r"adjusted\s+gross\s+income"),
                         F("taxable", "Taxable income", r"taxable\s+income"),
                         F("total_tax", "Total tax", r"\btotal\s+tax\b"),
                         F("withheld", "Federal income tax withheld", r"federal\s+income\s+tax\s+withheld"),
                         F("refund", "Refund", r"amount\s+you\s+want\s+refunded|refunded\s+to\s+you|\boverpaid\b|\brefund\b"),
                         F("owed", "Amount you owe", r"amount\s+you\s+owe")],
    "Tax Return Transcript": [F("agi", "Adjusted gross income", r"adjusted\s+gross\s+income"), F("taxable", "Taxable income", r"taxable\s+income"),
                              F("total_tax", "Total tax", r"\btotal\s+tax\b"), F("refund", "Refund", r"refund\s+amount|amount\s+refunded")],
    "State Tax Return": [F("agi", "State AGI / taxable income", r"adjusted\s+gross\s+income|taxable\s+income"),
                         F("refund", "Refund", r"\brefund\b"), F("owed", "Amount due", r"amount\s+(?:you\s+)?(?:owe|due)")],
    "IRS Notice": [F("amount_due", "Amount due", r"amount\s+(?:due|you\s+owe)"),
                   F("notice", "Notice number", r"\b(CP\s?\d{2,4}[A-Z]?|LTR\s?\d{3,4}[A-Z]?|Letter\s+\d{3,4}[A-Z]?)\b", "raw"),
                   F("period", "Tax year / period", r"tax\s+(?:year|period)(?:\s+ending)?\s*:?\s*(?:[A-Za-z]+\.?\s+\d{1,2},?\s+)?(20\d\d)", "raw")],
    "Property Tax Bill": [F("total", "Total amount due / total tax", r"total\s+(?:amount\s+)?(?:due|tax(?:es)?(?:\s+due)?)|amount\s+due"),
                          F("inst1", "First installment", r"(?:1st|first)\s+installment"), F("inst2", "Second installment", r"(?:2nd|second)\s+installment"),
                          F("assessed", "Assessed value", r"(?:total\s+)?(?:net\s+)?assessed\s+value", "number"),
                          F("land", "Land value", r"\bland\b(?:\s+value)?", "number"), F("improvements", "Improvements value", r"improvements?(?:\s+value)?", "number"),
                          F("parcel", "Parcel / APN", r"parcel\s+(?:no\.?|number|id)\s*:?\s*([A-Z0-9][A-Z0-9\-]{3,})|\bapn\b\s*:?\s*([A-Z0-9][A-Z0-9\-]{3,})", "raw")],
    "Insurance Premium": [F("premium", "Premium", r"(?:total\s+|annual\s+|policy\s+)?premium(?:\s+(?:amount|due|total))?"),
                          F("policy_period", "Policy period", r"policy\s+period\s*:?", "text"),
                          F("dwelling", "Dwelling coverage", r"dwelling(?:\s+coverage)?")] + GENERIC_TOTALS,
    "HOA Statement": [F("dues", "Dues / assessment", r"(?:quarterly|monthly|annual|special)?\s*(?:assessments?|dues)(?:\s+amount)?")] + GENERIC_TOTALS,
    "Depreciation Schedule": [F("basis", "Cost or other basis", r"cost\s+or\s+(?:other\s+)?basis|depreciable\s+basis|basis\s+for\s+depreciation"),
                              F("land", "Land value", r"\bland\b(?:\s+value)?"),
                              F("business_use", "Business / rental use %", r"(?:business|rental)(?:/\w+)?\s+use", "pct"),
                              F("prior", "Prior depreciation", r"prior\s+(?:years?'?\s+)?depreciation|accumulated\s+depreciation|depreciation\s+allowed"),
                              F("current", "Current-year depreciation", r"(?:current|this)\s+year'?s?\s+depreciation|depreciation\s+deduction|20\d\d\s+depreciation"),
                              F("method", "Method", r"\bmethod\s*:?", "text"), F("recovery", "Recovery period", r"recovery\s+period\s*:?", "text"),
                              F("convention", "Convention", r"\bconvention\s*:?", "text"),
                              F("in_service", "Placed in service", r"(?:date\s+)?placed\s+in\s+service|in-?service\s+date", "date")],
    "Rental Income Statement": [F("rent", "Rent income / received", r"rent(?:al)?\s+(?:income|received|collected)|total\s+income"),
                                F("mgmt_fee", "Management fee", r"management\s+fee"),
                                F("repairs", "Repairs / maintenance", r"repairs?(?:\s+(?:and|&)\s+maintenance)?|maintenance"),
                                F("disbursement", "Owner disbursement", r"owner\s+(?:disbursement|distribution|payment|proceeds)|net\s+to\s+owner")],
    "Lease Agreement": [F("rent", "Monthly rent", r"(?:monthly\s+)?rent(?:\s+(?:shall\s+be|of|amount|is))?"),
                        F("deposit", "Security deposit", r"security\s+deposit"),
                        F("term_start", "Lease start", r"(?:commenc\w+|begin\w*|start\w*)\s+(?:on\s+)?", "date")],
    "Rent Receipt": [F("rent", "Rent received", r"rent(?:\s+(?:received|payment|paid|for))?|received\s+from")],
    "Donation Receipt": [F("amount", "Donation amount", r"(?:donation|contribution|gift)\s+(?:of|amount|total|in\s+the\s+amount\s+of)|amount\s+(?:of\s+)?(?:donation|contribution|gift)|total\s+(?:donation|contribution)s?"),
                         F("fmv", "Fair market value (non-cash)", r"fair\s+market\s+value|estimated\s+value"),
                         F("date", "Donation date", r"(?:received|donated|dated?|contribution\s+date|donation\s+date)\s*(?:on)?\s*:?", "date")] + GENERIC_TOTALS,
    "Medical Bill": [F("patient_resp", "Patient responsibility / amount you owe", r"patient\s+(?:responsibility|balance|portion)|amount\s+you\s+owe|you\s+owe|your\s+responsibility"),
                     F("paid", "Amount paid", r"amount\s+paid|payment\s+received")] + GENERIC_TOTALS,
    "Explanation of Benefits": [F("patient_resp", "Patient responsibility", r"patient\s+(?:responsibility|balance|portion)|member\s+responsibility|you\s+(?:may\s+)?owe"),
                                F("billed", "Amount billed", r"amount\s+billed|billed\s+amount|total\s+charges"),
                                F("plan_paid", "Plan paid", r"plan\s+paid|insurance\s+paid|we\s+paid")],
    "Vehicle Registration": [F("vlf", "Vehicle license fee (value-based, deductible part)", r"vehicle\s+license\s+fee|\bvlf\b|license\s+fee"),
                             F("reg_fee", "Registration fee", r"registration\s+fee")] + GENERIC_TOTALS,
    "Childcare Statement": [F("paid", "Total paid", r"total\s+(?:tuition\s+)?paid|total\s+(?:fees|payments)|amount\s+paid|payments?\s+received")] + GENERIC_TOTALS,
    "Student Account Statement": [F("paid", "Payments", r"payments?(?:\s+received)?|total\s+paid"), F("tuition", "Tuition and fees", r"tuition(?:\s+and\s+fees)?")] + GENERIC_TOTALS,
    "Energy Improvement Receipt": [F("installed", "Installation date", r"install\w*\s+(?:date|on)\s*:?", "date")] + GENERIC_TOTALS,
    "Clean Vehicle Purchase": [F("price", "Purchase / sales price", r"(?:total\s+)?(?:purchase|sales?|vehicle)\s+price|\bmsrp\b|total\s+(?:cash\s+)?price|amount\s+financed"),
                               F("credit", "Credit amount / transferred", r"(?:clean\s+vehicle\s+)?credit(?:\s+amount)?|credit\s+transferred"),
                               F("date", "Date of sale", r"date\s+of\s+(?:sale|purchase|delivery)|sale\s+date|purchase\s+date", "date")],
    "1040-ES Voucher": [F("amount", "Amount of estimated tax", r"amount\s+of\s+(?:estimated\s+tax|payment)|amount\s+(?:paid|enclosed)|payment\s+amount"),
                        F("quarter", "Voucher / quarter", r"voucher\s*#?\s*(\d)|(\d)(?:st|nd|rd|th)\s+(?:quarter|installment|payment)", "raw"),
                        F("due", "Due date", r"\bdue\b\s*(?:date|by|on)?\s*:?", "date")],
    "Estimated Tax Payment Confirmation": [F("amount", "Payment amount", r"(?:payment|total)\s+amount|amount\s+(?:paid|of\s+payment)|you\s+paid"),
                                           F("date", "Payment date", r"(?:payment|scheduled|effective|processed|submitted|confirmation)\s+(?:date|on)|date\s+(?:of\s+payment|paid)", "date"),
                                           F("period", "Tax period / year", r"tax\s+(?:period|year)\s*:?", "text"),
                                           F("type", "Reason / payment type", r"(?:reason\s+for\s+payment|payment\s+type|apply\s+payment\s+to)\s*:?", "text")],
    "Pay Stub": [F("ytd_gross", "YTD gross pay", r"(?:ytd|year-?to-?date)\s+gross|gross\s+(?:pay|earnings)\s+ytd"),
                 F("ytd_fed", "YTD federal withholding", r"(?:ytd|year-?to-?date)\s+(?:federal|fed)\s+(?:income\s+tax|withholding|w/?h)"),
                 F("gross", "Gross pay (this period)", r"gross\s+pay"), F("net", "Net pay", r"net\s+pay"),
                 F("pay_date", "Pay date", r"pay\s+date\s*:?", "date")],
    "Profit and Loss": [F("income", "Total income", r"total\s+(?:income|revenue|sales)"), F("cogs", "Cost of goods sold", r"cost\s+of\s+goods\s+sold"),
                        F("expenses", "Total expenses", r"total\s+(?:operating\s+)?expenses"), F("net", "Net income / profit", r"net\s+(?:operating\s+)?(?:income|profit|loss)")],
    "Mileage Log": [F("miles", "Total business miles", r"total\s+(?:business\s+)?miles(?:\s+driven)?|business\s+miles(?:\s+total)?", "number"),
                    F("total_miles", "Total miles (all)", r"total\s+miles\s+(?:driven|all)|odometer", "number")],
    "Payment App Statement": [F("gross", "Gross payments received", r"gross\s+(?:payments|sales|amount|volume)|total\s+(?:received|payments|sales)|payments\s+received"),
                              F("fees", "Fees", r"\bfees\b(?:\s+(?:total|charged))?"), F("net", "Net", r"\bnet\s+(?:amount|payments|total)")],
    "Unemployment Statement": [F("total", "Total benefits paid", r"total\s+(?:benefits\s+)?paid|benefits\s+paid|total\s+payments"),
                               F("withheld", "Federal tax withheld", r"federal\s+(?:income\s+)?tax\s+withheld")],
    "Bank Statement": [F("interest", "Interest paid / earned (period or YTD)", r"interest\s+(?:paid|earned)(?:\s+(?:this\s+)?(?:period|year|ytd))?|ytd\s+interest")],
    "Credit Card Statement": [F("interest", "Interest charged", r"(?:total\s+)?interest\s+charged|interest\s+charge")],
    "Loan Statement": [F("interest", "Interest paid (YTD)", r"(?:ytd\s+)?interest\s+paid"), F("balance", "Balance", r"(?:current\s+|principal\s+)?balance")],
    "Closing Disclosure": [F("sale_price", "Sale price", r"sale\s+price"), F("loan", "Loan amount", r"loan\s+amount"),
                           F("closing_costs", "Total closing costs", r"total\s+closing\s+costs"), F("cash_to_close", "Cash to close", r"cash\s+to\s+close"),
                           F("closing_date", "Closing date", r"closing\s+date", "date")],
}
BILL_TYPES = {"Electric Bill", "Gas Bill", "Water Bill", "Internet Bill", "Phone Bill", "Repair Invoice", "Invoice", "Receipt",
              "HOA Statement", "Insurance Premium", "Health Insurance Premium Statement", "Medical Bill", "Energy Improvement Receipt",
              "Property Tax Bill", "Childcare Statement", "Student Account Statement", "Donation Receipt", "Rent Receipt",
              "Unemployment Statement", "Vehicle Registration"}
for _t in ("Electric Bill", "Gas Bill", "Water Bill", "Internet Bill", "Phone Bill", "Repair Invoice", "Invoice", "Receipt"):
    FIELDS[_t] = [F("usage", "Usage", r"\b(?:usage|consumption)\b\s*:?", "text")] + GENERIC_TOTALS if _t in ("Electric Bill", "Gas Bill", "Water Bill") else list(GENERIC_TOTALS)
FIELDS["W-2c"] = FIELDS["W-2"]

PRIMARY: Dict[str, List[str]] = {
    "W-2": ["wages"], "W-2c": ["wages"], "W-2G": ["winnings"], "1099-NEC": ["nec"], "1099-MISC": ["rents", "royalties", "other_income"],
    "1099-K": ["gross"], "1099-INT": ["interest"], "1099-DIV": ["ordinary"], "1099-B": ["proceeds"], "Consolidated 1099": ["ordinary", "interest", "proceeds"],
    "1099-OID": ["oid"], "1099-DA": ["proceeds"], "Crypto Tax Statement": ["gain", "proceeds"], "1099-R": ["gross"], "SSA-1099": ["net"],
    "RRB-1099": ["net"], "1099-G": ["unemployment", "refund"], "1099-C": ["discharged"], "1099-Q": ["gross"], "1099-S": ["proceeds"],
    "1099-LTC": ["gross"], "1099-PATR": ["patronage"], "1095-A": ["annual_a"], "1099-SA HSA Distributions": ["gross"], "5498 IRA Contributions": ["ira", "roth"],
    "5498-SA HSA Contributions": ["total"], "1098 Mortgage Interest": ["interest"], "Mortgage Statement": ["ytd_interest"],
    "1098-T Tuition": ["payments"], "1098-E Student Loan Interest": ["interest"], "1098-C Vehicle Donation": ["gross", "fmv"],
    "Health Insurance Premium Statement": ["premium", "total_due", "amount_due", "total"], "Schedule K-1 (1065)": ["ordinary"],
    "Schedule K-1 (1120-S)": ["ordinary"], "Schedule K-1 (1041)": ["interest"], "Form 1040 Return": ["agi"], "Tax Return Transcript": ["agi"],
    "State Tax Return": ["agi"], "IRS Notice": ["amount_due"], "Property Tax Bill": ["total", "inst1"], "Insurance Premium": ["premium", "total_due", "total"],
    "HOA Statement": ["dues", "total_due", "amount_due", "total"], "Depreciation Schedule": ["current"], "Rental Income Statement": ["rent"],
    "Lease Agreement": ["rent"], "Rent Receipt": ["rent"], "Donation Receipt": ["amount", "fmv", "total"], "Medical Bill": ["patient_resp", "paid", "total_due", "amount_due", "total"],
    "Explanation of Benefits": ["patient_resp"], "Vehicle Registration": ["vlf", "total_due", "total"], "Childcare Statement": ["paid", "total"],
    "Student Account Statement": ["paid", "tuition"], "Clean Vehicle Purchase": ["price"], "1040-ES Voucher": ["amount"],
    "Estimated Tax Payment Confirmation": ["amount"], "Pay Stub": ["ytd_gross"], "Profit and Loss": ["net", "income"], "Mileage Log": ["miles"],
    "Payment App Statement": ["gross"], "Unemployment Statement": ["total"], "Closing Disclosure": ["sale_price", "closing_costs"],
}
GENERIC_PRIMARY = ["total_due", "amount_due", "total_paid", "balance_due", "grand_total", "total", "current_charges"]
MONTHLY_TYPES = {"Electric Bill", "Gas Bill", "Water Bill", "Internet Bill", "Phone Bill", "Mortgage Statement", "Rental Income Statement",
                 "Bank Statement", "Credit Card Statement", "Payment App Statement", "Health Insurance Premium Statement", "Rent Receipt"}
INFO_RETURN_RE = re.compile(r"^(W-2|1099|1098|1095|5498|Schedule K-1|SSA-1099|RRB-1099|Consolidated 1099)")

# Questions only the taxpayer can answer, per section (printed when the section has documents) -----------------
QUESTIONS: Dict[str, List[str]] = {
    "filing": ["Filing status for the year (single, married filing jointly/separately, head of household, qualifying surviving spouse)?",
               "Who is on the return: you, a spouse, dependents (names and relationship only; the tax pro takes SSNs and birth dates from the documents)?",
               "Address on the return and state(s) lived or worked in during the year; any move during the year?",
               "Can anyone else claim you (or your spouse) as a dependent? Does anyone on the return have an IP PIN (never write the PIN here)?",
               "Refund by direct deposit? (Say yes/no only; keep account numbers out of this file.)"],
    "work": ["For each self-employment activity: what the work is, when it started, sole proprietorship or LLC, cash or accrual accounting?",
             "Any income that did not come on a 1099 (cash, checks, Venmo/Zelle/PayPal goods-and-services payments)? Amount per activity.",
             "Home office: square feet used exclusively for the business and total square feet of the home?",
             "Vehicle: business miles, total miles for the year, commuting miles, and whether the mileage log is complete?",
             "Health insurance premiums paid personally while self-employed? Retirement contributions (SEP, SIMPLE, solo 401(k))?",
             "Equipment or furniture bought for the business (item, date, cost)? Any contractors you paid $600 or more (1099s issued)?",
             "Estimated tax payments made for this income (see Estimated Tax Payments)?"],
    "rental": ["Ownership share of each property (100%? co-owned with whom?) and whether you actively participate in managing it?",
               "Address of the property and of the rented unit; type (single-family, duplex, unit on the same lot, room in your home)?",
               "Days rented at fair rental value and days of personal use during the year? Vacant months?",
               "Monthly rent and the months it was received; any security deposit held (not income) or applied?",
               "How shared costs are split between the rental and the personal portion: square footage, number of occupants, or another basis, and the figures behind it?",
               "Depreciation: purchase price or basis, land value, date placed in service, prior depreciation (link the prior schedule), improvements made this year (item, date, cost)?",
               "Mortgage on the property (yes/no); if yes, the 1098 belongs in this section.",
               "Repairs vs. improvements this year; mileage or travel to the property; management company?"],
    "investments": ["Any sales not on a 1099-B (private sales, crypto wallet-to-wallet transfers, property)? Cost basis for noncovered securities?",
                    "Foreign accounts or assets (FBAR / Form 8938 thresholds)? Foreign tax paid?",
                    "Dividends reinvested? Margin interest paid? Capital loss carryover from last year's return?"],
    "retirement": ["IRA contributions made for the year (traditional or Roth, amount, and the date, including contributions made by the April deadline)?",
                   "Rollovers or Roth conversions? Any early distribution and the reason (exception)? Required minimum distributions taken?",
                   "Social Security: did anyone on the return receive benefits? Medicare premiums deducted from them?"],
    "healthcare": ["Who was covered by which plan in each month of the year (marketplace, employer, Medicare, Medicaid, none)?",
                   "For marketplace coverage: household size and whether income changes were reported to the marketplace during the year?",
                   "HSA: months eligible (HDHP, no other coverage), employer contributions (W-2 box 12 code W), and what distributions paid for?",
                   "Out-of-pocket medical, dental, vision, prescriptions and medical mileage totals (only matter if you itemize)?",
                   "Self-employed: premiums paid for yourself and family?"],
    "education": ["Who is the student (you, spouse, dependent) and what program; at least half-time? Year of study?",
                  "Books and supplies paid outside the school (amounts)? 529 distributions and what they paid for?",
                  "Education credits claimed in prior years (the American Opportunity credit is limited to four years)?"],
    "dependents": ["Each dependent's name, relationship, months lived with you, student status, and whether anyone else could claim them?",
                   "Childcare: provider name and address (the provider's tax ID is on the statement; do not copy it here), amount paid per child, and the reason care was needed (work, school)?",
                   "Dependent-care FSA through work (W-2 box 10)?"],
    "home": ["Do you expect to itemize (mortgage interest + property tax + donations + medical above the threshold) or take the standard deduction?",
             "Mortgage: was any of it a refinance or cash-out not used on the home? Points paid? Mortgage insurance?",
             "Property tax: the personal share (the rental share goes under Rental Property). Energy improvements (what, when, cost, manufacturer certification)?",
             "Did you sell a home this year (dates owned and lived in it, sale price, selling costs, basis)?"],
    "other-income": ["Unemployment received and any repaid? Did you itemize last year (affects whether a state refund is taxable)?",
                     "Gambling losses up to winnings (records)? Cancelled debt and whether you were insolvent? Jury duty pay turned over to an employer?",
                     "Alimony received (and the date of the divorce agreement)? Prizes, awards, hobby income, rental of personal items?"],
    "estimated": ["Each federal and state estimated payment: date, amount, confirmation (attach or link the confirmation)? Was a Q4 payment made in January?",
                  "Was last year's refund applied to this year's estimates? Any payment made with an extension?"],
    "misc-deductions": ["Cash donations by organization with dates (acknowledgment letters needed for $250 or more)?",
                        "Non-cash donations: items, condition, fair market value, date, organization (Form 8283 above $500; appraisal above $5,000)?",
                        "Vehicle registration: the value-based part (e.g., California VLF)? State income tax paid with last year's return or balance due?",
                        "Educator expenses, alimony paid (and agreement date), gambling losses, casualty losses in a federally declared disaster?"],
    "misc-credits": ["Clean vehicle bought: make/model, date, price, was the credit transferred to the dealer (the VIN is in the seller report; do not copy it here)?",
                     "Home EV charger installed? Adoption expenses? Anyone 65+ or disabled on the return (credit for the elderly or disabled)?"],
    "prior-year": ["Last year's AGI (needed to e-file) and whether the return was filed on time, amended, or is still open?",
                   "Carryovers from last year: capital loss, passive activity (rental) losses, charitable contributions, net operating loss, foreign tax credit, AMT credit?",
                   "Any IRS or state notices received this year?"],
}


# --------------------------------------------------------------------------
# extraction
# --------------------------------------------------------------------------

def parse_amount(s: str) -> Optional[float]:
    neg = s.strip().startswith("(") or s.strip().startswith("-")
    digits = re.sub(r"[^\d.]", "", s)
    if not digits or digits == ".":
        return None
    try:
        v = float(digits)
    except ValueError:
        return None
    return -v if neg else v


def to_iso(m, kind: str) -> Optional[str]:
    g = m.groups()
    try:
        if kind == "ymd":
            y, mo, d = int(g[0]), int(g[1]), int(g[2])
        elif kind == "mdy":
            y = int(g[2]); y = y + 2000 if y < 100 else y
            mo, d = int(g[0]), int(g[1])
        elif kind == "Mdy":
            y, mo, d = int(g[2]), MONTHS[g[0].lower()[:3]], int(g[1])
        else:
            y, mo, d = int(g[2]), MONTHS[g[1].lower()[:3]], int(g[0])
        return datetime(y, mo, d).strftime("%Y-%m-%d")
    except (ValueError, KeyError):
        return None


def first_date(text: str) -> Optional[str]:
    for rx, kind in DATE_RES:
        m = rx.search(text)
        if m:
            iso = to_iso(m, kind)
            if iso:
                return iso
    return None


def find_field(text: str, pattern: str, kind: str, window: int = 90,
               stop_patterns: Optional[List[str]] = None) -> Optional[Tuple[str, str]]:
    """Return (value, snippet) for the first label occurrence followed (or, on forms, preceded) by a value.
    Text values end where the next known label of the same document type begins."""
    for m in re.finditer(pattern, text, re.I):
        if kind == "raw":
            groups = [g for g in m.groups() if g]
            if groups:
                return groups[0].strip(), snippet_at(text, m.start(), m.end())
            continue
        tail = text[m.end(): m.end() + window]
        cut = NEXT_BOX_RE.search(tail, 1)
        if cut:
            tail = tail[: cut.start()]
        value = None
        if kind == "amount":
            v = AMOUNT_RE.search(tail)
            if v:
                value = v.group(0).strip()
            else:  # value printed above the box label (common on W-2 / 1099 layouts)
                head = text[max(0, m.start() - 45): m.start()]
                v2 = re.search("(?:%s)\\s*$" % AMOUNT, head)
                if v2:
                    value = v2.group(0).strip()
        elif kind == "number":
            # same line only; a label with no number on its line (a column header) is skipped in favour of the
            # next occurrence ("Total business miles 2025   46.8")
            same_line = tail.split("\n", 1)[0]
            nums = [n.group(0) for n in NUMBER_RE.finditer(same_line)]
            nums = [n for n in nums if not re.fullmatch(r"(?:19|20)\d\d", n)]  # "Total miles 2025" -> not the year
            value = nums[0] if nums else None
        elif kind == "pct":
            v = PCT_RE.search(tail)
            value = v.group(0) if v else None
        elif kind == "code":
            v = CODE_RE.search(tail.replace(":", " "))
            value = v.group(1) if v else None
        elif kind == "date":
            value = first_date(tail)
        elif kind == "text":
            line = tail.split("\n", 1)[0].strip(" :-")
            line = re.split(r"\s{2,}|\t|\s[|;]\s|\s\u00b7\s", line, maxsplit=1)[0].strip(" :-")
            for sp in stop_patterns or []:
                cut2 = re.search(sp, line, re.I)
                if cut2 and cut2.start() > 0:
                    line = line[: cut2.start()].strip(" :-,")
            value = line[:70] if re.search(r"\w", line) else None
        if value:
            return value, snippet_at(text, m.start(), m.end())
    return None


def snippet_at(text: str, start: int, end: int) -> str:
    s = text[max(0, start - 30): min(len(text), end + 70)]
    return re.sub(r"\s+", " ", s).strip()


def extract_fields(doc_type: str, text: str) -> "OrderedDict[str, Dict]":
    specs = list(FIELDS.get(doc_type, []))
    if not specs and doc_type not in ("Unknown",) and not INFO_RETURN_RE.match(doc_type or ""):
        specs = list(GENERIC_TOTALS)
    found: "OrderedDict[str, Dict]" = OrderedDict()
    others = [pat for _k, _l, pat, _kind in specs]
    for key, label, pattern, kind in specs:
        if key in found:
            continue
        hit = find_field(text, pattern, kind, stop_patterns=[pat for pat in others if pat != pattern])
        if hit:
            value, snippet = hit
            number = parse_amount(value) if kind in ("amount", "number") else None
            if (key, label, pattern, kind) in GENERIC_TOTALS and number is not None and any(
                    f.get("number") == number for f in found.values()):
                continue  # the generic "Total" repeats a labelled amount already captured
            found[key] = {"label": label, "value": value, "kind": kind, "number": number, "snippet": snippet}
    if doc_type == "1095-A":
        found.update(extract_1095a(text))
    return found


def extract_1095a(text: str) -> Dict[str, Dict]:
    out: Dict[str, Dict] = {}
    m = re.search(r"annual\s+totals?\s*[:\-]?\s*(%s)\s+(%s)\s+(%s)" % (AMOUNT, AMOUNT, AMOUNT), text, re.I)
    if m:
        for key, label, g in (("annual_a", "Line 33 annual total, column A (monthly enrollment premiums)", 1),
                              ("annual_b", "Line 33 annual total, column B (SLCSP premium)", 2),
                              ("annual_c", "Line 33 annual total, column C (advance payment of PTC)", 3)):
            out[key] = {"label": label, "value": m.group(g), "kind": "amount", "number": parse_amount(m.group(g)), "snippet": snippet_at(text, m.start(), m.end())}
    months = []
    for mm in re.finditer(r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(%s)\s+(%s)\s+(%s)" % (AMOUNT, AMOUNT, AMOUNT), text, re.I):
        a = parse_amount(mm.group(2))
        if a:
            months.append(mm.group(1).title())
    if months:
        out["months_covered"] = {"label": "Months with an enrollment premium", "value": ", ".join(months), "kind": "text", "number": None,
                                 "snippet": "%d month(s)" % len(months)}
    return out


def primary_amount(doc_type: str, fields: Dict) -> Optional[Dict]:
    for key in PRIMARY.get(doc_type, []) + GENERIC_PRIMARY:
        f = fields.get(key)
        if f and f.get("number") is not None:
            return {"key": key, "label": f["label"], "number": f["number"], "kind": f.get("kind", "amount")}
    return None


# --------------------------------------------------------------------------
# section routing
# --------------------------------------------------------------------------

def route(doc: Dict, tc) -> Tuple[str, str]:
    """(section key or special group, sub-group label) for a document, from the folder it sits in, else its category."""
    folder = doc.get("folder") or ""
    cat = doc.get("category") or ""
    dt = doc.get("doc_type") or ""
    norm = tc.normalize_folder(folder) if folder else ""
    if not norm or norm not in {tc.normalize_folder(n) for n in tc.TAXONOMY_FOLDERS}:
        if folder and doc.get("status") != "unsorted":
            return "custom:" + folder, ""
        norm = tc.normalize_folder(cat) if cat else ""
    prop = doc.get("property")
    biz = doc.get("business")
    if norm == "income - rental":
        return "rental", prop or "Property not identified"
    if norm == "income - self-employment":
        return "work", ("Self-employment: %s" % biz) if biz else "Self-employment (business not identified)"
    if norm == "income - wages":
        return "work", "W-2 wages"
    if norm == "income - partnerships and s-corps":
        return "work", "Partnerships & S-corps (K-1)"
    if norm == "income - investments":
        return "investments", ""
    if norm == "income - retirement":
        return "retirement", ""
    if norm == "retirement and hsa":
        return ("healthcare", "HSA") if "SA" in dt and "HSA" in dt else ("retirement", "IRA contributions")
    if norm == "regulations - health insurance":
        return "healthcare", "Coverage and premiums"
    if norm == "credits":
        if dt in ("1098-T Tuition", "Student Account Statement"):
            return "education", ""
        if dt == "Childcare Statement":
            return "dependents", "Childcare"
        if dt == "Energy Improvement Receipt":
            return "home", "Energy improvements"
        return "misc-credits", ""
    if norm == "deductions":
        if dt in ("1098 Mortgage Interest", "Mortgage Statement", "Property Tax Bill"):
            return "home", ""
        if dt == "1098-E Student Loan Interest":
            return "education", ""
        if dt in ("Medical Bill", "Explanation of Benefits"):
            return "healthcare", "Medical expenses"
        return "misc-deductions", ""
    if norm == "income - other":
        return "other-income", ""
    if norm == "estimated tax payments":
        return "estimated", ""
    if norm == "_last year's return":
        return "prior-year", ""
    if norm == "_this year's return":
        return "filing", "This year's return"
    if norm == "_proof of identity":
        return "filing", "Identity documents"
    if norm == "records - statements":
        return "records", ""
    if norm == "_needs human review":
        return "review", ""
    if norm == "zz_duplicates":
        return "duplicates", ""
    return ("unsorted", "") if doc.get("status") == "unsorted" else ("custom:" + (folder or cat or "?"), "")


# --------------------------------------------------------------------------
# gathering
# --------------------------------------------------------------------------

def top_folder(path: Path, root: Path, folder_in: Path, out: Path) -> str:
    """The taxonomy folder a file sits in: first path component under the output root, the sibling folder's name
    for app-placed files, or "" for files still in the inbox."""
    try:
        relp = path.resolve().relative_to(root.resolve())
    except ValueError:
        return ""
    if root.resolve() == out.resolve():
        return relp.parts[0] if len(relp.parts) > 1 else ""
    if root.resolve() == folder_in.resolve():
        return ""
    return root.name


def analyse_unprocessed(unprocessed: List[Dict], work: Path, extracted: Dict, cfg: Dict, target_year: Optional[int], tc) -> None:
    """Read files the classification skill has not seen, with its own extraction + classification code (no moves)."""
    try:
        import inventory as inv  # type: ignore
        import extract_text as et  # type: ignore
        import classify as cl  # type: ignore
    except Exception as exc:
        warn("cannot import the classification scripts (%s); %d file(s) stay unprocessed" % (exc, len(unprocessed)))
        return
    for sub in ("", "text", "pages", "attachments"):
        (work / sub).mkdir(parents=True, exist_ok=True)
    vision_log = load_json(work / "vision.json", {}) or {}
    for i, doc in enumerate(unprocessed, 1):
        p = Path(doc["path"])
        stem = p.stem
        f = {"path": str(p), "rel": p.name, "name": p.name, "ext": p.suffix.lower(), "kind": inv.kind_of(p.suffix.lower()),
             "size": p.stat().st_size, "hash": doc["hash"], "name_quality": tc.name_quality(stem),
             "filename_hints": inv.filename_hints(stem), "duplicate_of": None, "processed_dest": None}
        sys.stderr.write("  reading [%d/%d] %s ... " % (i, len(unprocessed), p.name))
        rec = extracted.get(doc["hash"])
        if not rec or rec.get("error") or not Path(rec.get("text_file", "")).exists():
            rec = et.extract_one(f, work, 6, 200, False)
            text = tc.mask_pii(rec.pop("_text"))
            text_path = work / "text" / (doc["hash"] + ".txt")
            text_path.write_text(text, encoding="utf-8")
            rec["text_file"] = str(text_path)
            extracted[doc["hash"]] = rec
            save_json(work / "extracted.json", extracted)
        text = Path(rec["text_file"]).read_text(encoding="utf-8", errors="ignore")
        item = cl.classify_file(f, rec, text[:12000], cfg, target_year, vision_log)
        for k in ("doc_type", "category", "entity", "issuer", "property", "business", "tax_year", "date", "dates", "when_style",
                  "confidence", "notes", "addresses", "issuer_candidates"):
            doc[k] = item.get(k)
        doc.update({"method": rec.get("method"), "quality": rec.get("quality"), "needs_vision": bool(rec.get("needs_vision")),
                    "page_images": rec.get("page_images", []), "text_file": rec.get("text_file"), "source": "analysis"})
        sys.stderr.write("%s (%s, %s)\n" % (doc["doc_type"], rec.get("method"), rec.get("quality")))


def parse_dest_name(name: str, tc) -> Dict:
    """'W-2 - Acme Corporation - 2025 (scan.pdf).pdf' -> doc_type, entity, when, orig_name (fallback when no record exists)."""
    stem = Path(name).stem
    desc, orig = tc.split_original(stem)
    parts = [p.strip() for p in desc.split(" - ")]
    info: Dict = {"orig_name": orig or name}
    if len(parts) >= 2:
        info["doc_type"] = parts[0]
        when = parts[-1] if re.fullmatch(r"\d{4}(-\d{2}){0,2}", parts[-1]) else None
        if when:
            info["date"] = when if len(when) > 4 else None
            info["tax_year"] = int(when[:4])
            middle = parts[1:-1]
        else:
            middle = parts[1:]
        if middle:
            info["entity"] = " - ".join(middle)
    elif parts and parts[0] in tc.DOC_TYPES:
        info["doc_type"] = parts[0]
    return info


def gather(args) -> Dict:
    tc = sibling()
    if tc is None:
        die("the tax-document-classification skill must be installed next to this one (%s)" % Path(__file__).resolve().parents[2])
    paths = resolve(args.folder, args.summaries)
    folder, out, work, swork, roots = paths["folder"], paths["out"], paths["work"], paths["swork"], paths["roots"]
    summaries_path: Path = paths["summaries"]
    swork.mkdir(parents=True, exist_ok=True)

    moves, runs = tc.load_manifest(work) if work.exists() else ([], [])
    by_dest: Dict[str, Dict] = {}
    by_hash_move: Dict[str, Dict] = {}
    for m in moves:
        by_dest[str(Path(m["dest"]).resolve())] = m
        by_hash_move[m["hash"]] = m
    plan = load_json(work / "plan.json", {}) or {}
    plan_by_hash = {it["hash"]: it for it in plan.get("items", []) if it.get("hash")}
    extracted = load_json(work / "extracted.json", {}) or {}
    cfg = load_json(work / "config.json", {}) or {}
    cfg.setdefault("properties", {}); cfg.setdefault("businesses", {}); cfg.setdefault("min_confidence", 0.75)
    vision_log = load_json(work / "vision.json", {}) or {}

    existing_text = summaries_path.read_text(encoding="utf-8", errors="ignore") if summaries_path.exists() else ""
    target_year = args.tax_year or cfg.get("tax_year") or cfg.get("tax_year_inferred")
    if not target_year and existing_text:
        header, _ = parse_summaries(existing_text)
        target_year = header_tax_year(header)

    docs: List[Dict] = []
    unprocessed: List[Dict] = []
    for root, p in iter_documents(roots, work):
        digest = tc.sha256_file(p)
        folder_name = top_folder(p, root, folder, out)
        status = "sorted"
        nf = tc.normalize_folder(folder_name) if folder_name else ""
        if nf == tc.normalize_folder(tc.REVIEW_FOLDER):
            status = "review"
        elif nf == tc.normalize_folder(tc.DUPLICATES_FOLDER):
            status = "duplicate"
        elif root.resolve() == folder.resolve() and not folder_name:
            status = "unsorted"
        move = by_dest.get(str(p.resolve())) or by_hash_move.get(digest)
        item = plan_by_hash.get(digest)
        rec = extracted.get(digest)
        doc: Dict = {"hash": digest, "path": str(p), "name": p.name, "root": str(root), "folder": folder_name, "status": status,
                     "link": rel_link(p, summaries_path.parent), "size": p.stat().st_size}
        desc, orig_inner = tc.split_original(p.stem)
        doc["display"] = desc if orig_inner else p.stem
        src = None
        if item:
            src = "plan"
            for k in ("doc_type", "category", "entity", "issuer", "property", "business", "tax_year", "date", "dates", "when_style",
                      "confidence", "notes", "addresses", "issuer_candidates", "vision"):
                doc[k] = item.get(k)
        if move:
            src = src or "manifest"
            for k in ("doc_type", "category", "entity", "property", "business", "tax_year", "date", "when_style", "confidence", "vision"):
                if doc.get(k) in (None, "", []) and move.get(k) not in (None, ""):
                    doc[k] = move[k]
            doc.setdefault("notes", [])
            if isinstance(doc["notes"], str):
                doc["notes"] = [doc["notes"]]
            if move.get("notes") and not doc["notes"]:
                doc["notes"] = [n.strip() for n in move["notes"].split(";") if n.strip()]
            doc["orig_name"] = move.get("orig_name") or orig_inner or p.name
            doc["manifest_status"] = move.get("status")
        else:
            doc["orig_name"] = orig_inner or p.name
        if rec:
            doc.update({"method": rec.get("method"), "quality": rec.get("quality"), "needs_vision": bool(rec.get("needs_vision")),
                        "page_images": rec.get("page_images", []), "text_file": rec.get("text_file")})
            src = src or "extracted"
        if not doc.get("doc_type"):
            doc.update({k: v for k, v in parse_dest_name(p.name, tc).items() if k not in doc or not doc.get(k)})
            if doc.get("doc_type"):
                src = src or "filename"
        doc["source"] = src
        if not rec or not doc.get("doc_type"):
            if status != "duplicate":
                unprocessed.append(doc)
        docs.append(doc)

    if unprocessed:
        sys.stderr.write("%d file(s) have not been processed by the classification skill; reading them now (nothing is moved):\n" % len(unprocessed))
        analyse_unprocessed(unprocessed, work, extracted, cfg, target_year, tc)
        for d in unprocessed:
            d["source"] = d.get("source") or "analysis"

    if not target_year:
        years = [d["tax_year"] for d in docs if d.get("tax_year") and INFO_RETURN_RE.match(d.get("doc_type") or "")]
        if years:
            target_year = Counter(years).most_common(1)[0][0]
    ty = int(target_year) if target_year else None

    # fields, primary amounts, tax-year membership, routing
    for d in docs:
        text = ""
        if d.get("text_file") and Path(d["text_file"]).exists():
            text = Path(d["text_file"]).read_text(encoding="utf-8", errors="ignore")[: args.max_chars]
        d["chars"] = len(text)
        dt = d.get("doc_type") or "Unknown"
        d["fields"] = extract_fields(dt, text) if text else OrderedDict()
        d["primary"] = primary_amount(dt, d["fields"])
        d["ocr"] = bool(d.get("method") and "ocr" in str(d.get("method"))) or (d.get("quality") not in (None, "good"))
        d["excerpt"] = re.sub(r"\s+", " ", tc.mask_pii(text))[:200]
        when_style = d.get("when_style") or tc.DOC_TYPES.get(dt, ("", "none"))[1]
        d["when_style"] = when_style
        if ty is None:
            d["in_tax_year"] = None
        elif when_style == "year":
            d["in_tax_year"] = (d.get("tax_year") == ty) if d.get("tax_year") else None
        elif d.get("date"):
            d["in_tax_year"] = d["date"][:4] == str(ty)
        elif d.get("tax_year"):
            d["in_tax_year"] = d["tax_year"] == ty
        else:
            d["in_tax_year"] = None
        sec, group = route(d, tc)
        props, bizs = list(cfg.get("properties", {})), list(cfg.get("businesses", {}))
        if sec == "rental" and group == "Property not identified":
            # a file already named by the classification skill carries its property in the name
            ent = parse_dest_name(d["name"], tc).get("entity") or ""
            if re.match(r"(?i)^(property|unit|rental|apt|apartment|house|duplex|condo)\b", ent) or re.search(r"\d+\s+[A-Za-z]", ent):
                group = ent
                d["property"] = ent
            elif len(props) == 1:
                group = props[0]
                d.setdefault("notes", []).append("assigned to the only property label, %s; confirm" % group)
        if sec == "work" and group == "Self-employment (business not identified)" and len(bizs) == 1:
            group = "Self-employment: %s" % bizs[0]
            d.setdefault("notes", []).append("assigned to the only business label, %s; confirm" % bizs[0])
        d["section"], d["group"] = sec, group
        d["referenced"] = bool(existing_text) and any(
            s and s in existing_text for s in (d["name"], d.get("orig_name"), d["link"], d["link"].replace("%20", " ")))

    # groups, totals, month coverage
    groups: Dict[str, Dict[str, List[Dict]]] = OrderedDict()
    for d in docs:
        groups.setdefault(d["section"], OrderedDict()).setdefault(d["group"], []).append(d)
    totals: List[Dict] = []
    coverage: List[Dict] = []
    for sec, gs in groups.items():
        if sec in ("duplicates", "review", "unsorted", "records") or sec.startswith("custom:"):
            continue
        for g, ds in gs.items():
            by_type: Dict[str, List[Dict]] = OrderedDict()
            for d in ds:
                by_type.setdefault(d.get("doc_type") or "Unknown", []).append(d)
            for dt, tds in by_type.items():
                in_ty = [d for d in tds if d["in_tax_year"] is True]
                nums = [d["primary"]["number"] for d in in_ty if d.get("primary")]
                kinds = {d["primary"]["kind"] for d in in_ty if d.get("primary")}
                totals.append({"section": sec, "group": g, "doc_type": dt, "count": len(tds), "in_tax_year": len(in_ty),
                               "outside": len([d for d in tds if d["in_tax_year"] is False]),
                               "undated": len([d for d in tds if d["in_tax_year"] is None]),
                               "with_amount": len(nums), "total": round(sum(nums), 2) if nums else None,
                               "kind": "number" if kinds == {"number"} else "amount",
                               "label": in_ty[0]["primary"]["label"] if nums and in_ty[0].get("primary") else None,
                               "ocr": any(d["ocr"] for d in in_ty)})
                if dt in MONTHLY_TYPES and ty and len(tds) >= 2:
                    months = sorted({d["date"][:7] for d in tds if d.get("date") and d["date"][:4] == str(ty)})
                    all_months = ["%d-%02d" % (ty, m) for m in range(1, 13)]
                    coverage.append({"section": sec, "group": g, "doc_type": dt, "months": months,
                                     "missing": [m for m in all_months if m not in months]})

    hints = build_hints(docs, groups, totals, coverage, ty, tc)
    labels = {"properties": cfg.get("properties", {}), "businesses": cfg.get("businesses", {})}
    existing = None
    if existing_text:
        header, sections = parse_summaries(existing_text)
        existing = {"path": str(summaries_path), "sections": [{"title": s.title, "key": s.key, "na": s.is_na} for s in sections],
                    "missing": [SECTION_BY_KEY[k][0] for k in SECTION_ORDER if k not in {s.key for s in sections if s.key}]}
    facts = {"generated": now_iso(), "folder": str(folder), "out": str(out), "work": str(work), "roots": [str(r) for r in roots],
             "summaries": str(summaries_path), "summaries_exists": summaries_path.exists(), "tax_year": ty,
             "tax_year_source": ("given" if args.tax_year else "classification config" if cfg.get("tax_year") or cfg.get("tax_year_inferred")
                                 else "Summaries.md header" if existing_text and header_tax_year(parse_summaries(existing_text)[0]) else "inferred from documents"),
             "labels": labels, "counts": {"documents": len(docs), "sorted": len([d for d in docs if d["status"] == "sorted"]),
                                          "review": len([d for d in docs if d["status"] == "review"]),
                                          "duplicates": len([d for d in docs if d["status"] == "duplicate"]),
                                          "unsorted": len([d for d in docs if d["status"] == "unsorted"]),
                                          "needs_vision": len([d for d in docs if d.get("needs_vision") and d["status"] != "duplicate"]),
                                          "ocr": len([d for d in docs if d["ocr"] and d["status"] != "duplicate"])},
             "documents": docs, "totals": totals, "coverage": coverage, "hints": hints, "existing": existing,
             "sorted_md": str(out / SORTED_FILENAME) if (out / SORTED_FILENAME).exists() else None}
    save_json(swork / "facts.json", facts)
    md = render_facts_md(facts, groups, tc)
    (swork / "facts.md").write_text(md, encoding="utf-8")
    return {"facts": facts, "md": md, "swork": swork}


def build_hints(docs, groups, totals, coverage, ty, tc) -> List[str]:
    hints: List[str] = []
    types = Counter(d.get("doc_type") for d in docs if d["status"] in ("sorted", "unsorted"))
    if types.get("1095-A"):
        hints.append("A 1095-A is present: Form 8962 (premium tax credit reconciliation) is required; state who was covered each month.")
    if types.get("1099-NEC") or types.get("1099-K"):
        biz_groups = [g for g in groups.get("work", {}) if g.startswith("Self-employment")]
        for g in biz_groups:
            ds = groups["work"][g]
            if not any((d.get("doc_type") or "") in ("Receipt", "Invoice", "Repair Invoice", "Mileage Log", "Profit and Loss", "Payment App Statement",
                                                     "Internet Bill", "Phone Bill", "Insurance Premium", "Bank Statement", "Credit Card Statement") for d in ds):
                hints.append("%s: income forms found but no expense records (receipts, mileage log, P&L); ask for them or state that there are none." % g)
        if not types.get("Estimated Tax Payment Confirmation") and not types.get("1040-ES Voucher"):
            hints.append("Self-employment income is present but no estimated-tax payment confirmations were found; ask whether estimates were paid.")
    for g, ds in groups.get("rental", {}).items():
        dts = {d.get("doc_type") for d in ds}
        if "Depreciation Schedule" not in dts:
            hints.append("Rental %s: no depreciation schedule found; the tax pro needs basis, land value, in-service date and prior depreciation (link last year's schedule)." % g)
        if not dts & {"Rental Income Statement", "Lease Agreement", "Rent Receipt", "1099-MISC"}:
            hints.append("Rental %s: no rent income record found; state the monthly rent and the months it was received." % g)
        if g == "Property not identified":
            hints.append("Rental documents without a property label: run classify.py with --property \"Label=address\" or assign them in the summary.")
    if not any((d.get("doc_type") or "") in ("Form 1040 Return", "Tax Return Transcript", "State Tax Return") for d in docs):
        hints.append("No prior-year return or transcript found; the tax pro usually asks for last year's return (AGI, carryovers).")
    for c in coverage:
        if c["missing"] and c["months"]:
            hints.append("%s / %s: documents found for %s; none for %s (a bill may cover two months; confirm the year is complete)." % (
                c["group"] or c["section"], c["doc_type"], ", ".join(c["months"]), ", ".join(c["missing"])))
    outside = [d for d in docs if d["in_tax_year"] is False and d["status"] in ("sorted", "unsorted")
               and d.get("section") != "prior-year" and d.get("doc_type") != "Depreciation Schedule"]
    if outside:
        hints.append("%d document(s) are dated outside tax year %s and are excluded from the totals: %s." % (
            len(outside), ty, "; ".join(d["display"] for d in outside[:8]) + (" …" if len(outside) > 8 else "")))
    undated = [d for d in docs if d["in_tax_year"] is None and d["status"] in ("sorted", "unsorted") and (d.get("doc_type") or "Unknown") != "Unknown"]
    if undated:
        hints.append("%d document(s) have no readable date or tax year; confirm they belong to %s: %s." % (
            len(undated), ty, "; ".join(d["display"] for d in undated[:8]) + (" …" if len(undated) > 8 else "")))
    vision = [d for d in docs if d.get("needs_vision") and d["status"] != "duplicate"]
    if vision:
        hints.append("%d document(s) could not be read as text; read their page images before quoting any number from them." % len(vision))
    review = [d for d in docs if d["status"] == "review"]
    if review:
        hints.append("%d file(s) are in %s and are not summarised until identified: %s." % (
            len(review), tc.REVIEW_FOLDER, "; ".join(d["name"] for d in review[:8])))
    unsorted = [d for d in docs if d["status"] == "unsorted"]
    if unsorted:
        hints.append("%d file(s) are still in the inbox (not sorted); they were read for this summary, but run the classification skill to file them." % len(unsorted))
    ocr_used = [t for t in totals if t["ocr"] and t["total"] is not None]
    if ocr_used:
        hints.append("Totals marked OCR include numbers read from scans; verify each against the page image before relying on them.")
    return hints


# --------------------------------------------------------------------------
# facts.md
# --------------------------------------------------------------------------

def fmt_field(f: Dict) -> str:
    if f.get("number") is not None and f.get("kind") == "amount":
        return "%s **%s**" % (f["label"], fmt_money(f["number"]))
    return "%s **%s**" % (f["label"], f["value"])


def doc_line(d: Dict, tc) -> str:
    bits = []
    quality = []
    if d.get("method"):
        quality.append(str(d["method"]).replace("pdf-", "").replace("image-", ""))
    if d.get("quality") and d["quality"] != "good":
        quality.append("quality %s" % d["quality"])
    if d.get("needs_vision"):
        quality.append("NEEDS VISION")
    if d.get("when_style") == "year":
        when = str(d["tax_year"]) if d.get("tax_year") else d.get("date")
    else:
        when = d.get("date") or (str(d.get("tax_year")) if d.get("tax_year") else None)
    head = "- [%s](%s)" % (d["display"], d["link"])
    if d.get("orig_name") and d["orig_name"] != d["name"] and d["orig_name"] not in d["name"]:
        head += " (was `%s`)" % d["orig_name"]
    meta = [x for x in (d.get("doc_type"), when, ", ".join(quality) if quality else None) if x]
    if d.get("in_tax_year") is False:
        meta.append("OUTSIDE TAX YEAR")
    elif d.get("in_tax_year") is None and d.get("doc_type") not in (None, "Unknown"):
        meta.append("no date read")
    head += " \u2014 " + " \u00b7 ".join(meta)
    bits.append(head)
    fields = [f for k, f in (d.get("fields") or {}).items() if k != "period" or f.get("value")]
    if fields:
        shown = "; ".join(fmt_field(f) for f in fields[:9])
        bits.append("  " + shown + ("  _(OCR \u2014 verify)_" if d.get("ocr") else ""))
    elif d.get("doc_type") not in (None, "Unknown") and d.get("chars"):
        bits.append("  _no amount recognised by the patterns; read the document_")
    if d.get("needs_vision") and d.get("page_images"):
        bits.append("  page images: " + ", ".join(d["page_images"][:4]))
    if d.get("addresses"):
        bits.append("  addresses: " + "; ".join(d["addresses"][:3]))
    notes = [n for n in (d.get("notes") or []) if n and not n.startswith("applied ")]
    if notes:
        bits.append("  notes: " + "; ".join(notes)[:220])
    return "\n".join(bits)


def render_facts_md(facts: Dict, groups: Dict, tc) -> str:
    L: List[str] = []
    ty = facts["tax_year"]
    c = facts["counts"]
    L.append("# Facts for %s \u2014 tax year %s" % (SUMMARIES_FILENAME, ty if ty else "unknown"))
    L.append("")
    L.append("- Documents: %d (%d sorted, %d in %s, %d duplicates ignored, %d still in the inbox) \u00b7 %d need AI vision \u00b7 %d read by OCR" % (
        c["documents"], c["sorted"], c["review"], tc.REVIEW_FOLDER, c["duplicates"], c["unsorted"], c["needs_vision"], c["ocr"]))
    L.append("- Summaries.md: `%s` (%s)" % (facts["summaries"], "exists" if facts["summaries_exists"] else "does not exist yet; summaries.py scaffold creates it"))
    L.append("- Document folders: %s" % ", ".join("`%s`" % r for r in facts["roots"]))
    L.append("- Tax year %s (%s)" % (ty if ty else "unknown \u2014 pass --tax-year", facts["tax_year_source"]))
    lab = facts["labels"]
    if lab.get("properties") or lab.get("businesses"):
        L.append("- Labels: properties %s; businesses %s" % (
            ", ".join("%s (%s)" % (k, " | ".join(v)) for k, v in lab.get("properties", {}).items()) or "none",
            ", ".join("%s (%s)" % (k, " | ".join(v)) for k, v in lab.get("businesses", {}).items()) or "none"))
    else:
        L.append("- Labels: none (if there are rentals or businesses, re-run classify.py with --property / --business so documents group by property or business)")
    if facts.get("sorted_md"):
        L.append("- File list: `%s`" % facts["sorted_md"])
    L.append("")
    L.append("Amounts below were read from the extracted text by label patterns; they are candidates, not verified figures. "
             "_(OCR \u2014 verify)_ marks text that came from a scan. Documents outside the tax year are listed but excluded from totals. "
             "Links are relative to the Summaries.md folder and can be pasted into the summary.")
    L.append("")

    totals_idx: Dict[Tuple[str, str], List[Dict]] = {}
    for t in facts["totals"]:
        totals_idx.setdefault((t["section"], t["group"]), []).append(t)
    cov_idx: Dict[Tuple[str, str], List[Dict]] = {}
    for cv in facts["coverage"]:
        cov_idx.setdefault((cv["section"], cv["group"]), []).append(cv)

    for key in SECTION_ORDER:
        if key == "open-items":
            continue
        gs = groups.get(key)
        title = SECTION_BY_KEY[key][0]
        if not gs:
            continue
        L.append("## %s" % title)
        L.append("")
        for g, ds in gs.items():
            if g:
                L.append("### %s" % g)
                L.append("")
            for d in sorted(ds, key=lambda x: ((x.get("doc_type") or ""), x.get("date") or "", x["name"])):
                L.append(doc_line(d, tc))
            L.append("")
            tl = totals_idx.get((key, g), [])
            tl_lines = []
            for t in tl:
                if t["total"] is not None:
                    shown = fmt_money(t["total"]) if t["kind"] == "amount" else ("%s (%s)" % (format(t["total"], ",.1f").rstrip("0").rstrip("."), t["label"]))
                    tl_lines.append("%s %s (%d of %d in TY%s%s)%s" % (
                        t["doc_type"], shown, t["with_amount"], t["count"], ty,
                        (", %d outside" % t["outside"]) if t["outside"] else "", " OCR" if t["ocr"] else ""))
                elif t["in_tax_year"] == 0 and t["outside"]:
                    tl_lines.append("%s: %d doc(s), all outside TY%s" % (t["doc_type"], t["count"], ty))
                elif t["count"]:
                    tl_lines.append("%s: %d doc(s), no amount read%s" % (
                        t["doc_type"], t["count"], (", %d outside TY" % t["outside"]) if t["outside"] else ""))
            if tl_lines:
                L.append("Totals (tax year %s only, from the amounts above): %s" % (ty, " \u00b7 ".join(tl_lines)))
                L.append("")
            for cv in cov_idx.get((key, g), []):
                L.append("%s \u2014 months with a document in %s: %s%s" % (cv["doc_type"], ty, ", ".join(cv["months"]) or "none",
                                                                     ("; none for " + ", ".join(cv["missing"])) if cv["missing"] else " (all 12)"))
                L.append("")
        qs = QUESTIONS.get(key, [])
        if qs:
            L.append("Questions only the taxpayer can answer (ask them in one batch, or leave `[NEEDED: …]` in the summary):")
            for q in qs:
                L.append("- " + q)
            L.append("")

    for key, title in (("records", "Supporting statements (not a Summaries.md section; cite only where relevant)"),
                       ("review", "In %s (not summarised until identified)" % tc.REVIEW_FOLDER),
                       ("unsorted", "Still in the inbox (read for this summary; run the classification skill to file them)")):
        gs = groups.get(key)
        if gs:
            L.append("## %s" % title)
            L.append("")
            for g, ds in gs.items():
                for d in ds:
                    L.append(doc_line(d, tc))
            L.append("")
    customs = [k for k in groups if k.startswith("custom:")]
    if customs:
        L.append("## Other folders (custom categories)")
        L.append("")
        for k in customs:
            L.append("### %s" % k.split(":", 1)[1])
            L.append("")
            for g, ds in groups[k].items():
                for d in ds:
                    L.append(doc_line(d, tc))
            L.append("")
    dups = groups.get("duplicates")
    if dups:
        L.append("## Duplicates ignored")
        L.append("")
        for g, ds in dups.items():
            for d in ds:
                L.append("- %s" % d["name"])
        L.append("")

    L.append("## Hints for Open Items & Missing Documents")
    L.append("")
    for h in facts["hints"] or ["Nothing detected automatically."]:
        L.append("- " + h)
    L.append("")

    ex = facts.get("existing")
    L.append("## Existing %s" % SUMMARIES_FILENAME)
    L.append("")
    if ex:
        with_info = [s["title"] for s in ex["sections"] if not s["na"]]
        na = [s["title"] for s in ex["sections"] if s["na"]]
        L.append("- Sections with information: %s" % (", ".join(with_info) or "none"))
        L.append("- Sections marked N/A: %s" % (", ".join(na) or "none"))
        L.append("- Standard sections missing: %s" % (", ".join(ex["missing"]) or "none (summaries.py scaffold adds any that are missing)"))
        unref = [d for d in facts["documents"] if not d["referenced"] and d["status"] in ("sorted", "unsorted")]
        L.append("- Documents not mentioned yet (%d): %s" % (len(unref), "; ".join(d["display"] for d in unref) or "none"))
    else:
        L.append("- None yet. `summaries.py scaffold` creates it with every standard section; then write the sections that have documents.")
    L.append("")
    L.append("Next: python3 \"%s\" scaffold \"%s\"%s" % (Path(__file__).resolve().parent / "summaries.py", facts["folder"],
                                                      (" --tax-year %s" % ty) if ty else ""))
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", help="folder with Summaries.md (default: ./sorter/stage)")
    ap.add_argument("--tax-year", type=int)
    ap.add_argument("--summaries", help="path of Summaries.md (default: <folder>/Summaries.md)")
    ap.add_argument("--max-chars", type=int, default=40000, help="characters of text read per document")
    ap.add_argument("--quiet", action="store_true", help="do not print facts.md (it is still written)")
    args = ap.parse_args()
    result = gather(args)
    if not args.quiet:
        sys.stdout.write(result["md"])
    sys.stderr.write("facts written to %s and %s\n" % (result["swork"] / "facts.json", result["swork"] / "facts.md"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
