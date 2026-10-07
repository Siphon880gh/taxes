# Model sections

While something is still unknown, this section is the first one in the file. The user answers under `Answer:`
and runs the skill again, or copies in the document that has the answer and says so.

```markdown
## Things that need answering

There is not enough information yet to finish this summary. Write the answer under each question, then run the tax-document-summaries skill again. If the answer is in a document instead, copy that document into the folder and say so when you run the skill again.

### Rental Property

**Monthly rent:** [NEEDED: monthly rent]

Answer: $1,040 a month, all twelve months of 2025

### Filing Information

**Filing status:** [NEEDED: filing status]

Answer:
```

`finalize` turns the first of those into **$1,040 a month, all twelve months of 2025** inside Rental Property and
leaves the filing-status question at the top. A blank `Answer:` stays a question. "Copied in the December rent
statement" stays a question too, until the new document has been read.

The next example is the model for every section with figures: the taxpayer speaking to the tax professional in the first
person, every figure in bold with a label, the allocation math written out, each expense category under its own
heading, and a link to the document behind each number. Imitate its tone and density; do not add advice or
conclusions.

## The model (Rental Property)

```markdown
## Rental Property
Below is the information for my rental property for the 2025 tax year.

### Property and Rental Information

**Property owner:** Me  
**Property address:** 2021 Eastlake Ave, Los Angeles, CA 90031  
**Rental unit:** 2021 1/2 Eastlake Ave, Los Angeles, CA 90031

They are on the same lot/land.

I own the property at 2021 Eastlake Ave and collect the rent from the tenants at 2021 1/2 Eastlake Ave. The property is paid off, so there is **no mortgage or mortgage interest**.

The same tenants have rented the unit since **July 2019**.

### 2025 Rental Income

The rent is currently **$1,040 per month**.

My parents originally rented the unit to friends at a very low rental rate, and the rent has remained low.

- Monthly rent: **$1,040**
- 2025 annual rent collected: **$12,480**

### Rental Depreciation

Please also review the rental depreciation for 2025.

The 2024 depreciation schedule is available here:

[2024 Depreciation Schedule](https://drive.google.com/drive/u/0/folders/1nqxinI4Pq0t065BcdWIsNZ84ipRwqOHO)

The 2024 schedule shows:

- Rental/business use: **27%**
- Recovery period: **27.5 years**
- Method: **Straight-line depreciation**
- Convention: **Mid-month**
- Prior depreciation: **$11,250**
- 2024 depreciation: **$237**

For the 2025 depreciation, I believe we have the information for calculating depreciable basis, land allocation, 27% rental-use allocation, and prior depreciation.

---

### 2025 Rental Expenses

#### SCEP/RSO Fees

We pay LA County for the right to rent the property.

- Amount paid in 2025: **$77.50**

#### Repairs for the Tenant/Rental Portion

- Total repairs: **$1,998**
- Receipts: [https://drive.google.com/file/d/1AKPQCdyiD5eSquJ0v3E49MiDvGZx1eOV/view?usp=sharing](https://drive.google.com/file/d/1AKPQCdyiD5eSquJ0v3E49MiDvGZx1eOV/view?usp=sharing)

#### Water Paid for the Tenant/Rental Portion

The water bill covers both the tenants and the personal-use portion of the property.

- Tenants: **4 people**
- Personal-use portion: **2 people**
- Total occupants: **6 people**
- Total 2025 water bills paid: **$1,988.34**
- Rental allocation based on occupants: **4/6 (66.67%)**
- Rental share of water expense: **$1,325.56**
- Calculation: **$1,988.34 × 0.667 = $1,325.56**
- Receipts: [https://drive.google.com/file/d/1phY6_GNrM7Q96tnURCwErpD4-5r1TrcN/view?usp=sharing](https://drive.google.com/file/d/1phY6_GNrM7Q96tnURCwErpD4-5r1TrcN/view?usp=sharing)

#### Property Tax Paid for the Tenant/Rental Portion

The property tax bill for 2021 Eastlake Ave also covers the rental unit at 2021 1/2 Eastlake Ave.

- Total 2025 property tax paid: **$2,140.70**
- Rental portion based on square footage: **27%**
- Rental share: **$2,140.70 × 27% = $577.99**

Calculations of the square-footage allocation/map (bottom-right corner for the math worked out — i.e. Tenant Property's Area to Property):

[https://docs.google.com/document/d/1DvXzv6MxmQwpLGiydkB8977MdB-YnixKQ2V-MQrI0rc/edit?tab=t.0](https://docs.google.com/document/d/1DvXzv6MxmQwpLGiydkB8977MdB-YnixKQ2V-MQrI0rc/edit?tab=t.0)

Property-tax receipt:

[https://drive.google.com/file/d/1kJUNS0fu6SsJPW_bx0yVdi-DHvWGWY27/view?usp=sharing](https://drive.google.com/file/d/1kJUNS0fu6SsJPW_bx0yVdi-DHvWGWY27/view?usp=sharing)

#### Property Insurance

- Total property insurance paid: **$2,365**
- Tenant/rental property portion: **27%**
- Rental share: **$638.55**

Bill:

[https://drive.google.com/file/d/1BxmyLQkyXcfOGwowLKNWN-58mDLoBB31/view?usp=drivesdk](https://drive.google.com/file/d/1BxmyLQkyXcfOGwowLKNWN-58mDLoBB31/view?usp=drivesdk)

Receipt:

[https://drive.google.com/file/d/1QXGtrQxOEwV76xujPoGlVm7PIHr6mlfA/view?usp=drivesdk](https://drive.google.com/file/d/1QXGtrQxOEwV76xujPoGlVm7PIHr6mlfA/view?usp=drivesdk)
```

