#!/usr/bin/env python3
"""Step 5: execute the plan (dry run by default).

Moves (or copies with --copy) every item whose status is "ready" into
<out>/<category>/<dest_name>, duplicates into zz_Duplicates, and review items
into _Needs Human Review (original names) so a person can decide; --leave-review
keeps review items in the inbox instead. Never deletes. Existing folders that
differ only by apostrophe style or case are reused. Name collisions get " (2)",
" (3)"...; a byte-identical file already at the destination turns the item into
a duplicate.

Nothing-lost check: the files under the inbox and the output root are counted
before and after, every moved file is re-hashed at its destination and compared
with the hash taken at inventory time, and the run is reported as PASS only when
the total is unchanged (move) or grew by exactly the number of copies (--copy)
and every hash matches. The result is printed and written to <out>/SORTED.md.

SORTED.md (at the output root) is regenerated on every run from the manifest:
the file-count check of the last run, the complete map "original name -> new
location" grouped by folder (new names keep the original filename in
parentheses), and a table of all runs.

Every run writes <work>/applied-<timestamp>.json (for --undo) and appends to
<work>/manifest.jsonl so later runs recognise already-sorted files. Files parked
in _Needs Human Review are recorded with status "review" and are not counted as
sorted, so running the pipeline on that folder later picks them up again.

Vision gate: a review item flagged needs_vision whose page images have not been
read (vision "pending") blocks the whole run, dry run included, and nothing is
moved. Record a verdict per item with edit_plan.py first: --set doc_type=...
--status ready (identified) or --vision-failed "reason" (looked, cannot tell).
Only the latter are parked in _Needs Human Review.

Usage:
  python3 apply_plan.py --work WORK            # dry run, prints the table and the expected counts
  python3 apply_plan.py --work WORK --yes      # apply, then count + re-hash, then write SORTED.md
  python3 apply_plan.py --work WORK --yes --leave-review
  python3 apply_plan.py --work WORK --undo WORK/applied-20260101-120000.json
"""
import argparse
import json
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxsort_common import (DUPLICATES_FOLDER, REVIEW_FOLDER, SORTED_FILENAME, SUMMARIES_FILENAME, SUMMARIES_SKILL,
                            count_roots, die, item_dest, load_json, now_iso, rel, save_json, sha256_file,
                            write_sorted_md)


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


def fmt_counts(c: Dict[str, Optional[int]]) -> str:
    if c.get("inbox") is None or c.get("sorted") is None:
        return "%d" % c["total"]
    return "%d (inbox %d + sorted %d)" % (c["total"], c["inbox"], c["sorted"])


