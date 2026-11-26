# Reorganizing the tax documents in this folder

This is the Taxes app's uploads folder (`sorter/stage/`). The app's Document Sorter lists every file here, and the
folder a file sits in is its category. When someone asks you to reorganize these documents:

1. Sort in place, inside this folder. Do not move files out of it, and do not write to `sorter/sorted/`.
2. Move each document into a category folder. If you have the `tax-document-classification` skill (in
   `.agents/skills/` at the app's root), follow it. Otherwise use these folder names:

   ```
   _Last year's return               _Needs Human Review            _Proof of identity
   _This year's return               Credits                        Deductions
   Estimated tax payments            Income - Investments           Income - Other
   Income - Partnerships and S-corps Income - Rental                Income - Retirement
   Income - Self-employment          Income - Wages                 Records - Statements
   Regulations - Health Insurance    Retirement & HSA               zz_Duplicates
   ```

3. If the files already sit under a tax-year folder (for example `Tax Year 2025 - .../`), keep it as the parent and
   put the category folders inside it.
4. Put anything you cannot place with confidence in `_Needs Human Review`.
5. Keep the original filenames unless the skill says to rename. Never delete a document.
6. Leave these files where they are: `AGENTS.md`, `Summaries.md`, `Owed Audit.md`, `Owe Audit Breakdown - Rent.md`,
   `.gitkeep`, `.htaccess`.
7. Don't create folders whose names start with a dot; the app hides them.

When you finish, tell the person to press Refresh in the Document Sorter (or reload the app) to see the new folders.
