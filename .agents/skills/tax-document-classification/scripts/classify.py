#!/usr/bin/env python3
"""Step 3: classify every file and propose a destination folder + filename.

Deterministic, rule-based: weighted keyword / OMB-number cues per document
type (see reference/form-cues.md), payer / tax-year / date extraction, and
routing rules (reference/taxonomy.md). Output is a plan the agent reviews
(<work>/plan.md, <work>/plan.json) before apply_plan.py moves anything.

Usage:
  python3 classify.py [INPUT] [--out OUT] [--work WORK] [--tax-year 2025]
                      [--property "Property 200=200 Oak St|200 OAK STREET"] ...
                      [--business "Nursing 1099=Travel Nurse Co|RN"] ...
                      [--keep-descriptive] [--group-by-entity] [--min-confidence 0.75]

Every classified file is renamed to "{Type} - {Entity} - {Date} ({original filename}).ext"; the filename's
own words are scored as evidence next to the content (see reference/naming.md).
"""
import argparse
import math
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxsort_common import (DATE_TOKEN_RE, DOC_TYPES, FORM_TOKEN_RE, GENERIC_WORDS, IDENTITY, INFO_RETURNS,
                            RETURNS_LAST, RETURNS_THIS, REVIEW_FOLDER, build_name, clean_entity, ensure_work,
                            load_json, mask_pii, now_iso, resolve_paths, save_json, when_segment, write_plan)


def C(pattern: str, weight: float):
    return (re.compile(pattern, re.I), weight, False)


def B(pattern: str, weight: float):
    """A cue that is a list of brand / organisation names: usable as the issuer."""
    return (re.compile(pattern, re.I), weight, True)


# Shared weak cue groups --------------------------------------------------
BILL_WEAK = [C(r"service\s+address", 1.5), C(r"service\s+(period|dates?|from)", 1), C(r"meter\s+(number|no|reading|#)", 1),
             C(r"amount\s+due", 0.75), C(r"account\s+(number|no|#)", 0.5), C(r"(billing|bill|statement)\s+date", 0.75),
             C(r"due\s+date", 0.5), C(r"previous\s+balance|payments?\s+received|current\s+charges", 1), C(r"usage", 0.75)]
PAYER_WEAK = [C(r"payer'?s\s+name", 1), C(r"recipient'?s\s+(tin|name|identification)", 0.5), C(r"\bomb\s+no", 0.5),
              C(r"copy\s+[b2c]\b", 0.5), C(r"federal\s+income\s+tax\s+withheld", 1)]

