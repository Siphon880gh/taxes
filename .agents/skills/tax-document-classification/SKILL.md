---
name: tax-document-classification
description: Sorts a folder of tax documents (default sorter/stage/) into tax-prep folders such as "_Last year's return", "_Proof of identity", "Deductions", "Income - Investments", "Income - Rental", "Income - Self-employment" and "Regulations - Health Insurance", parks anything it cannot classify in "_Needs Human Review", and renames every file to a glanceable name that keeps the original filename in parentheses, e.g. "Electric Bill - Property 200 - 2026-07-01 (IMG_2048.jpg).jpg". Classifies from content (PDF text layer or OCR, photos and HEIC, DOCX, XLSX, CSV, EML), from AI vision when text cannot be extracted, and from helpful words in the filename. Counts files before and after moving and re-hashes each one so nothing is lost, and writes SORTED.md with the original → new map. Use when the user asks to sort, classify, organize, rename or file tax documents, W-2s, 1099s, receipts, bills or statements, or mentions the tax inbox or the sorter/stage folder.
argument-hint: "[folder] [--out folder] [--tax-year YYYY] [--property \"Label=keyword|keyword\"]"
---

# Tax Document Classification

Usage: just invoke the skill `tax-document-classification`, optionally with a folder
(`/tax-document-classification ~/Downloads/taxdocs --tax-year 2025`). Everything runs locally with the
bundled scripts; no document leaves the machine.

`SKILL_DIR` below is the directory containing this file (in this repo: `.agents/skills/tax-document-classification`).
Run every command from the repository root, or use the absolute path to `SKILL_DIR`.

## What it does

1. **Inventory** the inbox: SHA-256 every file, flag generic/hashed filenames, group byte-identical duplicates,
   recognise files sorted on an earlier run, warn if the folder is in git but not ignored.
2. **Extract text**: PDF text layer, falling back to OCR (pages rendered with `mutool`, read with `tesseract`,
   rotation fixed automatically); photos and HEIC; DOCX, DOC/RTF, XLSX, CSV, HTML, EML. Files whose text cannot be
   read are flagged `needs_vision`: that means the *text pipeline* failed and **you** read the page images with
   the Read tool (AI vision). It does not mean a person has to.
3. **Classify** deterministically: form titles, OMB numbers, box labels and bill/receipt cues score each document
   type from the extracted text **and from the words in the filename** ("Rental Income", "Electric Bill",
   "W2 Acme"); payer, tax year, date and street addresses are extracted (from the filename too when the content
   has none); a destination folder and filename are proposed with a confidence score. Output: `plan.md` (for you
   and the user) and `plan.json`.
4. **Review**: you read the plan, look at the page images of every `needs_vision` item and of low-confidence
   items, record a verdict for each with `edit_plan.py`, and show the user the before -> after list.
5. **Apply**: `apply_plan.py --yes` moves and renames, and parks whatever is still unclassified in
   `_Needs Human Review` (original names) for a person to decide. It refuses to run while any `needs_vision`
   item has no verdict, so nothing reaches that folder without an AI vision attempt. It never deletes, resolves
   name collisions, reuses existing folders, writes an undo log, and records every file in a manifest so re-runs
   skip what is already sorted (parked files are not counted as sorted).
6. **Prove nothing was lost**: `apply_plan.py` counts the files under the inbox and the output root before and
   after moving, re-hashes every moved file at its destination against the hash taken at inventory time, and
   prints `PASS` only when the total is unchanged and every hash matches (`CHECK FAILED` otherwise, with the undo
   command). It then writes **`SORTED.md`** at the output root: the count check, the complete
   `original name → new location` map grouped by folder, and a table of all runs.
7. **Hand off**: once the files are sorted, recommend the next skill: just invoke the skill
   `tax-document-summaries`, which creates or updates `Summaries.md` (the numbers a tax professional needs, one
   section per topic) from the sorted documents. `Summaries.md` and `SORTED.md` are reports, never sorted.

## Folders and filenames (summary)

