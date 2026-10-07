#!/usr/bin/env python3
"""Step 1: inventory the inbox folder.

Walks the input folder, hashes every file (SHA-256), flags generic/hashed
filenames, groups byte-identical duplicates, marks files already sorted on an
earlier run (manifest), and warns when the folder sits inside a git repo
without being ignored. Writes <work>/inventory.json and prints a summary.

Usage:
  python3 inventory.py [INPUT] [--out OUT] [--work WORK] [--json]
"""
import argparse
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxsort_common import (FORM_TOKEN_RE, REPORT_FILES, SYSTEM_FILES, TAXONOMY_FOLDERS, WORK_DIRNAME,
                            count_roots, ensure_work, is_within, load_json, name_quality, normalize_folder, now_iso,
                            rel, resolve_paths, run, save_json, sha256_file, tool_available, warn)

KINDS = {
    "pdf": {".pdf"},
    "image": {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".gif", ".webp", ".heic", ".heif"},
    "word": {".docx", ".doc", ".rtf", ".odt", ".pages"},
    "sheet": {".xlsx", ".xlsm", ".xls", ".csv", ".tsv", ".numbers", ".ods"},
    "text": {".txt", ".md", ".json", ".html", ".htm"},
    "email": {".eml", ".msg"},
    "archive": {".zip", ".7z", ".rar", ".tar", ".gz", ".tgz"},
}
SKIP_FILES = set(SYSTEM_FILES) | set(REPORT_FILES)  # SORTED.md / Summaries.md are reports written by the skills, never sorted


def kind_of(ext: str) -> str:
    for kind, exts in KINDS.items():
        if ext in exts:
            return kind
    return "other"


def filename_hints(stem: str):
    years = sorted({m.group(0) for m in re.finditer(r"\b(?:19|20)\d\d\b", stem)})
    dates = sorted({m.group(0) for m in re.finditer(
        r"\b(?:19|20)\d\d[-._](?:0?[1-9]|1[0-2])[-._](?:0?[1-9]|[12]\d|3[01])\b|"
        r"\b(?:0?[1-9]|1[0-2])[-._/](?:0?[1-9]|[12]\d|3[01])[-._/](?:19|20)?\d\d\b", stem)})
    forms = sorted({tok.upper() for tok in re.split(r"[\s_.,()\[\]]+", stem) if tok and FORM_TOKEN_RE.match(tok)})
    return {"years": years, "dates": dates, "forms": forms}


def load_manifest_hashes(work: Path):
    hashes = {}
    path = work / "manifest.jsonl"
    if not path.exists():
        return hashes
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                import json
                rec = json.loads(line)
            except Exception:
                continue
            if rec.get("event") == "undo":
                hashes.pop(rec.get("hash"), None)
            elif rec.get("status") == "review":
                continue  # parked for a person to decide, not sorted: a later run must classify it again
            elif rec.get("hash"):
                hashes[rec["hash"]] = rec.get("dest")
    return hashes