# Rules: strong cues always count; weak cues are capped per rule --------------
RULES: List[Dict] = [
    {"type": "W-2", "strong": [C(r"wage\s+and\s+tax\s+statement", 4), C(r"\bform\s+w-?2\b", 3), C(r"1545-0008", 3)],
     "weak": [C(r"wages,?\s+tips,?\s+other\s+comp", 2), C(r"employer'?s\s+name,?\s+address", 1.5),
              C(r"social\s+security\s+wages", 1.5), C(r"medicare\s+wages", 1.5), C(r"employer\s+identification\s+number", 1),
              C(r"copy\s+b.{0,40}employee'?s\s+federal", 1.5)], "weak_cap": 4},
    {"type": "W-2c", "strong": [C(r"corrected\s+wage\s+and\s+tax\s+statement", 6), C(r"\bw-?2c\b", 3)]},
    {"type": "W-2G", "strong": [C(r"certain\s+gambling\s+winnings", 5), C(r"\bw-?2g\b", 3), C(r"1545-0238", 3)],
     "weak": [C(r"reportable\s+winnings", 2), C(r"type\s+of\s+wager", 2)]},
    {"type": "1099-NEC", "strong": [C(r"nonemployee\s+compensation", 4), C(r"\b1099-?\s?nec\b", 3), C(r"1545-0116", 3)],
     "weak": PAYER_WEAK, "weak_cap": 2},
    {"type": "1099-MISC", "strong": [C(r"miscellaneous\s+(information|income)", 4), C(r"\b1099-?\s?misc\b", 3), C(r"1545-0115", 3)],
     "weak": PAYER_WEAK + [C(r"\brents\b", 1), C(r"royalties", 1)], "weak_cap": 3},
    {"type": "1099-INT", "strong": [C(r"\b1099-?\s?int\b", 3), C(r"1545-0112", 3), C(r"\binterest\s+income\b", 2.5)],
     "weak": PAYER_WEAK + [C(r"early\s+withdrawal\s+penalty", 2), C(r"interest\s+on\s+u\.?s\.?\s+savings\s+bonds", 2),
                           C(r"tax-?exempt\s+interest", 1.5)], "weak_cap": 4},
    {"type": "1099-DIV", "strong": [C(r"dividends\s+and\s+distributions", 4), C(r"\b1099-?\s?div\b", 3), C(r"1545-0110", 3)],
     "weak": PAYER_WEAK + [C(r"qualified\s+dividends", 2), C(r"total\s+ordinary\s+dividends", 2),
                           C(r"capital\s+gain\s+distr", 1.5), C(r"section\s+199a\s+dividends", 1.5)], "weak_cap": 4},
    {"type": "1099-B", "strong": [C(r"proceeds\s+from\s+broker", 4), C(r"\b1099-?\s?b\b", 3), C(r"1545-0715", 3)],
     "weak": PAYER_WEAK + [C(r"cost\s+or\s+other\s+basis", 2), C(r"date\s+sold\s+or\s+disposed", 2), C(r"date\s+acquired", 1),
                           C(r"wash\s+sale", 1.5), C(r"(short|long)-?term", 0.5)], "weak_cap": 4},
    {"type": "Consolidated 1099", "strong": [C(r"consolidated\s+(form\s+)?1099", 5), C(r"consolidated\s+tax\s+statement", 4),
                                             C(r"composite\s+(form\s+)?1099", 4), C(r"tax\s+reporting\s+statement", 3)],
     "weak": [B(r"(fidelity|vanguard|schwab|e\*?trade|merrill|morgan\s+stanley|td\s+ameritrade|robinhood|betterment|wealthfront|interactive\s+brokers|edward\s+jones|ameriprise|raymond\s+james|webull|sofi\s+invest|m1\s+finance|j\.?p\.?\s*morgan|ubs|lpl\s+financial|public\.com|tastytrade|apex\s+clearing)", 1)], "weak_cap": 1},
    {"type": "1099-OID", "strong": [C(r"original\s+issue\s+discount", 4), C(r"\b1099-?\s?oid\b", 3)], "weak": PAYER_WEAK, "weak_cap": 2},
    {"type": "1099-DA", "strong": [C(r"digital\s+asset\s+proceeds", 5), C(r"\b1099-?\s?da\b", 3)], "weak": PAYER_WEAK, "weak_cap": 2},
    {"type": "Crypto Tax Statement",
     "strong": [B(r"(coinbase|kraken|gemini|binance|crypto\.com|robinhood\s+crypto|bitstamp|cash\s+app\s+bitcoin)", 3),
                C(r"(gain|loss)\s+report|transaction\s+history|form\s+8949|capital\s+gains?\s+(report|summary)", 2)],
     "weak": [C(r"\b(btc|eth|sol|bitcoin|ethereum|cryptocurrency|crypto|digital\s+assets?|staking|airdrop)\b", 2), C(r"cost\s+basis", 1),
              C(r"proceeds", 0.5)], "weak_cap": 3},
    {"type": "Brokerage Statement",
     "strong": [B(r"(fidelity|vanguard|schwab|e\*?trade|merrill|morgan\s+stanley|td\s+ameritrade|robinhood|betterment|wealthfront|interactive\s+brokers|edward\s+jones|ameriprise|raymond\s+james|webull|sofi\s+invest|m1\s+finance)", 2),
                C(r"(account|portfolio)\s+(statement|summary)", 2)],
     "weak": [C(r"holdings|positions", 1), C(r"market\s+value|net\s+asset\s+value", 1), C(r"dividends?\s+received|realized\s+gain", 1),
              C(r"(beginning|ending)\s+(account\s+)?value", 1.5)], "weak_cap": 3},
    {"type": "1099-R", "strong": [C(r"distributions\s+from\s+pensions,?\s+annuities", 4), C(r"\b1099-?\s?r\b", 3), C(r"1545-0119", 3)],
     "weak": PAYER_WEAK + [C(r"gross\s+distribution", 2), C(r"distribution\s+code", 2), C(r"taxable\s+amount\s+not\s+determined", 2)], "weak_cap": 4},
    {"type": "SSA-1099", "strong": [C(r"social\s+security\s+benefit\s+statement", 5), C(r"\bssa-?\s?1099\b", 4)],
     "weak": [C(r"benefits\s+paid\s+in\s+20\d\d", 2), C(r"net\s+benefits\s+for\s+20\d\d", 2), C(r"medicare\s+part\s+b\s+premiums", 1.5)], "weak_cap": 3},
    {"type": "RRB-1099", "strong": [C(r"\brrb-?\s?1099", 4), C(r"railroad\s+retirement", 3)]},
    {"type": "Schedule K-1 (1065)", "strong": [C(r"partner'?s\s+share\s+of\s+income", 4), C(r"form\s+1065", 3), C(r"schedule\s+k-?1", 2)],
     "weak": [C(r"partnership'?s\s+(name|employer)", 1.5), C(r"guaranteed\s+payments", 1.5), C(r"self-?employment\s+earnings", 1)], "weak_cap": 3},
    {"type": "Schedule K-1 (1120-S)", "strong": [C(r"shareholder'?s\s+share\s+of\s+income", 4), C(r"form\s+1120-?s\b", 3), C(r"schedule\s+k-?1", 2)],
     "weak": [C(r"corporation'?s\s+(name|employer)", 1.5), C(r"shareholder'?s\s+percentage", 1.5)], "weak_cap": 3},
    {"type": "Schedule K-1 (1041)", "strong": [C(r"beneficiary'?s\s+share\s+of\s+income", 4), C(r"form\s+1041\b", 3), C(r"schedule\s+k-?1", 2)],
     "weak": [C(r"estate'?s\s+or\s+trust'?s", 1.5), C(r"fiduciary", 1.5)], "weak_cap": 3},
    {"type": "1099-G", "strong": [C(r"certain\s+government\s+payments", 4), C(r"\b1099-?\s?g\b", 3), C(r"1545-0120", 3)],
     "weak": PAYER_WEAK + [C(r"unemployment\s+compensation", 2), C(r"state\s+or\s+local\s+income\s+tax\s+refunds", 2)], "weak_cap": 4},
    {"type": "1099-K", "strong": [C(r"payment\s+card\s+and\s+third\s+party\s+network", 4), C(r"\b1099-?\s?k\b", 3), C(r"1545-2205", 3)],
     "weak": PAYER_WEAK + [C(r"gross\s+amount\s+of\s+payment\s+card", 2), C(r"number\s+of\s+payment\s+transactions", 2),
                           B(r"(paypal|venmo|stripe|square|etsy|ebay|airbnb|uber|lyft|doordash|cash\s+app)", 0.5)], "weak_cap": 4},
    {"type": "1099-C", "strong": [C(r"cancellation\s+of\s+debt", 4), C(r"\b1099-?\s?c\b", 3), C(r"1545-1424", 3)],
     "weak": PAYER_WEAK + [C(r"amount\s+of\s+debt\s+discharged", 2)], "weak_cap": 3},
    {"type": "1099-Q", "strong": [C(r"payments\s+from\s+qualified\s+education\s+programs", 4), C(r"\b1099-?\s?q\b", 3)],
     "weak": PAYER_WEAK + [C(r"\b529\b", 1), C(r"gross\s+distribution", 1)], "weak_cap": 3},
    {"type": "1099-S", "strong": [C(r"proceeds\s+from\s+real\s+estate\s+transactions", 4), C(r"\b1099-?\s?s\b", 3), C(r"1545-0997", 3)],
     "weak": PAYER_WEAK + [C(r"date\s+of\s+closing", 2), C(r"gross\s+proceeds", 1)], "weak_cap": 3},
    {"type": "1099-LTC", "strong": [C(r"long-?term\s+care\s+and\s+accelerated\s+death\s+benefits", 4), C(r"\b1099-?\s?ltc\b", 3)]},
    {"type": "1099-PATR", "strong": [C(r"taxable\s+distributions\s+received\s+from\s+cooperatives", 4), C(r"\b1099-?\s?patr\b", 3)]},
    {"type": "1099-SA HSA Distributions", "strong": [C(r"distributions\s+from\s+an\s+hsa", 4), C(r"\b1099-?\s?sa\b", 3)],
     "weak": [C(r"archer\s+msa", 2), C(r"medicare\s+advantage\s+msa", 1)], "weak_cap": 3},
    {"type": "5498 IRA Contributions", "strong": [C(r"ira\s+contribution\s+information", 4), C(r"\bform\s+5498\b(?!-?\s?sa)", 3), C(r"1545-0747", 3)],
     "weak": [C(r"fair\s+market\s+value\s+of\s+account", 2), C(r"rollover\s+contributions", 1.5), C(r"roth\s+ira\s+contributions", 1.5),
              C(r"\brmd\b|required\s+minimum\s+distribution", 1)], "weak_cap": 4},
    {"type": "5498-SA HSA Contributions", "strong": [C(r"hsa,?\s+archer\s+msa,?\s+or\s+medicare\s+advantage\s+msa\s+information", 5), C(r"\b5498-?\s?sa\b", 4)],
     "weak": [C(r"total\s+(hsa|contributions)", 2), C(r"fair\s+market\s+value", 1)], "weak_cap": 3},
    {"type": "1098 Mortgage Interest", "strong": [C(r"mortgage\s+interest\s+statement", 4), C(r"\bform\s+1098\b(?!-)", 3), C(r"1545-1380", 3)],
     "weak": [C(r"outstanding\s+mortgage\s+principal", 2), C(r"mortgage\s+origination\s+date", 2), C(r"mortgage\s+insurance\s+premiums", 1.5),
              C(r"points\s+paid\s+on\s+purchase", 1.5), C(r"recipient'?s/lender'?s", 1.5), C(r"mortgage\s+interest\s+received", 2)], "weak_cap": 5},
    {"type": "1098-T Tuition", "strong": [C(r"tuition\s+statement", 4), C(r"\b1098-?\s?t\b", 3), C(r"1545-1574", 3)],
     "weak": [C(r"payments\s+received\s+for\s+qualified\s+tuition", 2), C(r"scholarships\s+or\s+grants", 1.5), C(r"filer'?s\s+name", 0.5)], "weak_cap": 3},
    {"type": "1098-E Student Loan Interest", "strong": [C(r"student\s+loan\s+interest\s+statement", 4), C(r"\b1098-?\s?e\b", 3), C(r"1545-1576", 3)],
     "weak": [C(r"student\s+loan\s+interest\s+received", 2)], "weak_cap": 2},
    {"type": "1098-C Vehicle Donation", "strong": [C(r"contributions\s+of\s+motor\s+vehicles", 4), C(r"\b1098-?\s?c\b", 3)]},
    {"type": "1095-A", "strong": [C(r"health\s+insurance\s+marketplace\s+statement", 5), C(r"\b1095-?\s?a\b", 3), C(r"1545-2232", 3)],
     "weak": [C(r"second\s+lowest\s+cost\s+silver\s+plan|slcsp", 3), C(r"advance\s+payment\s+of\s+premium\s+tax\s+credit", 2),
              C(r"marketplace\s+identifier", 2), C(r"monthly\s+(enrollment\s+)?premium", 1.5)], "weak_cap": 5},
    {"type": "1095-B", "strong": [C(r"\b1095-?\s?b\b", 3), C(r"1545-2252", 3), C(r"\bhealth\s+coverage\b", 2)],
     "weak": [C(r"responsible\s+individual", 2), C(r"origin\s+of\s+the\s+(health\s+coverage|policy)", 2), C(r"covered\s+individuals", 1.5)], "weak_cap": 4},
    {"type": "1095-C", "strong": [C(r"employer-?\s?provided\s+health\s+insurance\s+offer\s+and\s+coverage", 5), C(r"\b1095-?\s?c\b", 3), C(r"1545-2251", 3)],
     "weak": [C(r"offer\s+of\s+coverage", 2), C(r"applicable\s+large\s+employer", 2), C(r"employee\s+required\s+contribution", 1.5)], "weak_cap": 4},
    {"type": "Health Insurance Premium Statement",
     "strong": [B(r"(kaiser|blue\s+shield|blue\s+cross|anthem|aetna|cigna|unitedhealthcare|humana|oscar\s+health|molina|covered\s+california|healthcare\.gov|health\s+net|ambetter|medica|priority\s+health|highmark|wellcare)", 2),
                C(r"premiums?\s+(paid|statement|notice|invoice|due)", 2)],
     "weak": [C(r"(medical|dental|vision|health)\s+(plan|coverage|insurance)", 1.5), C(r"member\s+(id|number)", 1), C(r"coverage\s+period", 1),
              C(r"subscriber", 1)], "weak_cap": 3},
    {"type": "Form 1040 Return", "strong": [C(r"u\.?s\.?\s+individual\s+income\s+tax\s+return", 5), C(r"\bform\s+1040(?:-?sr)?\b", 3),
                                            C(r"your\s+first\s+name\s+and\s+middle\s+initial", 2)],
     "weak": [C(r"adjusted\s+gross\s+income", 1.5), C(r"filing\s+status", 1.5), C(r"standard\s+deduction\s+or\s+itemized", 1),
              C(r"schedule\s+[abcde]\s+\(form\s+1040\)", 1.5), C(r"paid\s+preparer\s+use\s+only", 1.5),
              C(r"(turbotax|h&r\s+block|freetaxusa|taxact|taxslayer|cash\s+app\s+taxes|olt\.com)", 1),
              C(r"e-?file[d]?\s+(acceptance|accepted|confirmation)|submission\s+id", 1.5)], "weak_cap": 5},
    {"type": "State Tax Return", "strong": [C(r"(resident|nonresident|part-?year)\s+(income\s+)?tax\s+return", 4), C(r"state\s+(income\s+)?tax\s+return", 3),
                                            C(r"(franchise\s+tax\s+board|department\s+of\s+revenue|department\s+of\s+taxation|comptroller\s+of)", 2)],
     "weak": [C(r"\bform\s+(540|it-201|d-400|m1|il-1040|pa-40|mo-1040|500|sc1040|ar1000f|it\s+1040|mi-1040|760|502|nj-1040|or-40|140|104|ct-1040|ia\s+1040|k-40|740|it-540|511|ri-1040|tc-40|in-111|it-140|n-11|nd-1|d-40)\b", 3),
              C(r"state\s+wages", 1), C(r"state\s+income\s+tax\s+withheld", 1)], "weak_cap": 4},
    {"type": "Tax Return Transcript", "strong": [C(r"tax\s+return\s+transcript", 5), C(r"wage\s+and\s+income\s+transcript", 5), C(r"account\s+transcript", 4),
                                                 C(r"record\s+of\s+account", 3), C(r"tax\s+period\s+ending", 2), C(r"request\s+date", 2)],
     "weak": [C(r"tracking\s+number", 1), C(r"internal\s+revenue\s+service", 1)], "weak_cap": 2},
    {"type": "IRS Notice", "strong": [C(r"\b(cp2000|cp14|cp12|cp11|cp21[abc]?|cp22[ae]?|cp49|cp501|cp503|cp504|cp523|ltr\s*\d{3,4}c?|letter\s+\d{3,4}c?)\b", 4),
                                      C(r"notice\s+(number|date)", 2)],
     "weak": [C(r"internal\s+revenue\s+service", 2), C(r"we\s+(changed|received|need|are\s+proposing|haven'?t\s+received)|you\s+(owe|have\s+a\s+balance)|balance\s+due|amount\s+due\s+by", 1.5),
              C(r"tax\s+period|tax\s+year\s+ending", 1), C(r"taxpayer\s+id(entification)?\s+number", 1)], "weak_cap": 4},
    {"type": "IP PIN Notice", "strong": [C(r"identity\s+protection\s+(personal\s+identification\s+number|pin)", 5), C(r"\bip\s+pin\b", 4), C(r"\bcp01a\b", 4)]},
    {"type": "ITIN Letter", "strong": [C(r"individual\s+taxpayer\s+identification\s+number", 4), C(r"\bitin\b", 3), C(r"\bcp565\b", 4), C(r"\bform\s+w-?7\b", 3)]},
    {"type": "Driver License", "strong": [C(r"driver'?s?\s+licen[cs]e", 4), C(r"identification\s+card", 3), C(r"\breal\s+id\b", 2)],
     "weak": [C(r"\bdl\b\s*(no|#|number)?", 1.5), C(r"\bclass\s+[a-e]\b", 1.5), C(r"\b(exp|expires|expiration)\b", 1), C(r"\b(hgt|wgt|eyes|hair|sex)\b", 2),
              C(r"department\s+of\s+motor\s+vehicles|\bdmv\b", 1.5), C(r"\bdob\b", 1), C(r"\b(iss|issued)\b", 0.5), C(r"\bend(orsements)?\b|\brestr(ictions)?\b", 1)], "weak_cap": 5},
    {"type": "Passport", "strong": [C(r"\bpassport\b", 4), C(r"p<usa", 4)],
     "weak": [C(r"nationality", 2), C(r"place\s+of\s+birth", 2), C(r"date\s+of\s+issue", 1.5), C(r"surname|given\s+names", 1.5),
              C(r"united\s+states\s+of\s+america", 1), C(r"department\s+of\s+state", 1)], "weak_cap": 5},
    {"type": "Social Security Card", "strong": [C(r"this\s+number\s+has\s+been\s+established\s+for", 5), C(r"signature\s+of\s+(the\s+)?(number\s+holder|cardholder)", 4),
                                                C(r"social\s+security\s+(card|administration)", 3), C(r"not\s+valid\s+for\s+employment", 3)]},
    {"type": "Birth Certificate", "strong": [C(r"certificate\s+of\s+(live\s+)?birth", 5), C(r"birth\s+certificate", 4)],
     "weak": [C(r"registrar", 2), C(r"mother'?s\s+maiden\s+name", 3), C(r"vital\s+(records|statistics)", 2)], "weak_cap": 4},
    {"type": "Property Tax Bill", "strong": [C(r"property\s+tax(es)?\b", 3), C(r"(secured|unsecured)\s+(property\s+)?tax\s+bill", 3), C(r"assessed\s+value", 2.5),
                                             C(r"parcel\s+(no|number|id)|\bapn\b", 2.5)],
     "weak": [C(r"tax\s+collector|county\s+treasurer|assessor", 2), C(r"(first|second|1st|2nd)\s+installment", 2), C(r"millage|mill\s+rate|tax\s+rate\s+area", 1.5),
              C(r"homestead\s+exemption", 1.5), C(r"situs", 1.5)], "weak_cap": 4},
    {"type": "Mortgage Statement", "strong": [C(r"mortgage\s+statement", 4), B(r"(rocket\s+mortgage|mr\.?\s+cooper|pennymac|loancare|freedom\s+mortgage|newrez|lakeview|carrington|shellpoint|nationstar|wells\s+fargo\s+home\s+mortgage|chase\s+home\s+lending|us\s+bank\s+home\s+mortgage|loandepot|guild\s+mortgage|flagstar|truist\s+mortgage|citizens\s+one)", 2)],
     "weak": [C(r"escrow", 1.5), C(r"(principal|interest)\s+(balance|paid|payment)", 1.5), C(r"loan\s+number", 1), C(r"year-?to-?date\s+interest", 1.5),
              C(r"payment\s+due\s+date", 0.5), C(r"unpaid\s+principal", 1.5)], "weak_cap": 4},
    {"type": "Donation Receipt", "strong": [C(r"501\s*\(\s*c\s*\)\s*\(?\s*3\s*\)?", 4), C(r"no\s+goods\s+or\s+services\s+were\s+(provided|received)", 5),
                                            C(r"(charitable|tax-?deductible)\s+(contribution|donation|gift)", 3),
                                            C(r"thank\s+you\s+for\s+your\s+(generous\s+)?(donation|gift|support|contribution)", 3)],
     "weak": [C(r"\b(donation|donor|donated|contribution)\b", 1.5), B(r"(goodwill|salvation\s+army|red\s+cross|united\s+way|church|ministries|foundation|nonprofit|non-profit|habitat\s+for\s+humanity|st\.?\s+jude|world\s+vision|unicef|doctors\s+without\s+borders|food\s+bank|humane\s+society|planned\s+parenthood|aclu)", 1.5),
              C(r"in-?kind|fair\s+market\s+value\s+of", 1.5), C(r"tax\s+id|\bein\b", 0.5)], "weak_cap": 4},
    {"type": "Explanation of Benefits", "strong": [C(r"explanation\s+of\s+benefits", 5), C(r"\beob\b", 4), C(r"this\s+is\s+not\s+a\s+bill", 4)],
     "weak": [C(r"amount\s+billed|allowed\s+amount|plan\s+paid|patient\s+responsibility|member\s+responsibility|claim\s+(number|#)", 1.5)], "weak_cap": 3},
    {"type": "Medical Bill", "strong": [C(r"(patient\s+(name|account|responsibility|balance)|date\s+of\s+service)", 2.5), C(r"(hospital|medical\s+center|clinic|urgent\s+care|physicians?|dental|orthodont|dermatolog|radiology|laborator(y|ies)|pharmacy|optometr|chiropract|physical\s+therapy)", 2)],
     "weak": [C(r"copay|co-?pay|coinsurance", 1.5), C(r"\bdeductible\b", 1), C(r"insurance\s+(paid|adjustment)|amount\s+you\s+owe", 1.5), C(r"\b(cpt|icd|diagnosis|procedure)\b", 1.5),
              C(r"prescription|\brx\b", 1.5), C(r"\bprovider\b", 0.5), C(r"\bpatient\b", 1)], "weak_cap": 4},
    {"type": "Vehicle Registration", "strong": [C(r"(vehicle\s+)?registration\s+(renewal|card|fee|notice)", 4), C(r"vehicle\s+license\s+fee|\bvlf\b", 3)],
     "weak": [C(r"license\s+plate|plate\s+(number|no)", 2), C(r"\bvin\b", 1.5), C(r"department\s+of\s+motor\s+vehicles|\bdmv\b|motor\s+vehicle\s+(division|administration|commission)", 1.5),
              C(r"(make|model|year)\b", 0.5)], "weak_cap": 4},
    {"type": "Childcare Statement", "strong": [C(r"(child\s*care|childcare|day\s*care|daycare|preschool|pre-?k|after-?school|nanny|au\s+pair|montessori)", 3),
                                               C(r"dependent\s+care", 3), C(r"form\s+2441", 3)],
     "weak": [C(r"provider'?s?\s+(tax\s+id|ein|identification)|tax\s+id\s+(number|#)", 2), C(r"(tuition|fees)\s+paid", 1.5), C(r"year-?end\s+(statement|summary)", 1),
              C(r"enrolled|attendance", 1)], "weak_cap": 4},
    {"type": "Student Account Statement", "strong": [C(r"(bursar|student\s+account|tuition\s+and\s+fees)", 3), C(r"(university|college|community\s+college)", 1.5)],
     "weak": [C(r"(semester|quarter|term)\b", 1), C(r"financial\s+aid|scholarship|grant", 1.5), C(r"registration\s+fee|student\s+id", 1)], "weak_cap": 3},
    {"type": "Energy Improvement Receipt", "strong": [C(r"form\s+5695|residential\s+clean\s+energy|energy\s+efficient\s+home\s+improvement", 4),
                                                      C(r"(solar|photovoltaic|heat\s+pump|insulation|energy\s+star|battery\s+storage|ev\s+charger|geothermal|tankless\s+water\s+heater)", 2.5)],
     "weak": [C(r"manufacturer'?s?\s+certification", 2), C(r"(installed|installation)", 1), C(r"\bkw\b|kilowatt", 1), C(r"(windows?|doors?|skylights?)", 1)], "weak_cap": 3},
    {"type": "Clean Vehicle Purchase", "strong": [C(r"form\s+8936|form\s+15400|time\s+of\s+sale\s+report|seller\s+report|clean\s+vehicle\s+credit", 4),
                                                  C(r"(tesla|rivian|lucid|polestar|chevrolet\s+bolt|mustang\s+mach-?e|hyundai\s+ioniq|kia\s+ev\d|nissan\s+leaf|volkswagen\s+id\.?4|cadillac\s+lyriq)", 2)],
     "weak": [C(r"(electric\s+vehicle|\bev\b|plug-?in\s+hybrid|battery\s+capacity)", 2), C(r"\bvin\b", 1.5), C(r"purchase\s+(agreement|order|contract)|bill\s+of\s+sale|buyer'?s\s+order", 2)], "weak_cap": 4},
    {"type": "1040-ES Voucher", "strong": [C(r"estimated\s+tax\s+(payment\s+)?voucher", 5), C(r"form\s+1040-?es\b", 4)],
     "weak": [C(r"(1st|2nd|3rd|4th|first|second|third|fourth)\s+(quarter|installment|payment)", 1.5), C(r"estimated\s+tax", 2)], "weak_cap": 3},
    {"type": "Estimated Tax Payment Confirmation", "strong": [C(r"\beftps\b", 4), C(r"direct\s+pay", 3), C(r"payment\s+confirmation", 3), C(r"estimated\s+tax", 2)],
     "weak": [C(r"confirmation\s+(number|#)", 2), C(r"1040-?es", 2), C(r"(payment\s+)?(received|submitted|scheduled|successful|processed)", 1),
              C(r"irs\.gov|internal\s+revenue\s+service|franchise\s+tax\s+board|department\s+of\s+revenue", 1.5), C(r"tax\s+period", 1)], "weak_cap": 4},
    {"type": "Unemployment Statement", "strong": [C(r"unemployment\s+(insurance|benefits|compensation)", 3), B(r"employment\s+development\s+department|\bedd\b|workforce\s+commission|department\s+of\s+labor", 2)],
     "weak": [C(r"benefit\s+payment|weekly\s+benefit|claim\s+(id|number)", 1.5)], "weak_cap": 3},
    {"type": "Rental Income Statement", "strong": [C(r"(owner|owner'?s)\s+(statement|report|disbursement|distribution)", 4), C(r"property\s+management", 3),
                                                   C(r"(rent|rental)\s+income\s+(statement|report|summary|record|ledger)", 5),
                                                   C(r"(rent|rental)\s+(income|received|collected|roll)", 3)],
     "weak": [C(r"management\s+fee", 2.5), C(r"\btenants?\b", 2), C(r"security\s+deposit", 1.5), C(r"(late\s+fee|vacancy|leasing\s+fee|maintenance)", 1),
              C(r"\bunit\s+#?\s?\d", 0.5)], "weak_cap": 4},
    {"type": "Lease Agreement", "strong": [C(r"(residential\s+)?lease\s+(agreement|contract)", 5), C(r"rental\s+agreement", 4)],
     "weak": [C(r"\blandlord\b", 2), C(r"\btenants?\b", 1.5), C(r"monthly\s+rent|rent\s+shall\s+be", 2), C(r"security\s+deposit", 1.5), C(r"lease\s+term|term\s+of\s+(the\s+)?lease", 2)], "weak_cap": 5},
    {"type": "Rent Receipt", "strong": [C(r"rent\s+(receipt|payment\s+received)", 4), C(r"received\s+from.{0,40}for\s+rent", 4)],
     "weak": [C(r"\btenants?\b", 1.5), C(r"(month|period)\s+of", 1), C(r"\bunit\b|\bapt\b", 1)], "weak_cap": 3},
    {"type": "HOA Statement", "strong": [C(r"(homeowners?|home\s+owners?|condominium|condo|property\s+owners?)\s+association", 4), C(r"\bhoa\b", 4)],
     "weak": [C(r"\b(assessments?|dues)\b", 2), C(r"(community|association)\s+(dues|fees)", 2), C(r"special\s+assessment", 1.5), C(r"(common\s+area|reserve\s+fund)", 1)], "weak_cap": 4},
    {"type": "Depreciation Schedule", "strong": [C(r"\bdepreciation\b", 4), C(r"form\s+4562", 3)],
     "weak": [C(r"\bmacrs\b|straight-?line|27\.5|39\s+years?", 2), C(r"placed\s+in\s+service|in-?service\s+date", 2), C(r"cost\s+basis|accumulated\s+depreciation|recovery\s+period", 1.5)], "weak_cap": 5},
    {"type": "Electric Bill", "strong": [C(r"\bkwh\b|kilowatt", 4), C(r"electric(ity|al)?\s+(bill|service|charges|usage|statement|delivery)", 3),
                                         B(r"(entergy|pg&e|pacific\s+gas|southern\s+california\s+edison|\bsce\b|ladwp|con\s*edison|duke\s+energy|dominion\s+energy|xcel|georgia\s+power|\bfpl\b|florida\s+power|comed|ameren|cleco|swepco|\bdte\b|consumers\s+energy|national\s+grid|eversource|pse&g|pepco|\bsrp\b|\baps\b|austin\s+energy|cps\s+energy|oncor|\btxu\b|reliant|smud|pacificorp|puget\s+sound\s+energy|portland\s+general|idaho\s+power|nv\s+energy|alabama\s+power|mississippi\s+power|\btva\b|rocky\s+mountain\s+power|evergy|ppl\s+electric|appalachian\s+power|aep\b|first\s*energy|jcp&l|pseg)", 3)],
     "weak": BILL_WEAK, "weak_cap": 3},
    {"type": "Gas Bill", "strong": [C(r"\b(therms?|ccf|mcf)\b", 4), C(r"natural\s+gas", 3), C(r"\bgas\s+(bill|service|charges|usage|statement|company|utility)", 2.5),
                                    B(r"(socalgas|southern\s+california\s+gas|atmos\s+energy|centerpoint|nicor|peoples\s+gas|spire|washington\s+gas|piedmont\s+natural|columbia\s+gas|intermountain\s+gas|questar|national\s+fuel|nw\s+natural|cascade\s+natural)", 3)],
     "weak": BILL_WEAK, "weak_cap": 3},
    {"type": "Water Bill", "strong": [C(r"water\s+(bill|service|utility|district|department|usage|charges|authority)", 3), C(r"\b(gallons|hcf)\b", 2.5),
                                      C(r"(sewer|wastewater|sanitation|stormwater|refuse|trash\s+(service|collection))", 2),
                                      C(r"(department\s+of\s+water|water\s+and\s+power|public\s+works|utilities\s+department|municipal\s+utilities|water\s+works)", 2)],
     "weak": BILL_WEAK, "weak_cap": 3},
    {"type": "Internet Bill", "strong": [C(r"(internet|broadband|wi-?fi|fiber)\s*(service|bill|plan|charges)?", 2.5),
                                         B(r"(xfinity|comcast|spectrum|charter\s+communications|cox\s+communications|at&t\s+(internet|fiber)|verizon\s+fios|frontier\s+communications|centurylink|lumen|optimum|altice|google\s+fiber|t-mobile\s+home\s+internet|starlink|windstream|mediacom|astound|sonic\.net|hughesnet|viasat|ziply)", 3)],
     "weak": BILL_WEAK + [C(r"(modem|router|gateway|equipment\s+fee|data\s+usage|mbps|gbps|cable\s+tv|streaming)", 2)], "weak_cap": 3},
    {"type": "Phone Bill", "strong": [C(r"(wireless|mobile|cellular|phone)\s+(bill|service|statement|plan|line)", 3),
                                      B(r"(verizon\s+wireless|at&t\s+wireless|t-mobile|mint\s+mobile|visible|cricket\s+wireless|boost\s+mobile|us\s+cellular|google\s+fi|metro\s+by\s+t-mobile|xfinity\s+mobile|spectrum\s+mobile|consumer\s+cellular)", 3)],
     "weak": BILL_WEAK + [C(r"\b(minutes|talk|text|data)\b", 1), C(r"\(\d{3}\)\s*\d{3}-\d{4}", 1)], "weak_cap": 3},
    {"type": "Insurance Premium", "strong": [C(r"(homeowners?|landlord|dwelling|rental\s+property|dp-?3|ho-?3|umbrella|liability|auto|flood|earthquake|renters?)\s+(insurance|policy)", 3),
                                             B(r"(state\s+farm|allstate|geico|progressive|farmers\s+insurance|liberty\s+mutual|nationwide|usaa|travelers|american\s+family|lemonade|hippo|the\s+hartford|chubb|amica|erie\s+insurance|mercury\s+insurance|safeco|foremost|assurant|steadily|obie|citizens\s+property)", 3),
                                             C(r"declarations?\s+page", 3)],
     "weak": [C(r"policy\s+(number|no|#|period)", 1.5), C(r"policyholder|named\s+insured", 1.5), C(r"\bpremium\b", 1.5), C(r"\bcoverage\b", 1), C(r"renewal", 1), C(r"\bdeductible\b", 1)], "weak_cap": 5},
    {"type": "Closing Disclosure", "strong": [C(r"closing\s+disclosure|settlement\s+statement|hud-?1|alta\s+settlement", 5)],
     "weak": [C(r"(loan\s+terms|projected\s+payments|closing\s+costs|cash\s+to\s+close|title\s+(insurance|fee)|recording\s+fee|prorat(ed|ion))", 1.5)], "weak_cap": 5},
    {"type": "Repair Invoice", "strong": [C(r"\b(plumb(ing|er)|hvac|roof(ing|er)?|electrician|handyman|contractor|landscap(ing|er)|pest\s+control|appliance\s+repair|painting|flooring|locksmith|cleaning\s+service)\b", 3),
                                          C(r"work\s+order|job\s+(address|site|location)|service\s+call", 2.5)],
     "weak": [C(r"\b(labor|parts|materials)\b", 1.5), C(r"\binvoice\b", 1.5), C(r"\bestimate\b", 1), C(r"\brepair(s|ed)?\b", 1.5)], "weak_cap": 4},
    {"type": "Invoice", "strong": [C(r"\binvoice\b", 3), C(r"invoice\s+(number|no|#|date)", 2), C(r"bill\s+to", 2)],
     "weak": [C(r"due\s+(date|upon\s+receipt)|net\s+\d+", 1.5), C(r"(qty|quantity|unit\s+price|line\s+total|subtotal)", 1), C(r"remit\s+to", 1.5),
              C(r"(amount|balance|total)\s+due", 1), C(r"(hours|hourly|rate)", 1)], "weak_cap": 3},
    {"type": "Receipt", "strong": [C(r"\breceipt\b", 2.5),
                                   B(r"(home\s*depot|lowe'?s|amazon|costco|walmart|target|office\s+depot|officemax|staples|best\s+buy|apple\s+store|ikea|ace\s+hardware|harbor\s+freight|menards|sam'?s\s+club|cvs|walgreens|kroger|trader\s+joe|whole\s+foods|ups\s+store|fedex\s+office|uber|lyft|delta\s+air|united\s+airlines|american\s+airlines|southwest|marriott|hilton|hyatt|airbnb|shell|chevron|exxon|arco|7-?eleven|b&h|adorama|micro\s+center|newegg)", 2)],
     "weak": [C(r"\bsubtotal\b", 1), C(r"sales\s+tax", 1), C(r"change\s+due|cash\s+tendered", 1), C(r"\bcashier\b|\bregister\b|store\s+#", 0.75),
              C(r"thank\s+you\s+for\s+(shopping|your\s+(order|purchase|business))", 1), C(r"return\s+policy|items?\s+sold", 1), C(r"auth\s+code|approved|approval\s+code", 1),
              C(r"\b(visa|mastercard|amex|american\s+express|debit|credit\s+card)\b", 0.75), C(r"order\s+(number|#|id|total|date)", 0.75), C(r"\btotal\b", 0.5)], "weak_cap": 5},
    {"type": "Bank Statement", "strong": [C(r"(checking|savings|money\s+market)\s+account", 3), C(r"(beginning|ending|opening|closing)\s+balance", 3),
                                          B(r"(chase|bank\s+of\s+america|wells\s+fargo|citibank|capital\s+one|u\.?s\.?\s+bank|pnc|truist|td\s+bank|ally\s+bank|discover\s+bank|sofi|chime|navy\s+federal|usaa|regions|fifth\s+third|keybank|huntington|m&t|citizens\s+bank|bmo|first\s+republic|schwab\s+bank|credit\s+union|marcus|synchrony|american\s+express\s+national\s+bank|comerica|zions|frost\s+bank|hancock\s+whitney)", 2)],
     "weak": [C(r"(account|statement)\s+(summary|period)", 2), C(r"deposits\s+and\s+(other\s+)?(additions|credits)", 1.5), C(r"withdrawals\s+and\s+(other\s+)?(subtractions|debits)|checks\s+paid", 1.5),
              C(r"daily\s+balance|transaction\s+(history|detail)", 1), C(r"member\s+fdic|\bfdic\b", 1.5), C(r"interest\s+(paid|earned)\s+(this\s+)?(period|year)|ytd\s+interest", 1)], "weak_cap": 4},
    {"type": "Credit Card Statement", "strong": [C(r"(credit\s+card|card)\s+(statement|account\s+statement)", 3), C(r"minimum\s+payment\s+due", 3), C(r"credit\s+limit|available\s+credit", 2.5)],
     "weak": [B(r"(capital\s+one|chase|citi(bank)?|american\s+express|discover|bank\s+of\s+america|wells\s+fargo|barclays|synchrony|u\.?s\.?\s+bank|apple\s+card|goldman\s+sachs|navy\s+federal|usaa|pnc|td\s+bank)", 1.5),
              C(r"payment\s+due\s+date", 1), C(r"new\s+balance", 1), C(r"previous\s+balance", 1), C(r"annual\s+percentage\s+rate|\bapr\b", 1),
              C(r"interest\s+charge\s+calculation|late\s+payment\s+warning|cash\s+advances", 1), C(r"\b(visa|mastercard|amex)\b", 1), C(r"account\s+ending\s+in\s+\d{4}", 1.5),
              C(r"\bpurchases\b", 0.5)], "weak_cap": 5},
    {"type": "Payment App Statement", "strong": [B(r"\b(paypal|venmo|cash\s+app|zelle|stripe|square|shopify\s+payments)\b", 3),
                                                 C(r"(transaction\s+(history|statement|report|summary)|activity\s+(report|statement)|payments?\s+received|goods\s+and\s+services)", 2)],
     "weak": [C(r"(gross|net)\s+(sales|payments|volume|amount)", 2), C(r"\bfees?\b", 0.5), C(r"(buyer|seller|merchant)", 1)], "weak_cap": 3},
    {"type": "Pay Stub", "strong": [C(r"(pay\s+stub|paystub|earnings\s+statement|pay\s+statement|payroll\s+(statement|summary))", 4),
                                    C(r"\b(adp|paychex|gusto|workday|paylocity|paycom|rippling|trinet|justworks|intuit\s+payroll|quickbooks\s+payroll|ukg|ceridian|dayforce)\b", 2)],
     "weak": [C(r"pay\s+period", 1.5), C(r"pay\s+date", 1.5), C(r"gross\s+pay", 1.5), C(r"net\s+pay", 1.5), C(r"\bytd\b|year\s+to\s+date", 1),
              C(r"federal\s+withholding|fed\s+w/?h|federal\s+income\s+tax", 1), C(r"\bfica\b|social\s+security|medicare", 1), C(r"401\(?k\)?", 1), C(r"hours\s+worked|\brate\b", 0.5)], "weak_cap": 6},
    {"type": "Profit and Loss", "strong": [C(r"profit\s+(and|&)\s+loss|\bp&l\b|(?<!rental )(?<!rent )income\s+statement", 5)],
     "weak": [C(r"(total\s+income|gross\s+profit|total\s+expenses|net\s+(income|profit|operating\s+income|loss)|cost\s+of\s+goods)", 1.5),
              C(r"(quickbooks|xero|freshbooks|wave\s+accounting|zoho\s+books)", 1)], "weak_cap": 5},
    {"type": "Mileage Log", "strong": [C(r"mileage\s+(log|report|summary|tracker)", 5), C(r"(odometer|business\s+miles|standard\s+mileage)", 3)],
     "weak": [C(r"(miles\s+driven|trip\s+purpose|start\s+(location|address|odometer)|end\s+(location|address|odometer)|round\s+trip)", 2),
              C(r"(mileiq|everlance|triplog|stride|hurdlr)", 2), C(r"\bmiles\b", 1)], "weak_cap": 6},
    {"type": "Loan Statement", "strong": [C(r"(auto|car|personal|student)\s+loan\s+(statement|account)", 4), C(r"loan\s+statement", 3)],
     "weak": [C(r"(principal|interest)\s+paid", 1.5), C(r"payoff\s+amount", 1.5), C(r"loan\s+(number|balance)", 1)], "weak_cap": 3},
]
RULES_BY_TYPE = {r["type"]: r for r in RULES}

