# Filename convention

```
{Document type} - {Entity} - {YYYY[-MM[-DD]]}[ - CORRECTED] ({original filename}).ext
```

| Segment | Content | Examples |
|---|---|---|
| Document type | The `doc_type` label (see taxonomy.md). Form numbers stay as printed: `W-2`, `1099-NEC`, `1098 Mortgage Interest`, `Schedule K-1 (1065)`. | `Electric Bill`, `W-2`, `Donation Receipt` |
| Entity | Who or what the document is about: payer / employer / lender for information returns; the **property or business label** for bills, receipts and invoices tied to a rental or a business; the vendor or institution otherwise; the person's name for identity documents. Omitted when unknown. | `Acme Corporation`, `Property 200`, `Red Cross`, `Chase`, `Jane Doe` |
| When | Tax year for annual forms (`2025`); full date for dated documents (`2026-07-01`); month for monthly statements when no day is printed (`2025-12`); omitted for undated identity documents. | `2025`, `2026-07-01`, `2025-12` |
| Suffix | `CORRECTED` or `AMENDED` when the form says so (the boilerplate "CORRECTED (if checked)" on every 1099 does not count). | ` - CORRECTED` |
| Original filename | The file's name before sorting, in parentheses, extension included. Always present on a renamed file, so a search for the old name (`IMG_2048`, `scan0001`) still finds it and a rename never loses information. | `(IMG_2048.jpg)`, `(document (3).docx)` |

Segments are joined with ` - ` (space, hyphen, space); the original filename follows after one space. The
extension is kept but lower-cased.

## Examples

| Before | After | Why |
|---|---|---|
| `a3f9c2d1e5b7a9c0d1e2f3a4b5c6d7e8.pdf` | `Income - Wages/W-2 - Acme Corporation - 2025 (a3f9c2d1e5b7a9c0d1e2f3a4b5c6d7e8.pdf).pdf` | hashed name; employer from the "Employer's name" block, year from the form |
| `scan0001.pdf` (image-only PDF) | `Income - Self-employment/1099-NEC - Client Consulting LLC - 2025 (scan0001.pdf).pdf` | OCR; payer block |
| `IMG_2048.jpg` (rotated photo) | `Income - Rental/Electric Bill - Property 200 - 2026-07-01 (IMG_2048.jpg).jpg` | `kWh`, service address matched property label, "Statement date: Jul 1, 2026" |
| `ElectricBill_Property200_Aug2026.pdf` (little text) | `Income - Rental/Electric Bill - Property 200 - 2026-08-01 (ElectricBill_Property200_Aug2026.pdf).pdf` | filename words scored as evidence; the agent confirmed the page image |
| `Rental Income Statement Dec 2025.pdf` (unreadable scan) | `Income - Rental/Rental Income Statement - Property 200 - 2025-12 (Rental Income Statement Dec 2025.pdf).pdf` | type and month from the filename, property from the agent's reading of the image |
| `document (3).docx` | `Deductions/Donation Receipt - Red Cross - 2025-12-15 (document (3).docx).docx` | 501(c)(3) and "no goods or services" language; letterhead |
| `download.pdf` | `_Last year's return/Form 1040 Return - 2024 (download.pdf).pdf` | "U.S. Individual Income Tax Return 2024", year before target 2025 |
| `from phone/statement.pdf` | `Income - Rental/Property Tax Bill - Property 200 - 2025-11-15 (statement.pdf).pdf` | parcel number + assessed value; address matched label |
| `Chase 1099-INT 2025.pdf` | `Income - Investments/1099-INT - JPMorgan Chase Bank - 2025 (Chase 1099-INT 2025.pdf).pdf` | descriptive name renamed to the convention too; original kept |
| `w2.pdf` (actually a 1099-INT) | `Income - Investments/1099-INT - Ally Bank - 2025 (w2.pdf).pdf` | content wins over the filename; the plan notes the disagreement |
| `f1095a.pdf` | `Regulations - Health Insurance/1095-A - Marketplace LA - 2025 (f1095a.pdf).pdf` | marketplace identifier |
| `Book1.xlsx` | `Income - Self-employment/Mileage Log - Nursing 1099 - 2025 (Book1.xlsx).xlsx` | business label matched |
| `scan0001 copy.pdf` | `zz_Duplicates/scan0001 copy.pdf` | identical bytes to `scan0001.pdf`; name kept |
| `IMG_2051.heic` (blurry photo) | `_Needs Human Review/IMG_2051.heic` | nothing could be read; original name kept so the person reviewing it can find it |

## Which files get renamed

Every file that was classified is renamed, so a folder can be read at a glance. The original filename is
kept in parentheses, so renaming a descriptive name costs nothing. Exceptions:

