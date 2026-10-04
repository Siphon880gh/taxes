"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

const ENDPOINT = process.env.SERVER_URL_UPLOAD_API_PHP ?? "";

function requireEndpoint() {
  if (!ENDPOINT) {
    throw new Error("Set SERVER_URL_UPLOAD_API_PHP in .env. Restart the dev server after changing it.");
  }
  return ENDPOINT;
}

type StagedFile = { path: string; bytes: number };

type Status = {
  ok: boolean;
  files?: StagedFile[];
  categories?: string[];
  error?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentSorter({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(requireEndpoint());
      const body = (await response.json()) as Status;
      if (!response.ok || !body.ok) {
        setError(body.error || "Could not list the staging directory.");
        return;
      }
      setFiles(body.files ?? []);
      setCategories(body.categories ?? []);
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
      onUploaded();
      await refresh();
      setMessage(
        archives > 0
          ? "Upload finished. Folder structure from the archive was kept under sorter/stage."
          : "Upload finished. Files are in sorter/stage.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      if (finished > 0) onUploaded();
      await refresh();
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
    if (!category) return;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 id="check-heading" className="font-display text-2xl text-stone-900">
        Document Sorter
      </h2>
      <div className="sorter-note" role="note">
        <p>Open this codebase in Cursor and invoke the skill tax-document-classification.</p>
        <p>You can upload a zip or tar. Its folder structure and category structure are kept.</p>
        <details className="sorter-why">
          <summary>Why do I need my own AI harness?</summary>
          <p>
            Weng provides this service for free, so he can’t cover the cost of AI tokens. That’s why this feature
            guides you to use your own harness and tokens. Other options would be a prompt builder you could copy into
            ChatGPT or Claude, or an AI integration using your own API key. The API key option would require you to
            trust that the app doesn’t store or copy your key—something that’s easier to verify in a local app or
            Chrome extension.
          </p>
          <p>
            For now, the harness is the most practical choice. If the service becomes commercial and token costs are
            covered, AI can be integrated directly into the app.
          </p>
        </details>
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
          {files.map((file) => (
            <li key={file.path} className="sorter-card">
              <p className="break-all font-medium text-stone-900">{file.path}</p>
              <p className="text-xs uppercase tracking-wide text-stone-500">{formatBytes(file.bytes)}</p>
              <label className="mt-2 flex flex-col gap-1 text-sm text-stone-700">
                Place in
                <select
                  className="sorter-select"
                  defaultValue=""
                  disabled={busy}
                  onChange={(event) => {
                    const category = event.target.value;
                    event.target.value = "";
                    void place(file.path, category);
                  }}
                >
                  <option value="">Choose a category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