Input: the folder the user names; otherwise `sorter/stage/` under the current working directory (the directory
the skill was invoked from), created if it does not exist yet. Output: `--out`, else `sorter/sorted/` for the
default inbox, else the input folder itself (sorted in place). Work files live in `<out>/.tax-sorter/`.

Destination folders (leading `_` sorts first, `zz_` sorts last; the full list and routing rules are in
[reference/taxonomy.md](reference/taxonomy.md)):

```
_Last year's return               _Needs Human Review            _Proof of identity
_This year's return               Credits                        Deductions
Estimated tax payments            Income - Investments           Income - Other
Income - Partnerships and S-corps Income - Rental                Income - Retirement
Income - Self-employment          Income - Wages                 Records - Statements
Regulations - Health Insurance    Retirement & HSA               zz_Duplicates
```

Anything the scripts cannot classify with confidence is moved to `_Needs Human Review` with its original name and
listed in the report with the reason; a person decides where it goes.

Filename convention `{Document type} - {Entity} - {YYYY[-MM[-DD]]} ({original filename}).ext` (details in
[reference/naming.md](reference/naming.md)):

```
Electric Bill - Property 200 - 2026-07-01 (IMG_2048.jpg).jpg
W-2 - Acme Corporation - 2025 (a3f9c2d1e5b7a9c0d1e2f3a4b5c6d7e8.pdf).pdf
1099-NEC - Client Consulting LLC - 2025 (scan0001.pdf).pdf
1099-INT - JPMorgan Chase Bank - 2025 (Chase 1099-INT 2025.pdf).pdf
Donation Receipt - Red Cross - 2025-12-15 (document (3).docx).docx
Form 1040 Return - 2024 (download.pdf).pdf
```

Rental property tax keeps the original filename in parentheses, and the name itself says whether the page is
the **bill** (assessment: amount owed, parcel, installments) or the **receipts** (proof it was paid: bank
payment, treasurer paid stamp). One rental property:

```
Rent-Income-Deduction-Home-Property-Tax-Bill (200-lake-ave-farmers-tax.pdf).pdf
Rent-Income-Deduction-Home-Property-Tax-Receipts (200-lake-ave-boa-paid-tax.pdf).pdf
```

More than one rental: put that property in the name, immediately after `Rent-Income-`, in hyphenated title
case (`200 Lake Ave` -> `200-Lake-Ave`). Bill and receipts stay distinct:

```
Rent-Income-200-Lake-Ave-Deduction-Home-Property-Tax-Bill (200-lake-ave-farmers-tax.pdf).pdf
Rent-Income-200-Lake-Ave-Deduction-Home-Property-Tax-Receipts (200-lake-ave-boa-paid-tax.pdf).pdf
```

Set these with `edit_plan.py --set dest_name="..."`. A personal-home property tax bill (no rental) stays
`Property Tax Bill` in `Deductions`.

Every classified file is renamed so a folder can be read at a glance, and the original filename is always kept
in parentheses at the end, so nothing about the old name is lost and a search for `IMG_2048` still finds the
file. Files that could not be identified keep their original names. `--keep-descriptive` limits renaming to
generic or hashed names (`scan0001.pdf`, `IMG_2048.jpg`, `document (3).docx`, `a3f9c2d1e5b7….pdf`).
`SORTED.md` at the output root lists every rename as `original → new`.

## Requirements

Python 3.8+. Optional, used when present (the scripts say what is missing and keep going):

```bash
pip install pdfplumber python-docx openpyxl pillow      # PDF text layer, DOCX, XLSX, image handling
brew install tesseract mupdf-tools                      # OCR + PDF page rendering (poppler's pdftoppm also works)
```

HEIC photos are converted with macOS `sips` (or ImageMagick `magick`). Without `tesseract`, scans and photos are
simply flagged `needs_vision` and you read them yourself.

## Workflow

Copy this checklist and work through it:

