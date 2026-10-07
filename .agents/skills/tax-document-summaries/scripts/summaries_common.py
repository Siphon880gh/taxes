#!/usr/bin/env python3
"""Shared helpers for the tax-document-summaries scripts (Python 3.8+, standard library only).

Knows the standard sections of Summaries.md, how to parse / render the file, how N/A sections are
recognised, and how to find the documents and the classification skill's work folder.
"""
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__

HERE = Path(__file__).resolve().parent
SIBLING_SCRIPTS = HERE.parent.parent / "tax-document-classification" / "scripts"
SUMMARIES_FILENAME = "Summaries.md"
SORTED_FILENAME = "SORTED.md"
WORK_DIRNAME = ".tax-sorter"
WORK_SUBDIR = "summaries"
DEFAULT_FOLDER = os.path.join("sorter", "stage")
STAGE_NAMES = {"stage", "inbox", "staging"}
SYSTEM_FILES = {".ds_store", "thumbs.db", "desktop.ini", ".gitkeep", ".htaccess"}
REPORT_FILES = {SUMMARIES_FILENAME.lower(), SORTED_FILENAME.lower()}

PLACEHOLDER_RE = re.compile(r"\[(NEEDED|VERIFY|TODO|TBD|CONFIRM)(?::\s*[^\]]*)?\]", re.I)
SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
MASKED_SSN_RE = re.compile(r"\bX{3}-X{2}-\d{4}\b", re.I)
EIN_RE = re.compile(r"\b\d{2}-\d{7}\b")
ABS_PATH_RE = re.compile(r"(?<![\w/])(?:/Users/|/home/|[A-Z]:\\)")
NA_VALUES = {"n/a", "n/a.", "na", "na.", "not applicable", "not applicable.", "none", "none.", "n.a.", "-", "—"}
PLACEHOLDER_BLOCK_START = "<!-- placeholders:start -->"
PLACEHOLDER_BLOCK_END = "<!-- placeholders:end -->"

# --------------------------------------------------------------------------
# Standard sections: key, title, aliases, one-line scope. Order = canonical order of a new file.
# --------------------------------------------------------------------------

