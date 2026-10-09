"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { WhyNotAutomatic } from "@/components/prompt-builder";

const ENDPOINT = process.env.SERVER_URL_UPLOAD_API_PHP ?? "";

function requireEndpoint() {
  if (!ENDPOINT) {
    throw new Error("Set SERVER_URL_UPLOAD_API_PHP in .env. Restart the dev server after changing it.");
  }
  return ENDPOINT;
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
  "Open this codebase in Cursor and invoke the skill tax-document-summaries to create summaries (for example, a Rental Income and Deductions Summary) to help a tax professional quickly see the numbers and get an idea what forms are needed.";

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

export function DocumentSorter({
  onUploaded,
  onSuggestSummaries,
}: {
  onUploaded: () => void;
  onSuggestSummaries?: (suggest: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSuggestSummariesRef = useRef(onSuggestSummaries);
  onSuggestSummariesRef.current = onSuggestSummaries;
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

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(requireEndpoint());
      const body = (await response.json()) as Status;
      if (!response.ok || !body.ok) {
        setError(body.error || "Could not list the staging directory.");
        return;
      }
      setFiles(
        (body.files ?? []).map((file) => ({
          ...file,
          category: typeof file.category === "string" ? file.category : categoryOf(file),
        })),
      );
      setCategories(body.categories ?? []);
      const suggest = body.summaries !== true && body.folders === true;
      setSuggestSummaries(suggest);
      onSuggestSummariesRef.current?.(suggest);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not reach ${ENDPOINT}. The PHP server must be running.`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function uploadOne(file: File) {
    const payload = new FormData();
    payload.append("action", "upload");
    payload.append("file", file, file.name);
    const response = await fetch(requireEndpoint(), { method: "POST", body: payload });
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
      let archives = 0;
      for (const file of batch) {
        const result = await uploadOne(file);
        if (result.archive) archives += 1;
        finished += 1;
      }
      await refresh();
      onUploaded();
      setMessage(
        archives > 0
          ? "Upload finished. Folder structure from the archive was kept under sorter/stage."
          : "Upload finished. Files are in sorter/stage.",
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
    setBusy(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("action", "place");
      payload.append("path", filePath);
      payload.append("category", category);
      const response = await fetch(requireEndpoint(), { method: "POST", body: payload });
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
      const response = await fetch(requireEndpoint(), { method: "POST", body: payload });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "Could not remove that category.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that category.");
    } finally {
      setBusy(false);
    }
  }

  function openCategory(file: StagedFile) {
    setEditingPath(file.path);
    setPicked(categoryOf(file));
    setNewCategory("");
    setError(null);
  }

  function closeCategory() {
    setEditingPath(null);
    setPicked("");
    setNewCategory("");
  }

  const editing = files.find((file) => file.path === editingPath) ?? null;

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
      <div className="sorter-note" role="note">
        <p>Open this codebase in Cursor and invoke the skill tax-document-classification.</p>
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
          multiple
          onChange={(event) => {
            if (event.target.files) void uploadList(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-stone-600">Staging directory sorter/stage</p>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
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
      {files.length === 0 ? (
        <p className="mt-3 text-stone-700">Nothing is staged.</p>
      ) : (
        <ul className="sorter-list">
          {files.map((file) => {
            const category = categoryOf(file);
            return (
              <li key={file.path} className="sorter-card">
                <p className="break-all font-medium text-stone-900">{file.path}</p>
                <p className="text-xs uppercase tracking-wide text-stone-500">{formatBytes(file.bytes)}</p>
                <p className="mt-2 text-sm text-stone-700">Category: {category || "None"}</p>
                <button type="button" className="btn-secondary mt-2" disabled={busy} onClick={() => openCategory(file)}>
                  {category ? "Change category" : "Assign category"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {categories.length > 0 ? (
        <section className="sorter-categories" aria-labelledby="sorter-categories-heading">
          <h3 id="sorter-categories-heading" className="font-medium text-stone-900">
            Categories
          </h3>
          <p className="text-sm text-stone-600">A category can be removed after every document has been moved out of its folder.</p>
          <ul className="sorter-category-list">
            {categories.map((category) => {
              const count = documentsInCategory(category, files);
              const removable = categoryIsEmpty(category, files, categories);
              return (
                <li key={category} className="sorter-category">
                  <p className="min-w-0 break-all text-stone-900">{category}</p>
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
      {editing ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCategory}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="category-title" className="font-display text-2xl text-stone-900">
              {categoryOf(editing) ? "Change category" : "Assign category"}
            </h2>
            <p className="mt-3 break-all text-stone-800">{editing.path}</p>
            <p className="mt-2 text-stone-700">Current category: {categoryOf(editing) || "None"}</p>
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const category = newCategory.trim() || picked;
                if (!category) {
                  setError("Choose a category, or type a new one.");
                  return;
                }
                if (category === categoryOf(editing)) {
                  closeCategory();
                  return;
                }
                void place(editing.path, category).then((ok) => {
                  if (ok) closeCategory();
                });
              }}
            >
              {categories.length > 0 ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-stone-800">Existing category</legend>
                  {categories.map((category) => (
                    <label key={category} className="flex items-center gap-2 text-stone-800">
                      <input
                        type="radio"
                        name="existing-category"
                        value={category}
                        checked={newCategory.trim() === "" && picked === category}
                        onChange={() => {
                          setPicked(category);
                          setNewCategory("");
                        }}
                      />
                      <span className="break-all">{category}</span>
                    </label>
                  ))}
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