def git_warning(inp: Path):
    if not tool_available("git"):
        return None
    rc, out, _ = run(["git", "-C", str(inp), "rev-parse", "--is-inside-work-tree"], timeout=20)
    if rc != 0 or out.strip() != "true":
        return None
    # probe a hypothetical document inside the folder so rules like "sorter/stage/*" count
    rc, _, _ = run(["git", "-C", str(inp), "check-ignore", "-q", str(inp / "probe-document.pdf")], timeout=20)
    if rc == 0:
        return None
    return ("%s is inside a git repository and is NOT ignored. Tax documents must never be committed; "
            "add the folder to .gitignore before continuing." % inp)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", help="folder to sort (default: ./sorter/stage, created if missing)")
    ap.add_argument("--out", help="output root (default: sorter/sorted for sorter/stage, else in place)")
    ap.add_argument("--work", help="work folder (default: <out>/%s)" % WORK_DIRNAME)
    ap.add_argument("--json", action="store_true", help="print inventory JSON to stdout instead of a summary")
    ap.add_argument("--include-sorted", action="store_true",
                    help="in-place mode: also inventory files already inside taxonomy folders (analysis of an "
                         "already-organised folder, e.g. for the %s skill)" % "tax-document-summaries")
    args = ap.parse_args()

    paths = resolve_paths(args.input, args.out, args.work)
    inp, out, work = paths["input"], paths["out"], paths["work"]
    ensure_work(work)
    processed = load_manifest_hashes(work)

    skip_dirs = {work.resolve()}
    if is_within(out, inp) and out != inp:
        skip_dirs.add(out.resolve())
    taxonomy_norm = {normalize_folder(n) for n in TAXONOMY_FOLDERS}

    files = []
    for root, dirs, names in os.walk(str(inp)):
        root_p = Path(root)
        keep = []
        for d in dirs:
            p = (root_p / d).resolve()
            if d.startswith(".") or p in skip_dirs:
                continue
            # In-place mode: folders created by an earlier run are output, not input.
            if (paths["in_place"] and not args.include_sorted and root_p.resolve() == inp.resolve()
                    and normalize_folder(d) in taxonomy_norm):
                continue
            keep.append(d)
        dirs[:] = sorted(keep)
        for name in sorted(names):
            if name.startswith(".") or name.lower() in SKIP_FILES or name.startswith("~$"):
                continue
            p = root_p / name
            if not p.is_file():
                continue
            try:
                st = p.stat()
                digest = sha256_file(p)
            except OSError as exc:
                warn("cannot read %s: %s" % (p, exc))
                continue
            ext = p.suffix.lower()
            stem = p.stem
            files.append({
                "path": str(p),
                "rel": rel(p, inp),
                "name": name,
                "ext": ext,
                "kind": kind_of(ext),
                "size": st.st_size,
                "mtime": __import__("datetime").datetime.fromtimestamp(st.st_mtime).replace(microsecond=0).isoformat(),
                "hash": digest,
                "name_quality": name_quality(stem),
                "filename_hints": filename_hints(stem),
                "duplicate_of": None,
                "processed_dest": processed.get(digest),
            })

    by_hash = defaultdict(list)
    for f in files:
        by_hash[f["hash"]].append(f)
    for digest, group in by_hash.items():
        if len(group) > 1:
            group.sort(key=lambda f: (f["name_quality"] in ("generic", "hashed"), len(f["rel"]), f["rel"]))
            for dup in group[1:]:
                dup["duplicate_of"] = group[0]["rel"]

    counts = {
        "files": len(files),
        "by_kind": dict(Counter(f["kind"] for f in files)),
        "by_name_quality": dict(Counter(f["name_quality"] for f in files)),
        "duplicates": sum(1 for f in files if f["duplicate_of"]),
        "already_sorted": sum(1 for f in files if f["processed_dest"]),
        "empty": sum(1 for f in files if f["size"] == 0),
    }
    warnings = []
    g = git_warning(inp)
    if g:
        warnings.append(g)
    for f in files:
        if f["size"] == 0:
            warnings.append("empty file: %s" % f["rel"])
        if f["kind"] == "archive":
            warnings.append("archive (extract it into the inbox to sort its contents): %s" % f["rel"])

    counts["on_disk"] = count_roots(inp, out, work)  # re-counted by apply_plan.py after moving: must not shrink
    inventory = {
        "generated": now_iso(),
        "input": str(inp), "out": str(out), "work": str(work), "in_place": paths["in_place"],
        "counts": counts, "warnings": warnings, "files": files,
    }
    save_json(work / "inventory.json", inventory)

    if args.json:
        import json
        print(json.dumps(inventory, indent=2, ensure_ascii=False))
        return 0

    print("Inventory of %s" % inp)
    print("  output root : %s%s" % (out, "  (in place)" if paths["in_place"] else ""))
    print("  work folder : %s" % work)
    print("  files       : %d  (%s)" % (counts["files"], ", ".join("%s %d" % kv for kv in sorted(counts["by_kind"].items())) or "none"))
    print("  filenames   : %s" % (", ".join("%s %d" % kv for kv in sorted(counts["by_name_quality"].items())) or "-"))
    print("  duplicates  : %d   already sorted earlier: %d   empty: %d" % (counts["duplicates"], counts["already_sorted"], counts["empty"]))
    od = counts["on_disk"]
    print("  on disk     : %d file(s) in total%s (apply_plan.py counts again after moving; the total must not change)" % (
        od["total"], "" if od["inbox"] is None or od["sorted"] is None else " = inbox %d + sorted %d" % (od["inbox"], od["sorted"])))
    for w in warnings:
        print("  WARNING     : %s" % w)
    if files:
        print("")
        print("  %-5s %-8s %-12s %s" % ("kind", "size", "name", "file"))
        for f in files:
            flag = ""
            if f["duplicate_of"]:
                flag = "  [duplicate of %s]" % f["duplicate_of"]
            elif f["processed_dest"]:
                flag = "  [already sorted -> %s]" % f["processed_dest"]
            print("  %-5s %-8s %-12s %s%s" % (f["kind"], _human(f["size"]), f["name_quality"], f["rel"], flag))
    print("")
    print("Next: python3 %s/extract_text.py \"%s\" --out \"%s\"" % (Path(__file__).resolve().parent, inp, out))
    return 0


def _human(n: int) -> str:
    for unit in ("B", "K", "M", "G"):
        if n < 1024 or unit == "G":
            return "%d%s" % (n, unit) if unit == "B" else "%.1f%s" % (n, unit)
        n /= 1024.0
    return str(n)


if __name__ == "__main__":
    sys.exit(main())