# Routing sensitivity --------------------------------------------------------
PROPERTY_SENSITIVE = {"Electric Bill", "Gas Bill", "Water Bill", "Internet Bill", "Phone Bill", "Insurance Premium", "HOA Statement",
                      "Property Tax Bill", "Mortgage Statement", "1098 Mortgage Interest", "Repair Invoice", "Closing Disclosure",
                      "Rental Income Statement", "Lease Agreement", "Rent Receipt", "Depreciation Schedule", "1099-MISC", "Invoice", "Receipt"}
BUSINESS_SENSITIVE = {"Invoice", "Receipt", "Repair Invoice", "Payment App Statement", "Electric Bill", "Internet Bill", "Phone Bill",
                      "Insurance Premium", "Mileage Log", "Profit and Loss", "1099-NEC", "1099-K", "Bank Statement", "Credit Card Statement"}
# Types that need a property or business label before they are "ready"
NEEDS_CONTEXT = {"Electric Bill", "Gas Bill", "Water Bill", "Internet Bill", "Phone Bill", "Insurance Premium", "Repair Invoice",
                 "Invoice", "Receipt", "Closing Disclosure"}
UTILITY_TYPES = {"Electric Bill", "Gas Bill", "Water Bill", "Internet Bill", "Phone Bill"}
RETURN_TYPES = {"Form 1040 Return", "State Tax Return", "Tax Return Transcript"}

