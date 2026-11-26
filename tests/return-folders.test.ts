import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultReturnName,
  inReturnFolder,
  normalizeReturnName,
  returnFolderLabel,
  returnFolderNames,
  stageListingFrom,
  unsortedFiles,
} from "../src/lib/return-folders";

const folder = "Tax Year 2025 - 3. Extended to Oct 15";

test("a year loads only folders named Tax Year YYYY - NAME", () => {
  const categories = [
    folder,
    `${folder}/Income - Rental Property`,
    "Tax Year 2026 - Return",
    "2026 Return",
    "Income - Wages",
  ];
  assert.deepEqual(returnFolderNames(categories, "2025"), [folder]);
  assert.deepEqual(returnFolderNames(categories, "2026"), ["Tax Year 2026 - Return"]);
  assert.deepEqual(returnFolderNames(categories, "2024"), []);
});

test("a blank name is filled in, and a typed name uses Tax Year YYYY - NAME", () => {
  assert.equal(defaultReturnName([], "2026"), "Tax Year 2026 - Return");
  assert.equal(defaultReturnName(["Tax Year 2026 - Return"], "2026"), "Tax Year 2026 - Return 2");
  assert.equal(normalizeReturnName("", "2026", []), "Tax Year 2026 - Return");
  assert.equal(normalizeReturnName("Weng", "2026", []), "Tax Year 2026 - Weng");
  assert.equal(normalizeReturnName("Tax Year 2026 - Weng", "2026", []), "Tax Year 2026 - Weng");
  assert.equal(returnFolderLabel(folder, "2025"), "3. Extended to Oct 15");
});

test("files missing from sort-state.json are unsorted, and junk files are ignored", () => {
  const files = [
    { path: `${folder}/Income - Wages/a.pdf`, category: `${folder}/Income - Wages` },
    { path: `${folder}/new-scan.pdf`, category: folder },
    { path: `${folder}/.DS_Store`, category: folder },
    { path: `${folder}/.taxes/text/note.txt`, category: `${folder}/.taxes/text` },
    { path: `${folder}/Summaries.md`, category: folder },
    { path: "Tax Year 2024 - Old/a.pdf", category: "Tax Year 2024 - Old" },
  ];
  const state = { sorted: true, filenames: ["Income - Wages/a.pdf"] };
  assert.deepEqual(unsortedFiles(files, folder, state), ["new-scan.pdf"]);
  assert.deepEqual(unsortedFiles(files, folder, null), ["Income - Wages/a.pdf", "new-scan.pdf"]);
  assert.equal(inReturnFolder(`${folder}/Income - Wages`, folder), true);
  assert.equal(inReturnFolder("Tax Year 2024 - Old", folder), false);
});

test("a status answer carries the sort state for each return folder", () => {
  assert.equal(stageListingFrom({ ok: false }), null);
  assert.deepEqual(
    stageListingFrom({
      ok: true,
      files: [{ path: `${folder}/a.pdf`, category: folder }],
      categories: [folder],
      sortStates: { [folder]: { sorted: true, filenames: ["a.pdf"] } },
    }),
    {
      files: [{ path: `${folder}/a.pdf`, category: folder }],
      categories: [folder],
      sortStates: { [folder]: { sorted: true, filenames: ["a.pdf"] } },
      summaryFolders: [],
    },
  );
});