What makes it work:

- The first line says what the section is and for which tax year.
- Facts only the taxpayer knows (who owns it, tenants since July 2019, 4 of 6 occupants, 27% by square footage)
  are stated plainly. When you do not have them, write `[NEEDED: …]` instead of guessing.
- Every expense category has its own `####` heading with the total, the allocation basis, the computed rental
  share with the formula, and the receipt link.
- Links point to the actual documents. With sorted local files, use the relative links from `facts.md`:
  `[Property Tax Bill - Property 200 - 2025-11-15](../sorted/Income%20-%20Rental/Property%20Tax%20Bill%20-%20Property%20200%20-%202025-11-15%20%28statement.pdf%29.pdf)`.

## Shorter examples

```markdown
## Work Income / Businesses

### W-2 Wages

- **Employer:** Acme Corporation
- Box 1 wages: **$52,300.00**
- Box 2 federal income tax withheld: **$6,100.00**
- Box 17 Louisiana income tax withheld: **$1,980.00**
- Box 12 codes: **D $3,000.00** (401(k)), **DD $7,800.00**
- Form: [W-2 - Acme Corporation - 2025](../sorted/Income%20-%20Wages/W-2%20-%20Acme%20Corporation%20-%202025%20%28a3f9c2d1e5b7a9c0d1e2f3a4b5c6d7e8.pdf%29.pdf)

### Self-Employment: Nursing 1099

I work shifts as a contract nurse; sole proprietorship, cash basis, started **March 2023**. All income came on
one 1099-NEC; I received no other payments for this work.

- 1099-NEC, Client Consulting LLC, box 1: **$18,450.00** — [1099-NEC - Client Consulting LLC - 2025](../sorted/Income%20-%20Self-employment/1099-NEC%20-%20Client%20Consulting%20LLC%20-%202025%20%28scan0001.pdf%29.pdf)
- Business miles to client sites: **46.8 miles** (log complete) — [Mileage Log - Nursing 1099 - 2025](../sorted/Income%20-%20Self-employment/Mileage%20Log%20-%20Nursing%201099%20-%202025%20%28Book1.xlsx%29.xlsx)
- Other expenses: **none** [NEEDED: licenses, scrubs, phone share, if any]
- Home office: **none**
- Estimated tax payments for this income: see Estimated Tax Payments & Withholding.
```

```markdown
## Investments

### Interest (1099-INT)

- JPMorgan Chase Bank, box 1: **$412.33** — [1099-INT - JPMorgan Chase Bank - 2025](../sorted/Income%20-%20Investments/1099-INT%20-%20JPMorgan%20Chase%20Bank%20-%202025%20%28Chase%201099-INT%202025.pdf%29.pdf)
- Ally Bank, box 1: **$88.10** — [1099-INT - Ally Bank - 2025](../sorted/Income%20-%20Investments/1099-INT%20-%20Ally%20Bank%20-%202025%20%28w2.pdf%29.pdf)
- Total interest: **$412.33 + $88.10 = $500.43**

No dividends, sales, or digital-asset transactions this year.
```

```markdown
## Healthcare

### Marketplace Coverage (Form 1095-A)

I had a Louisiana marketplace plan for **January–March 2025** and employer coverage from April (see the 1095-C).
Form 8962 is needed to reconcile the advance credit.

- Column A, enrollment premiums (annual total): **$1,236.00**
- Column B, SLCSP premium (annual total): **$1,365.00**
- Column C, advance payment of the premium tax credit (annual total): **$900.00**
- Household size on the application: **1**
- Form: [1095-A - Marketplace LA - 2025](../sorted/Regulations%20-%20Health%20Insurance/1095-A%20-%20Marketplace%20LA%20-%202025%20%28f1095a.pdf%29.pdf)
```

```markdown
## Open Items & Missing Documents

- Water bills for Property 200: only March, May and July 2025 are on file; the other months are needed for the
  annual total.
- The two electricity amounts come from phone photos read by OCR; please check them against the photos.
- `_Needs Human Review` holds two files I could not identify (PXL_20260115_093011.jpg, mystery.pdf).
- No estimated-tax confirmations were found although there is 1099-NEC income.
```

A section with nothing to report stays as:

```markdown
## Education

N/A
```
