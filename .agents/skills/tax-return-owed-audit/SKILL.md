---
name: tax-return-owed-audit
description: Use when a federal or state tax return is in sorter/stage, or the user asks how much they owe, whether a balance due is correct, "I have my return - audit owed", a client copy, Form 1040 amount you owe, Form 540 balance due, or an audit of the preparer's figure against the other documents in the folder. Also use when the user asks what portion of the federal tax comes from rental income (writes Owe Audit Breakdown - Rent.md).
---

# Tax return owed audit

The user-facing name is **I have my return - audit owed**.

A return in the folder states a balance. This skill says what the federal return says is owed, what the state return says is owed, and whether the other documents support those figures. Write `Owed Audit.md` in the folder that holds the source documents.

Federal and state stay separate. Do not add them into one amount.

When the return has rental property income, also write `Owe Audit Breakdown - Rent.md` in the same folder: how many dollars of the federal tax come from the rent (step 7).

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
- [ ] 7 If there is rental income, write or update Owe Audit Breakdown - Rent.md
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

`Owed Audit.md`, `Owe Audit Breakdown - Rent.md`, and any `balance check.md` are reports. The classification and summaries skills do not sort or count them, the Document Sorter does not list them, and Ask AI to reorganize leaves them in place.

**Step 7. Rental breakdown.** Look for rental property income: Schedule E Part I rents (line 3) on the return, a 1099-MISC with rents in box 1, a 1099-K for a rental platform, a lease, or a rent ledger in the folder. If there is none, skip this step and do not write the file. If there is, answer this question, exactly as the user asks it:

> Reading for the year's taxes... what portion of the federal taxes is from me receiving rental income? Give in total amount rather than a percentage.

Method:

1. Take the Schedule E net rental income or loss that flows to Schedule 1 (rents minus expenses and depreciation, after any passive-loss limit). Quote the rents and the expenses as the return shows them.
2. Recompute the federal return twice with the same filing status, dependents, and standard or itemized deduction: once as filed, once with that Schedule E net amount removed. Use the return's own figures for everything else.
3. In the version without rent, recompute everything that depends on income: adjusted gross income, the qualified business income deduction (Form 8995, both the rental's own QBI if the return claims it and the 20%-of-taxable-income limit), taxable income, income tax through the brackets for that year, any credit that phases with income (premium tax credit on Form 8962, earned income credit, child tax credit), and the estimated-tax penalty (Form 2210), whose safe harbor is measured against the prior year's tax.
4. Self-employment tax does not come from rent. Schedule E income is not on Schedule SE, so that row is the same in both columns. Say so.
5. The rental's share is the difference, row by row. Lead with the **total dollar amount** from rental, then that amount as a share of the amount owed, of total tax, and of income tax.
6. Explain the effective rate in one short paragraph (bracket, QBI absorbing part of the income) and say why the credit and the penalty did or did not move.
7. If a rent ledger, lease, or 1099 in the folder disagrees with the return's rents, add one sentence: the ledger figure, the return figure, and about how much the rental tax would change.

Same rules as `Owed Audit.md`: quote only figures seen on the forms or the source documents, cite the document (for example the preparer's client copy and its date), keep federal and state separate (this report is federal; mention the state only in a separate sentence if asked), and never write an SSN, ITIN, EIN, account number, routing number, policy number, or IP PIN. The file name is exactly `Owe Audit Breakdown - Rent.md`, written in the same folder as `Owed Audit.md`. If it is already there, update the figures and keep sentences the user wrote.

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

## Rental breakdown report

This is an **example**, from one return. Every figure, name, and date in it is a placeholder: replace each one with the figures read from this folder's return and documents. Never copy these numbers.

```markdown
About $610, which is 15% of the $4,181 the 2025 federal return says you owe. The rest of the bill is almost all self-employment tax on the 1099 work, which rent does not create.

That is from the Fast Tax client copy dated October 13, 2026. Rental is Schedule E net profit of $7,625 (rents $12,480 minus expenses $4,855). That is about 26% of AGI, but it is a much smaller slice of the tax.

| Piece | With rental (the return) | If there were no rental | From rental |
| --- | ---: | ---: | ---: |
| AGI | $29,375 | $21,750 | $7,625 |
| Income tax | $1,093 | $483 | $610 |
| Self-employment tax | $3,307 | $3,307 | $0 |
| Total tax | $4,400 | $3,790 | $610 |
| Net premium tax credit | −$330 | −$330 | $0 |
| Estimated-tax penalty | $111 | $111 | $0 |
| Amount owed IRS | $4,181 | $3,571 | $610 |

So of federal tax:

- ~15% of the $4,181 you owe comes from the rental
- ~14% of the $4,400 total tax
- ~56% of the $1,093 income tax
- None of the $3,307 self-employment tax — that 15.3% is only on the Schedule C profit of $23,402 (nursing + programming)

Why the rental is taxed at about 8%, not 10% or 15.3%: you are still in the 10% bracket (taxable income $10,900). The QBI deduction also absorbs 20% of the extra income, so $6,100 of the $7,625 is taxed at 10% → $610.

The premium tax credit stays $330 either way. At this income the credit is already capped at the LA Care premium, so dropping the rental does not increase it. The $111 penalty also stays, because it is still measured against last year's tax of $2,405.

If the rent ledger of $12,900 were used instead of the return's $12,480, rental tax would be about $30 higher, still around 15% of the federal bill.
```

Keep the order: the dollar answer first, then where the figures came from, the table, the shares, why the rate is what it is, what did not move, and the ledger sentence only when a ledger disagrees. Drop a table row that is zero in both columns on this return (for example no premium tax credit), and add a row for any other piece that moves (earned income credit, child tax credit).

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
| Give the rental share only as a percentage | Lead with the dollar amount from rental, then the percentages |
| Charge self-employment tax to the rent | Schedule E rent is not on Schedule SE; that row is the same with and without rent |
| Subtract the rent at the top bracket rate | Recompute both versions through QBI, the brackets, Form 8962, and Form 2210 |
| Copy the example's figures | Every number comes from this folder's return and documents |
