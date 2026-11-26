# Local skills

When the user asks which skills are available, what this repository can do with its skills, or to list local skills, look at `.agents/skills/` on disk. Do not answer from a list written in this file.

1. List the directories in `.agents/skills/`.
2. Read the YAML frontmatter of each `SKILL.md` in those directories.
3. Report every skill whose frontmatter has a `name` and a `description`. Skip a directory that has no `SKILL.md`.

Invoke a skill by the `name` in that frontmatter. Read that skill's `SKILL.md` before following it.

# Reorganizing tax documents

Uploads live in `sorter/`, in a folder named `Tax Year YYYY - NAME` (for example `Tax Year 2025 - Extended to Oct 15`). There is no `stage/` or `sorted/` folder. The Document Sorter lists the files in the selected folder, and the folder a file sits in is its category. When someone asks you to reorganize these documents, open this app (the folder that contains this file).

1. Sort in place, inside the selected `Tax Year YYYY - NAME` folder. Do not move files out of it, and do not create `stage/` or `sorted/`.
2. Move each document into a category folder. If you have the `tax-document-classification` skill (in `.agents/skills/` at this app's root), follow it. Otherwise use these folder names:

   ```
   _Last year's return               _Needs Human Review            _Proof of identity
   _This year's return               Credits                        Deductions
   Estimated tax payments            Income - Investments           Income - Other
   Income - Partnerships and S-corps Income - Rental                Income - Retirement
   Income - Self-employment          Income - Wages                 Records - Statements
   Regulations - Health Insurance    Retirement & HSA               zz_Duplicates
   ```

3. Keep the tax-year folder as the parent and put the category folders inside it.
4. Put anything you cannot place with confidence in `_Needs Human Review`.
5. Keep the original filenames unless the skill says to rename. Never delete a document.
6. Leave these files where they are: `Summaries.md`, `Owed Audit.md`, `Owe Audit Breakdown - Rent.md`, `SORTED.md`, `sort-state.json`, and `.htaccess`. They belong inside the tax-year folder. This `AGENTS.md` stays at the app root.
7. Keep sort metadata in `.taxes` inside the tax-year folder (extracted text, page images, the plan, and `summaries/`). The app hides that folder. Do not list it in `sort-state.json`.
8. After sorting, write `sort-state.json` in the tax-year folder: `{ "sorted": true, "filenames": ["Category/file.pdf"] }` with paths relative to that folder. Omit the notes above and anything under `.taxes`, including `.DS_Store`. A file that is not listed is unsorted.

When you finish, tell the person to press Refresh in the Document Sorter (or reload the app) to see the new folders.