# Extraction patterns ---------------------------------------------------------
ISSUER_LABELS = [re.compile(p, re.I) for p in (
    r"employer'?s\s+name", r"payer'?s\s+name", r"recipient'?s/lender'?s\s+name", r"lender'?s\s+name", r"filer'?s\s+name",
    r"partnership'?s\s+name", r"corporation'?s\s+name", r"estate'?s\s+or\s+trust'?s\s+name", r"trustee'?s/issuer'?s\s+name",
    r"issuer'?s\s+name", r"name\s+of\s+employer", r"insurer'?s?\s+name", r"issuer\s+or\s+other\s+coverage\s+provider",
)]
# label words that follow "PAYER'S name" on IRS forms, e.g. ", street address, city or town, ... and telephone no."
LABEL_TAIL = re.compile(r"^(?:[,\s]*(?:street\s+address|address|city(?:\s+or\s+town)?|town|state(?:\s+or\s+province)?|province|country|"
                        r"zip(?:\s+or\s+foreign\s+postal)?\s+code|and\s+zip\s+code|(?:and\s+)?(?:telephone|phone)\s+(?:no\.?|number)|\(ein\)|"
                        r"and\s+employer\s+identification\s+number|and\s+tin)\b[.,]?)*", re.I)
# boundaries between a value and the next label on the same line
SEGMENT_SPLIT = re.compile(r"\n|(?=\s\d{1,2}[a-z]?\s+[A-Z][a-z])|(?=\s(?:RECIPIENT|PAYER|EMPLOYEE|BORROWER|STUDENT|TRUSTEE|FILER|PARTICIPANT|PARTNER|"
                           r"SHAREHOLDER|BENEFICIARY)'S\s)|(?=\sOMB\s)|(?=\sCopy\s[A-D12]\b)|(?=\s(?:Part|Box)\s+[IVX\d])|(?=\s[A-Z]\s[A-Z][a-z]+'s\s)")
