#!/usr/bin/env python3
"""Step 5: execute the plan (dry run by default).

Moves (or copies with --copy) every item whose status is "ready" into
<out>/<category>/<dest_name>, duplicates into zz_Duplicates, and, only with
--include-review, review items into zz_Needs review (original names).
Never deletes. Existing folders that differ only by apostrophe style or case
are reused. Name collisions get " (2)", " (3)"...; a byte-identical file already
at the destination turns the item into a duplicate.

Every run writes <work>/applied-<timestamp>.json (for --undo) and appends to
<work>/manifest.jsonl so later runs recognise already-sorted files.

Usage:
  python3 apply_plan.py --work WORK            # dry run, prints the table
  python3 apply_plan.py --work WORK --yes      # apply
  python3 apply_plan.py --work WORK --yes --include-review
  python3 apply_plan.py --work WORK --undo WORK/applied-20260101-120000.json
"""
import argparse
import json
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxsort_common import (DUPLICATES_FOLDER, REVIEW_FOLDER, die, item_dest, load_json, now_iso, rel, save_json,
                            sha256_file)


def unique_path(folder: Path, name: str, src_hash: str):
    """Return (path, is_duplicate). Appends ' (n)' on collisions with different content."""
    candidate = folder / name
    if not candidate.exists():
        return candidate, False
    try:
        if sha256_file(candidate) == src_hash:
            return candidate, True
    except OSError:
        pass
    stem, dot, ext = name.rpartition(".")
    if not dot or len(ext) > 6:
        stem, ext = name, ""
    n = 2
    while True:
        alt = folder / ("%s (%d)%s" % (stem, n, ("." + ext) if ext else ""))
        if not alt.exists():
            return alt, False
        try:
            if sha256_file(alt) == src_hash:
                return alt, True
        except OSError:
            pass
        n += 1


def undo(work: Path, log_path: Path) -> int:
    log = load_json(log_path)
    if not log:
        die("cannot read %s" % log_path)
    if log.get("mode") == "copy":
        print("This run copied files; originals are still in place. Removing the copies would be a delete, so nothing is undone.")
        return 1
    restored, skipped = 0, 0
    for rec in reversed(log.get("moves", [])):
        src, dest = Path(rec["src"]), Path(rec["dest"])
        if dest.exists() and not src.exists():
            src.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(dest), str(src))
            restored += 1
            with open(work / "manifest.jsonl", "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"event": "undo", "hash": rec["hash"], "src": rec["src"], "dest": rec["dest"], "at": now_iso()}) + "\n")
        else:
            skipped += 1
    # remove now-empty folders created by that run
    for folder in sorted(set(Path(r["dest"]).parent for r in log.get("moves", [])), key=lambda p: -len(str(p))):
        try:
            if folder.is_dir() and not any(folder.iterdir()):
                folder.rmdir()
        except OSError:
            pass
    print("undo: restored %d, skipped %d (already moved or missing)" % (restored, skipped))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", required=True)
    ap.add_argument("--plan", help="plan file (default <work>/plan.json)")
    ap.add_argument("--out", help="override output root")
    ap.add_argument("--yes", action="store_true", help="actually move files (default: dry run)")
    ap.add_argument("--copy", action="store_true", help="copy instead of move (originals stay in the inbox)")
    ap.add_argument("--include-review", action="store_true", help="also move review items into %s" % REVIEW_FOLDER)
    ap.add_argument("--undo", metavar="APPLIED_JSON", help="reverse a previous run")
    args = ap.parse_args()

    work = Path(args.work).expanduser().resolve()
    if args.undo:
        return undo(work, Path(args.undo).expanduser().resolve())
    plan = load_json(Path(args.plan).expanduser().resolve() if args.plan else work / "plan.json")
    if not plan:
        die("no plan found; run classify.py first")
    out = Path(args.out).expanduser().resolve() if args.out else Path(plan["out"])

    actions = []
    for it in plan["items"]:
        status = it["status"]
        if status == "skip":
            continue
        if status == "review" and not args.include_review:
            continue
        src = Path(it["src"])
        if not src.exists():
            actions.append({"item": it, "src": src, "dest": None, "note": "source missing (moved already?)", "do": False})
            continue
        folder, name = item_dest(it, out)
        dest, is_dup = unique_path(folder, name, it["hash"])
        if is_dup:
            if dest.resolve() == src.resolve():
                actions.append({"item": it, "src": src, "dest": dest, "note": "already in place", "do": False})
                continue
            folder = out / DUPLICATES_FOLDER
            dest, _ = unique_path(folder, src.name, it["hash"])
            note = "identical file already at destination -> %s" % DUPLICATES_FOLDER
        else:
            note = "" if dest.name == name else "renamed to avoid collision"
        actions.append({"item": it, "src": src, "dest": dest, "note": note, "do": True})

    verb = "COPY" if args.copy else "MOVE"
    print("%s plan for %s -> %s%s" % (verb, plan["input"], out, "" if args.yes else "   (DRY RUN: add --yes to apply)"))
    print("")
    for a in actions:
        it = a["item"]
        dest_s = rel(a["dest"], out) if a["dest"] else "-"
        flag = "" if a["do"] else "  [skipped: %s]" % a["note"]
        extra = ("  [%s]" % a["note"]) if a["do"] and a["note"] else ""
        print("  %-9s %s\n            -> %s%s%s" % (it["status"], it["rel"], dest_s, extra, flag))
    todo = [a for a in actions if a["do"]]
    left = [it for it in plan["items"] if it["status"] == "review"] if not args.include_review else []
    print("")
    print("  %d to %s, %d skipped%s" % (len(todo), verb.lower(), len(actions) - len(todo),
                                        (", %d review items left in place" % len(left)) if left else ""))
    if not args.yes:
        return 0
    if not todo:
        print("Nothing to apply.")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log = {"applied_at": now_iso(), "mode": "copy" if args.copy else "move", "input": plan["input"], "out": str(out), "moves": []}
    manifest_path = work / "manifest.jsonl"
    done = Counter()
    for a in todo:
        it, src, dest = a["item"], a["src"], a["dest"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            if args.copy:
                shutil.copy2(str(src), str(dest))
            else:
                shutil.move(str(src), str(dest))
        except OSError as exc:
            print("  ERROR %s: %s" % (it["rel"], exc))
            continue
        rec = {"hash": it["hash"], "src": str(src), "dest": str(dest), "status": it["status"], "doc_type": it["doc_type"],
               "category": it["category"], "at": now_iso()}
        log["moves"].append(rec)
        with open(manifest_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        done[rel(dest.parent, out)] += 1
    log_path = work / ("applied-%s.json" % stamp)
    save_json(log_path, log)
    # keep the plan in sync so a re-run does not try to move the same items again
    moved_hashes = {m["hash"] for m in log["moves"]}
    for it in plan["items"]:
        if it["hash"] in moved_hashes and it["status"] in ("ready", "duplicate", "processed", "review"):
            it["status"] = "skip"
            it["notes"] = (it.get("notes") or []) + ["applied %s" % stamp]
    save_json(work / "plan.json", plan)

    print("")
    print("Applied %d file(s):" % len(log["moves"]))
    for folder, n in sorted(done.items()):
        print("  %-40s %d" % (folder, n))
    print("")
    print("Undo with: python3 %s --work \"%s\" --undo \"%s\"" % (Path(__file__).resolve(), work, log_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
