# Filename convention

```
{Document type} - {Entity} - {YYYY[-MM[-DD]]}[ - CORRECTED].ext
```

| Segment | Content | Examples |
|---|---|---|
| Document type | The `doc_type` label (see taxonomy.md). Form numbers stay as printed: `W-2`, `1099-NEC`, `1098 Mortgage Interest`, `Schedule K-1 (1065)`. | `Electric Bill`, `W-2`, `Donation Receipt` |
| Entity | Who or what the document is about: payer / employer / lender for information returns; the **property or business label** for bills, receipts and invoices tied to a rental or a business; the vendor or institution otherwise; the person's name for identity documents. Omitted when unknown. | `Acme Corporation`, `Property 200`, `Red Cross`, `Chase`, `Jane Doe` |
| When | Tax year for annual forms (`2025`); full date for dated documents (`2026-07-01`); month for monthly statements when no day is printed (`2025-12`); omitted for undated identity documents. | `2025`, `2026-07-01`, `2025-12` |
| Suffix | `CORRECTED` or `AMENDED` when the form says so (the boilerplate "CORRECTED (if checked)" on every 1099 does not count). | ` - CORRECTED` |

Segments are joined with ` - ` (space, hyphen, space). The extension is kept but lower-cased.

## Examples

| Before | After | Why |
|---|---|---|
| `a3f9c2d1e5b7a9c0d1e2f3a4b5c6d7e8.pdf` | `Income - Wages/W-2 - Acme Corporation - 2025.pdf` | hashed name; employer from the "Employer's name" block, year from the form |
| `scan0001.pdf` (image-only PDF) | `Income - Self-employment/1099-NEC - Client Consulting LLC - 2025.pdf` | OCR; payer block |
| `IMG_2048.jpg` (rotated photo) | `Income - Rental/Electric Bill - Property 200 - 2026-07-01.jpg` | `kWh`, service address matched property label, "Statement date: Jul 1, 2026" |
| `document (3).docx` | `Deductions/Donation Receipt - Red Cross - 2025-12-15.docx` | 501(c)(3) and "no goods or services" language; letterhead |
| `download.pdf` | `_Last year's return/Form 1040 Return - 2024.pdf` | "U.S. Individual Income Tax Return 2024", year before target 2025 |
| `from phone/statement.pdf` | `Income - Rental/Property Tax Bill - Property 200 - 2025-11-15.pdf` | parcel number + assessed value; address matched label |
| `Chase 1099-INT 2025.pdf` | `Income - Investments/Chase 1099-INT 2025.pdf` | descriptive name kept, only moved |
| `f1095a.pdf` | `Regulations - Health Insurance/1095-A - Marketplace LA - 2025.pdf` | marketplace identifier |
| `Book1.xlsx` | `Income - Self-employment/Mileage Log - Nursing 1099 - 2025.xlsx` | business label matched |
| `scan0001 copy.pdf` | `zz_Duplicates/scan0001 copy.pdf` | identical bytes to `scan0001.pdf` |

## Which files get renamed

`inventory.py` grades every filename stem:

| Grade | Rule | Examples | Renamed? |
|---|---|---|---|
| `hashed` | 16+ hex characters, a UUID, or 16+ characters with 3+ digits and no 4-letter word | `a3f9c2d1e5b7a9c0.pdf`, `3fa85f64-5717-4562-b3fc-2c963f66afa6.pdf`, `IMG_20250115_123456.jpg` | yes |
| `generic` | fewer than two informative tokens after dropping camera/scanner/app words (`scan`, `img`, `image`, `photo`, `document`, `doc`, `file`, `download`, `untitled`, `copy`, `final`, `screenshot`, `adobe`, `camscanner`, `whatsapp`, `pxl`, `dsc`, `statement`, `receipt`, `invoice`, `form`, `tax` …), digits and dates. A form id (`W-2`, `1099-NEC`), a year or a date counts as one informative token. | `scan0001.pdf`, `IMG_2048.jpg`, `document (3).docx`, `download.pdf`, `Statement.pdf`, `w2.pdf`, `1099-NEC.pdf`, `2025-01-15.pdf` | yes |
| `descriptive` | two or more informative tokens | `Chase 1099-INT 2025.pdf`, `Home Depot receipt.jpg`, `Acme W-2 2025.pdf` | no (unless `--rename-all`) |
| `convention` | already `X - Y - YYYY[-MM[-DD]]` | `Electric Bill - Property 200 - 2026-07-01.pdf` | no |

Files whose type is `Unknown` keep their name even when generic.

## Sanitising

- Characters `\ / : * ? " < > |` and control characters become `-`; runs of whitespace collapse to one space;
  leading/trailing spaces and dots are trimmed; names longer than 140 characters are cut at a word boundary.
- Entities are tidied: ALL-CAPS names become Title Case (`ACME CORPORATION` -> `Acme Corporation`) while keeping
  `LLC`, `Inc`, `Corp`, `HOA`, `IRS`, `PG&E`, `AT&T` and similar acronyms; trailing street addresses and
  `ATTN:`/`c/o` fragments are cut.
- Collisions: if the destination name exists with different content, ` (2)`, ` (3)`… is appended. If it exists
  with identical content the new file is a duplicate and goes to `zz_Duplicates`.

## Dates

`classify.py` prefers a labelled date (`Statement date`, `Bill date`, `Invoice date`, `Date of service`,
`Payment date`, `Closing date`, `Received`…), then the first date in the text, then a month-year
(`December 2025` -> `2025-12`), then a date in the original filename. For annual forms the tax year comes from
"for calendar year 20XX", "Tax Year 20XX", the year printed beside the form number, or the only year in the text.
When several differ, trust the printed form year over statement or mailing dates.