LABEL_LINE = re.compile(r"(omb|copy\s+[a-d12]|form\s+\d|box\s+\d|\btin\b|\bein\b|identification\s+number|^\d[\d\s,.$-]*$|^\$|"
                        r"street\s+address|city\s+or\s+town|zip|telephone|for\s+(calendar|tax)\s+year|department\s+of\s+the\s+treasury|"
                        r"internal\s+revenue|wage\s+and\s+tax|corrected|void|employee'?s|recipient'?s|statement|information|page\s+\d|"
                        r"first\s+name|last\s+name|middle\s+initial|spouse|dear\b|^re:|^to:|^from:|^\d{1,2}[a-z]?\s+[A-Za-z]|"
                        r"^(?:state|city|country|province|town|address)$)", re.I)
CORP_LINE = re.compile(r"^[A-Z0-9][A-Za-z0-9&.,'\- ]{2,60}\b(Inc|LLC|L\.L\.C\.|Corp|Corporation|Company|Co\.|Ltd|LP|LLP|PLLC|PC|Bank|"
                       r"Credit Union|Trust|Group|Partners|Associates|Services|Energy|Power|Electric|Gas|Water|Utilities|Insurance|"
                       r"Mortgage|Financial|Investments|Securities|Properties|Management|University|College|Hospital|Clinic|Medical|"
                       r"Church|Foundation|Association|HOA|Agency|Department|County|Parish|Tax Collector|Treasurer|Assessor|"
                       r"Sheriff|Cross|Society|Ministries|Charities|Fund|Institute|School|Academy|Center|Centre|Cooperative|"
                       r"Authority|District|City of [A-Z][a-z]+)\b\.?", re.I)