| Case | Renamed? |
|---|---|
| Type `Unknown` (parked in `_Needs Human Review`) | no, original name kept |
| Duplicates (`zz_Duplicates`) | no, original name kept |
| Already in the convention, e.g. `W-2 - Acme - 2025 (scan.pdf).pdf` from an earlier run | no; and if it is ever renamed again, the name inside the parentheses is reused rather than nested |
| `classify.py --keep-descriptive` | only `generic` and `hashed` names are renamed (see below) |

`inventory.py` still grades every filename stem, because the grade decides how much the filename is trusted
and what `--keep-descriptive` renames:

| Grade | Rule | Examples |
|---|---|---|
| `hashed` | 16+ hex characters, a UUID, or 16+ characters with 3+ digits and no 4-letter word | `a3f9c2d1e5b7a9c0.pdf`, `3fa85f64-5717-4562-b3fc-2c963f66afa6.pdf`, `IMG_20250115_123456.jpg` |
| `generic` | fewer than two informative tokens after dropping camera/scanner/app words (`scan`, `img`, `image`, `photo`, `document`, `doc`, `file`, `download`, `untitled`, `copy`, `final`, `screenshot`, `adobe`, `camscanner`, `whatsapp`, `pxl`, `dsc`, `statement`, `receipt`, `invoice`, `form`, `tax` …), digits and dates. A form id (`W-2`, `1099-NEC`), a year or a date counts as one informative token. | `scan0001.pdf`, `IMG_2048.jpg`, `document (3).docx`, `download.pdf`, `Statement.pdf`, `w2.pdf`, `1099-NEC.pdf` |
| `descriptive` | two or more informative tokens | `Chase 1099-INT 2025.pdf`, `Home Depot receipt.jpg`, `Rental Income Statement Dec 2025.pdf` |
| `convention` | already `X - Y - YYYY[-MM[-DD]]` or `X - Y (original.ext)` | `Electric Bill - Property 200 - 2026-07-01 (IMG_2048.jpg).pdf` |

## The filename as evidence

`classify.py` turns the filename into words (`RentalIncome_Dec2025-Property200.pdf` -> `Rental Income Dec 2025
Property 200`) and scores them with the same rules as the content, scaled so that a precise filename counts like
one strong content cue but never like a read document. Form ids in the name (`w2`, `1099nec`) add a little on
their own. Words left over after removing the document type, form ids, dates and filler become the entity when
the content offers none (`Chase 1099-INT 2025.pdf` -> `Chase`); a month and year in the name become the date
when the content has none (`Dec 2025` -> `2025-12`); property and business keywords in the name count for the
label match. When readable content and the filename disagree, the content wins and the plan notes
`filename suggests W-2; content reads as 1099-INT (content wins)`.

## Sanitising

- Characters `\ / : * ? " < > |` and control characters become `-`; runs of whitespace collapse to one space;
  leading/trailing spaces and dots are trimmed.
- Entities are tidied: ALL-CAPS names become Title Case (`ACME CORPORATION` -> `Acme Corporation`) while keeping
  `LLC`, `Inc`, `Corp`, `HOA`, `IRS`, `PG&E`, `AT&T`, `JPMorgan` and similar; trailing street addresses,
  `, N.A.` and `ATTN:`/`c/o` fragments are cut.
- Length: a name is kept under 180 characters. When it must be shortened, the original filename is trimmed first
  to 60 characters with a middle ellipsis (`Scan from Canon imageRUNNER…long name indeed.pdf`, still searchable by
  its start and end), then the entity (never the type, date or suffix), then the original again.
- Collisions: if the destination name exists with different content, ` (2)`, ` (3)`… is appended. If it exists
  with identical content the new file is a duplicate and goes to `zz_Duplicates`.

## Dates

`classify.py` prefers a labelled date (`Statement date`, `Bill date`, `Invoice date`, `Date of service`,
`Payment date`, `Closing date`, `Received`…), then the first date in the text, then a month-year
(`December 2025` -> `2025-12`), then a date or month-year in the original filename. For annual forms the tax
year comes from "for calendar year 20XX", "Tax Year 20XX", the year printed beside the form number, or the only
year in the text. When several differ, trust the printed form year over statement or mailing dates.

## SORTED.md

`apply_plan.py` writes `SORTED.md` at the output root after every run (and after every `--undo`), regenerated
from `<out>/.tax-sorter/manifest.jsonl`:

- the **file count check** of the last run: inbox and sorted counts before and after, the total, and the
  `PASS` / `CHECK FAILED` line (total unchanged, every moved file re-hashed at its destination);
- the **file map**, one line per file, grouped by destination folder, in the form
  `original name → new location`, e.g.
  `IMG_2048.jpg → Income - Rental/Electric Bill - Property 200 - 2026-07-01 (IMG_2048.jpg).jpg`;
  files parked in `_Needs Human Review` and duplicates are listed with the reason; a file that moves on in a
  later run (parked, then sorted after the user answered) is shown once, from its first name to its final place;
- a **table of all runs** with their counts and check results.

`SORTED.md` itself is never inventoried or moved.