SECTIONS: List[Tuple[str, str, List[str], str]] = [
    ("needs-answering", "Things that need answering",
     ["Things to answer", "Please answer these", "Answers needed", "Needs answering", "Questions for me"],
     "Questions the summary cannot finish without. Always the first section while any are open; N/A (and listed "
     "last) once they are answered. The user writes the answer under each question, or copies in a new document."),
    ("filing", "Filing Information",
     ["Filing", "Filing Overview", "Taxpayer Information", "Taxpayer & Filing", "Taxpayer and Filing Information",
      "Overview", "Personal Information", "About Me", "General Information", "This Year's Return", "_This year's return",
      "Proof of Identity", "_Proof of identity"],
     "Tax year, filing status, taxpayer and spouse, dependents (names only), address and state(s), identity "
     "documents on file, this year's draft or filed return."),
    ("work", "Work Income / Businesses",
     ["Work Income", "Work Income and Businesses", "Businesses", "Business", "Business Income", "Employment",
      "Employment Income", "Wages", "W-2", "W-2 Wages", "Self-Employment", "Self Employment", "Freelance",
      "Income - Wages", "Income - Self-employment", "Income - Partnerships and S-corps", "Partnerships & S-Corps"],
     "W-2 wages per employer; each self-employment activity with its 1099-NEC/1099-K and other income, expenses by "
     "category, mileage, home office; K-1 packages."),
    ("rental", "Rental Property",
     ["Rental Properties", "Rentals", "Rental", "Rental Income", "Income - Rental", "Rental Property Income",
      "Rental Real Estate"],
     "Per property: ownership, address and unit, rent received, depreciation, and every rental expense with its "
     "rental-share calculation."),
    ("investments", "Investments",
     ["Investment Income", "Interest and Dividends", "Interest & Dividends", "Interest", "Dividends", "Stocks",
      "Brokerage", "Capital Gains", "Crypto", "Digital Assets", "Income - Investments"],
     "Interest and dividends per payer, sales (proceeds, basis, short/long term), digital assets, foreign tax paid, "
     "consolidated 1099 packages."),
    ("retirement", "Retirement & Social Security",
     ["Retirement", "Retirement and Social Security", "Social Security", "Pensions", "Pension", "IRA",
      "IRA Contributions", "Income - Retirement", "Retirement Income", "Retirement & HSA"],
     "1099-R distributions (gross, taxable, code), SSA-1099 benefits, IRA contributions (5498), rollovers, RMDs."),
    ("healthcare", "Healthcare",
     ["Health Care", "Health", "Health Insurance", "Medical", "Medical Expenses", "HSA", "Insurance",
      "Regulations - Health Insurance"],
     "Marketplace 1095-A (months, premiums, SLCSP, advance credit), 1095-B/C, premiums paid, HSA contributions and "
     "distributions, medical expenses paid."),
    ("education", "Education",
     ["Tuition", "Education Expenses", "College", "School", "Student Loans", "Student Loan Interest", "529"],
     "1098-T per student, books and supplies, 1098-E student loan interest, 529 (1099-Q) distributions, who the "
     "student is; education credits belong here."),
    ("dependents", "Dependents & Childcare",
     ["Dependents", "Dependents and Childcare", "Childcare", "Child Care", "Dependent Care", "Children", "Kids",
      "Child Tax Credit"],
     "Dependents (names, relationship, months in the home), childcare providers and amounts paid (Form 2441), "
     "dependent-care FSA."),
    ("home", "Primary Residence",
     ["Home", "Residence", "Personal Residence", "Main Home", "Mortgage", "Homeownership", "Primary Home", "House"],
     "The home you live in: mortgage interest (1098), property tax (personal share), PMI, points, energy "
     "improvements (credit), sale of the home."),
    ("other-income", "Other Income",
     ["Miscellaneous Income", "Misc Income", "Income - Other", "Unemployment", "Gambling", "Other"],
     "1099-G (unemployment, state refund), W-2G, 1099-C, 1099-S (not the home), 1099-MISC other income, jury duty, "
     "prizes, alimony received."),
    ("estimated", "Estimated Tax Payments & Withholding",
     ["Estimated Tax Payments", "Estimated Taxes", "Estimated Payments", "Estimated Tax", "Withholding",
      "Tax Payments", "Payments", "Estimated tax payments"],
     "Federal and state estimated payments by quarter with dates and amounts, prior-year overpayment applied, "
     "extension payment, withholding summary."),
    ("misc-deductions", "Misc Deductions",
     ["Miscellaneous Deductions", "Other Deductions", "Deductions", "Itemized Deductions", "Charitable Donations",
      "Donations", "Charity"],
     "Deductions not tied to another section: charitable donations (cash and non-cash), vehicle registration "
     "(value-based part), state tax paid with last year's return, educator expenses, alimony paid, gambling losses."),
    ("misc-credits", "Misc Credits",
     ["Miscellaneous Credits", "Other Credits", "Credits", "Tax Credits"],
     "Credits not tied to another section: clean vehicle (Form 8936), EV charger, adoption, elderly or disabled "
     "credit, other."),
    ("prior-year", "Prior-Year Return & Carryovers",
     ["Prior Year Return", "Prior-Year Return", "Last Year's Return", "Last Year", "Previous Return", "Prior Return",
      "Carryovers", "Carryover", "_Last year's return", "Prior-Year Return and Carryovers", "Transcripts"],
     "Last year's return (year, AGI, refund or balance, preparer or software), transcripts, carryovers (capital "
     "loss, passive losses, charitable, NOL), IRS notices."),
    ("open-items", "Open Items & Missing Documents",
     ["Open Items", "Open Items and Missing Documents", "Missing Documents", "Questions", "Open Questions",
      "To Do", "Todo", "Outstanding Items", "Follow-ups", "Follow Ups", "Notes for the Tax Professional",
      "Questions for the Tax Professional"],
     "Questions still open, documents expected but not found, numbers read by OCR that still need checking, "
     "files parked in _Needs Human Review."),
]
SECTION_BY_KEY = {k: (t, a, s) for k, t, a, s in SECTIONS}
SECTION_ORDER = [k for k, _, _, _ in SECTIONS]
NEVER_NA_LAST = "open-items"  # always the last section with content
NEEDS_ANSWERING = "needs-answering"  # always the first section while it has questions
QUESTIONS_START = "<!-- questions:start -->"
QUESTIONS_END = "<!-- questions:end -->"
# An Answer: line that points at paperwork instead of stating the fact. Left in place for the next run to read
# the new documents rather than pasted into the summary as a number.
DOC_POINTER_RE = re.compile(
    r"\b(new documents?|copied in|just (copied|added|uploaded)|in the (new )?(file|document|folder|inbox|papers)|"
    r"see (the )?(new|attached|uploaded)|uploaded)\b", re.I)


