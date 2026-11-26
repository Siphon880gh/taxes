"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AiReorganizeDialog } from "@/components/ai-reorganize-dialog";
import { WhyNotAutomatic } from "@/components/prompt-builder";
import { documentCoverage } from "@/lib/document-coverage";
import { unsortedFiles, type SortState } from "@/lib/return-folders";
import { fetchPdfHints, formsLabel, hintBadge, type PdfHints } from "@/lib/pdf-hints";
import { sorterFetch } from "@/lib/sorter-client";
import { sorterEndpoint, unreachableMessage } from "@/lib/sorter-endpoint";
import { useDialogFocus } from "@/lib/use-dialog-focus";

function requireEndpoint() {
  const endpoint = sorterEndpoint();
  if (!endpoint.ok) throw new Error(endpoint.message);
  return endpoint.url;
}

type StagedFile = { path: string; bytes: number; category?: string };

type Status = {
  ok: boolean;
  files?: StagedFile[];
  categories?: string[];
  summaries?: boolean;
  folders?: boolean;
  error?: string;
};

export const SUMMARIES_SKILL_NOTE =
  "Summaries.md is not in this folder yet. Ask AI to write it so a tax professional can see the numbers and which forms they suggest.";

function categoryOf(file: StagedFile) {
  if (typeof file.category === "string") return file.category;
  const slash = file.path.lastIndexOf("/");
  return slash === -1 ? "" : file.path.slice(0, slash);
}

function documentsInCategory(category: string, staged: StagedFile[]) {
  return staged.filter((file) => {
    const current = categoryOf(file);
    return current === category || current.startsWith(`${category}/`);
  }).length;
}

