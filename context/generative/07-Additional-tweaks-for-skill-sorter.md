@tax-document-classification 

At this skill the default is sorter/stage/. If user prefers the default, make sure the folder exists at current working directory where skill was called. If doesn't exist, it'll create taht folder structure

---

Check the tax documentation classification skill. Does it note that rental income deductions goes under deductions folder?

---

Does it mention if a folder can't be classified that it goes under some folder about needing human intervention. We dont want simply reported back to user. Please do so but we also want it to be under a folder _Needs Human Review

---

Can we make sure if it needs vision, then AI will use vision to read it?! Only if it failed then it goes to the folder needing human review?

In addition to OCR, using AI vision, we also should pay attention to filename. If filename has helpful words like "Rental Income", do pay attention to it.

User needs confidence sorting did not remove files. Do they count number of files before and after rearranging. Make sure does.

And does it create a doc “SORTED.md” that lists any filerenames as maps, eg abc123.pdf → Rent-Income-Payment-Record (abc123.pdf).pdf . Make sure it does. You should definitely rename files to make them easier to glance at the files. Keep original filename in parenthesis

---

At sorting skill,

Add filenaming examples mentioning pay attention bill vs receipts:
Rent-Income-Deduction-Home-Property-Tax-Bill (200-lake-ave-farmers-tax.pdf).pdf
Rent-Income-Deduction-Home-Property-Tax-Receipts (200-lake-ave-boa-paid-tax.pdf).pdf

If there are multiple rent incomes, you want to name it per the property, eg
Rent-Income-200-Lake-Ave-Deduction-Home-Property-Tax-Bill...