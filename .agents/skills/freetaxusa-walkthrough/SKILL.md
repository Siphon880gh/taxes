---
name: freetaxusa-walkthrough
description: Use when the user wants to fill a FreeTaxUSA return from sorted tax documents, asks for the FreeTaxUSA walkthrough, or is on a FreeTaxUSA screen and needs the next number from a file in this repo.
---

# FreeTaxUSA walkthrough

The user types. You read the FreeTaxUSA screen in a browser tab inside Cursor and say what to enter next. Every number names the file it came from.

Open https://www.freetaxusa.com in the Cursor IDE browser. Do not use an external browser. Snapshot the page before each instruction.

## When this is the wrong skill

- Files still need sorting or renaming: `tax-document-classification`.
- `Summaries.md` does not exist yet and the user wants the preparer summary: `tax-document-summaries`.
- A finished return PDF is being checked for the balance due: `tax-return-owed-audit`.
- The chart in this app is a cross-check of forms already prepared. It is not this data-entry guide.

## Before the browser

Default folder is `sorter/stage/`, with sorted files in `sorter/sorted/` or in category folders the app created. If the inbox still holds unsorted files and there is no sorted tree, stop and name `tax-document-classification`.

Read `Summaries.md` (default `sorter/stage/Summaries.md`). If it is missing, stop and name `tax-document-summaries`. Continue from the source files only when the user says to. Still cite those files.

The user signs in. Do not ask for a password, SSN, bank account, routing number, or IP PIN to be pasted into the chat. For those fields, name the file and the box label. The user reads the value from the file.

## One screen at a time

```
- [ ] Snapshot the current screen
- [ ] Match its heading and fields to Summaries.md, then to the source file
- [ ] Say what to do, the number, and the file
- [ ] Ask when it is done, or watch until the screen changes
```

**Say what to do.** One screen. Name the heading you see. If the screen has several fields, list them in the order they appear. For each amount: the number, the box or line on the source document, and the relative file path. Quote a figure only after you have seen it in `Summaries.md` or in the file. If neither has it, say it is missing. Do not guess a business-use percentage.

**Done.** Ask the user to say when that screen is done. If they ask you to watch, snapshot again. The step is done only when the heading or the set of fields has changed. If it has not changed, say it is the same screen and wait. Telling them what to type does not finish the step.

**Who clicks.** Leave Continue, typing, and every other control to the user. Operate the form only when they explicitly ask. Even then, do not file, e-file, submit, pay, or buy Deluxe, Pro Support, or Audit Defense.

## Where a topic usually sits

The live screen wins. Notes that disagree with it are stale: follow the screen and say so. When a screen is unfamiliar, read the matching note under `context/knowledge/__Learn by Leveling Up - Master Personal Tax Preparer/2. Learn by Leveling Up - FreeTaxUSA.com/` before you instruct.

The map, not a script:

- Income: W-2; each 1099-NEC as its own instance; Business Income (Schedule C), linking that 1099-NEC instead of typing the income again; other Schedule C income and expenses; Rental Income (Schedule E); interest and investments.
- Deductions/Credits: standard or itemized, marketplace health insurance, and only the categories the documents support.
- Misc: Identity Protection PIN and foreign income. The PIN can be created at the end of filing. A letter is not the only way.
- State, after Misc, when they are filing a state return.
- On a narrow window the Income and Deductions/Credits tabs move into the left menu.

Two quirks from those notes:

- Depreciation basis is the assessment on the date the property was first rented, not the original purchase assessment, unless the file says they are the same.
- An early balance of $0 is not the amount owed. Do not treat it as final.

## Stop

Stop on the screen that would file, pay, or sell an add-on. Say the return is ready for the checklist in this app, and for `tax-return-owed-audit` once a PDF of the return is in the folder. Unlock the browser.

## Common mistakes

| Mistake | What to do instead |
| --- | --- |
| Type the 1099-NEC income again on Schedule C | Link the 1099-NEC already entered |
| Invent a number the folder does not contain | Say the file is missing |
| Mark the step done after giving the instruction | Wait for the user, or for the screen to change |
| File or pay from the browser | Stop on that screen |
| Paste an SSN or password into the chat | Point at the file and the box label |
