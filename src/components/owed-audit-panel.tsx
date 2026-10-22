"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sorterFetch } from "@/lib/sorter-client";
import { sorterEndpoint, unreachableMessage } from "@/lib/sorter-endpoint";

type Status = {
  ok?: boolean;
  owedAudits?: string[];
  error?: string;
};

function folderOf(path: string) {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "sorter/stage" : path.slice(0, slash);
}

export function OwedAuditPanel({ onDialog }: { onDialog?: (open: boolean) => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [reading, setReading] = useState<{ path: string; markdown: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(reading != null, dialogRef);

  const close = useCallback(() => {
    setReading(null);
    onDialog?.(false);
  }, [onDialog]);

  const refresh = useCallback(async () => {
    const endpoint = sorterEndpoint();
    if (!endpoint.ok) {
      setError(endpoint.message);
      setChecked(true);
      return;
    }
    setError(null);
    try {
      const response = await sorterFetch(endpoint.url);
      const body = (await response.json()) as Status;
      if (!response.ok || !body.ok) {
        setError(body.error || "Could not check for Owed Audit.md.");
        return;
      }
      setPaths(body.owedAudits ?? []);
    } catch (err) {
      setError(unreachableMessage(err, endpoint.url));
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!reading) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, close]);

  async function openAudit(path: string) {
    const endpoint = sorterEndpoint();
    if (!endpoint.ok) return;
    setOpening(path);
    setError(null);
    try {
      const response = await sorterFetch(`${endpoint.url}?owed=${encodeURIComponent(path)}`);
      const body = (await response.json()) as Status & { markdown?: string; path?: string };
      if (!response.ok || !body.ok || typeof body.markdown !== "string") {
        setError(body.error || "Could not open Owed Audit.md.");
        return;
      }
      setReading({ path: body.path || path, markdown: body.markdown });
      onDialog?.(true);
    } catch (err) {
      setError(unreachableMessage(err, endpoint.url));
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <h2 id="check-heading" className="font-display text-2xl text-stone-900">
        Return & Owe Audit
      </h2>
      <p className="mt-2 text-sm text-stone-800">
        Place the federal and state returns in sorter/stage with the other documents. Open this codebase in Cursor and invoke the skill tax-return-owed-audit.
      </p>
      <p className="mt-2 text-sm text-stone-800">
        The skill writes Owed Audit.md in the folder that holds those documents. Federal and state stay separate. Next year&apos;s estimated-tax vouchers are not this year&apos;s balance.
      </p>
      {checked && paths.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {paths.map((path) => (
            <li key={path}>
              <button
                type="button"
                className="btn-secondary"
                aria-disabled={opening === path}
                aria-busy={opening === path}
                onClick={() => {
                  // aria-disabled, not disabled: a disabled button drops focus, and the dialog returns focus here on close.
                  if (opening !== path) void openAudit(path);
                }}
              >
                View Owed Audit.md
              </button>
              <p className="mt-1 text-xs text-stone-500">{folderOf(path)}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {checked && paths.length === 0 && !error ? (
        <p className="mt-4 text-sm text-stone-600">No Owed Audit.md is in sorter/stage yet.</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-rust" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn-secondary mt-3" onClick={() => void refresh()}>
        Refresh
      </button>
      {reading && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop owed-audit-backdrop" role="presentation" onClick={close}>
              <div
                ref={dialogRef}
                tabIndex={-1}
                className="modal-card owed-audit-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="owed-audit-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="owed-audit-toolbar">
                  <div>
                    <h2 id="owed-audit-title" className="font-display text-2xl text-stone-900">
                      Owed Audit.md
                    </h2>
                    <p className="text-sm text-stone-600">{folderOf(reading.path)}</p>
                  </div>
                  <button type="button" className="btn-secondary" onClick={close}>
                    Close
                  </button>
                </div>
                <div className="owed-audit-md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) =>
                        href && /^https?:/i.test(href) ? (
                          <a href={href} target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        ) : (
                          <span>{children}</span>
                        ),
                    }}
                  >
                    {reading.markdown}
                  </ReactMarkdown>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
