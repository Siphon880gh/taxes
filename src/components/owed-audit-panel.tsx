"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sorterFetch } from "@/lib/sorter-client";
import { sorterEndpoint, unreachableMessage } from "@/lib/sorter-endpoint";
import { RENT_BREAKDOWN_NAME, reportFolder as folderOf, type OwedReportsState } from "@/lib/owed-reports";

type Status = {
  ok?: boolean;
  error?: string;
};

/** Markdown from a skill report: tables via GFM, and only web links stay links. */
function ReportMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: label }: { href?: string; children?: ReactNode }) =>
          href && /^https?:/i.test(href) ? (
            <a href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          ) : (
            <span>{label}</span>
          ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

async function fetchReport(path: string): Promise<{ path: string; markdown: string }> {
  const endpoint = sorterEndpoint();
  if (!endpoint.ok) throw new Error(endpoint.message);
  const response = await sorterFetch(`${endpoint.url}?owed=${encodeURIComponent(path)}`);
  const body = (await response.json()) as Status & { markdown?: string; path?: string };
  if (!response.ok || !body.ok || typeof body.markdown !== "string") throw new Error(body.error || `Could not open ${path.slice(path.lastIndexOf("/") + 1)}.`);
  return { path: body.path || path, markdown: body.markdown };
}

/** "Owe Audit Breakdown - Rent", shown in the panel itself whenever the skill wrote one. */
function RentBreakdowns({ paths }: { paths: string[] }) {
  const [reports, setReports] = useState<Record<string, { markdown?: string; error?: string }>>({});
  const key = paths.join("\n");

  useEffect(() => {
    let live = true;
    const list = key ? key.split("\n") : [];
    void Promise.all(
      list.map((path) =>
        fetchReport(path).then(
          (report) => [path, { markdown: report.markdown }] as const,
          (err: unknown) => [path, { error: err instanceof TypeError ? unreachableMessage(err) : err instanceof Error ? err.message : "Could not open it." }] as const,
        ),
      ),
    ).then((entries) => {
      if (live) setReports(Object.fromEntries(entries));
    });
    return () => {
      live = false;
    };
  }, [key]);

  if (paths.length === 0) return null;
  return (
    <>
      {paths.map((path, index) => {
        const report = reports[path];
        const headingId = `rent-breakdown-heading-${index}`;
        return (
          <section key={path} className="rent-breakdown" aria-labelledby={headingId}>
            <h3 id={headingId} className="font-display text-xl text-stone-900">
              Owe Audit Breakdown - Rent
            </h3>
            <p className="text-xs text-stone-600">
              {RENT_BREAKDOWN_NAME} · {folderOf(path)}
            </p>
            {report?.markdown != null ? (
              <div className="owed-audit-md rent-breakdown-md" tabIndex={0} role="region" aria-label="Owe Audit Breakdown - Rent table">
                <ReportMarkdown>{report.markdown}</ReportMarkdown>
              </div>
            ) : report?.error ? (
              <p className="mt-2 text-sm text-rust" role="alert">
                {report.error}
              </p>
            ) : (
              <p className="mt-2 text-sm text-stone-600" role="status">
                Opening {RENT_BREAKDOWN_NAME}…
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

export function OwedAuditPanel({
  state,
  onRefresh,
  onDialog,
  lede,
}: {
  /** One line under the heading: where this panel sits in the guided flow. */
  lede?: string;
  /** What api.php last said about the skill's reports (see use-owed-reports.ts). */
  state: OwedReportsState;
  onRefresh: () => void;
  onDialog?: (open: boolean) => void;
}) {
  const checked = state.status !== "loading";
  const paths = state.status === "ready" ? state.reports.audits : [];
  const rentPaths = state.status === "ready" ? state.reports.rentBreakdowns : [];
  const [error, setError] = useState<string | null>(null);
  const shownError = error ?? (state.status === "error" ? state.message : null);
  const [opening, setOpening] = useState<string | null>(null);
  const [reading, setReading] = useState<{ path: string; markdown: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(reading != null, dialogRef);

  const close = useCallback(() => {
    setReading(null);
    onDialog?.(false);
  }, [onDialog]);

  useEffect(() => {
    if (!reading) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, close]);

  async function openAudit(path: string) {
    setOpening(path);
    setError(null);
    try {
      setReading(await fetchReport(path));
      onDialog?.(true);
    } catch (err) {
      setError(err instanceof TypeError ? unreachableMessage(err) : err instanceof Error ? err.message : "Could not open Owed Audit.md.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <h2 id="check-heading" className="font-display text-2xl text-stone-900">
        Return & Owe Audit
      </h2>
      {lede ? <p className="panel-lede">{lede}</p> : null}
      <p className="mt-2 text-sm text-stone-800">
        Place the federal and state returns in the tax-year folder with the other documents. Open this codebase in Cursor and invoke the skill tax-return-owed-audit.
      </p>
      <p className="mt-2 text-sm text-stone-800">
        The skill writes Owed Audit.md in the folder that holds those documents. Federal and state stay separate. Next year&apos;s estimated-tax vouchers are not this year&apos;s balance.
        When the return has rental income it also writes Owe Audit Breakdown - Rent.md, shown below: how much of the federal tax comes from the rent.
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
              <p className="mt-1 text-xs text-stone-600">{folderOf(path)}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <RentBreakdowns paths={rentPaths} />
      {checked && paths.length === 0 && !shownError ? (
        <p className="mt-4 text-sm text-stone-600">No Owed Audit.md is in this tax-year folder yet.</p>
      ) : null}
      {shownError ? (
        <p className="mt-3 text-sm text-rust" role="alert">
          {shownError}
        </p>
      ) : null}
      <button
        type="button"
        className="btn-secondary mt-3"
        onClick={() => {
          setError(null);
          onRefresh();
        }}
      >
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
                  <ReportMarkdown>{reading.markdown}</ReportMarkdown>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
