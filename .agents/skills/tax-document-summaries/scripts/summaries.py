#!/usr/bin/env python3
"""Create, update and check Summaries.md.

  summaries.py scaffold [FOLDER] [--tax-year YYYY]   create Summaries.md (header + every standard section as N/A), or add
                                                    the missing standard sections to an existing file; nothing else changes
  summaries.py status   [FOLDER]                     sections (information / N/A / missing / custom), placeholders,
                                                    documents not mentioned yet
  summaries.py finalize [FOLDER] [--tax-year YYYY]   apply answers typed under "Things that need answering", move that
                                                    section to the top while questions remain, move N/A sections below
                                                    the others, refresh the header, and run the checks
  summaries.py check    [FOLDER]                     checks only (exit 1 on failures)

A backup of the previous Summaries.md is written to <work>/summaries/backups/ before scaffold or finalize changes it.
Checks: no SSN (or masked SSN) in the file, every standard section present exactly once, N/A sections below the
sections with information, no absolute local paths (links must be relative), and warnings for EIN-looking numbers,
placeholders left in the text and sorted documents that the summary never mentions (needs facts.json from
gather_facts.py).

Usage examples:
  python3 summaries.py scaffold sorter/stage --tax-year 2025
  python3 summaries.py finalize sorter/stage
"""
import argparse
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from summaries_common import (ABS_PATH_RE, EIN_RE, MASKED_SSN_RE, SECTION_BY_KEY, SORTED_FILENAME,
                              SSN_RE, SUMMARIES_FILENAME, Section, apply_question_answers, backup, clear_open_items_placeholder_block,
                              default_header, die, find_placeholders, header_tax_year, is_na_body, load_json,
                              missing_standard_sections, order_sections, parse_summaries, refresh_last_updated,
                              rel_link, render_summaries, resolve, sync_questions_section)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""


def write_if_changed(path: Path, text: str, swork: Path) -> bool:
    old = read(path)
    if old == text:
        return False
    b = backup(path, swork)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    if b:
        print("backup: %s" % b)
    return True


def docs_location_hint(out: Path, from_dir: Path) -> str:
    """'this folder' or the relative path from Summaries.md to the sorted documents, for the header."""
    if out.resolve() == from_dir.resolve():
        return "this folder"
    import os
    try:
        return "`%s/`" % os.path.relpath(str(out), str(from_dir)).replace(os.sep, "/")
    except ValueError:
        return "`%s`" % out


def facts_docs(swork: Path) -> Optional[List[Dict]]:
    facts = load_json(swork / "facts.json")
    return facts.get("documents") if facts else None


def tax_year_for(args, header: str, swork: Path) -> Optional[int]:
    if getattr(args, "tax_year", None):
        return args.tax_year
    ty = header_tax_year(header) if header else None
    if ty:
        return ty
    facts = load_json(swork / "facts.json")
    return facts.get("tax_year") if facts else None


def cmd_scaffold(args) -> int:
    p = resolve(args.folder, args.summaries)
    path, swork = p["summaries"], p["swork"]
    text = read(path)
    header, sections = parse_summaries(text) if text else ("", [])
    facts = load_json(swork / "facts.json") or {}
    ty = tax_year_for(args, header, swork)
    created = not text.strip()
    if created:
        n = facts.get("counts", {}).get("documents") if facts else None
        docs_hint = docs_location_hint(Path(p["out"]), path.parent)
        sorted_md = Path(p["out"]) / SORTED_FILENAME
        header = default_header(ty, docs_hint, rel_link(sorted_md, path.parent) if sorted_md.exists() else None)
        if n:
            header = refresh_last_updated(header, n)
        sections = []
    missing = missing_standard_sections(sections)
    for key in missing:
        sections.append(Section(SECTION_BY_KEY[key][0], "\nN/A\n"))
    sections = order_sections(sections)
    out = render_summaries(header, sections)
    changed = write_if_changed(path, out, swork)
    print("%s %s" % ("created" if created else ("updated" if changed else "unchanged"), path))
    if missing and not created:
        print("added %d missing section(s) as N/A: %s" % (len(missing), ", ".join(SECTION_BY_KEY[k][0] for k in missing)))
    print_status(out, swork, path)
    return 0


