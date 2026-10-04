"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import categoryNames from "../../sorter/categories.json";

type StageFile = { name: string; bytes: number };
type CategoryStatus = { name: string; files: StageFile[] };
type StatusPayload = {
  ok: boolean;
  error?: string;
  stageDir?: string;
  files?: StageFile[];
  categories?: CategoryStatus[];
};

const ENDPOINT = "/sorter/api.php";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentSorter({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const response = await fetch(`${ENDPOINT}?action=status`, { cache: "no-store" });
      const payload = (await response.json()) as StatusPayload;
      if (!response.ok || !payload.ok) {
        setStatus(null);
        setStatusError(payload.error ?? "The staging directory could not be checked.");
        return;
      }
      setStatus(payload);
    } catch {
      setStatus(null);
      setStatusError("The staging directory could not be checked.");
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setUploadNote(null);
    const body = new FormData();
    body.set("action", "upload");
    for (const file of files) body.append("files[]", file);
    try {
      const response = await fetch(ENDPOINT, { method: "POST", body });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        staged?: string[];
        rejected?: { name: string; error: string }[];
      };
      const staged = payload.staged ?? [];
      const rejected = payload.rejected ?? [];
      if (staged.length > 0) onUploaded();
      if (rejected.length > 0) {
        setUploadNote(rejected.map((item) => `${item.name || "File"}: ${item.error}`).join(" "));
      } else if (!payload.ok) {
        setUploadNote(payload.error ?? "Those files were not staged.");
      } else {
        setUploadNote(null);
      }
      await refreshStatus();
    } catch {
      setUploadNote("Those files were not staged.");
    } finally {
      setBusy(false);
    }
  }

  const staged = status?.files ?? [];
  const categories = status?.categories ?? categoryNames.map((name) => ({ name, files: [] }));

  return (
    <>
      <h2 id="check-heading" className="font-display text-2xl text-stone-900">
        Document Sorter
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        Stage tax documents here. Uploads and the status check both go through sorter/api.php.
      </p>
      <div className="disclaimer mt-3" role="note">
        <p className="font-medium text-stone-900">Run the document classification skill in Cursor</p>
        <p className="mt-1">
          Open this project in Cursor and run the document classification skill. It reads sorter/stage/ and places each file into a tax category.
        </p>
      </div>
      <div
        className={`mt-3 rounded-md border border-dashed px-4 py-6 text-center ${dragging ? "border-[#9a3412] bg-[#fff7ed]" : "border-stone-300 bg-[#fffdf8]"}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload([...event.dataTransfer.files]);
        }}
      >
        <p className="font-medium text-stone-900">Drop files to stage them</p>
        <p className="mt-1 text-sm text-stone-600">They are written to sorter/stage/ and stay there until the skill places them.</p>
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Staging…" : "Choose files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.txt,.csv,.rtf,.doc,.docx,.xls,.xlsx,.heic,.ofx,.qfx"
          aria-label="Choose tax documents to stage"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            void upload(files);
          }}
        />
      </div>
      {uploadNote ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
          {uploadNote}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => void refreshStatus()}>
          Refresh status
        </button>
        <p className="text-sm text-stone-600">Checks sorter/stage/.</p>
      </div>
      <div className="mt-3 rounded-md border border-stone-200 bg-[#fffdf8] px-3 py-2" aria-live="polite">
        <p className="text-xs uppercase tracking-wide text-stone-500">Staging directory</p>
        <p className="font-medium text-stone-900">sorter/stage/</p>
        {statusError ? <p className="mt-1 text-sm text-amber-950">{statusError}</p> : null}
        {!statusError && staged.length === 0 ? (
          <p className="mt-1 text-sm text-stone-700">No files staged.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {staged.map((file) => (
              <li key={file.name} className="flex items-baseline justify-between gap-3 text-sm text-stone-800">
                <span className="min-w-0 break-all">{file.name}</span>
                <span className="shrink-0 text-stone-500">{formatBytes(file.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-stone-800">Sort targets</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {categories.map((category) => (
          <li key={category.name} className="rounded-md border border-stone-200 bg-[#fffdf8] px-3 py-2">
            <p className="font-medium text-stone-900">{category.name}</p>
            {category.files.length === 0 ? (
              <p className="text-sm text-stone-600">Empty</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {category.files.map((file) => (
                  <li key={file.name} className="text-sm text-stone-700">
                    {file.name}
                    <span className="text-stone-500"> · {formatBytes(file.bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