```
- [ ] 1 Confirm input folder (default sorter/stage/ in the cwd; create it if missing), output root, tax year; check the inbox is gitignored
- [ ] 2 inventory.py -> report counts, duplicates, warnings
- [ ] 3 extract_text.py -> note needs_vision items
- [ ] 4 Read every needs_vision page image; read other images when confidence < 0.75
- [ ] 5 classify.py (with --property / --business labels when there are rentals or businesses)
- [ ] 6 Review plan.md item by item; fix with edit_plan.py
- [ ] 7 Show the user the before -> after plan; get a go-ahead unless they pre-approved
- [ ] 8 apply_plan.py --yes; quote the PASS line (file count before = after, every hash matched) and SORTED.md;
        report what went to _Needs Human Review and why
- [ ] 9 Recommend the next step: invoke the skill tax-document-summaries to create or update Summaries.md
```

**Step 1.** Default inbox is `sorter/stage/`. If the user named a folder, use it. Ask the user for the tax year only
if the documents do not make it obvious (classify infers it from the W-2/1099/1098 forms; pass `--tax-year` when
known). If the folder is inside a git repository and not ignored, stop and tell the user before continuing.

**Step 2.**

```bash
python3 "$SKILL_DIR/scripts/inventory.py" [INPUT] [--out OUT]
```

**Step 3.**

```bash
python3 "$SKILL_DIR/scripts/extract_text.py" [INPUT] [--out OUT]            # 6 pages per PDF by default
python3 "$SKILL_DIR/scripts/extract_text.py" [INPUT] --only FILE --max-pages 0   # whole multi-form package
python3 "$SKILL_DIR/scripts/extract_text.py" [INPUT] --only FILE --render        # page images for a digital PDF
```

**Step 4. Read documents yourself when the scripts cannot.** `needs_vision` means the text pipeline (text layer,
then OCR) produced nothing usable; it is your cue to use vision, not a reason to hand the file to a person. For
every `needs_vision` item (and any item you doubt), open the listed PNGs under `<out>/.tax-sorter/pages/` with
the Read tool and identify the document from what is printed on it. The filename is a hint to check against
(`plan.md` shows the filename-based guess, e.g. "Rental Income Statement Dec 2025.pdf" -> Rental Income
Statement, 2025-12): confirm it from the image rather than trusting it. Look for: the form title and
number (W-2, 1099-NEC, 1098, 1095-A, K-1), the OMB number, the payer/employer/lender block, the tax year printed
on the form, the service or statement date, property addresses, and whether the page is a cover letter or
instructions rather than the form itself. Cues per form are in [reference/form-cues.md](reference/form-cues.md).

Each `needs_vision` item ends in exactly one of two verdicts, recorded in step 6:

- you identified it -> `edit_plan.py --item N --set doc_type="..." --set entity="..." --status ready`
- you opened the images and still cannot tell what it is (blurry, cropped, blank, wrong side, cover letter only)
  -> `edit_plan.py --item N --vision-failed "what you saw"`. Only these files go to `_Needs Human Review`.

`apply_plan.py` refuses to run while any `needs_vision` item has neither verdict, so this step cannot be skipped.
If an item has no page images (PDF renderer missing, spreadsheet library missing, unsupported type), install the
tool the `vision_reason` names and run `extract_text.py [INPUT] --only FILE --force`, or read the file itself with
the Read tool; record `--vision-failed` only when neither works.

**Step 5.**

```bash
python3 "$SKILL_DIR/scripts/classify.py" [INPUT] [--out OUT] [--tax-year 2025] \
    --property "Property 200=200 Oak St|200 OAK STREET" \
    --business "Nursing 1099=Travel Nurse Co|Metairie clinic"
```

**Filenames are evidence.** `classify.py` scores the words in the filename with the same rules as the content:
`RentalIncome_Dec2025.pdf`, `Electric Bill Property 200.jpg` or `Acme W2 2025.pdf` raise the matching type, can
supply the payer or vendor (`Chase 1099-INT 2025.pdf` -> Chase) and the date or year when the content has none,
and a `Property 200` or business keyword in the name counts for the label match. Readable content still wins over
the filename when they disagree, and the note `filename suggests W-2; content reads as 1099-INT (content wins)`
is added so you can double-check. A filename alone never clears the confidence bar for an unreadable file: the
`needs_vision` gate still makes you look at it, with the filename-based guess already filled in.