YEAR_PATTERNS = [re.compile(p, re.I) for p in (
    r"(?:for\s+)?(?:calendar|tax)\s+year\s*:?\s*(20\d\d)",
    r"\b(20\d\d)\s+(?:form\s+)?(?:w-?2|1099|1098|1095|5498|1040|schedule\s+k-?1)\b",
    r"wage\s+and\s+tax\s+statement\s*(20\d\d)",
    r"(?:form\s+)?(?:w-?2|1099(?:-[a-z]+)?|1098(?:-[a-z])?|1095-[a-c]|5498(?:-sa)?)\b[\s\S]{0,40}?\b(20\d\d)\b",
    r"tax\s+year\s*(?:ending\s+)?(?:december\s+31,?\s+)?(20\d\d)",
    r"for\s+the\s+(?:year|period)\s+(?:ended|ending)\s+(?:december\s+31,?\s+)?(20\d\d)",
    r"\b(20\d\d)\s+(?:u\.?s\.?\s+)?individual\s+income\s+tax\s+return",
    r"year-?end\s+(?:statement|summary)\s*(?:for\s+)?(20\d\d)",
    r"\bty\s?(20\d\d)\b",
    r"schedule\s+k-?1\s*\(form\s+\d{4}(?:-s)?\)\s*(20\d\d)",
    r"tax\s+period\s+ending\s*:?\s*(?:[a-z]+\.?\s+\d{1,2},?\s+)?(20\d\d)",
    r"\b(20\d\d)\s+tax\s+(?:reporting\s+)?statement",
    r"\b(20\d\d)\s+department\s+of\s+the\s+treasury",
    r"\b(20\d\d)\s+(?:gain/loss|gains?\s+and\s+loss(?:es)?|tax\s+(?:report|summary|documents?|forms?|information)|annual\s+(?:statement|summary)|transaction\s+(?:history|report))",
)]
MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
DATE_RXS = [
    (re.compile(r"\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d\d|\d\d)\b"), "mdy"),
    (re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b", re.I), "Mdy"),
    (re.compile(r"\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d\d)\b", re.I), "dMy"),
]
DATE_LABEL = re.compile(r"(statement|bill|billing|invoice|issue|issued|payment|transaction|receipt|order|service|closing|paid|"
                        r"date\s+of\s+service|donation|contribution|gift|sale|purchase|received|dated?)\s*(date|on)?\s*:?\s*$", re.I)
ADDRESS_RX = re.compile(r"\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Z][A-Za-z0-9.'\-]+(?:\s+[A-Z][A-Za-z0-9.'\-]+){0,3}\s+"
                        r"(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|"
                        r"Highway|Hwy|Parkway|Pkwy|Trail|Trl|Loop)\b\.?(?:\s*(?:#|Apt\.?|Unit|Ste\.?|Suite)\s*\w+)?")
FILENAME_FORM_HINTS = [
    (re.compile(r"\bw-?2\b(?![gc])", re.I), "W-2"), (re.compile(r"\bw-?2g\b", re.I), "W-2G"), (re.compile(r"\b1099-?\s?nec\b", re.I), "1099-NEC"),
    (re.compile(r"\b1099-?\s?misc\b", re.I), "1099-MISC"), (re.compile(r"\b1099-?\s?int\b", re.I), "1099-INT"), (re.compile(r"\b1099-?\s?div\b", re.I), "1099-DIV"),
    (re.compile(r"\b1099-?\s?b\b", re.I), "1099-B"), (re.compile(r"\b1099-?\s?r\b", re.I), "1099-R"), (re.compile(r"\b1099-?\s?g\b", re.I), "1099-G"),
    (re.compile(r"\b1099-?\s?k\b", re.I), "1099-K"), (re.compile(r"\b1099-?\s?sa\b", re.I), "1099-SA HSA Distributions"),
    (re.compile(r"\b1098-?\s?t\b", re.I), "1098-T Tuition"), (re.compile(r"\b1098-?\s?e\b", re.I), "1098-E Student Loan Interest"),
    (re.compile(r"\b1098\b(?!-)", re.I), "1098 Mortgage Interest"), (re.compile(r"\b1095-?\s?a\b", re.I), "1095-A"), (re.compile(r"\b1095-?\s?b\b", re.I), "1095-B"),
    (re.compile(r"\b1095-?\s?c\b", re.I), "1095-C"), (re.compile(r"\b5498-?\s?sa\b", re.I), "5498-SA HSA Contributions"), (re.compile(r"\b5498\b(?!-)", re.I), "5498 IRA Contributions"),
    (re.compile(r"\bk-?1\b", re.I), "Schedule K-1 (1065)"), (re.compile(r"\b1040\b", re.I), "Form 1040 Return"), (re.compile(r"\bssa-?1099\b", re.I), "SSA-1099"),
    (re.compile(r"\bw-?2c\b", re.I), "W-2c"), (re.compile(r"\b1040-?es\b", re.I), "1040-ES Voucher"),
]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def norm_text(text: str) -> str:
    text = text.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"[ \t]+", " ", text)


def score_rules(text: str) -> Tuple[Dict[str, float], Dict[str, List[str]]]:
    scores: Dict[str, float] = {}
    reasons: Dict[str, List[str]] = {}
    for rule in RULES:
        total, found = 0.0, []
        for rx, w, _brand in rule.get("strong", []):
            m = rx.search(text)
            if m:
                total += w
                found.append(m.group(0).strip()[:40])
        weak = 0.0
        for rx, w, _brand in rule.get("weak", []):
            m = rx.search(text)
            if m:
                weak += w
                found.append(m.group(0).strip()[:40])
        total += min(weak, rule.get("weak_cap", 3.0))
        if total > 0:
            scores[rule["type"]] = round(total, 2)
            reasons[rule["type"]] = found
    return scores, reasons


def confidence(best: float, second: float, quality: str) -> float:
    if best <= 0:
        return 0.0
    conf = 1.0 / (1.0 + math.exp(-(best - 5.0) / 1.8))
    if second > 0:
        conf *= 1.0 - 0.6 * (second / best) ** 2
    if quality == "poor":
        conf *= 0.85
    elif quality == "none":
        conf *= 0.5
    return round(min(conf, 0.97), 2)


def extract_issuer(text: str, doc_type: str) -> Tuple[Optional[str], List[str]]:
    candidates: List[str] = []
    lines = [ln.strip() for ln in text.splitlines()]
    # 1. labelled blocks on IRS forms
    for rx in ISSUER_LABELS:
        m = rx.search(text)
        if not m:
            continue
        tail = text[m.end(): m.end() + 400]
        tail = LABEL_TAIL.sub("", tail, count=1)
        for seg in SEGMENT_SPLIT.split(tail):
            seg = (seg or "").strip(" :,-|")
            if not seg or LABEL_LINE.search(seg):
                continue
            if re.search(r"[A-Za-z]{3,}", seg) and len(seg) <= 80:
                cand = clean_entity(seg)
                if cand and len(cand) >= 3:
                    candidates.append(cand)
                    break
        if candidates:
            break
    # Returns, transcripts, notices and identity documents: no guessed issuer (the agent may set the person's name)
    if doc_type in RETURN_TYPES or doc_type in ("IRS Notice", "IP PIN Notice", "ITIN Letter", "Unknown") \
            or DOC_TYPES.get(doc_type, ("",))[0] == IDENTITY:
        return None, []
    # 2. fixed issuers
    if doc_type == "SSA-1099":
        return "Social Security Administration", ["Social Security Administration"]
    if doc_type == "RRB-1099":
        return "Railroad Retirement Board", ["Railroad Retirement Board"]
    if doc_type == "1095-A":
        m = re.search(r"(?i:marketplace\s+identifier)\s*:?\s*([A-Z]{2})\b", text)
        if m:
            candidates.append("Marketplace %s" % m.group(1).upper())
    # 3. brand / organisation names from the rule that won
    rule = RULES_BY_TYPE.get(doc_type)
    if rule:
        for rx, w, brand in rule.get("strong", []) + rule.get("weak", []):
            if not brand:
                continue
            m = rx.search(text)
            if m:
                cand = clean_entity(m.group(0))
                if cand:
                    candidates.append(cand)
                    break
    # 4. lines that look like organisation names
    for line in lines[:60]:
        if CORP_LINE.match(line) and not LABEL_LINE.search(line):
            cand = clean_entity(line)
            if cand and cand not in candidates:
                candidates.append(cand)
        if len(candidates) >= 5:
            break
    # 5. letterhead: a short first line made of words (letters, receipts, statements)
    for line in lines[:3]:
        if (3 <= len(line) <= 50 and re.fullmatch(r"[A-Za-z][A-Za-z&.,'\- ]+", line)
                and len(line.split()) >= 2 and not LABEL_LINE.search(line)
                and not re.match(r"(dear|form|thank|re:|to:|from:|date|page|invoice|receipt|statement)\b", line, re.I)):
            cand = clean_entity(line)
            if cand and cand not in candidates:
                candidates.append(cand)
            break
    seen, uniq = set(), []
    for c in candidates:
        if c.lower() not in seen:
            seen.add(c.lower())
            uniq.append(c)
    return (uniq[0] if uniq else None), uniq[:5]


def extract_tax_year(text: str, hints: Dict, date: Optional[str]) -> Tuple[Optional[int], str]:
    this_year = datetime.now().year
    for rx in YEAR_PATTERNS:
        m = rx.search(text)
        if m:
            y = int(m.group(1))
            if 2000 <= y <= this_year + 1:
                return y, "text"
    years = [int(y) for y in re.findall(r"\b(20\d\d)\b", text) if 2000 <= int(y) <= this_year + 1]
    if years:
        y, n = Counter(years).most_common(1)[0]
        if n >= 2:
            return y, "frequency"
        if len(set(years)) == 1:
            return y, "only year in text"
    if hints.get("years"):
        return int(hints["years"][0]), "filename"
    if date:
        return int(date[:4]), "date"
    return None, "unknown"


def _iso(y: int, m: int, d: int) -> Optional[str]:
    try:
        return datetime(y, m, d).strftime("%Y-%m-%d")
    except ValueError:
        return None


def _match_to_iso(m, kind: str) -> Optional[str]:
    g = m.groups()
    try:
        if kind == "ymd":
            return _iso(int(g[0]), int(g[1]), int(g[2]))
        if kind == "mdy":
            y = int(g[2])
            y = y + 2000 if y < 100 else y
            return _iso(y, int(g[0]), int(g[1]))
        if kind == "Mdy":
            return _iso(int(g[2]), MONTHS[g[0].lower()[:3]], int(g[1]))
        if kind == "dMy":
            return _iso(int(g[2]), MONTHS[g[1].lower()[:3]], int(g[0]))
    except (ValueError, KeyError):
        return None
    return None


def extract_dates(text: str, hints: Dict) -> Tuple[Optional[str], List[str]]:
    this_year = datetime.now().year
    labelled: List[str] = []
    all_dates: List[str] = []
    for rx, kind in DATE_RXS:
        for m in rx.finditer(text):
            iso = _match_to_iso(m, kind)
            if not iso or not (2000 <= int(iso[:4]) <= this_year + 1):
                continue
            all_dates.append(iso)
            before = text[max(0, m.start() - 28): m.start()]
            if DATE_LABEL.search(before):
                labelled.append(iso)
    uniq = []
    for d in labelled + all_dates:
        if d not in uniq:
            uniq.append(d)
    chosen = labelled[0] if labelled else (all_dates[0] if all_dates else None)
    if not chosen:  # month-only statements: "December 2025", "Jul 2026"
        m = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d\d)\b", text, re.I)
        if m and 2000 <= int(m.group(2)) <= this_year + 1:
            chosen = "%s-%02d" % (m.group(2), MONTHS[m.group(1).lower()[:3]])
            uniq.append(chosen)
    if not chosen and hints.get("dates"):
        for raw in hints["dates"]:
            for rx, kind in DATE_RXS:
                m = rx.search(raw.replace("_", "-").replace(".", "-"))
                if m:
                    iso = _match_to_iso(m, kind)
                    if iso:
                        chosen = iso
                        break
            if chosen:
                break
    return chosen, uniq[:6]


