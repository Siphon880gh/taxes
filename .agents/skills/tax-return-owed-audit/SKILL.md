---
name: tax-return-owed-audit
description: Use when a federal or state tax return is in sorter/stage, or the user asks how much they owe, whether a balance due is correct, "I have my return - audit owed", a client copy, Form 1040 amount you owe, Form 540 balance due, or an audit of the preparer's figure against the other documents in the folder.
---

# Tax return owed audit

The user-facing name is **I have my return - audit owed**.

A return in the folder states a balance. This skill says what the federal return says is owed, what the state return says is owed, and whether the other documents support those figures. Write `Owed Audit.md` in the folder that holds the source documents.

Federal and state stay separate. Do not add them into one amount.

## When this is the wrong skill

- Documents need sorting or renaming: `tax-document-classification`.
- The preparer needs `Summaries.md` and no return is being checked: `tax-document-summaries`.
- No federal and no state return is in the folder: say so. Do not build a balance from the source documents alone.

## Workflow

```
- [ ] 1 Find the federal return and the state return
- [ ] 2 Read the balance lines and the schedules that produce them
- [ ] 3 Recompute each return's own arithmetic
- [ ] 4 Compare every input that moves the balance to a source document
- [ ] 5 Recompute the balance for each disagreement the documents support
- [ ] 6 Write or update Owed Audit.md
```

**Step 1.** Default folder is `sorter/stage/`, including its subfolders. A return may instead be in `sorter/sorted/`. One PDF often contains both the federal return and the state return. A cover letter, a filing-instruction page, and a payment voucher can each state the balance; read the forms themselves.

**Step 2.** Read the pages. For a scanned page, open the page image. Quote a figure only after seeing it on the form or the source document.

Federal, from Form 1040 and the schedules it points to: total tax, withholding, estimates, refundable credits, amount you owe, estimated-tax penalty. Follow Schedule 1, Schedule 2, Schedule 3, Schedule C, Schedule E, Schedule SE, Form 8995, and Form 8962 when those lines are filled.

State: the resident return's taxable income, tax, payments, and balance due, plus its payment voucher (California Form 540 and Form 3582). Do not derive the state balance from the federal balance.

**Step 3.** Show the addition that produces the voucher. Income tax, self-employment tax, credits, and the estimated-tax penalty are separate rows. A penalty printed inside the amount you owe stays visible as its own row.

These are not this year's balance:

- Next year's estimated-tax vouchers (Form 1040-ES and the state equivalent).
- Failure-to-pay penalty and interest for paying after the original due date. An extension moves the filing date, not the payment date. If the copy is dated after that due date and the return shows no payment, say those amounts are not on the voucher. Look up the rate before naming a dollar figure for them.

**Step 4.** For each amount that changes the balance, find the source document in the folder: W-2, 1099, rent ledger, bill, 1095-A, prior-year return. A match is a match. A disagreement becomes a row in the changes table.

A bill for a home the person lives in is not a business expense because it was paid. If the person's own note says only part was for the work, or the folder has no business-use percentage, the return's balance holds only if that full bill is a business expense. Recompute with the expense removed, and at half. Do not invent a percentage.

An allocation the folder does state (a headcount, a percentage carried on the prior-year depreciation schedule, a paid installment) is used as stated. Say where the percentage came from.

**Step 5.** Recompute only the pieces that changed: self-employment tax, adjusted gross income, the qualified business income limit, income tax, and a credit that depends on income (premium tax credit). Show the new federal balance and, when the same income flows through, the direction of the state balance.

**Step 6.** The file name is exactly `Owed Audit.md`. Write it in the folder that holds the source documents for the return. When those documents are in a subfolder of `sorter/stage/`, the file belongs in that subfolder, not in `sorter/stage/` itself. If `Owed Audit.md` is already there, update the figures and keep sentences the user wrote. Relative links to the files used. Never write an SSN, ITIN, EIN, account number, routing number, policy number, or IP PIN.

`Owed Audit.md` and any `balance check.md` are reports. The classification skill does not sort them.

## Report

The answer is the first section. Bold the dollar amounts. The rest follows this shape:

```markdown
# {Year} balance check

## Answer

The federal return says pay **$X**. {The forms add up to that / they do not, and the forms themselves come to $Y.} {The source documents support it / they support it only if … / they put the balance higher or lower, and by about how much.}

The state return says pay **$Z**, separate from the federal amount. {Same kind of sentence.}

## How the federal return gets to $X

| Piece | Amount |
| --- | ---: |
| Income tax | $… |
| Self-employment tax | $… |
| Total tax | $… |
| Payments and refundable credits | −$… |
| Estimated-tax penalty | $… |
| Payment due | **$X** |

One short paragraph under the table showing the addition, including adjusted gross income, the standard or itemized deduction, and the qualified business income deduction when those produce taxable income.

## How the state return gets to $Z

| Piece | Amount |
| --- | ---: |
| Taxable income | $… |
| Tax | $… |
| Payments | −$… |
| Payment due | **$Z** |

## What the documents do to that number

| Change | Federal balance | State balance |
| --- | ---: | ---: |
| Return as prepared | $X | $Z |
| {one disagreement, stated as the document figure} | $… | $… |

## What already matches

- {Document}: **$…**. {The return line that uses it.}

## Not part of this year's balance

- Next year's estimated vouchers, with their amounts and dates.
- Late-payment penalty and interest, when the copy is after the original payment due date.

## Still open

- {Only a fact the documents do not settle, and which way it would move the balance.}
```

## Common mistakes

| Mistake | What to do instead |
| --- | --- |
| Treat the cover letter as the audit | Recompute from the forms, then compare the forms to the source documents |
| Call the voucher correct because its lines add up | That shows the return is internally consistent. The audit is whether the inputs match the other documents |
| Add federal and state | Two balances, two sentences in the answer |
| Fold next year's estimates into this year's balance | List them under "Not part of this year's balance" |
| Invent a business-use percentage | Report the return's figure, the figure with the expense removed, and the figure at half |
| Quote an unread OCR number | Open the page image first |
| Leave the report only in the chat | Write `Owed Audit.md` |