function categoryIsEmpty(category: string, staged: StagedFile[], folders: string[]) {
  if (documentsInCategory(category, staged) > 0) return false;
  return !folders.some((folder) => folder.startsWith(`${category}/`));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function DocumentSorter({
  onUploaded,
  onSuggestSummaries,
  revealed = [],
  onFiles,
  onPdfHints,
  onStatus,
  lede,
  returnFolder = null,
  taxYear = null,
  sortState = null,
  onEnsureFolder,
  onAskAi,
}: {
  onUploaded: () => void;
  /** One line under the heading: where this panel sits in the guided flow. */
  lede?: string;
  onSuggestSummaries?: (suggest: boolean) => void;
  /** Chart boxes on the current path, used to list the documents the path calls for. */
  revealed?: string[];
  /** Hears the staged paths (relative to sorter) after every refresh. */
  onFiles?: (paths: string[]) => void;
  /** Hears the form names api.php read inside the staged PDFs, after every refresh. */
  onPdfHints?: (hints: PdfHints) => void;
  /** Hears every status api.php returns, so the Return & Owe Audit tab learns about new reports too. */
  onStatus?: (body: unknown) => void;
  /** "Tax Year 2026 - Return". Only documents in this folder are shown. Null shows nothing from other years. */
  returnFolder?: string | null;
  /** Tax year selected in the top right, such as "2026". */
  taxYear?: string | null;
  /** sort-state.json for this folder. Files not listed there are unsorted. */
  sortState?: SortState | null;
  /** Creates the year's folder when an upload arrives before one has been named. */
  onEnsureFolder?: () => Promise<string>;
  /** Starts an in-app AI task (summaries or the return and owe audit) for this tax-year folder. */
  onAskAi?: (task: "summaries" | "audit") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSuggestSummariesRef = useRef(onSuggestSummaries);
  onSuggestSummariesRef.current = onSuggestSummaries;
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const onPdfHintsRef = useRef(onPdfHints);
  onPdfHintsRef.current = onPdfHints;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const hintsRequest = useRef(0);
  const [hints, setHints] = useState<PdfHints>({});
  /** null until api.php has answered; false when the PDF reader is not installed on the server. */
  const [reader, setReader] = useState<boolean | null>(null);
  const [readingPdfs, setReadingPdfs] = useState(false);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suggestSummaries, setSuggestSummaries] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [query, setQuery] = useState("");
  const closeAi = useCallback(() => setAiOpen(false), []);

  const refresh = useCallback(async () => {
    setError(null);
    const endpoint = sorterEndpoint();
    if (!endpoint.ok) {
      setError(endpoint.message);
      return;
    }
    try {
      const response = await sorterFetch(endpoint.url);
      const body = (await response.json()) as Status;
      if (!response.ok || !body.ok) {
        setError(body.error || "Could not list the staging directory.");
        return;
      }
      onStatusRef.current?.(body);
      const listed = (body.files ?? []).map((file) => ({
        ...file,
        category: typeof file.category === "string" ? file.category : categoryOf(file),
      }));
      setFiles(listed);
      // Reading inside the PDFs can take a moment the first time; the list shows right away and the hints follow.
      const request = ++hintsRequest.current;
      setReadingPdfs(listed.some((file) => file.path.toLowerCase().endsWith(".pdf")));
      void fetchPdfHints(endpoint.url).then((result) => {
        if (request !== hintsRequest.current) return;
        setReadingPdfs(false);
        setHints(result.hints);
        setReader(result.available);
        onPdfHintsRef.current?.(result.hints);
      });
      setCategories(body.categories ?? []);
      const suggest = body.summaries !== true && body.folders === true;
      setSuggestSummaries(suggest);
      onSuggestSummariesRef.current?.(suggest);
    } catch (err) {
      setError(unreachableMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function uploadOne(file: File, folder: string) {
    const payload = new FormData();
    payload.append("action", "upload");
    payload.append("folder", folder);
    payload.append("file", file, file.name);
    const response = await sorterFetch(requireEndpoint(), { method: "POST", body: payload });
    const body = (await response.json()) as { ok?: boolean; error?: string; archive?: boolean };
    if (!response.ok || !body.ok) throw new Error(body.error || `Could not upload ${file.name}`);
    return body;
  }

  async function uploadList(list: FileList | File[]) {
    const batch = Array.from(list);
    if (batch.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    let finished = 0;
    try {
      const folder = returnFolder || (await onEnsureFolder?.());
      if (!folder) throw new Error("Choose or create a folder for this tax year first.");
      let archives = 0;
      for (const file of batch) {
        const result = await uploadOne(file, folder);
        if (result.archive) archives += 1;
        finished += 1;
      }
      await refresh();
      onUploaded();
      setMessage(
        archives > 0
          ? `Upload finished. Folder structure from the archive was kept under sorter/${folder}.`
          : `Upload finished. Files are in sorter/${folder}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      await refresh();
      if (finished > 0) onUploaded();
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(false);
    if (event.dataTransfer.files.length) void uploadList(event.dataTransfer.files);
  }

  async function place(filePath: string, category: string) {
    if (!category) return false;
    const target = returnFolder && category !== returnFolder && !category.startsWith(`${returnFolder}/`)
      ? `${returnFolder}/${category}`
      : category;
    setBusy(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("action", "place");
      payload.append("path", filePath);
      payload.append("category", target);
      const response = await sorterFetch(requireEndpoint(), { method: "POST", body: payload });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "Could not place that file.");
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place that file.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category: string) {
    if (!categoryIsEmpty(category, files, categories)) return;
    setBusy(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("action", "remove");
      payload.append("category", category);
      const response = await sorterFetch(requireEndpoint(), { method: "POST", body: payload });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "Could not remove that category.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that category.");
    } finally {
      setBusy(false);
    }
  }

  function displayCategory(category: string) {
  if (!returnFolder) return category;
  if (category === returnFolder) return "";
  if (category.startsWith(`${returnFolder}/`)) return category.slice(returnFolder.length + 1);
  return category;
}

function openCategory(file: StagedFile) {
    setEditingPath(file.path);
    setPicked(displayCategory(categoryOf(file)));
    setNewCategory("");
    setError(null);
  }

  function closeCategory() {
    setEditingPath(null);
    setPicked("");
    setNewCategory("");
  }

  const scoped = useMemo(() => {
    if (!returnFolder) return [];
    return files.filter((file) => {
      const category = categoryOf(file);
      return category === returnFolder || category.startsWith(`${returnFolder}/`);
    });
  }, [files, returnFolder]);
  const scopedCategories = useMemo(() => {
    if (!returnFolder) return [];
    return categories.filter((category) => category === returnFolder || category.startsWith(`${returnFolder}/`));
  }, [categories, returnFolder]);

  useEffect(() => {
    onFilesRef.current?.(scoped.map((file) => file.path));
  }, [scoped]);

  const unsorted = useMemo(
    () =>
      returnFolder
        ? unsortedFiles(
            scoped.map((file) => ({ path: file.path, category: categoryOf(file) })),
            returnFolder,
            sortState,
          )
        : [],
    [scoped, returnFolder, sortState],
  );
  const coverage = useMemo(() => documentCoverage({ revealed }, scoped.map((file) => file.path), hints), [revealed, scoped, hints]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? scoped.filter((file) => file.path.toLowerCase().includes(needle) || formsLabel(hints[file.path]?.forms ?? []).toLowerCase().includes(needle))
      : scoped;
  }, [scoped, query, hints]);
  /** Shown files by category folder; uncategorized first, then folders in name order. */
  const groups = useMemo(() => {
    const byCategory = new Map<string, StagedFile[]>();
    for (const file of shown) {
      const full = categoryOf(file);
      const category = !returnFolder || full === returnFolder
        ? (full === returnFolder ? "" : full)
        : full.startsWith(`${returnFolder}/`)
          ? full.slice(returnFolder.length + 1)
          : full;
      byCategory.set(category, [...(byCategory.get(category) ?? []), file]);
    }
    return [...byCategory.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [shown, returnFolder]);
  const editing = files.find((file) => file.path === editingPath) ?? null;
  const categoryDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(editing != null, categoryDialogRef);

  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCategory();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  return (
    <>
      <h2 id="check-heading" className="font-display text-2xl text-stone-900">
        Document Sorter
      </h2>
      {lede ? <p className="panel-lede">{lede}</p> : null}
      <div className="sorter-note" role="note">
        <p>
          Ask AI to sort, write Summaries.md, or audit what the return owes. Each one tries ChatGPT or Claude in this app
          first, using the matching skill in <code>.agents/skills/</code>. Sorting sees file names and form tags. Summaries
          and the audit also send a short redacted excerpt of each file.
        </p>
        {suggestSummaries ? <p>{SUMMARIES_SKILL_NOTE}</p> : null}
        <p>You can upload a zip or tar. Its folder structure and category structure are kept.</p>
        <p>The folder a document is in is its category.</p>
        <WhyNotAutomatic />
      </div>
      <div
        className={over ? "sorter-drop is-over" : "sorter-drop"}
        onDragEnter={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <p>Drop files here</p>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          Choose files
        </button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          aria-label="Choose files to upload"
          multiple
          onChange={(event) => {
            if (event.target.files) void uploadList(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-stone-600">{returnFolder ? `Folder sorter/${returnFolder}` : "Name a folder for this tax year before uploading."}</p>
        {files.length > scoped.length ? (
          <p className="text-sm text-stone-600">{files.length - scoped.length} documents are in other folders and are not shown for this year.</p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary ai-reorg-open" disabled={busy} onClick={() => setAiOpen(true)}>
            <span aria-hidden="true">✦</span> Ask AI to sort
          </button>
          {onAskAi ? (
            <>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => onAskAi("summaries")}>
                Ask AI to write Summaries.md
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => onAskAi("audit")}>
                Ask AI to audit owed
              </button>
            </>
          ) : null}
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </div>
      {message ? (
        <p className="mt-2 text-sm text-stone-800" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-rust" role="alert">
          {error}
        </p>
      ) : null}
      {coverage.expected.length > 0 ? (
        <section className="sorter-coverage" aria-labelledby="sorter-coverage-heading">
          <h3 id="sorter-coverage-heading" className="font-medium text-stone-900">
            Documents this path calls for
          </h3>
          <p className="text-sm text-stone-600" aria-live="polite">
            {coverage.found} of {coverage.expected.length} look like they are on file in this tax-year folder.{" "}
            {readingPdfs
              ? "Reading the PDFs for form names…"
              : reader
                ? "PDFs count by the form named in their text; scans and other files count by folder and file name."
                : "Judging by folder and file names."}{" "}
            The list grows as you answer more of the chart.
          </p>
          <ul className="sorter-coverage-list">
            {coverage.expected.map((doc) => {
              const found = doc.files.length > 0;
              return (
                <li key={doc.id} className={found ? "is-found" : "is-missing"}>
                  <span className="sorter-coverage-mark" aria-hidden="true">
                    {found ? "✓" : "○"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900">
                      {doc.label}
                      <span className="sr-only">{found ? ", on file" : ", not found yet"}</span>
                    </p>
                    <p className="text-sm text-stone-700">{doc.reason}</p>
                    <p className="break-all text-xs text-stone-600">
                      {found
                        ? `On file: ${doc.files.map((path) => (doc.byContent.includes(path) ? `${fileName(path)} (read inside the PDF)` : fileName(path))).join(", ")}`
                        : reader
                          ? "Nothing in this tax-year folder reads as this form or matches by name yet. Upload it; a scan with no text needs the form name in its file name."
                          : "Nothing in this tax-year folder matches by name yet. Upload it, or rename it so the form name is in the file name."}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="mt-3 text-sm text-stone-600">Answer questions on the chart to see which source documents this return calls for.</p>
      )}
      {unsorted.length > 0 ? (
        <section className="sorter-note mt-3" aria-labelledby="unsorted-heading">
          <h3 id="unsorted-heading" className="font-medium text-stone-900">
            Unsorted
          </h3>
          <p>
            {unsorted.length} {unsorted.length === 1 ? "file is" : "files are"} not in sort-state.json
            {sortState?.sorted ? " since the last sort" : ""}. The tax-document-classification skill records a file there once it has a category.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {unsorted.map((path) => (
              <li key={path} className="break-all text-sm text-stone-800">
                {path}
              </li>
            ))}
          </ul>
        </section>
      ) : returnFolder && scoped.length > 0 ? (
        <p className="mt-3 text-sm text-stone-700" role="status">Every document in this folder is recorded as sorted.</p>
      ) : null}
      {scoped.length === 0 ? (
        <p className="mt-3 text-stone-700">{returnFolder ? "Nothing is in this folder yet." : "Nothing is staged for this tax year."}</p>
      ) : (
        <>
          <div className="sorter-filter">
            <label htmlFor="sorter-filter-input" className="text-sm font-medium text-stone-800">
              Filter documents
            </label>
            <input
              id="sorter-filter-input"
              type="search"
              className="sorter-select"
              placeholder="Name, form, or folder, such as 1099"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="text-sm text-stone-600" role="status">
              {shown.length === files.length
                ? `${files.length} ${files.length === 1 ? "document" : "documents"} in ${groups.length} ${groups.length === 1 ? "group" : "groups"}`
                : `${shown.length} of ${files.length} documents match`}
            </p>
          </div>
          {shown.length === 0 ? <p className="mt-3 text-stone-700">No staged document matches that filter.</p> : null}
          {groups.map(([category, list]) => (
            <section key={category || "(none)"} className="sorter-group" aria-label={`${category || "Not in a category"}, ${list.length} ${list.length === 1 ? "document" : "documents"}`}>
              <h3 className="sorter-group-title">
                <span className="break-all">{category || "Not in a category"}</span>
                <span className="sorter-group-count">{list.length}</span>
              </h3>
              <ul className="sorter-list">
                {list.map((file) => (
                  <li key={file.path} className="sorter-card">
                    <p className="break-all font-medium text-stone-900" title={file.path}>
                      {category ? file.path.slice(category.length + 1) : file.path}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-stone-500">{formatBytes(file.bytes)}</p>
                    {hintBadge(hints[file.path]) ? (
                      <p className={`sorter-read${hints[file.path]?.forms.length ? " is-form" : ""}`} title="Read inside the PDF on the server; the file is not changed">
                        {hintBadge(hints[file.path])}
                      </p>
                    ) : null}
                    <button type="button" className="btn-secondary mt-2" disabled={busy} onClick={() => openCategory(file)}>
                      {category ? "Change category" : "Assign category"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {scopedCategories.filter((category) => category !== returnFolder).length > 0 ? (
        <section className="sorter-categories" aria-labelledby="sorter-categories-heading">
          <h3 id="sorter-categories-heading" className="font-medium text-stone-900">
            Categories
          </h3>
          <p className="text-sm text-stone-600">A category can be removed after every document has been moved out of its folder.</p>
          <ul className="sorter-category-list">
            {scopedCategories.filter((category) => category !== returnFolder).map((category) => {
              const count = documentsInCategory(category, scoped);
              const removable = categoryIsEmpty(category, scoped, scopedCategories);
              const shownName = displayCategory(category);
              return (
                <li key={category} className="sorter-category">
                  <p className="min-w-0 break-all text-stone-900">{shownName}</p>
                  <p className="text-sm text-stone-600">
                    {count} {count === 1 ? "document" : "documents"}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy || !removable}
                    title={removable ? "Remove this empty category" : "Move every document out of this category before removing it."}
                    onClick={() => void removeCategory(category)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {aiOpen ? <AiReorganizeDialog onClose={closeAi} onRefresh={refresh} returnFolder={returnFolder} taxYear={taxYear} /> : null}
      {editing ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCategory}>
          <div
            ref={categoryDialogRef}
            tabIndex={-1}
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="category-title" className="font-display text-2xl text-stone-900">
              {displayCategory(categoryOf(editing)) ? "Change category" : "Assign category"}
            </h2>
            <p className="mt-3 break-all text-stone-800">{editing.path}</p>
            <p className="mt-2 text-stone-700">Current category: {displayCategory(categoryOf(editing)) || "None"}</p>
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const category = newCategory.trim() || picked;
                if (!category) {
                  setError("Choose a category, or type a new one.");
                  return;
                }
                if (category === displayCategory(categoryOf(editing))) {
                  closeCategory();
                  return;
                }
                void place(editing.path, category).then((ok) => {
                  if (ok) closeCategory();
                });
              }}
            >
              {scopedCategories.some((category) => category !== returnFolder) ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-stone-800">Existing category</legend>
                  {scopedCategories.filter((category) => category !== returnFolder).map((category) => {
                    const shown = displayCategory(category);
                    return (
                    <label key={category} className="flex items-center gap-2 text-stone-800">
                      <input
                        type="radio"
                        name="existing-category"
                        value={shown}
                        checked={newCategory.trim() === "" && picked === shown}
                        onChange={() => {
                          setPicked(shown);
                          setNewCategory("");
                        }}
                      />
                      <span className="break-all">{shown}</span>
                    </label>
                    );
                  })}
                </fieldset>
              ) : null}
              <label className="flex flex-col gap-1 text-sm text-stone-800">
                New category
                <input
                  className="sorter-select"
                  value={newCategory}
                  disabled={busy}
                  onChange={(event) => {
                    setNewCategory(event.target.value);
                    setPicked("");
                  }}
                />
              </label>
              <p className="text-sm text-stone-600">A new name creates a folder and moves this document into it.</p>
              {error ? (
                <p className="text-sm text-rust" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={busy}>
                  Update category
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={closeCategory}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