def print_status(text: str, swork: Path, path: Path) -> None:
    header, sections = parse_summaries(text)
    print("")
    print("Sections (%d):" % len(sections))
    for s in sections:
        kind = "standard" if s.key else "custom"
        state = "N/A" if s.is_na else "has information (%d lines)" % len([l for l in s.body.splitlines() if l.strip()])
        print("  %-42s %-8s %s" % (s.title, kind, state))
    missing = missing_standard_sections(sections)
    if missing:
        print("  missing standard sections: %s" % ", ".join(SECTION_BY_KEY[k][0] for k in missing))
    ph = find_placeholders(text)
    if ph:
        print("")
        print("Placeholders (%d):" % len(ph))
        for x in ph:
            print("  %-30s %s" % (x["section"][:30], x["line"][:110]))
    docs = facts_docs(swork)
    if docs is not None:
        unref = [d for d in docs if d.get("status") in ("sorted", "unsorted") and not mentioned(d, text)]
        print("")
        print("Documents not mentioned yet: %d%s" % (len(unref), (" \u2014 " + "; ".join(d["display"] for d in unref[:12]) + (" …" if len(unref) > 12 else "")) if unref else ""))


def mentioned(d: Dict, text: str) -> bool:
    for s in (d.get("name"), d.get("orig_name"), d.get("link"), (d.get("link") or "").replace("%20", " ")):
        if s and s in text:
            return True
    return False


def cmd_status(args) -> int:
    p = resolve(args.folder, args.summaries)
    text = read(p["summaries"])
    if not text:
        print("%s does not exist yet (run: summaries.py scaffold)" % p["summaries"])
        return 1
    print(p["summaries"])
    print_status(text, p["swork"], p["summaries"])
    return 0


def run_checks(text: str, swork: Path, path: Path) -> Dict[str, List[str]]:
    failures: List[str] = []
    warnings: List[str] = []
    header, sections = parse_summaries(text)
    if SSN_RE.search(text):
        failures.append("an SSN-looking number (NNN-NN-NNNN) appears in the file; remove it (refer to the document instead)")
    if MASKED_SSN_RE.search(text):
        failures.append("a masked SSN (XXX-XX-NNNN) was pasted from the cached text; remove it")
    titles = [s.title.strip().lower() for s in sections]
    dups = sorted({t for t in titles if titles.count(t) > 1})
    if dups:
        failures.append("duplicate section titles: %s (merge them)" % ", ".join(dups))
    keys = [s.key for s in sections if s.key]
    dupkeys = sorted({k for k in keys if keys.count(k) > 1})
    if dupkeys:
        failures.append("two sections map to the same standard section: %s (merge them or rename one)" % ", ".join(SECTION_BY_KEY[k][0] for k in dupkeys))
    missing = missing_standard_sections(sections)
    if missing:
        failures.append("standard sections missing: %s (run summaries.py scaffold)" % ", ".join(SECTION_BY_KEY[k][0] for k in missing))
    if not re.search(r"^# ", header, re.M):
        failures.append("no title (H1) at the top; summaries.py finalize adds one")
    if not sections:
        failures.append("no ## sections found")
    seen_na = False
    for s in sections:
        if s.is_na:
            seen_na = True
        elif seen_na:
            failures.append("section with information below an N/A section: %s (run summaries.py finalize to reorder)" % s.title)
            break
    for m in ABS_PATH_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        warnings.append("absolute local path on line %d; use a relative link" % line)
    eins = EIN_RE.findall(text)
    if eins:
        warnings.append("%d EIN/TIN-looking number(s) (NN-NNNNNNN): refer to the document instead of copying identifiers" % len(eins))
    ph = find_placeholders(text)
    if ph:
        warnings.append("%d placeholder(s) still to fill: %s" % (len(ph), "; ".join("%s: %s" % (x["section"], x["text"]) for x in ph[:10]) + (" …" if len(ph) > 10 else "")))
    docs = facts_docs(swork)
    if docs is None:
        warnings.append("facts.json not found; run gather_facts.py to check that every document is mentioned")
    else:
        unref = [d for d in docs if d.get("status") in ("sorted", "unsorted") and not mentioned(d, text)]
        if unref:
            warnings.append("%d sorted document(s) are not mentioned anywhere: %s" % (
                len(unref), "; ".join(d["display"] for d in unref[:12]) + (" …" if len(unref) > 12 else "")))
    na_titles = [s.title for s in sections if s.is_na]
    if sections and len(na_titles) == len(sections):
        warnings.append("every section is N/A; nothing has been written yet")
    return {"failures": failures, "warnings": warnings}