Labels are remembered in `<out>/.tax-sorter/config.json`. A bill, receipt, invoice, insurance, HOA, property-tax
or 1098 document that mentions a property label is routed to `Income - Rental` and named with that label
(`Electric Bill - Property 200 - ...`); receipts and invoices matching a business label go to
`Income - Self-employment`. Without a matching label those documents stay in review, because a personal utility
bill or a Home Depot receipt is not a tax document by itself. If `plan.md` lists addresses you do not recognise,
ask the user which property or business they belong to, then re-run with labels. Add `--group-by-entity` to get
one subfolder per property or business.

**Step 6.** Read `<out>/.tax-sorter/plan.md`. For each item check: document type, folder, entity (payer, property
or business), year or date, and the proposed name. Fix with:

```bash
python3 "$SKILL_DIR/scripts/edit_plan.py" --work OUT/.tax-sorter --list
python3 "$SKILL_DIR/scripts/edit_plan.py" --work OUT/.tax-sorter --item 7 \
    --set doc_type="Electric Bill" --set entity="Property 200" --set date=2026-07-01 \
    --set category="Income - Rental" --status ready
python3 "$SKILL_DIR/scripts/edit_plan.py" --work OUT/.tax-sorter --item 3 --set entity="Jane Doe" --status ready   # identity docs
python3 "$SKILL_DIR/scripts/edit_plan.py" --work OUT/.tax-sorter --item 9 --status skip                           # leave it alone
python3 "$SKILL_DIR/scripts/edit_plan.py" --work OUT/.tax-sorter --item 4 --vision-failed "blurry; ask for a re-photograph"   # looked, cannot tell
```

`doc_type` values and their default folders are listed in [reference/taxonomy.md](reference/taxonomy.md); a
free-form `doc_type` or `category` is allowed when nothing fits. Set `--set dest_name="..."` when the
convention cannot express the name, and for every rental property-tax file (bill vs receipts, and the property
when there is more than one rental — see the filename examples above). The original filename is appended in
parentheses even then.

**Step 7.** Show the user the plan as a before -> after list grouped by folder, including the items going to
`_Needs Human Review` and why. Wait for approval unless the user already said to go ahead.

**Step 8.**

```bash
python3 "$SKILL_DIR/scripts/apply_plan.py" --work OUT/.tax-sorter            # dry run
python3 "$SKILL_DIR/scripts/apply_plan.py" --work OUT/.tax-sorter --yes      # move + rename; review items -> _Needs Human Review
python3 "$SKILL_DIR/scripts/apply_plan.py" --work OUT/.tax-sorter --yes --leave-review   # keep review items in the inbox instead
python3 "$SKILL_DIR/scripts/apply_plan.py" --work OUT/.tax-sorter --undo OUT/.tax-sorter/applied-<stamp>.json
```

If the output starts with `BLOCKED`, a `needs_vision` item still has no verdict: go back to step 4 for the items it
lists, record the verdicts, and run it again. Nothing has been moved.

The dry run prints the file count now and the total the run must end with. The real run ends with:

```
File count: before 16 (inbox 16 + sorted 0) -> after 16 (inbox 0 + sorted 16)
PASS: no file was lost. 16 moved; total before 16, after 16. Every moved file was re-hashed at its new location and matches the original byte for byte.
Renames (original -> new): ...
SORTED.md written: sorter/sorted/SORTED.md
```

Quote the `File count` and `PASS` lines to the user verbatim and point them to `SORTED.md`, which holds the same
check plus the full `original → new` map. If the run prints `CHECK FAILED` (total changed or a hash mismatch),
do not report success: show the problems it lists, run the printed `--undo` command, and tell the user exactly
which files were affected.

Use `--copy` if the user wants the originals left in the inbox. When the user later answers a question about a
parked file (which property, whose ID, personal or business), run steps 2-8 again with `OUT/_Needs Human Review`
as the input and `--out OUT`: parked files are not counted as sorted, so they are classified again with the new
labels and move on to their folders; whatever is still unclear stays parked.

