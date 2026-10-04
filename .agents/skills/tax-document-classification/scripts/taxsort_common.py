#!/usr/bin/env python3
"""Shared helpers for the tax-document-classification scripts.

Python 3.8+, standard library only. The sibling scripts import this module.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

WORK_DIRNAME = ".tax-sorter"
DEFAULT_INPUT = os.path.join("sorter", "stage")

RETURNS_LAST = "_Last year's return"
IDENTITY = "_Proof of identity"
RETURNS_THIS = "_This year's return"
REVIEW_FOLDER = "zz_Needs review"
DUPLICATES_FOLDER = "zz_Duplicates"

# Folder taxonomy. The leading underscore forces those folders to sort first,
# "zz_" forces the two housekeeping folders to sort last.
TAXONOMY: List[Tuple[str, str]] = [
    (RETURNS_LAST, "Prior-year federal and state returns, IRS transcripts, prior-year e-file acceptance letters"),
    (IDENTITY, "Driver license / state ID, passport, Social Security card, ITIN letter, IP PIN notice, birth certificates"),
    (RETURNS_THIS, "Drafts, filed copies and e-file acceptance for the tax year being prepared"),
    ("Credits", "1098-T, childcare provider statements, energy-improvement and clean-vehicle purchase records"),
    ("Deductions", "1098 mortgage interest, 1098-E, property tax bills (personal home), donation receipts, medical bills and EOBs, vehicle registration, mortgage statements"),
    ("Estimated tax payments", "1040-ES vouchers, IRS Direct Pay / EFTPS and state estimated-payment confirmations"),
    ("Income - Investments", "1099-B, 1099-DIV, 1099-INT, 1099-OID, 1099-DA, consolidated 1099s, brokerage statements, crypto tax statements"),
    ("Income - Other", "1099-G, W-2G, 1099-C, 1099-Q, 1099-S, 1099-LTC, 1099-MISC (non-rental), unemployment statements"),
    ("Income - Partnerships and S-corps", "Schedule K-1 packages (Forms 1065, 1120-S, 1041)"),
    ("Income - Rental", "Owner statements, leases, rent receipts and per-property bills: utilities, insurance, HOA, repairs, property tax, 1098, depreciation schedules"),
    ("Income - Retirement", "1099-R, SSA-1099, RRB-1099"),
    ("Income - Self-employment", "1099-NEC, 1099-K, invoices, business receipts, P&L, mileage logs, payment-app statements"),
    ("Income - Wages", "W-2, W-2c, pay stubs"),
    ("Records - Statements", "Bank and credit card statements not tied to a property or business"),
    ("Regulations - Health Insurance", "1095-A, 1095-B, 1095-C, health insurance premium statements"),
    ("Retirement & HSA", "5498, 5498-SA, 1099-SA, IRA/HSA contribution confirmations"),
    (REVIEW_FOLDER, "Files the pipeline could not classify with confidence (kept with original names)"),
    (DUPLICATES_FOLDER, "Byte-identical copies of files already sorted (kept with original names)"),
]
TAXONOMY_FOLDERS = [name for name, _ in TAXONOMY]

# doc_type -> (default folder, how the trailing name segment is built)
#   "year" -> tax year (annual forms), "date" -> document date, "none" -> omitted
DOC_TYPES: Dict[str, Tuple[str, str]] = {
    # Wages
    "W-2": ("Income - Wages", "year"),
    "W-2c": ("Income - Wages", "year"),
    "Pay Stub": ("Income - Wages", "date"),
    # Self-employment
    "1099-NEC": ("Income - Self-employment", "year"),
    "1099-K": ("Income - Self-employment", "year"),
    "Invoice": ("Income - Self-employment", "date"),
    "Repair Invoice": ("Income - Rental", "date"),
    "Receipt": ("Income - Self-employment", "date"),
    "Profit and Loss": ("Income - Self-employment", "year"),
    "Mileage Log": ("Income - Self-employment", "year"),
    "Payment App Statement": ("Income - Self-employment", "date"),
    # Rental
    "Rental Income Statement": ("Income - Rental", "date"),
    "Lease Agreement": ("Income - Rental", "date"),
    "Rent Receipt": ("Income - Rental", "date"),
    "HOA Statement": ("Income - Rental", "date"),
    "Depreciation Schedule": ("Income - Rental", "year"),
    "Electric Bill": ("Income - Rental", "date"),
    "Gas Bill": ("Income - Rental", "date"),
    "Water Bill": ("Income - Rental", "date"),
    "Internet Bill": ("Income - Rental", "date"),
    "Phone Bill": ("Income - Rental", "date"),
    "Insurance Premium": ("Income - Rental", "date"),
    "Closing Disclosure": ("Income - Rental", "date"),
    # Investments
    "1099-B": ("Income - Investments", "year"),
    "1099-DIV": ("Income - Investments", "year"),
    "1099-INT": ("Income - Investments", "year"),
    "1099-OID": ("Income - Investments", "year"),
    "1099-DA": ("Income - Investments", "year"),
    "Consolidated 1099": ("Income - Investments", "year"),
    "Brokerage Statement": ("Income - Investments", "date"),
    "Crypto Tax Statement": ("Income - Investments", "year"),
    # Retirement income
    "1099-R": ("Income - Retirement", "year"),
    "SSA-1099": ("Income - Retirement", "year"),
    "RRB-1099": ("Income - Retirement", "year"),
    # Pass-through
    "Schedule K-1 (1065)": ("Income - Partnerships and S-corps", "year"),
    "Schedule K-1 (1120-S)": ("Income - Partnerships and S-corps", "year"),
    "Schedule K-1 (1041)": ("Income - Partnerships and S-corps", "year"),
    # Other income
    "1099-G": ("Income - Other", "year"),
    "W-2G": ("Income - Other", "year"),
    "1099-C": ("Income - Other", "year"),
    "1099-Q": ("Income - Other", "year"),
    "1099-S": ("Income - Other", "year"),
    "1099-LTC": ("Income - Other", "year"),
    "1099-MISC": ("Income - Other", "year"),
    "1099-PATR": ("Income - Other", "year"),
    "Unemployment Statement": ("Income - Other", "date"),
    # Deductions
    "1098 Mortgage Interest": ("Deductions", "year"),
    "1098-E Student Loan Interest": ("Deductions", "year"),
    "1098-C Vehicle Donation": ("Deductions", "year"),
    "Property Tax Bill": ("Deductions", "date"),
    "Mortgage Statement": ("Deductions", "date"),
    "Donation Receipt": ("Deductions", "date"),
    "Medical Bill": ("Deductions", "date"),
    "Explanation of Benefits": ("Deductions", "date"),
    "Vehicle Registration": ("Deductions", "date"),
    # Credits
    "1098-T Tuition": ("Credits", "year"),
    "Student Account Statement": ("Credits", "date"),
    "Childcare Statement": ("Credits", "year"),
    "Energy Improvement Receipt": ("Credits", "date"),
    "Clean Vehicle Purchase": ("Credits", "date"),
    # Retirement & HSA
    "5498 IRA Contributions": ("Retirement & HSA", "year"),
    "5498-SA HSA Contributions": ("Retirement & HSA", "year"),
    "1099-SA HSA Distributions": ("Retirement & HSA", "year"),
    # Health insurance
    "1095-A": ("Regulations - Health Insurance", "year"),
    "1095-B": ("Regulations - Health Insurance", "year"),
    "1095-C": ("Regulations - Health Insurance", "year"),
    "Health Insurance Premium Statement": ("Regulations - Health Insurance", "date"),
    # Estimated taxes
    "1040-ES Voucher": ("Estimated tax payments", "date"),
    "Estimated Tax Payment Confirmation": ("Estimated tax payments", "date"),
    # Returns (folder decided by tax year vs. target year in classify.py)
    "Form 1040 Return": (RETURNS_LAST, "year"),
    "State Tax Return": (RETURNS_LAST, "year"),
    "Tax Return Transcript": (RETURNS_LAST, "year"),
    "IRS Notice": (REVIEW_FOLDER, "date"),
    # Identity
    "Driver License": (IDENTITY, "none"),
    "Passport": (IDENTITY, "none"),
    "Social Security Card": (IDENTITY, "none"),
    "Birth Certificate": (IDENTITY, "none"),
    "IP PIN Notice": (IDENTITY, "year"),
    "ITIN Letter": (IDENTITY, "date"),
    # Statements
    "Bank Statement": ("Records - Statements", "date"),
    "Credit Card Statement": ("Records - Statements", "date"),
    "Loan Statement": ("Records - Statements", "date"),
    "Unknown": (REVIEW_FOLDER, "none"),
}

# Information returns: the filename needs the payer/issuer to be useful.
INFO_RETURNS = {
    t for t in DOC_TYPES
    if re.match(r"^(W-2|1099|1098|1095|5498|Schedule K-1|SSA-1099|RRB-1099|Consolidated 1099)", t)
}

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

def resolve_paths(input_arg: Optional[str], out_arg: Optional[str], work_arg: Optional[str]) -> Dict[str, Path]:
    """Resolve input / output / work folders.

    input : given folder, else ./sorter/stage if it exists.
    out   : given folder; else <input>/../sorted when the input folder is named
            "stage" (sorter/stage -> sorter/sorted); else the input folder itself
            (sort in place).
    work  : given folder; else <out>/.tax-sorter
    """
    if input_arg:
        inp = Path(input_arg).expanduser().resolve()
    else:
        inp = Path(DEFAULT_INPUT).resolve()
        if not inp.is_dir():
            die("No input folder given and ./%s does not exist. Pass the folder to sort." % DEFAULT_INPUT)
    if not inp.is_dir():
        die("Input folder not found: %s" % inp)
    if out_arg:
        out = Path(out_arg).expanduser().resolve()
    elif inp.name.lower() in ("stage", "inbox", "staging"):
        out = inp.parent / "sorted"
    else:
        out = inp
    work = Path(work_arg).expanduser().resolve() if work_arg else out / WORK_DIRNAME
    return {"input": inp, "out": out, "work": work, "in_place": out == inp}


def ensure_work(work: Path) -> Path:
    for sub in ("", "text", "pages", "attachments"):
        (work / sub).mkdir(parents=True, exist_ok=True)
    return work


def is_within(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def rel(path: Path, base: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(base.resolve()))
    except ValueError:
        return str(path)


def die(msg: str, code: int = 2) -> None:
    sys.stderr.write("error: %s\n" % msg)
    sys.exit(code)


def warn(msg: str) -> None:
    sys.stderr.write("warning: %s\n" % msg)


# --------------------------------------------------------------------------
# JSON / hashing / tools
# --------------------------------------------------------------------------

def load_json(path: Path, default=None):
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False, sort_keys=False)
    os.replace(tmp, path)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tool_available(name: str) -> bool:
    return shutil.which(name) is not None


def run(cmd: List[str], timeout: int = 180) -> Tuple[int, str, str]:
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, "", str(exc)
    return proc.returncode, proc.stdout.decode("utf-8", "replace"), proc.stderr.decode("utf-8", "replace")


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


# --------------------------------------------------------------------------
# Filename quality (generic / hashed / descriptive)
# --------------------------------------------------------------------------

GENERIC_WORDS = set("""
scan scanned scanner scans img image images photo photos picture pic pics document documents doc docs file files
download downloads downloaded untitled new copy final print printout attachment attachments screenshot screen shot
pdf jpg jpeg png page pages temp tmp export exported report adobe camscanner genius whatsapp pxl dsc dcim mvimg
signal telegram messenger fax efax statement estatement receipt invoice form forms tax taxes letter upload uploads
capture captured version draft the and for from of my our a an to in on at with scanned_document docscan paper
""".split())

FORM_TOKEN_RE = re.compile(
    r"^(w-?2[gc]?|1099(-?[a-z]{1,4})?|1098(-?[tec])?|1095(-?[abc])?|5498(-?sa)?|k-?1|1040(-?(es|sr|x))?"
    r"|ssa-?1099|rrb-?1099|1042-?s|w-?9|w-?4|8949|1065|1120-?s|1041)$",
    re.I,
)
HEX_RE = re.compile(r"^[0-9a-f]{16,}$", re.I)
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
CONVENTION_RE = re.compile(r"^.+ - .+ - \d{4}(-\d{2}){0,2}( - (CORRECTED|AMENDED|FINAL))?$")
DATE_TOKEN_RE = re.compile(r"^(19|20)\d\d([-._/]\d{1,2}){1,2}$|^\d{1,2}[-._/]\d{1,2}[-._/](19|20)?\d\d$")


def name_quality(stem: str) -> str:
    """Return 'hashed', 'generic', 'convention' or 'descriptive' for a filename stem."""
    s = stem.strip()
    if not s:
        return "generic"
    if CONVENTION_RE.match(s):
        return "convention"
    compact = re.sub(r"[\s_\-.()\[\]]+", "", s)
    if UUID_RE.match(s) or HEX_RE.match(compact):
        return "hashed"
    if re.fullmatch(r"[\d\s_\-.()\[\]]+", s):
        return "generic"
    letter_runs = re.findall(r"[A-Za-z]+", compact)
    if (len(compact) >= 16 and " " not in s and len(re.findall(r"\d", compact)) >= 3
            and all(len(r) < 4 for r in letter_runs)):
        return "hashed"
    informative = 0
    for tok in re.split(r"[\s_.,()\[\]]+", s):
        if not tok:
            continue
        if FORM_TOKEN_RE.match(tok):
            informative += 1
        elif re.fullmatch(r"(19|20)\d\d", tok) or DATE_TOKEN_RE.match(tok):
            informative += 1
        elif re.fullmatch(r"[A-Za-z][A-Za-z'\-&]{2,}", tok) and tok.lower() not in GENERIC_WORDS:
            informative += 1
    return "descriptive" if informative >= 2 else "generic"


# --------------------------------------------------------------------------
# Names
# --------------------------------------------------------------------------

ACRONYMS = {"llc", "llp", "lp", "pc", "pllc", "dba", "hoa", "irs", "ssa", "usa", "dmv", "edd", "ftb", "cpa", "md",
            "dds", "rn", "ladwp", "sce", "pg&e", "at&t", "td", "us", "ubs", "pnc", "bmo", "hsbc", "cvs", "ups", "etf",
            "ira", "hsa", "k-1", "w-2", "ii", "iii", "iv", "na", "n.a.", "fsb", "sa", "ag", "nv", "bv", "mbna", "usaa",
            "aig", "geico", "ibm", "hp", "ge", "att", "tx", "ca", "ny", "la", "adp", "ukg", "lsu", "ucla", "nyu", "mit", "pnc", "jpmorgan"}
SMALL_WORDS = {"of", "and", "the", "for", "de", "la", "del", "&"}


def clean_entity(raw: Optional[str]) -> Optional[str]:
    """Tidy a payer / employer / vendor string for use in a filename."""
    if not raw:
        return None
    s = unicodedata.normalize("NFC", raw)
    s = re.sub(r"\s+", " ", s).strip(" ,.;:-|*#")
    s = re.sub(r"^(payer|employer|lender|recipient|issuer|filer|name)\b[\s:'-]*", "", s, flags=re.I)
    s = re.sub(r"\b(attn|c/o|dept|department)\b.*$", "", s, flags=re.I).strip(" ,.-")
    # cut a trailing street address ("ACME CORP 123 MAIN ST") and trailing label text
    s = re.split(r"\s+(?:P\.?O\.?\s+Box|\d{1,6}\s+[A-Za-z])", s, maxsplit=1)[0].strip(" ,.-")
    s = re.split(r"\s+(?:applicable\s+large\s+employer|employer\s+identification|street\s+address|city\s+or\s+town|"
                 r"explanation\s+of\s+benefits|statement\s+of|account\s+statement|owner\s+statement|tax\s+reporting|"
                 r"year-?end|total\s+checking|platinum|earnings\s+statement|renewal|declarations?)\b", s, maxsplit=1, flags=re.I)[0].strip(" ,.-")
    if len(s) > 60:
        s = s[:60].rsplit(" ", 1)[0]
    if s and (s.isupper() or s.islower()):
        words = []
        for i, w in enumerate(s.split(" ")):
            lw = w.lower().strip(",.")
            if lw in ACRONYMS:
                words.append(w.upper() if "&" not in lw else w.upper())
            elif lw in SMALL_WORDS and i > 0:
                words.append(lw)
            else:
                words.append(w[:1].upper() + w[1:].lower())
        s = " ".join(words)
        s = re.sub(r"\bInc\b\.?", "Inc", s)
        s = re.sub(r"\bCorp\b\.?", "Corp", s)
    return s or None


def sanitize_filename(name: str, max_len: int = 140) -> str:
    name = unicodedata.normalize("NFC", name)
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "-", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    name = re.sub(r"\s*-\s*-\s*", " - ", name)
    if len(name) > max_len:
        stem, dot, ext = name.rpartition(".")
        if dot and len(ext) <= 6:
            stem = stem[: max_len - len(ext) - 1].rstrip(" -")
            name = stem + "." + ext
        else:
            name = name[:max_len].rstrip(" -")
    return name


def build_name(doc_type: str, entity: Optional[str], when: Optional[str], ext: str,
               suffix: Optional[str] = None) -> str:
    """'{Document type} - {Entity} - {YYYY[-MM[-DD]]}[ - CORRECTED].ext'"""
    parts = [str(p).strip() for p in (doc_type, entity, when) if p and str(p).strip()]
    stem = " - ".join(parts)
    if suffix:
        stem += " - " + suffix.strip()
    ext = ext.lower()
    if ext and not ext.startswith("."):
        ext = "." + ext
    return sanitize_filename(stem + ext)


def when_segment(style: str, tax_year: Optional[int], date: Optional[str]) -> Optional[str]:
    if style == "none":
        return None
    if style == "date":
        if date:
            return date
        return str(tax_year) if tax_year else None
    return str(tax_year) if tax_year else (date[:4] if date else None)


# --------------------------------------------------------------------------
# Folder matching (tolerates ’ vs ' and case differences in existing folders)
# --------------------------------------------------------------------------

def normalize_folder(name: str) -> str:
    s = unicodedata.normalize("NFKC", name)
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    s = re.sub(r"\s+", " ", s).strip().lower()
    s = s.replace(" & ", " and ")
    return s


def find_existing_folder(root: Path, category: str) -> Path:
    """Return an existing folder under root that matches category loosely, else root/category."""
    target = normalize_folder(category)
    if root.is_dir():
        for child in sorted(root.iterdir()):
            if child.is_dir() and normalize_folder(child.name) == target:
                return child
    return root / category


# --------------------------------------------------------------------------
# PII masking for cached text and excerpts
# --------------------------------------------------------------------------

SSN_RE = re.compile(r"\b(\d{3})[- ](\d{2})[- ](\d{4})\b")


def mask_pii(text: str) -> str:
    def _m(m):
        a, b, c = m.groups()
        # Keep EIN-looking (NN-NNNNNNN) untouched; this pattern is NNN-NN-NNNN only.
        return "XXX-XX-" + c
    return SSN_RE.sub(_m, text)


# --------------------------------------------------------------------------
# Plan rendering (shared by classify.py and edit_plan.py)
# --------------------------------------------------------------------------

def item_dest(item: Dict, out: Path) -> Tuple[Path, str]:
    """Destination folder and filename for a plan item."""
    status = item.get("status")
    if status in ("duplicate", "processed"):
        return out / DUPLICATES_FOLDER, Path(item["src"]).name
    if status == "review":
        return out / REVIEW_FOLDER, Path(item["src"]).name
    category = item.get("category") or REVIEW_FOLDER
    folder = find_existing_folder(out, category)
    if item.get("subfolder"):
        folder = folder / item["subfolder"]
    name = item.get("dest_name") or Path(item["src"]).name
    return folder, name


def render_plan_md(plan: Dict) -> str:
    out = Path(plan["out"])
    items = plan["items"]
    by_status: Dict[str, List[Dict]] = {}
    for it in items:
        by_status.setdefault(it["status"], []).append(it)
    lines = []
    lines.append("# Sorting plan: %s -> %s" % (plan["input"], plan["out"]))
    lines.append("")
    ty = plan.get("tax_year")
    lines.append("Tax year: %s (%s). Items: %d. %s" % (
        ty if ty else "unknown", plan.get("tax_year_source", "not set"), len(items),
        " · ".join("%s %d" % (k, len(v)) for k, v in sorted(by_status.items()))))
    lines.append("")
    order = ["ready", "review", "duplicate", "processed", "skip"]
    titles = {"ready": "Ready to apply", "review": "Needs review (left in place unless --include-review)",
              "duplicate": "Duplicates (moved to %s)" % DUPLICATES_FOLDER,
              "processed": "Already sorted on an earlier run (moved to %s)" % DUPLICATES_FOLDER,
              "skip": "Skipped"}
    for status in order:
        group = by_status.get(status)
        if not group:
            continue
        lines.append("## %s (%d)" % (titles[status], len(group)))
        lines.append("")
        lines.append("| # | Source | Destination | Type | Conf | Notes |")
        lines.append("|---|---|---|---|---|---|")
        for it in group:
            folder, name = item_dest(it, out)
            dest = rel(folder / name, out) if status != "review" else "guess: %s/%s" % (
                it.get("category"), it.get("dest_name") or Path(it["src"]).name)
            notes = "; ".join(it.get("notes", []))
            if it.get("needs_vision"):
                notes = ("VISION: read page images; " + notes).strip("; ")
            lines.append("| %d | %s | %s | %s | %.2f | %s |" % (
                it["index"], _md(it["rel"]), _md(dest), it.get("doc_type", ""), it.get("confidence", 0.0), _md(notes)))
        lines.append("")
    review = by_status.get("review", [])
    if review:
        lines.append("## Review details")
        lines.append("")
        for it in review:
            lines.append("### %d. %s" % (it["index"], it["rel"]))
            if it.get("excerpt"):
                lines.append("- excerpt: %s" % _md(it["excerpt"]))
            if it.get("alternatives"):
                lines.append("- alternatives: %s" % ", ".join("%s (%.1f)" % (a, s) for a, s in it["alternatives"]))
            if it.get("issuer_candidates"):
                lines.append("- issuer candidates: %s" % "; ".join(it["issuer_candidates"]))
            if it.get("addresses"):
                lines.append("- addresses seen: %s" % "; ".join(it["addresses"]))
            if it.get("dates"):
                lines.append("- dates seen: %s" % ", ".join(it["dates"]))
            if it.get("page_images"):
                lines.append("- page images: %s" % ", ".join(it["page_images"]))
            lines.append("- fix: python3 scripts/edit_plan.py --work \"%s\" --item %d --set doc_type=\"...\" "
                         "--set entity=\"...\" --set date=YYYY-MM-DD --set category=\"...\" --status ready" % (
                             plan["work"], it["index"]))
            lines.append("")
    return "\n".join(lines)


def _md(s: str) -> str:
    return str(s).replace("|", "\\|").replace("\n", " ")


def write_plan(plan: Dict, work: Path) -> None:
    save_json(work / "plan.json", plan)
    with open(work / "plan.md", "w", encoding="utf-8") as fh:
        fh.write(render_plan_md(plan))
