---
name: tax-document-summaries
description: Creates or updates Summaries.md, the document a tax professional reads to see at a glance which numbers go on the return, from the documents sorted by the tax-document-classification skill (default sorter/stage/Summaries.md unless the user points to another folder). One section per topic, in the taxpayer's voice, with key figures in bold and links to the files; deductions and credits sit in the section they belong to, and anything else in Misc Deductions or Misc Credits. When information is missing, Things that need answering is the first section, and the user writes the answers there or copies in the documents that have them, then runs this skill again. Sections that do not apply say N/A and are listed last. Use when the user asks for a tax summary, a summary for the accountant, CPA or preparer, Summaries.md, or what numbers the preparer needs.
argument-hint: "[folder] [--tax-year YYYY] [--summaries path]"
---

# Tax Document Summaries

Usage: just invoke the skill `tax-document-summaries`, optionally with a folder
(`/tax-document-summaries ~/Taxes/2025 --tax-year 2025`). Run it after `tax-document-classification` has sorted
the documents; it reads that skill's cache and never moves a file.

`SKILL_DIR` is the directory containing this file (in this repo: `.agents/skills/tax-document-summaries`). The
`tax-document-classification` skill must be installed next to it; the scripts import its code. Run commands from
the repository root or with absolute paths.

## What it does

1. **Gathers facts** (`gather_facts.py`): every sorted document with its type, payer, date, folder, link, and the
   amounts read from its text (W-2 boxes, 1099 boxes, bill totals, premiums, depreciation figures…), grouped by
   summary section and by property or business label; totals per expense category for the tax year; which
   months each monthly bill covers; what still needs AI vision; hints for Open Items; and, when a `Summaries.md`
   exists, which documents it does not mention yet. Files the classification skill never processed (left in the
   inbox, or a folder organised by hand) are read with the same extraction code.
2. **Scaffolds** (`summaries.py scaffold`): creates `Summaries.md` with a header and every standard section
   marked `N/A`, or adds the missing standard sections to an existing file without touching anything else.
3. **You write the sections** from the facts and the documents, in the taxpayer's voice, following
   [reference/example.md](reference/example.md) and [reference/sections.md](reference/sections.md).
4. **Finalizes** (`summaries.py finalize`): reads any answers the user typed under **Things that need answering**
   and puts them into the section that asked; rebuilds that section at the top with whatever is still open;
   moves `N/A` sections below the sections with information; refreshes the header; backs up the previous
   version; and runs the checks (no SSNs, every standard section present once, correct order, relative links,
   documents not mentioned).

## Where Summaries.md lives

- Default: `sorter/stage/Summaries.md` (the inbox folder the classification skill starts from). The documents
  themselves are read from `sorter/sorted/` (where that skill files them), from anything still in
  `sorter/stage/`, and from `sorter/<category>/` folders the web app's "place" action may have created.
- If the user points to another folder: `<folder>/Summaries.md`, documents read from that folder (and from its
  `../sorted` sibling when the folder is an inbox). `--summaries PATH` overrides the file location.
- Work files: `<sorted>/.tax-sorter/summaries/` (`facts.json`, `facts.md`, `backups/`). `Summaries.md` is never
  inventoried, sorted or counted by the classification skill.

## Sections

Standard sections, in the order a new file gets them (titles are exact; `summaries.py` also recognises common
aliases such as "Rentals" or "Health Insurance"):

```
Things that need answering   (first, and only while something is still open)
Filing Information                    Work Income / Businesses         Rental Property
Investments                           Retirement & Social Security     Healthcare
Education                             Dependents & Childcare           Primary Residence
Other Income                          Estimated Tax Payments & Withholding
Misc Deductions                       Misc Credits                     Prior-Year Return & Carryovers
Open Items & Missing Documents        (last among the sections that have information)
```

Rules:

- **Deductions live in the section they belong to.** Rental expenses go under Rental Property, business expenses
  under Work Income / Businesses, medical expenses and premiums under Healthcare, student loan interest under
  Education, mortgage interest and property tax for the home under Primary Residence. Deductions tied to no
  section (donations, vehicle registration, state tax paid with last year's return…) go to **Misc Deductions**.
- **Credits follow the same rule.** Education credits under Education, childcare under Dependents & Childcare,
  home energy under Primary Residence, the saver's credit under Retirement, foreign tax credit under Investments.
  Credits tied to no section (clean vehicle, adoption, elderly/disabled…) go to **Misc Credits**.
- **Add sections when the documents call for one** (for example `Farm`, `Foreign Income`, `Sale of Home`,
  `Trust / Estate`). Keep the `## Title` style; `finalize` keeps custom sections and orders them with the others.
- **Not enough information goes at the top.** `finalize` builds **Things that need answering** as the first
  section whenever a `[NEEDED: …]`, `[VERIFY]`, `[TODO]`, `[TBD]` or `[CONFIRM]` is still in the summary. Each
  question has a blank `Answer:` line. Once nothing is open, that section says `N/A` and drops below the others.
- **Sections that do not apply stay in the file with `N/A` underneath** and are listed after every section that
  has information. `finalize` enforces the order; do not delete an N/A section.
- The full mapping of document types to sections, what each section needs, and the layout for each are in
  [reference/sections.md](reference/sections.md).

## Workflow

```
- [ ] 1 Resolve the folder (default sorter/stage) and the tax year; run gather_facts.py and read facts.md
- [ ] 2 Read the documents you will quote: page images for every NEEDS VISION item, the page image or text for
        every OCR amount, and the text file for any figure you are not sure about
- [ ] 3 summaries.py scaffold (creates Summaries.md or adds missing sections); read Summaries.md if it existed
- [ ] 4 On a rerun, read Things that need answering first (answers typed there, or new documents the user copied in)
- [ ] 5 Write or refresh each section that has documents; keep every sentence the user wrote
- [ ] 6 summaries.py finalize; it places typed answers and rebuilds the questions at the top
- [ ] 7 Report: where the file is, which sections have information, which are N/A, and what is still at the top
```

**Step 1.**

```bash
python3 "$SKILL_DIR/scripts/gather_facts.py" [FOLDER] [--tax-year 2025]
```

`facts.md` is organised by section. Each document line has a ready-made markdown link (relative to the
Summaries.md folder), the type, payer, date, how it was read (`text`, `ocr`, `sheet`, `NEEDS VISION`), and the
amounts found with their labels. Amounts are candidates read by label patterns, not verified figures. If the
labels line says "none" and there are rentals or businesses, run the classification skill's `classify.py` with
`--property` / `--business` first so the documents group by property or business.

**Step 2. Read before you quote.** For every document marked `NEEDS VISION`, open its page images with the Read
tool and take the figures from the image. For every amount marked `_(OCR — verify)_`, open the page image and
confirm the digits before using them; if you cannot, write the number followed by `[VERIFY]`. For a figure that
matters and that the patterns did not find (a 1099-B total, box 12 codes on a W-2, the months on a 1095-A), read
the cached text (`<work>/text/<hash>.txt`) or the page image. Never quote a number you have not seen.

**Step 3.**

```bash
python3 "$SKILL_DIR/scripts/summaries.py" scaffold [FOLDER] [--tax-year 2025]
```

**Step 4. A rerun starts at the top.** If `Summaries.md` already exists, read **Things that need answering**
before writing anything else.

- Answers typed under `Answer:` are applied by `finalize` into the section that asked. Do not retype them yourself
  and do not delete the user's wording.
- An answer that says the fact is in a document ("copied in the water bill", "it's in the new files") is not a
  figure. Treat it as a pointer: run `gather_facts.py` again, and if the new files are still in the inbox, run the
  `tax-document-classification` skill on them first. Then read the new or not-yet-mentioned documents in
  `facts.md` and write what they show into the section, which removes the question.
- The same applies when the user says it in chat rather than in the file. New documents copied into the folder
  are the other way a question gets answered.
- On a first run there is nothing to read yet. Write each section with `[NEEDED: what you need]` where only the
  taxpayer knows the fact. Do not stop to ask in chat; the top section asks them, and they answer by running the
  skill again.

**Step 5. Write the sections.** Edit `Summaries.md` directly (one section at a time). The model to follow is
[reference/example.md](reference/example.md); the per-section layout is in
[reference/sections.md](reference/sections.md). Writing rules:

- **Voice:** first person, the taxpayer speaking to their tax professional ("I own…", "My rental…",
  "Please also review…"). Plain sentences; no advice, no conclusions about what is deductible.
- **Numbers in bold**, with a label, and the **math shown** for anything allocated or summed:
  `**$1,988.34 × 0.667 = $1,325.56**`, `**$64.10 + $61.85 = $125.95**`. Give totals for the tax year and say how
  many documents they come from ("3 of the 12 monthly bills are on file").
- **Link every document you use**, with the link from facts.md, and keep any links the user already had (Google
  Drive, etc.). A document that is in the sorted folders but mentioned nowhere shows up as a warning in step 6.
- **Dates:** the tax year for annual forms, the statement or service date for bills, "July 2019" style in prose.
- **Placeholders:** `[NEEDED: …]` for facts only the taxpayer knows, `[VERIFY]` after a figure read by OCR that
  you could not confirm. Nothing else is invented: no estimated amounts, no assumed percentages, no guessed
  filing status.
- **Privacy:** never write an SSN, ITIN, EIN, account number, routing number, policy number, VIN or IP PIN. Refer
  to the document that has it ("the provider's tax ID is on the statement"). `finalize` fails on an SSN.
- **Updating an existing file:** keep every sentence, bullet and link the user wrote. Add new documents, refresh
  totals that changed, and replace an `N/A` only when there is now information. If a number the user wrote
  changes, change it and tell the user in your report (the previous version is in `backups/`); do not add change
  notes inside the summary.
- **Things that need answering:** do not hand-write this section. `finalize` rebuilds it from the placeholders
  left in the other sections and puts it first. Leave the `Answer:` lines for the user.
- **Open Items & Missing Documents:** missing months, documents the tax pro usually needs, and files parked in
  `_Needs Human Review`. The questions themselves are at the top, not here.

**Step 6.**

```bash
python3 "$SKILL_DIR/scripts/summaries.py" finalize [FOLDER]
python3 "$SKILL_DIR/scripts/summaries.py" status [FOLDER]     # sections, placeholders, documents not mentioned
```

`finalize` prints how many typed answers it placed, then `Checks passed.` or `CHECK FAILED` (an SSN, a missing or
duplicated standard section, a section with information below an N/A section, no title) and warnings (documents
not mentioned, questions still open, absolute paths, EIN-looking numbers). A question left open is expected: it
is listed at the top for the next run. A document that is not mentioned is not; mention it, or say in Open Items
why it is not summarised, and run `finalize` again.

**Step 7.** Report to the user: the path of `Summaries.md`, the sections with information and what each
contains in one line, the N/A sections, the open items and the questions they still need to answer, and any
figure you changed in text they had written.

## Report

```
Summaries.md written: sorter/stage/Summaries.md (tax year 2025, 20 documents, backup of the previous version kept)
Sections with information: Filing Information · Work Income / Businesses (W-2 Acme $52,300; Nursing 1099:
  1099-NEC $18,450, 46.8 business miles) · Rental Property (Property 200: property tax $2,145.60, insurance
  $1,240.00, water 3 bills $189.15, electricity 2 bills $378.49 [VERIFY], 2024 depreciation schedule linked) ·
  Investments (interest $500.43) · Healthcare (1095-A, Jan–Mar) · Misc Deductions (Red Cross $500) ·
  Prior-Year Return (2024 AGI $61,000) · Open Items
N/A: Retirement & Social Security, Education, Dependents & Childcare, Primary Residence, Other Income,
  Estimated Tax Payments & Withholding, Misc Credits
Still to answer, at the top of Summaries.md: filing status; monthly rent and rental unit address; the other 9
  water bills; coverage for April–December; whether estimated payments were made. Write the answers under those
  questions, or copy in the documents, and run tax-document-summaries again.
Changed in text you had written: none.
```

## Additional resources

- [reference/sections.md](reference/sections.md): every section, the documents that feed it, what the tax
  professional needs from it, the layout to use, and the deductions/credits placement table.
- [reference/example.md](reference/example.md): the model section (Rental Property) to imitate, and shorter
  examples for wages, investments and healthcare.
