#!/usr/bin/env python3
"""Step 4 helper: correct plan items without hand-editing JSON.

Updates one item (by its # in plan.md, or by a unique substring of its source
path), rebuilds the destination filename from the naming convention, and
regenerates plan.md.

Examples:
  python3 edit_plan.py --work sorter/sorted/.tax-sorter --list
  python3 edit_plan.py --work W --item 7 --set doc_type="Electric Bill" --set entity="Property 200" \
                       --set date=2026-07-01 --set category="Income - Rental" --status ready
  python3 edit_plan.py --work W --src IMG_2048 --set entity="Jane Doe" --status ready
  python3 edit_plan.py --work W --item 3 --set dest_name="W-2 - Acme Corp - 2025 (spouse).pdf" --status ready
  python3 edit_plan.py --work W --item 9 --status skip
Keys for --set: doc_type, category, subfolder, entity, tax_year, date, suffix, dest_name, rename, notes
"""
import argparse
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxsort_common import DOC_TYPES, TAXONOMY_FOLDERS, build_name, die, load_json, normalize_folder, when_segment, write_plan

ALLOWED = {"doc_type", "category", "subfolder", "entity", "tax_year", "date", "suffix", "dest_name", "rename", "notes"}


def find_item(plan, index, src):
    items = plan["items"]
    if index is not None:
        for it in items:
            if it["index"] == index:
                return it
        die("no item #%d" % index)
    hits = [it for it in items if src in it["src"] or src in it["rel"]]
    if len(hits) == 1:
        return hits[0]
    die("--src matched %d items; be more specific" % len(hits))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", required=True)
    ap.add_argument("--item", type=int)
    ap.add_argument("--src")
    ap.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    ap.add_argument("--status", choices=["ready", "review", "skip"])
    ap.add_argument("--list", action="store_true", help="print a compact list of all items")
    args = ap.parse_args()

    work = Path(args.work).expanduser().resolve()
    plan = load_json(work / "plan.json")
    if not plan:
        die("no plan.json in %s (run classify.py first)" % work)

    if args.list:
        for it in plan["items"]:
            print("%3d %-9s %.2f %-28s %-34s %s -> %s" % (
                it["index"], it["status"], it["confidence"], it["doc_type"][:28], it["category"][:34], it["rel"], it["dest_name"]))
        return 0
    if args.item is None and not args.src:
        die("give --item N or --src SUBSTRING (or --list)")

    it = find_item(plan, args.item, args.src)
    explicit_name = False
    explicit_rename = any(s.strip().startswith("rename=") for s in args.set)
    name_fields = {"doc_type", "entity", "date", "tax_year", "suffix"}
    if not explicit_rename and any(s.split("=", 1)[0].strip() in name_fields for s in args.set):
        it["rename"] = True  # the caller is describing the document: build the name from it
    for kv in args.set:
        if "=" not in kv:
            die("--set expects KEY=VALUE, got %r" % kv)
        key, value = kv.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key not in ALLOWED:
            die("unknown key %r (allowed: %s)" % (key, ", ".join(sorted(ALLOWED))))
        if key == "tax_year":
            it["tax_year"] = int(value) if value else None
        elif key == "date":
            if value and not re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", value):
                die("date must be YYYY, YYYY-MM or YYYY-MM-DD")
            it["date"] = value or None
        elif key == "rename":
            it["rename"] = value.lower() in ("1", "true", "yes", "y")
        elif key == "notes":
            it["notes"] = [value] if value else []
        elif key == "dest_name":
            it["dest_name"] = value
            it["rename"] = True
            explicit_name = True
        elif key == "doc_type":
            it["doc_type"] = value
            if value in DOC_TYPES:
                default_cat, style = DOC_TYPES[value]
                it["when_style"] = style
                if not any(s.startswith("category=") for s in args.set):
                    it["category"] = default_cat
            else:
                print("note: %r is not a known doc_type; using it as a free-form label" % value)
        elif key == "category":
            it["category"] = value
            norm = normalize_folder(value)
            if norm not in {normalize_folder(n) for n in TAXONOMY_FOLDERS}:
                print("note: %r is not in the standard taxonomy; a custom folder will be created" % value)
        else:
            it[key] = value or None

    if args.status:
        it["status"] = args.status
        if args.status == "ready":
            it["needs_vision"] = False
    if not explicit_name:
        if it.get("rename", True) and it.get("doc_type") and it["doc_type"] != "Unknown":
            when = when_segment(it.get("when_style", "none"), it.get("tax_year"), it.get("date"))
            it["dest_name"] = build_name(it["doc_type"], it.get("entity"), when, Path(it["src"]).suffix, it.get("suffix"))
            it["rename"] = True
        else:
            it["dest_name"] = Path(it["src"]).name
    write_plan(plan, work)
    print("%3d %-9s %s -> %s/%s%s" % (it["index"], it["status"], it["rel"], it["category"],
                                      (it["subfolder"] + "/") if it.get("subfolder") else "", it["dest_name"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