def append_manifest(work: Path, rec: Dict) -> None:
    with open(work / "manifest.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def verify_moves(moves: List[Dict], mode: str) -> List[str]:
    """Re-hash every file at its destination; report anything that does not match the inventory hash."""
    problems = []
    for m in moves:
        dest, src = Path(m["dest"]), Path(m["src"])
        if not dest.exists():
            problems.append("missing at destination: %s" % dest)
            continue
        try:
            actual = sha256_file(dest)
        except OSError as exc:
            problems.append("cannot read %s: %s" % (dest, exc))
            continue
        if actual != m["hash"]:
            problems.append("content differs at destination: %s" % dest)
        if mode == "copy" and not src.exists():
            problems.append("original disappeared after copy: %s" % src)
        if mode == "move" and src.exists():
            problems.append("original still present after move (counted twice?): %s" % src)
    return problems


def count_check(before: Dict, after: Dict, mode: str, n_files: int, problems: List[str]) -> Dict:
    expected = before["total"] + (n_files if mode == "copy" else 0)
    ok = after["total"] == expected and not problems
    if mode == "copy":
        what = "%d copied; total went from %d to %d (expected %d)" % (n_files, before["total"], after["total"], expected)
    elif mode == "undo":
        what = "%d restored; total before %d, after %d" % (n_files, before["total"], after["total"])
    else:
        what = "%d moved; total before %d, after %d" % (n_files, before["total"], after["total"])
    if ok:
        text = ("PASS: no file was lost. %s. Every %s file was re-hashed at its new location and matches the "
                "original byte for byte." % (what, "restored" if mode == "undo" else "moved" if mode != "copy" else "copied"))
    else:
        text = "CHECK FAILED: %s. %s" % (what, "; ".join(problems) if problems else "the file total changed unexpectedly")
    return {"verified": ok, "text": text}


def undo(work: Path, log_path: Path) -> int:
    log = load_json(log_path)
    if not log:
        die("cannot read %s" % log_path)
    if log.get("mode") == "copy":
        print("This run copied files; originals are still in place. Removing the copies would be a delete, so nothing is undone.")
        return 1
    inp, out = Path(log["input"]), Path(log["out"])
    before = count_roots(inp, out, work)
    restored, skipped, restored_recs = 0, 0, []
    for rec in reversed(log.get("moves", [])):
        src, dest = Path(rec["src"]), Path(rec["dest"])
        if dest.exists() and not src.exists():
            src.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(dest), str(src))
            restored += 1
            restored_recs.append({"hash": rec["hash"], "src": str(dest), "dest": str(src)})
            append_manifest(work, {"event": "undo", "hash": rec["hash"], "src": rec["src"], "dest": rec["dest"], "at": now_iso()})
        else:
            skipped += 1
    # remove now-empty folders created by that run
    for folder in sorted(set(Path(r["dest"]).parent for r in log.get("moves", [])), key=lambda p: -len(str(p))):
        try:
            if folder.is_dir() and not any(folder.iterdir()):
                folder.rmdir()
        except OSError:
            pass
    # give the restored items their pre-apply status back so the plan can be applied again
    plan = load_json(work / "plan.json")
    if plan:
        restored_srcs = {r["dest"] for r in restored_recs}  # dest of the undo = original source path
        stamp = log_path.stem.replace("applied-", "")
        for it in plan.get("items", []):
            if it.get("src") in restored_srcs and it.get("applied_stamp") == stamp and it.get("applied_status"):
                it["status"] = it.pop("applied_status")
                it.pop("applied_stamp", None)
                it["notes"] = [n for n in (it.get("notes") or []) if n != "applied %s" % stamp]
        save_json(work / "plan.json", plan)
    after = count_roots(inp, out, work)
    problems = verify_moves(restored_recs, "move")
    check = count_check(before, after, "undo", restored, problems)
    append_manifest(work, {"event": "undo-run", "at": now_iso(), "mode": "undo", "input": str(inp), "out": str(out),
                           "files": restored, "before": before, "after": after, "verified": check["verified"],
                           "check_text": check["text"], "undone": str(log_path)})
    sorted_md = write_sorted_md(out, work)
    print("undo: restored %d, skipped %d (already moved or missing)" % (restored, skipped))
    print("File count: before %s -> after %s" % (fmt_counts(before), fmt_counts(after)))
    print(check["text"])
    print("%s updated: %s" % (SORTED_FILENAME, sorted_md))
    return 0 if check["verified"] else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", required=True)
    ap.add_argument("--plan", help="plan file (default <work>/plan.json)")
    ap.add_argument("--out", help="override output root")
    ap.add_argument("--yes", action="store_true", help="actually move files (default: dry run)")
    ap.add_argument("--copy", action="store_true", help="copy instead of move (originals stay in the inbox)")
    ap.add_argument("--leave-review", action="store_true",
                    help="keep review items in the inbox instead of moving them into %s" % REVIEW_FOLDER)
    ap.add_argument("--include-review", action="store_true", help=argparse.SUPPRESS)  # former opt-in; now the default
    ap.add_argument("--undo", metavar="APPLIED_JSON", help="reverse a previous run")
    args = ap.parse_args()

    work = Path(args.work).expanduser().resolve()
    if args.undo:
        return undo(work, Path(args.undo).expanduser().resolve())
    plan = load_json(Path(args.plan).expanduser().resolve() if args.plan else work / "plan.json")
    if not plan:
        die("no plan found; run classify.py first")
    out = Path(args.out).expanduser().resolve() if args.out else Path(plan["out"])
    inp = Path(plan["input"])

    actions = []
    for it in plan["items"]:
        status = it["status"]
        if status == "skip":
            continue
        if status == "review" and args.leave_review:
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
    left = [it for it in plan["items"] if it["status"] == "review"] if args.leave_review else []
    parked = [a for a in todo if a["item"]["status"] == "review"]
    print("")
    print("  %d to %s, %d skipped%s%s" % (
        len(todo), verb.lower(), len(actions) - len(todo),
        (", %d for a person to review -> %s" % (len(parked), REVIEW_FOLDER)) if parked else "",
        (", %d review items left in the inbox (--leave-review)" % len(left)) if left else ""))

    # Vision gate: the scripts could not read these files and nobody has looked at the page images yet.
    # Parking them in the human-review folder now would skip the AI vision step, so refuse to do anything.
    pending = [it for it in plan["items"] if it["status"] == "review" and it.get("vision") == "pending"]
    if pending:
        print("")
        print("BLOCKED: %d file(s) flagged needs_vision have not been read yet. Nothing was moved." % len(pending))
        for it in pending:
            print("  %3d. %-40s %s" % (it["index"], it["rel"][:40], "; ".join(it.get("notes", []))[:100]))
            for img in it.get("page_images", [])[:6]:
                print("       %s" % img)
            if not it.get("page_images"):
                print("       (no page images: install the missing tool and re-run extract_text.py --only FILE --force,"
                      " or read the file itself)")
        print("Open the page images with the Read tool and identify each file from its content, then record a verdict:")
        print("  python3 \"%s\" --work \"%s\" --item N --set doc_type=\"...\" --set entity=\"...\" --status ready" % (
            Path(__file__).resolve().parent / "edit_plan.py", work))
        print("  python3 \"%s\" --work \"%s\" --item N --vision-failed \"what you saw (blurry, cropped, blank)\"" % (
            Path(__file__).resolve().parent / "edit_plan.py", work))
        print("Only files you looked at and still could not identify go to %s." % REVIEW_FOLDER)
        return 1

    before = count_roots(inp, out, work)
    mode = "copy" if args.copy else "move"
    if not args.yes:
        expected = before["total"] + (len(todo) if args.copy else 0)
        print("")
        print("File count now: %s. After applying, the total must be %d%s; apply_plan.py re-counts and re-hashes every "
              "file to prove it, and writes the result to %s." % (
                  fmt_counts(before), expected, "" if args.copy else " (unchanged)", out / SORTED_FILENAME))
        return 0
    if not todo:
        print("Nothing to apply.")
        write_sorted_md(out, work)
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log = {"applied_at": now_iso(), "mode": mode, "input": plan["input"], "out": str(out), "moves": [],
           "count_before": before}
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
               "category": it["category"], "orig_name": src.name, "src_rel": it["rel"],
               "notes": "; ".join(it.get("notes") or [])[:200], "confidence": it.get("confidence"), "at": now_iso(),
               # what the summaries skill needs later, even after plan.json has been overwritten by another run
               "entity": it.get("entity"), "property": it.get("property"), "business": it.get("business"),
               "tax_year": it.get("tax_year"), "date": it.get("date"), "when_style": it.get("when_style"),
               "method": it.get("method"), "quality": it.get("quality"), "needs_vision": bool(it.get("needs_vision")),
               "vision": it.get("vision")}
        log["moves"].append(rec)
        append_manifest(work, rec)
        done[rel(dest.parent, out)] += 1

    # The nothing-lost check: count again and re-hash every file where it now lives.
    after = count_roots(inp, out, work)
    problems = verify_moves(log["moves"], mode)
    check = count_check(before, after, mode, len(log["moves"]), problems)
    log.update({"count_after": after, "verified": check["verified"], "check_text": check["text"], "problems": problems})
    log_path = work / ("applied-%s.json" % stamp)
    save_json(log_path, log)
    append_manifest(work, {"event": "run", "at": log["applied_at"], "mode": mode, "input": plan["input"], "out": str(out),
                           "files": len(log["moves"]), "before": before, "after": after, "verified": check["verified"],
                           "check_text": check["text"], "log": str(log_path)})
    # keep the plan in sync so a re-run does not try to move the same items again (--undo restores these)
    moved_srcs = {m["src"] for m in log["moves"]}
    for it in plan["items"]:
        if it["src"] in moved_srcs and it["status"] in ("ready", "duplicate", "processed", "review"):
            it["applied_status"] = it["status"]
            it["applied_stamp"] = stamp
            it["status"] = "skip"
            it["notes"] = (it.get("notes") or []) + ["applied %s" % stamp]
    save_json(work / "plan.json", plan)
    sorted_md = write_sorted_md(out, work)

    print("")
    print("Applied %d file(s):" % len(log["moves"]))
    for folder, n in sorted(done.items()):
        print("  %-40s %d" % (folder, n))
    print("")
    print("File count: before %s -> after %s" % (fmt_counts(before), fmt_counts(after)))
    print(check["text"])
    if not check["verified"]:
        print("Do not report this run as successful. Review the problems above; the undo command below restores the files.")
    print("")
    print("Renames (original -> new):")
    for m in log["moves"]:
        print("  %s -> %s" % (m["orig_name"], rel(Path(m["dest"]), out)))
    print("")
    print("%s written: %s" % (SORTED_FILENAME, sorted_md))
    print("Undo with: python3 %s --work \"%s\" --undo \"%s\"" % (Path(__file__).resolve(), work, log_path))
    if check["verified"]:
        print("")
        print("Next: create or update %s for the tax professional. Just invoke the skill %s (default folder %s)." % (
            SUMMARIES_FILENAME, SUMMARIES_SKILL, plan["input"]))
    return 0 if check["verified"] else 1


if __name__ == "__main__":
    sys.exit(main())