def print_checks(result: Dict[str, List[str]]) -> None:
    print("")
    if result["failures"]:
        print("CHECK FAILED (%d):" % len(result["failures"]))
        for f in result["failures"]:
            print("  - " + f)
    else:
        print("Checks passed.")
    if result["warnings"]:
        print("Warnings (%d):" % len(result["warnings"]))
        for w in result["warnings"]:
            print("  - " + w)


def cmd_finalize(args) -> int:
    p = resolve(args.folder, args.summaries)
    path, swork = p["summaries"], p["swork"]
    text = read(path)
    if not text.strip():
        die("%s does not exist; run summaries.py scaffold first" % path)
    header, sections = parse_summaries(text)
    facts = load_json(swork / "facts.json") or {}
    ty = tax_year_for(args, header, swork)
    for key in missing_standard_sections(sections):
        sections.append(Section(SECTION_BY_KEY[key][0], "\nN/A\n"))
    if not re.search(r"^# ", header, re.M):
        sorted_md = Path(p["out"]) / SORTED_FILENAME
        new_header = default_header(ty, docs_location_hint(Path(p["out"]), path.parent),
                                    rel_link(sorted_md, path.parent) if sorted_md.exists() else None)
        header = new_header + ("\n\n" + header.strip("\n") if header.strip() else "")
    header = refresh_last_updated(header, facts.get("counts", {}).get("documents") if facts else None)
    if ty and "[NEEDED: tax year]" in header:
        header = header.replace("[NEEDED: tax year]", str(ty))
    # Answers the user typed at the top go into the section that asked. Notes that point at a new document stay put
    # so the next run can read that document instead of pasting the note in as a figure.
    folded = apply_question_answers(sections)
    placeholders = find_placeholders(render_summaries(header, sections))
    sync_questions_section(sections, placeholders, folded["unmatched"], folded["pointers"])
    clear_open_items_placeholder_block(sections, bool(placeholders))
    sections = order_sections(sections)
    if folded["applied"] or folded["pointers"] or folded["unmatched"]:
        print("Answers read from Things that need answering: %d placed, %d point at a document, %d could not be placed." % (
            len(folded["applied"]), len(folded["pointers"]), len(folded["unmatched"])))
        for item in folded["applied"]:
            print("  placed in %s: %s" % (item["section"], re.sub(r"\s+", " ", item["answer"])[:80]))
        for item in folded["pointers"]:
            print("  document, not a figure (%s): %s" % (item["section"], re.sub(r"\s+", " ", item["answer"])[:80]))
    out = render_summaries(header, sections)
    changed = write_if_changed(path, out, swork)
    print("%s %s" % ("updated" if changed else "unchanged", path))
    content = [s.title for s in sections if not s.is_na]
    na = [s.title for s in sections if s.is_na]
    print("  with information (%d): %s" % (len(content), ", ".join(content) or "none"))
    print("  N/A, listed last (%d): %s" % (len(na), ", ".join(na) or "none"))
    result = run_checks(out, swork, path)
    print_checks(result)
    return 1 if result["failures"] else 0


def cmd_check(args) -> int:
    p = resolve(args.folder, args.summaries)
    text = read(p["summaries"])
    if not text.strip():
        die("%s does not exist; run summaries.py scaffold first" % p["summaries"])
    result = run_checks(text, p["swork"], p["summaries"])
    print(p["summaries"])
    print_checks(result)
    return 1 if result["failures"] else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    for name, fn in (("scaffold", cmd_scaffold), ("status", cmd_status), ("finalize", cmd_finalize), ("check", cmd_check)):
        sp = sub.add_parser(name)
        sp.add_argument("folder", nargs="?", help="folder with Summaries.md (default: ./sorter/stage)")
        sp.add_argument("--summaries", help="path of Summaries.md (default: <folder>/Summaries.md)")
        if name in ("scaffold", "finalize"):
            sp.add_argument("--tax-year", type=int)
        sp.set_defaults(fn=fn)
    args = ap.parse_args()
    if not getattr(args, "fn", None):
        ap.print_help()
        return 2
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
