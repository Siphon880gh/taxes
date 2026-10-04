---
name: tax-document-classification
description: Sorts a folder of tax documents (default sorter/stage/) into tax-prep folders such as "_Last year's return", "_Proof of identity", "Deductions", "Income - Investments", "Income - Rental", "Income - Self-employment" and "Regulations - Health Insurance", and renames generic or hashed filenames (scan0001.pdf, IMG_2048.jpg, a3f9c2d1….pdf) to recognizable ones like "Electric Bill - Property 200 - 2026-07-01.pdf". Reads PDFs (text layer or OCR), photos and HEIC, DOCX, XLSX, CSV and EML with bundled scripts, and has the agent look at page images when text cannot be extracted. Use when the user asks to sort, classify, organize, rename or file tax documents, W-2s, 1099s, receipts, bills or statements, or mentions the tax inbox or the sorter/stage folder.
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
   read are flagged `needs_vision` and their page images are kept for you to look at.
3. **Classify** deterministically: form titles, OMB numbers, box labels and bill/receipt cues score each document
   type; payer, tax year, date and street addresses are extracted; a destination folder and filename are proposed
   with a confidence score. Output: `plan.md` (for you and the user) and `plan.json`.
4. **Review**: you read the plan, look at images for unreadable or low-confidence items, fix items with
   `edit_plan.py`, and show the user the before -> after list.
5. **Apply**: `apply_plan.py --yes` moves and renames. It never deletes, resolves name collisions, reuses existing
   folders, writes an undo log, and records every file in a manifest so re-runs skip what is already sorted.

## Folders and filenames (summary)

Input: the folder the user names; otherwise `sorter/stage/` if it exists. Output: `--out`, else `sorter/sorted/`
for the default inbox, else the input folder itself (sorted in place). Work files live in `<out>/.tax-sorter/`.

Destination folders (leading `_` sorts first, `zz_` sorts last; the full list and routing rules are in
[reference/taxonomy.md](reference/taxonomy.md)):

```
_Last year's return      _Proof of identity       _This year's return
Credits                  Deductions               Estimated tax payments
Income - Investments     Income - Other           Income - Partnerships and S-corps
Income - Rental          Income - Retirement      Income - Self-employment
Income - Wages           Records - Statements     Regulations - Health Insurance
Retirement & HSA         zz_Needs review          zz_Duplicates
```

Filename convention `{Document type} - {Entity} - {YYYY[-MM[-DD]]}.ext` (details and the generic/hashed
rules in [reference/naming.md](reference/naming.md)):

```
Electric Bill - Property 200 - 2026-07-01.pdf      W-2 - Acme Corporation - 2025.pdf
1099-NEC - Client Consulting LLC - 2025.pdf         Form 1040 Return - 2024.pdf
Donation Receipt - Red Cross - 2025-12-15.docx      Property Tax Bill - Property 200 - 2025-11-15.pdf
```

Only generic or hashed names are renamed (`scan0001.pdf`, `IMG_2048.jpg`, `document (3).docx`, `download.pdf`,
`a3f9c2d1e5b7….pdf`). Descriptive names such as `Chase 1099-INT 2025.pdf` are kept unless the user asks for
`--rename-all`.

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
- [ ] 1 Confirm input folder, output root, tax year; check the inbox is gitignored
- [ ] 2 inventory.py -> report counts, duplicates, warnings
- [ ] 3 extract_text.py -> note needs_vision items
- [ ] 4 Read every needs_vision page image; read other images when confidence < 0.75
- [ ] 5 classify.py (with --property / --business labels when there are rentals or businesses)
- [ ] 6 Review plan.md item by item; fix with edit_plan.py
- [ ] 7 Show the user the before -> after plan; get a go-ahead unless they pre-approved
- [ ] 8 apply_plan.py --yes; report the result and what is left in the inbox
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

**Step 4. Read documents yourself when the scripts cannot.** For every `needs_vision` item (and any item you
doubt), open the listed PNGs under `<out>/.tax-sorter/pages/` with the Read tool and identify the document from
its content, never from its filename. Look for: the form title and number (W-2, 1099-NEC, 1098, 1095-A, K-1),
the OMB number, the payer/employer/lender block, the tax year printed on the form, the service or statement date,
property addresses, and whether the page is a cover letter or instructions rather than the form itself.
Cues per form are in [reference/form-cues.md](reference/form-cues.md). Record what you find in step 6.

**Step 5.**

```bash
python3 "$SKILL_DIR/scripts/classify.py" [INPUT] [--out OUT] [--tax-year 2025] \
    --property "Property 200=200 Oak St|200 OAK STREET" \
    --business "Nursing 1099=Travel Nurse Co|Metairie clinic"
```

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
```

`doc_type` values and their default folders are listed in [reference/taxonomy.md](reference/taxonomy.md); a
free-form `doc_type` or `category` is allowed when nothing fits. Set `--set dest_name="..."` only when the
convention cannot express the name.

**Step 7.** Show the user the plan as a before -> after list grouped by folder, including items left in review
and why. Wait for approval unless the user already said to go ahead.

**Step 8.**

```bash
python3 "$SKILL_DIR/scripts/apply_plan.py" --work OUT/.tax-sorter            # dry run
python3 "$SKILL_DIR/scripts/apply_plan.py" --work OUT/.tax-sorter --yes      # move + rename
python3 "$SKILL_DIR/scripts/apply_plan.py" --work OUT/.tax-sorter --yes --include-review   # also park review items in zz_Needs review
python3 "$SKILL_DIR/scripts/apply_plan.py" --work OUT/.tax-sorter --undo OUT/.tax-sorter/applied-<stamp>.json
```

Use `--copy` if the user wants the originals left in the inbox.

## Rules

- Classify from content. Filenames are hints at best; a file called `w2.pdf` can be a 1099.
- Never delete. Duplicates go to `zz_Duplicates`, unknowns stay in the inbox (or `zz_Needs review`).
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
  Income - Wages (1)              W-2 - Acme Corporation - 2025.pdf
  Income - Self-employment (3)    1099-NEC - Client Consulting LLC - 2025.pdf, ...
  ...
Left in the inbox (2): mystery.pdf (could not identify), IMG_2051.heic (blurry; please re-photograph)
Duplicates (1): scan0001 copy.pdf -> zz_Duplicates
Questions: Is "200 Oak St" the rental? Two bills mention it but no property label was given.
```

## Additional resources

- [reference/taxonomy.md](reference/taxonomy.md): every folder, what goes in it, routing rules, document types.
- [reference/naming.md](reference/naming.md): filename convention, generic/hashed detection, examples.
- [reference/form-cues.md](reference/form-cues.md): how to recognise each IRS form and common document from its
  content, including what to look for in page images.