def _norm_title(title: str) -> str:
    s = unicodedata.normalize("NFKC", title)
    s = s.replace("\u2019", "'").replace("\u2014", "-").replace("\u2013", "-")
    s = s.lower().replace("&", " and ").replace("/", " / ")
    s = re.sub(r"[^a-z0-9'\- /]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" :.-")
    s = re.sub(r"^(?:\d+[.)]\s*)", "", s)  # "1. Rental Property"
    return s


_ALIAS_INDEX: Dict[str, str] = {}
for _k, _t, _aliases, _ in SECTIONS:
    _ALIAS_INDEX[_norm_title(_t)] = _k
    for _a in _aliases:
        _ALIAS_INDEX.setdefault(_norm_title(_a), _k)


def section_key_for_title(title: str) -> Optional[str]:
    n = _norm_title(title)
    if n in _ALIAS_INDEX:
        return _ALIAS_INDEX[n]
    # "Rental Property: 200 Oak St" / "Rental Property - Property 200" -> rental
    head = re.split(r"\s[-:]\s|:\s", n, maxsplit=1)[0].strip()
    if head in _ALIAS_INDEX:
        return _ALIAS_INDEX[head]
    return None


# --------------------------------------------------------------------------
# Parsing and rendering Summaries.md
# --------------------------------------------------------------------------

class Section:
    def __init__(self, title: str, body: str):
        self.title = title.strip()
        self.body = body
        self.key = section_key_for_title(self.title)

    @property
    def is_na(self) -> bool:
        return is_na_body(self.body)

    def render(self) -> str:
        body = self.body.strip("\n")
        return "## %s\n\n%s" % (self.title, body if body.strip() else "N/A")


def strip_comments(text: str) -> str:
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def is_na_body(body: str) -> bool:
    core = strip_comments(body).strip()
    core = re.sub(r"[*_`]+", "", core).strip()
    return core == "" or core.lower() in NA_VALUES


def parse_summaries(text: str) -> Tuple[str, List[Section]]:
    """Split into (header text before the first H2, [Section]). Fenced code blocks are not scanned for headings."""
    lines = text.splitlines()
    header: List[str] = []
    sections: List[Section] = []
    current_title: Optional[str] = None
    current: List[str] = []
    in_fence = False
    for line in lines:
        if re.match(r"^\s*(```|~~~)", line):
            in_fence = not in_fence
        m = re.match(r"^##\s+(?!#)(.+?)\s*#*\s*$", line) if not in_fence else None
        if m:
            if current_title is None:
                header = current
            else:
                sections.append(Section(current_title, "\n".join(current)))
            current_title, current = m.group(1), []
            continue
        current.append(line)
    if current_title is None:
        header = current
    else:
        sections.append(Section(current_title, "\n".join(current)))
    return "\n".join(header).rstrip("\n"), sections


def render_summaries(header: str, sections: List[Section]) -> str:
    parts = [header.rstrip("\n")] if header.strip() else []
    parts.extend(s.render() for s in sections)
    return "\n\n".join(parts).rstrip("\n") + "\n"


def order_sections(sections: List[Section]) -> List[Section]:
    """Sections with information first, then the N/A sections.

    While Things that need answering has questions it is the first section, above every other one. Open Items
    stays last among the sections that have information. N/A sections, including Things that need answering once
    nothing is left to answer, follow. Custom sections are kept; nothing is dropped. File order is kept within
    each group.
    """
    content = [s for s in sections if not s.is_na]
    na = [s for s in sections if s.is_na]
    first = [s for s in content if s.key == NEEDS_ANSWERING]
    last = [s for s in content if s.key == NEVER_NA_LAST]
    mid = [s for s in content if s.key not in (NEEDS_ANSWERING, NEVER_NA_LAST)]
    na = [s for s in na if s.key != NEEDS_ANSWERING] + [s for s in na if s.key == NEEDS_ANSWERING]
    return first + mid + last + na


def missing_standard_sections(sections: List[Section]) -> List[str]:
    present = {s.key for s in sections if s.key}
    return [k for k in SECTION_ORDER if k not in present]


def default_header(tax_year: Optional[int], docs_hint: str, sorted_link: Optional[str]) -> str:
    ty = str(tax_year) if tax_year else "[NEEDED: tax year]"
    where = docs_hint
    if sorted_link:
        where += "; the complete file list is in [%s](%s)" % (SORTED_FILENAME, sorted_link)
    return (
        "# Tax Summaries \u2014 Tax Year %s\n\n"
        "Prepared for my tax professional from my sorted tax documents (%s). Numbers in **bold** come from the "
        "documents linked next to them. Anything still missing is listed first, under **Things that need answering**: "
        "I write the answer under the question, or copy in the document that has it, and run the summary again. "
        "Sections that do not apply to me this year say N/A and are listed at the end.\n\n"
        "_Last updated %s_" % (ty, where, date.today().isoformat())
    )


LAST_UPDATED_RE = re.compile(r"^_Last updated[^\n]*_\s*$", re.M)


def refresh_last_updated(header: str, n_docs: Optional[int]) -> str:
    line = "_Last updated %s%s_" % (date.today().isoformat(), (" \u00b7 %d documents reviewed" % n_docs) if n_docs else "")
    if LAST_UPDATED_RE.search(header):
        return LAST_UPDATED_RE.sub(line, header, count=1)
    return header.rstrip("\n") + "\n\n" + line


def header_tax_year(header: str) -> Optional[int]:
    m = re.search(r"tax\s+year\s*:?\s*(20\d\d)", header, re.I)
    return int(m.group(1)) if m else None


def find_placeholders(text: str) -> List[Dict]:
    """Every [NEEDED: ...] / [VERIFY] / [TODO] / [TBD] / [CONFIRM] in the file, with its section."""
    header, sections = parse_summaries(text)
    found: List[Dict] = []

    def scan(block: str, title: str):
        for line in block.splitlines():
            if "<!--" in line:
                continue  # question ids and the auto blocks quote placeholders; they are not new questions
            for m in PLACEHOLDER_RE.finditer(line):
                quoted = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", line)      # links -> their text
                quoted = re.sub(r"^\s*(?:[-*+]|\d+[.)]|#+)\s+", "", quoted)   # list / heading markers
                quoted = re.sub(r"\s+", " ", quoted).strip()
                found.append({"section": title, "kind": m.group(1).upper(), "text": m.group(0),
                              "line": quoted[:140] + ("\u2026" if len(quoted) > 140 else "")})

    # in the header only the title counts (it may still say "[NEEDED: tax year]"); the rest is the legend
    scan("\n".join(l for l in header.splitlines() if l.startswith("#")), "(title)")
    for s in sections:
        if s.key == NEEDS_ANSWERING:
            continue  # this section lists the questions; it does not create new ones
        if s.key == NEVER_NA_LAST:
            body = re.sub(re.escape(PLACEHOLDER_BLOCK_START) + r".*?" + re.escape(PLACEHOLDER_BLOCK_END), "", s.body, flags=re.S)
            scan(body, s.title)
        else:
            scan(s.body, s.title)
    return found


def _esc_attr(token: str) -> str:
    return token.replace("&", "&amp;").replace('"', "&quot;")


def _unesc_attr(token: str) -> str:
    return token.replace("&quot;", '"').replace("&amp;", "&")


QUESTION_BLOCK_RE = re.compile(
    r'<!--\s*q\s+section="([^"]*)"\s+token="([^"]*)"\s*-->(.*?)<!--\s*/q\s*-->', re.S)
ANSWER_LINE_RE = re.compile(r"(?m)^[ \t>*_-]*Answer:[ \t]*(.*)$")


def questions_intro() -> str:
    return (
        "There is not enough information yet to finish this summary. Write the answer under each question, "
        "then run the tax-document-summaries skill again. If the answer is in a document instead, copy that "
        "document into the folder and say so when you run the skill again; the new files are read and these "
        "questions are updated."
    )


def parse_question_answers(body: str) -> List[Dict]:
    """Answers the user typed under Things that need answering. Empty Answer: lines are skipped."""
    found = []
    for m in QUESTION_BLOCK_RE.finditer(body or ""):
        inner = m.group(3)
        answers = ANSWER_LINE_RE.findall(inner)
        text = ""
        if answers:
            # everything after the first "Answer:" marker, so a multi-line answer is kept
            text = inner.split("Answer:", 1)[1]
            text = re.sub(r"<!--.*?-->", "", text, flags=re.S).strip()
        if not text or text.lower() in NA_VALUES or text.lower() in {"answer", "...", "\u2026"}:
            continue
        found.append({
            "section": _unesc_attr(m.group(1)),
            "token": _unesc_attr(m.group(2)),
            "answer": text,
            "points_at_documents": bool(DOC_POINTER_RE.search(text)),
        })
    return found


def format_answer(answer: str) -> str:
    """One line, bold, safe to drop into the middle of a bullet."""
    text = re.sub(r"\s+", " ", answer).strip()
    if text.startswith("**") and text.endswith("**") and len(text) >= 4:
        return text
    return "**%s**" % text


def apply_question_answers(sections: List[Section]) -> Dict[str, List[Dict]]:
    """Fold answers typed at the top into the section that asked. Returns applied / document pointers / unmatched.

    An answer that says the fact is in a new document is not pasted in; the next run reads that document.
    """
    box = next((s for s in sections if s.key == NEEDS_ANSWERING), None)
    applied, pointers, unmatched = [], [], []
    if box is None:
        return {"applied": applied, "pointers": pointers, "unmatched": unmatched}
    for item in parse_question_answers(box.body):
        if item["points_at_documents"]:
            pointers.append(item)
            continue
        target = next((s for s in sections if s.title == item["section"] and s.key != NEEDS_ANSWERING), None)
        if target is None or item["token"] not in target.body:
            unmatched.append(item)
            continue
        target.body = target.body.replace(item["token"], format_answer(item["answer"]), 1)
        applied.append(item)
    return {"applied": applied, "pointers": pointers, "unmatched": unmatched}


def render_questions_section(placeholders: List[Dict], unmatched: List[Dict], prefilled: Optional[List[Dict]] = None) -> str:
    """The top section: one block per open question, with a blank Answer: line, plus any answer that could not be placed.

    prefilled: answers that point at a new document. The question stays (the document has not been read yet) and the
    user's note is kept under Answer: so the next run still sees it.
    """
    if not placeholders and not unmatched:
        return "\nN/A\n"
    filled = {(p["section"], p["token"]): p["answer"] for p in (prefilled or [])}
    lines = [questions_intro(), "", QUESTIONS_START]
    current = None
    for p in placeholders:
        if p["section"] != current:
            current = p["section"]
            lines += ["", "### %s" % current, ""]
        lines.append('<!-- q section="%s" token="%s" -->' % (_esc_attr(p["section"]), _esc_attr(p["text"])))
        lines.append(p.get("line") or p["text"])
        lines.append("")
        prior = filled.get((p["section"], p["text"]))
        lines.append("Answer:%s" % ((" " + re.sub(r"\s+", " ", prior).strip()) if prior else ""))
        lines.append("<!-- /q -->")
        lines.append("")
    if unmatched:
        lines += ["", "### Could not place these answers", "",
                  "These were written last time but did not match an open question. They were kept so nothing is lost.", ""]
        for item in unmatched:
            lines.append('<!-- q section="%s" token="%s" -->' % (_esc_attr(item["section"]), _esc_attr(item["token"])))
            lines.append("**%s** (%s)" % (item["token"], item["section"]))
            lines.append("")
            lines.append("Answer: %s" % re.sub(r"\s+", " ", item["answer"]).strip())
            lines.append("<!-- /q -->")
            lines.append("")
    lines.append(QUESTIONS_END)
    return "\n" + "\n".join(lines).rstrip() + "\n"


def sync_questions_section(sections: List[Section], placeholders: List[Dict], unmatched: List[Dict],
                           prefilled: Optional[List[Dict]] = None) -> None:
    target = next((s for s in sections if s.key == NEEDS_ANSWERING), None)
    if target is None:
        target = Section(SECTION_BY_KEY[NEEDS_ANSWERING][0], "")
        sections.insert(0, target)
    target.body = render_questions_section(placeholders, unmatched, prefilled)


def clear_open_items_placeholder_block(sections: List[Section], has_questions: bool) -> None:
    """The question list lives at the top now. Drop the old copy inside Open Items; keep anything the user wrote."""
    target = next((s for s in sections if s.key == NEVER_NA_LAST), None)
    if target is None:
        return
    body = re.sub(r"\n?" + re.escape(PLACEHOLDER_BLOCK_START) + r".*?" + re.escape(PLACEHOLDER_BLOCK_END) + r"\n?",
                  "\n", target.body, flags=re.S)
    body = body.strip("\n")
    pointer = "Questions still open are listed at the top, under Things that need answering."
    if has_questions:
        if is_na_body(body):
            body = pointer
        elif pointer not in body:
            body = body + "\n\n" + pointer
    elif is_na_body(body) or body.strip() == pointer:
        body = "N/A"
    target.body = "\n" + body + "\n"


# --------------------------------------------------------------------------
# Files, paths, work folder
# --------------------------------------------------------------------------

def die(msg: str, code: int = 2) -> None:
    sys.stderr.write("error: %s\n" % msg)
    sys.exit(code)


def warn(msg: str) -> None:
    sys.stderr.write("warning: %s\n" % msg)


def load_json(path: Path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    with open(str(path), "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: Path, data) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(str(tmp), "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    os.replace(str(tmp), str(path))


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def sibling():
    """The classification skill's shared module, or None when that skill is not installed next to this one."""
    if not (SIBLING_SCRIPTS / "taxsort_common.py").exists():
        return None
    if str(SIBLING_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SIBLING_SCRIPTS))
    import taxsort_common  # type: ignore
    return taxsort_common


TAXONOMY_FOLDER_RE = re.compile(r"^(_|zz_|Income - |Deductions$|Credits$|Regulations - |Retirement & HSA$|Records - |"
                                r"Estimated tax payments$)", re.I)


def looks_like_taxonomy_folder(name: str) -> bool:
    tc = sibling()
    if tc:
        norm = tc.normalize_folder(name)
        if norm in {tc.normalize_folder(n) for n in tc.TAXONOMY_FOLDERS}:
            return True
    return bool(TAXONOMY_FOLDER_RE.match(name))


def resolve(folder_arg: Optional[str], summaries_arg: Optional[str] = None) -> Dict:
    """Where Summaries.md lives, where the documents are, and where the classification work folder is.

    folder     : the folder the user named, else ./sorter/stage (must exist).
    summaries  : --summaries PATH, else <folder>/Summaries.md.
    out        : the sorted documents: <folder>/../sorted for a stage/inbox folder, else the folder itself.
    roots      : folders scanned for documents: out, the folder (leftovers), and for a stage folder any taxonomy-named
                 sibling folders (the web app's "place" action puts files in sorter/<category>/).
    work       : <out>/.tax-sorter (the classification skill's cache); swork = <work>/summaries.
    """
    folder = Path(folder_arg).expanduser().resolve() if folder_arg else Path(DEFAULT_FOLDER).resolve()
    if not folder.is_dir():
        die("folder not found: %s (run the tax-document-classification skill first, or point to the folder with the documents)" % folder)
    tc = sibling()
    if tc:
        paths = tc.resolve_paths(str(folder), None, None)
        out, work, in_place = Path(paths["out"]), Path(paths["work"]), bool(paths["in_place"])
    else:
        if folder.name.lower() in STAGE_NAMES and (folder.parent / "sorted").is_dir():
            out, in_place = folder.parent / "sorted", False
        else:
            out, in_place = folder, True
        work = out / WORK_DIRNAME
    roots: List[Path] = [out]
    if not in_place:
        roots.append(folder)
        for child in sorted(folder.parent.iterdir()):
            if (child.is_dir() and child.resolve() not in (folder.resolve(), out.resolve())
                    and not child.name.startswith(".") and looks_like_taxonomy_folder(child.name)):
                roots.append(child)
    summaries = Path(summaries_arg).expanduser().resolve() if summaries_arg else folder / SUMMARIES_FILENAME
    return {"folder": folder, "out": out, "work": work, "swork": work / WORK_SUBDIR, "in_place": in_place,
            "roots": roots, "summaries": summaries}


def iter_documents(roots: List[Path], work: Path):
    """Yield every regular file under the roots, skipping the work folder, reports and system files."""
    seen = set()
    work_r = work.resolve()
    for root in roots:
        if not root.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(str(root)):
            d = Path(dirpath)
            dirnames[:] = sorted(x for x in dirnames if (d / x).resolve() != work_r and not x.startswith("."))
            for name in sorted(filenames):
                if name.startswith(".") or name.startswith("~$") or name.lower() in SYSTEM_FILES or name.lower() in REPORT_FILES:
                    continue
                p = d / name
                if not p.is_file():
                    continue
                rp = p.resolve()
                if rp in seen:
                    continue
                seen.add(rp)
                yield root, p


def rel_link(target: Path, from_dir: Path) -> str:
    """Relative, URL-encoded markdown link target from the Summaries.md folder to a file."""
    try:
        relp = os.path.relpath(str(target), str(from_dir))
    except ValueError:
        relp = str(target)
    relp = relp.replace(os.sep, "/")
    from urllib.parse import quote
    return quote(relp, safe="/")


def backup(path: Path, swork: Path) -> Optional[Path]:
    if not path.exists():
        return None
    dest_dir = swork / "backups"
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = dest_dir / ("%s-%s%s" % (path.stem, stamp, path.suffix))
    dest.write_bytes(path.read_bytes())
    return dest


def fmt_money(v: Optional[float]) -> str:
    if v is None:
        return "?"
    sign = "-" if v < 0 else ""
    return "%s$%s" % (sign, format(abs(v), ",.2f"))