## Rules

- Classify from content first, filename second. Helpful words in the filename ("Rental Income", "Electric Bill",
  a payer name, a date) count as evidence and fill gaps the content leaves; when readable content disagrees, the
  content wins (`w2.pdf` can be a 1099-INT) and the plan notes the disagreement.
- Never delete, and prove it: the file total before and after `apply_plan.py` must be identical (or larger by
  the number of copies with `--copy`), and every moved file must re-hash to its inventory hash. Report the
  `PASS` line and `SORTED.md`; never claim success after a `CHECK FAILED`.
- Rename everything you classified, and keep the original filename in parentheses at the end of the new name;
  files you could not identify keep their original names.
- Duplicates go to `zz_Duplicates`; anything not classified with confidence goes to `_Needs Human Review` with
  its original name, and the report says why for each file. Never guess a folder for a file you could not
  identify just to keep that folder empty.
- `needs_vision` is for you, not for the user: the scripts could not read the file, so you read its page images.
  A file reaches `_Needs Human Review` for one of two reasons only: you looked at it and recorded
  `--vision-failed`, or the question is one only the user can answer (which property, whose ID, personal or
  business). Writing `--vision-failed` without having opened the images is not allowed; the reason must say what
  you saw.
- Privacy: never put an SSN, EIN or account number in a filename, note or report. Cached text under
  `<out>/.tax-sorter/text/` has SSNs masked; offer to delete `text/` and `pages/` when done.
- Multi-form packages (brokerage "Consolidated 1099", employer W-2 + 1095-C, K-1 packets with state copies):
  read all pages, name the file by the package (`Consolidated 1099 - Fidelity - 2025.pdf`) and list the forms it
  contains in the report. Split pages only if the user asks.
- `CORRECTED` / `AMENDED` forms keep the original too; the newer file gets the ` - CORRECTED` suffix.
- Returns: a Form 1040 or state return for a year before the target tax year goes to `_Last year's return`;
  for the target year to `_This year's return`.
- Several tax years in one inbox: tell the user; sort the target year, and either park the rest in review or run
  again with `--out sorter/sorted/TY2024 --tax-year 2024` for the other year.
- Ask the user only what only they know: which property or business a bill belongs to, whose identity document
  it is, whether a Home Depot receipt is personal or business.

## Report

End with a short report:

```
Sorted 14 files from sorter/stage -> sorter/sorted (tax year 2025)
File count: before 16 (inbox 16 + sorted 0) -> after 16 (inbox 0 + sorted 16). PASS: no file was lost;
  every moved file re-hashed at its destination and matches the original.
  Income - Wages (1)              a3f9c2d1….pdf -> W-2 - Acme Corporation - 2025 (a3f9c2d1….pdf).pdf
  Income - Self-employment (3)    scan0001.pdf -> 1099-NEC - Client Consulting LLC - 2025 (scan0001.pdf).pdf, ...
  ...
Needs human review (2) -> _Needs Human Review: mystery.pdf (text read, no document type matched),
  IMG_2051.heic (AI vision: too blurry to read the title or payer; please re-photograph)
Duplicates (1): scan0001 copy.pdf -> zz_Duplicates
Full original -> new map and the count check: sorter/sorted/SORTED.md
Questions: Is "200 Oak St" the rental? Two bills mention it but no property label was given.
Next: to turn these documents into the numbers your tax professional needs, invoke the skill
  tax-document-summaries. It creates or updates Summaries.md (default: sorter/stage/Summaries.md).
```

Always end with that recommendation (the user may not know the second skill exists). If the user asks to go
ahead, read and follow `.agents/skills/tax-document-summaries/SKILL.md`.

## Additional resources

- [reference/taxonomy.md](reference/taxonomy.md): every folder, what goes in it, routing rules, document types.
- [reference/naming.md](reference/naming.md): filename convention, generic/hashed detection, examples.
- [reference/form-cues.md](reference/form-cues.md): how to recognise each IRS form and common document from its
  content, including what to look for in page images.