def match_labels(text: str, filename: str, labels: Dict[str, List[str]]) -> Tuple[Optional[str], List[str]]:
    hay = (text + "\n" + filename).lower()
    hay = re.sub(r"\s+", " ", hay)
    hits = []
    for label, keywords in labels.items():
        n = 0
        for kw in [label] + list(keywords):
            kw_n = re.sub(r"\s+", " ", kw.lower()).strip()
            if kw_n and kw_n in hay:
                n += 1
        if n:
            hits.append((n, label))
    hits.sort(reverse=True)
    matched = [lab for _, lab in hits]
    if hits and (len(hits) == 1 or hits[0][0] > hits[1][0]):
        return hits[0][1], matched
    return None, matched


def parse_labels(values: List[str]) -> Dict[str, List[str]]:
    result: Dict[str, List[str]] = {}
    for v in values or []:
        if "=" in v:
            label, kws = v.split("=", 1)
            result[label.strip()] = [k.strip() for k in re.split(r"[|;]", kws) if k.strip()]
        else:
            result[v.strip()] = []
    return result


FILENAME_WEIGHT = 1.0   # filename cue scores are scaled by this before being added to the content scores
FILENAME_CAP = 5.0      # and capped: a precise filename counts like one strong content cue, never like a read document
MONTH_WORDS = set("jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august "
                  "september october november december".split())


def filename_text(name: str) -> str:
    """Turn a filename into words the rules can read: 'RentalIncome_Dec2025-Property200.pdf'
    -> 'Rental Income Dec 2025 Property 200'. Form tokens such as w2 or 1099nec are left intact."""
    stem = Path(name).stem
    s = re.sub(r"[_\-.+,;]+", " ", stem)
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)                 # camelCase
    s = re.sub(r"(?<=[A-Za-z]{3})(?=\d)", " ", s)              # Dec2025 -> Dec 2025 (but w2, 1099nec stay)
    s = re.sub(r"(?<=\d)(?=[A-Z][a-z]{2})", " ", s)            # 2025Statement -> 2025 Statement
    return re.sub(r"\s+", " ", s).strip()


def filename_entity(name: str, doc_type: str) -> Optional[str]:
    """Words in the filename that are not the document type, a form id, a date or filler: a likely payer /
    vendor ('Chase 1099-INT 2025' -> 'Chase'). Returns None when nothing informative is left."""
    stop = set(GENERIC_WORDS) | MONTH_WORDS | {
        "bill", "bills", "statement", "statements", "receipt", "receipts", "invoice", "invoices", "income", "rental",
        "rent", "payment", "payments", "record", "records", "signed", "scanned", "copy", "final", "letter", "notice",
        "summary", "annual", "monthly", "quarterly", "year", "end", "yearend", "tax", "taxes", "return", "returns",
        "form", "forms", "page", "pages", "part", "schedule", "property", "business", "personal", "home", "office",
        "paid", "due", "confirmation", "report", "detail", "details", "info", "information", "doc", "document"}
    for t in DOC_TYPES:
        stop.update(w.lower() for w in re.findall(r"[A-Za-z]+", t))
    stop.update(w.lower() for w in re.findall(r"[A-Za-z]+", doc_type or ""))
    words = []
    for tok in filename_text(name).split(" "):
        if not tok or FORM_TOKEN_RE.match(tok) or re.fullmatch(r"\d+[a-z]*", tok, re.I) or DATE_TOKEN_RE.match(tok):
            continue
        if re.fullmatch(r"[A-Za-z][A-Za-z'&]*", tok) and tok.lower() not in stop and len(tok) >= 2:
            words.append(tok)
        elif re.fullmatch(r"[A-Za-z]+\d{1,4}", tok) and tok[:1].isalpha() and tok.lower() not in stop:
            words.append(tok)  # 'Property200' style labels
    if not words or len(words) > 4:
        return None
    return clean_entity(" ".join(words))


def detect_suffix(text: str, filename: str) -> Optional[str]:
    if re.search(r"\bcorrected\b", filename, re.I) or re.search(r"\bCORRECTED\b(?!\s*\(?\s*if\s+checked)", text):
        return "CORRECTED"
    if re.search(r"\bamended\b", filename, re.I) or re.search(r"\bamended\s+(return|statement|k-?1)\b", text, re.I):
        return "AMENDED"
    return None


# --------------------------------------------------------------------------
# per-file classification
# --------------------------------------------------------------------------

def classify_file(f: Dict, rec: Optional[Dict], text: str, cfg: Dict, target_year: Optional[int],
                  vision_log: Optional[Dict] = None) -> Dict:
    notes: List[str] = []
    filename = f["name"]
    hints = f.get("filename_hints", {})
    raw = text or ""
    text_n = norm_text(raw)
    quality = rec["quality"] if rec else "none"
    needs_vision = bool(rec and rec.get("needs_vision"))
    # Vision verdict for files the scripts could not read. "pending": the agent still has to open the page
    # images (apply_plan.py refuses to run until then); "failed": the agent looked and could not identify it
    # (recorded by edit_plan.py --vision-failed in <work>/vision.json, keyed by hash so it survives re-runs).
    vision: Optional[str] = None
    if needs_vision:
        prior = (vision_log or {}).get(f["hash"]) or {}
        vision = "failed" if prior.get("result") == "failed" else "pending"

    scores, reasons = score_rules(text_n)
    content_top = max(scores.items(), key=lambda kv: kv[1]) if scores else (None, 0.0)
    # The filename is evidence too: words such as "Rental Income", "Electric Bill" or "W2 Acme" are scored with
    # the same rules as the content (scaled and capped), and form ids in the name add a little on their own.
    # When the content is readable and disagrees, the content wins and the disagreement is noted.
    fn_text = filename_text(filename)
    fn_scores, fn_reasons = score_rules(fn_text)
    fn_evidence: Dict[str, float] = {}
    for dtype, s in fn_scores.items():
        add = round(min(s * FILENAME_WEIGHT, FILENAME_CAP), 2)
        fn_evidence[dtype] = fn_evidence.get(dtype, 0.0) + add
        reasons.setdefault(dtype, []).append("filename: %s" % ", ".join(fn_reasons[dtype][:3]))
    for rx, dtype in FILENAME_FORM_HINTS:
        if rx.search(filename):
            fn_evidence[dtype] = fn_evidence.get(dtype, 0.0) + 1.5
            reasons.setdefault(dtype, []).append("filename: %s" % filename)
    for dtype, add in fn_evidence.items():
        scores[dtype] = round(scores.get(dtype, 0.0) + add, 2)
    fn_top = max(fn_evidence.items(), key=lambda kv: kv[1]) if fn_evidence else (None, 0.0)
    if fn_top[0] and content_top[0] and fn_top[0] != content_top[0] and fn_top[1] >= 1.5 and content_top[1] >= 5:
        notes.append("filename suggests %s; content reads as %s (content wins)" % (fn_top[0], content_top[0]))
    # consolidated brokerage packages
    detected_forms = [t for t, s in scores.items() if t in INFO_RETURNS and s >= 5]
    if len({"1099-B", "1099-DIV", "1099-INT", "1099-OID"} & set(detected_forms)) >= 2:
        scores["Consolidated 1099"] = round(max(scores.values()) + 1, 2)
        reasons.setdefault("Consolidated 1099", []).append("contains %s" % ", ".join(sorted(detected_forms)))

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    doc_type = ranked[0][0] if ranked else "Unknown"
    best = ranked[0][1] if ranked else 0.0
    second = ranked[1][1] if len(ranked) > 1 else 0.0
    if doc_type == "Consolidated 1099":
        second = 0.0
    conf = confidence(best, second, quality)
    alternatives = [(t, s) for t, s in ranked[1:4]]
    if len(detected_forms) > 1 and doc_type != "Consolidated 1099":
        notes.append("package may contain several forms: %s" % ", ".join(sorted(detected_forms)))

    category, style = DOC_TYPES.get(doc_type, (REVIEW_FOLDER, "none"))
    date, dates = extract_dates(text_n, hints)
    if not date:
        fn_date, fn_dates = extract_dates(fn_text, {})
        if fn_date:
            date, dates = fn_date, dates + [d for d in fn_dates if d not in dates]
            notes.append("date taken from the filename")
    tax_year, ty_source = extract_tax_year(text_n, hints, date if style == "date" else None)
    issuer, issuer_candidates = extract_issuer(raw, doc_type)
    fn_entity = filename_entity(filename, doc_type) if doc_type not in ("Unknown",) else None
    if fn_entity and fn_entity.lower() not in {c.lower() for c in issuer_candidates}:
        issuer_candidates = issuer_candidates + [fn_entity]
    if not issuer and fn_entity and DOC_TYPES.get(doc_type, ("",))[0] != IDENTITY:
        issuer = fn_entity
        notes.append("payer/vendor taken from the filename")
    addresses = []
    for m in ADDRESS_RX.finditer(raw):
        a = re.sub(r"\s+", " ", m.group(0)).strip()
        if a not in addresses:
            addresses.append(a)
        if len(addresses) >= 5:
            break

    property_label, prop_hits = match_labels(text_n, filename, cfg.get("properties", {}))
    business_label, biz_hits = match_labels(text_n, filename, cfg.get("businesses", {}))
    entity = issuer
    subfolder = None
    if property_label and doc_type in PROPERTY_SENSITIVE:
        category = "Income - Rental"
        entity = property_label
        if cfg.get("group_by_entity"):
            subfolder = property_label
        notes.append("matched property %s" % property_label)
    elif business_label and doc_type in BUSINESS_SENSITIVE:
        category = "Income - Self-employment"
        if doc_type not in INFO_RETURNS:
            entity = business_label if doc_type in ("Mileage Log", "Profit and Loss", "Payment App Statement", "Bank Statement",
                                                     "Credit Card Statement") else (issuer or business_label)
        if cfg.get("group_by_entity"):
            subfolder = business_label
        notes.append("matched business %s" % business_label)
    elif len(prop_hits) > 1:
        notes.append("mentions several properties: %s" % ", ".join(prop_hits))
    if doc_type == "Insurance Premium" and not property_label and re.search(r"landlord|dwelling|rental\s+property|dp-?3", text_n, re.I):
        notes.append("landlord/dwelling policy; confirm which property")

    status = "ready"
    if doc_type in RETURN_TYPES:
        if tax_year and target_year:
            category = RETURNS_LAST if tax_year < target_year else RETURNS_THIS
        else:
            category = RETURNS_LAST
            status = "review"
            notes.append("return year vs. target tax year unclear")
    if doc_type == "Unknown":
        category = REVIEW_FOLDER
        status = "review"
        notes.append("no document type matched")
    if doc_type == "IRS Notice":
        status = "review"
        notes.append("IRS notice: decide which return it belongs to")
    if needs_vision:
        status = "review"
        notes.append(rec.get("vision_reason", "text unreadable"))
        if vision == "failed":
            notes.append("AI vision failed: %s" % (vision_log or {}).get(f["hash"], {}).get("reason", "could not identify"))
    if conf < cfg.get("min_confidence", 0.75):
        status = "review"
        notes.append("low confidence")
    if style == "year" and not tax_year:
        status = "review"
        notes.append("tax year not found")
    if style == "date" and not date:
        notes.append("date not found%s" % ("; using tax year" if tax_year else ""))
        if not tax_year:
            status = "review"
    if doc_type in INFO_RETURNS and not entity:
        status = "review"
        notes.append("payer/issuer not found")
    if doc_type in NEEDS_CONTEXT and not (property_label or business_label):
        status = "review"
        notes.append("needs a property/business label (home utilities are not deductible unless home office)"
                     if doc_type in UTILITY_TYPES else "personal or business? pass --property/--business labels")
    if doc_type == "Property Tax Bill" and not property_label and cfg.get("properties"):
        notes.append("no property label matched; routed to Deductions (personal home)")
    if doc_type == "Payment App Statement" and not business_label:
        notes.append("payment-app statement: goods-and-services payments are self-employment income")

    suffix = detect_suffix(raw, filename)
    when = when_segment(style, tax_year, date)
    # Every classified file is renamed to the convention, with the original filename kept in parentheses, so
    # the folder can be read at a glance and nothing about the old name is lost. --keep-descriptive limits the
    # renaming to generic/hashed names. Files already in the convention and unidentified files keep their names.
    if cfg.get("keep_descriptive"):
        rename = f["name_quality"] in ("generic", "hashed")
    else:
        rename = f["name_quality"] != "convention"
    if doc_type == "Unknown":
        rename = False
    dest_name = build_name(doc_type, entity, when, f["ext"], suffix, original=filename) if rename else filename

    if f.get("duplicate_of"):
        status = "duplicate"
        notes = ["same bytes as %s" % f["duplicate_of"]]
    elif f.get("processed_dest"):
        status = "processed"
        notes = ["already sorted earlier -> %s" % f["processed_dest"]]

    excerpt = re.sub(r"\s+", " ", mask_pii(raw))[:220]
    return {
        "src": f["path"], "rel": f["rel"], "hash": f["hash"], "status": status, "confidence": conf,
        "doc_type": doc_type, "category": category, "subfolder": subfolder, "entity": entity, "issuer": issuer,
        "property": property_label, "business": business_label, "tax_year": tax_year, "tax_year_source": ty_source,
        "date": date, "when_style": style, "suffix": suffix, "name_quality": f["name_quality"], "rename": rename,
        "dest_name": dest_name, "needs_vision": needs_vision, "vision": vision, "page_images": (rec or {}).get("page_images", []),
        "method": (rec or {}).get("method", "none"), "quality": quality, "score": best,
        "reasons": reasons.get(doc_type, [])[:6], "alternatives": alternatives, "forms_detected": sorted(detected_forms),
        "issuer_candidates": issuer_candidates, "addresses": addresses, "dates": dates, "notes": notes, "excerpt": excerpt,
    }


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?")
    ap.add_argument("--out")
    ap.add_argument("--work")
    ap.add_argument("--tax-year", type=int, help="tax year being prepared (default: inferred from the information returns)")
    ap.add_argument("--property", action="append", default=[], metavar="LABEL=KW|KW",
                    help='rental property label and keywords, e.g. "Property 200=200 Oak St|200 OAK STREET" (repeatable)')
    ap.add_argument("--business", action="append", default=[], metavar="LABEL=KW|KW",
                    help='self-employment activity label and keywords, e.g. "Nursing 1099=Travel Nurse Co" (repeatable)')
    ap.add_argument("--keep-descriptive", action="store_true",
                    help="rename only generic/hashed filenames (default: rename every classified file; the original "
                         "filename is always kept in parentheses)")
    ap.add_argument("--rename-all", action="store_true", help=argparse.SUPPRESS)  # former opt-in; now the default
    ap.add_argument("--group-by-entity", action="store_true", help="create a subfolder per property/business label")
    ap.add_argument("--min-confidence", type=float, default=None, help="below this the item needs review (default 0.75)")
    ap.add_argument("--max-chars", type=int, default=12000, help="characters of text considered per file")
    ap.add_argument("--reset-labels", action="store_true", help="forget property/business labels saved in <work>/config.json")
    args = ap.parse_args()

    paths = resolve_paths(args.input, args.out, args.work)
    work = ensure_work(paths["work"])
    inventory = load_json(work / "inventory.json")
    extracted = load_json(work / "extracted.json", {}) or {}
    if not inventory:
        sys.stderr.write("run inventory.py and extract_text.py first\n")
        return 1
    if not extracted:
        sys.stderr.write("run extract_text.py first (no extracted.json)\n")
        return 1

    cfg = load_json(work / "config.json", {}) or {}
    if args.reset_labels:
        cfg["properties"], cfg["businesses"] = {}, {}
    cfg.setdefault("properties", {}).update(parse_labels(args.property))
    cfg.setdefault("businesses", {}).update(parse_labels(args.business))
    if args.tax_year:
        cfg["tax_year"] = args.tax_year
    if args.min_confidence is not None:
        cfg["min_confidence"] = args.min_confidence
    cfg.setdefault("min_confidence", 0.75)
    if args.keep_descriptive:
        cfg["keep_descriptive"] = True
    if args.rename_all:
        cfg["keep_descriptive"] = False
    if args.group_by_entity:
        cfg["group_by_entity"] = True
    cfg.setdefault("keep_descriptive", False)
    cfg.setdefault("group_by_entity", False)
    cfg.pop("rename_all", None)
    save_json(work / "config.json", cfg)

    texts: Dict[str, str] = {}
    for f in inventory["files"]:
        rec = extracted.get(f["hash"])
        if not rec and f.get("duplicate_of"):
            primary = next((x for x in inventory["files"] if x["rel"] == f["duplicate_of"]), None)
            rec = extracted.get(primary["hash"]) if primary else None
        text = ""
        if rec and rec.get("text_file") and Path(rec["text_file"]).exists():
            text = Path(rec["text_file"]).read_text(encoding="utf-8", errors="ignore")[: args.max_chars]
        texts[f["hash"]] = text

    vision_log = load_json(work / "vision.json", {}) or {}

    # pass 1: provisional classification to infer the target tax year
    provisional = [classify_file(f, extracted.get(f["hash"]), texts[f["hash"]], cfg, None, vision_log) for f in inventory["files"]]
    target_year, ty_source = cfg.get("tax_year"), "given"
    if not target_year:
        years = [p["tax_year"] for p in provisional if p["doc_type"] in INFO_RETURNS and p["tax_year"]]
        if years:
            target_year, ty_source = Counter(years).most_common(1)[0][0], "inferred from %d information returns" % len(years)
        else:
            years = [p["tax_year"] for p in provisional if p["tax_year"] and p["doc_type"] not in RETURN_TYPES]
            if years:
                target_year, ty_source = Counter(years).most_common(1)[0][0], "inferred from %d dated documents" % len(years)
            elif cfg.get("tax_year_inferred"):
                target_year, ty_source = cfg["tax_year_inferred"], "inferred on an earlier run"
    if target_year and ty_source != "given":
        cfg["tax_year_inferred"] = target_year
        save_json(work / "config.json", cfg)
    # pass 2: final
    items = []
    for i, f in enumerate(inventory["files"], 1):
        it = classify_file(f, extracted.get(f["hash"]), texts[f["hash"]], cfg, target_year, vision_log)
        if target_year and it["tax_year"] and it["doc_type"] in INFO_RETURNS and it["tax_year"] != target_year:
            it["notes"].append("tax year %s differs from target %s" % (it["tax_year"], target_year))
            if it["status"] == "ready":
                it["status"] = "review"
        it["index"] = i
        items.append(it)

    plan = {
        "generated": now_iso(), "input": inventory["input"], "out": inventory["out"], "work": str(work),
        "tax_year": target_year, "tax_year_source": ty_source, "min_confidence": cfg["min_confidence"],
        "labels": {"properties": cfg["properties"], "businesses": cfg["businesses"]},
        "group_by_entity": cfg["group_by_entity"], "items": items,
    }
    write_plan(plan, work)

    by_status = Counter(it["status"] for it in items)
    print("Classified %d files -> %s" % (len(items), work / "plan.md"))
    print("  tax year : %s (%s)" % (target_year or "unknown", ty_source))
    print("  status   : %s" % ", ".join("%s %d" % kv for kv in sorted(by_status.items())))
    folders = Counter(it["category"] for it in items if it["status"] == "ready")
    for folder, n in sorted(folders.items()):
        print("  %-36s %d" % (folder, n))
    review = [it for it in items if it["status"] == "review"]
    if review:
        print("")
        print("Review (%d):" % len(review))
        for it in review:
            print("  %3d. %-40s guess %s / %s (%.2f) - %s" % (
                it["index"], it["rel"][:40], it["category"], it["doc_type"], it["confidence"], "; ".join(it["notes"])[:120]))
    pending = [it for it in items if it["status"] == "review" and it.get("vision") == "pending"]
    if pending:
        print("")
        print("VISION PENDING (%d) - the scripts could not read these. Open the page images with the Read tool and" % len(pending))
        print("identify each one yourself; apply_plan.py will not run until every one has a verdict:")
        for it in pending:
            print("  %3d. %s" % (it["index"], it["rel"]))
            for img in it["page_images"][:6]:
                print("       %s" % img)
            if not it["page_images"]:
                print("       (no page images: %s)" % "; ".join(it["notes"])[:100])
        print("  identified : edit_plan.py --work \"%s\" --item N --set doc_type=\"...\" --set entity=\"...\" --status ready" % work)
        print("  unreadable : edit_plan.py --work \"%s\" --item N --vision-failed \"what you saw (blurry, cropped, blank)\"" % work)
    print("")
    print("Read %s, fix items with edit_plan.py, then: python3 %s/apply_plan.py --work \"%s\" [--yes]" % (
        work / "plan.md", Path(__file__).resolve().parent, work))
    return 0


if __name__ == "__main__":
    sys.exit(main())
