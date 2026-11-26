"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/harness-help";
import { copyText } from "@/lib/copy-text";
import {
  AI_TASKS,
  AI_UNAVAILABLE_TITLE,
  AiUnavailableError,
  harnessPrompt,
  harnessSnag,
  postAi,
  type AiTaskId,
} from "@/lib/ai-tasks";
import { useDialogFocus } from "@/lib/use-dialog-focus";

/**
 * Runs one in-app AI task (summaries, return & owe audit, or the FreeTaxUSA walkthrough).
 * The click that opened this dialog is the attempt. A missing key or a billing refusal snags here and names
 * the skill, the tax year, and the folder. A result is shown before anything is written into the folder.
 */

type RunTask = Exclude<AiTaskId, "sort">;

type Draft = { markdown?: string; rent?: string; guidance?: string };

export function AiSkillDialog({
  task,
  folder,
  onClose,
  onSaved,
}: {
  task: RunTask;
  folder: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const spec = AI_TASKS[task];
  const dialogRef = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<"run" | "snag" | "ready" | "saved">(folder ? "run" : "ready");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(folder ? null : "Name a folder for this tax year first.");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  useDialogFocus(true, dialogRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [onClose]);

  useEffect(() => {
    if (!folder) return;
    let live = true;
    setPhase("run");
    setError(null);
    setDraft(null);
    void postAi({ action: "ai-run", task, folder })
      .then((body) => {
        if (!live) return;
        setDraft({
          markdown: typeof body.markdown === "string" ? body.markdown : undefined,
          rent: typeof body.rent === "string" ? body.rent : undefined,
          guidance: typeof body.guidance === "string" ? body.guidance : undefined,
        });
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof AiUnavailableError) {
          setPhase("snag");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not ask AI.");
        setPhase("ready");
      });
    return () => {
      live = false;
    };
  }, [task, folder]);

  const prompt = harnessPrompt(spec.skill, folder);
  const shown = draft?.guidance || draft?.markdown || "";

  async function save() {
    if (!folder || !draft?.markdown) return;
    setBusy(true);
    setError(null);
    try {
      await postAi({
        action: "ai-save",
        task,
        folder,
        markdown: draft.markdown,
        rent: draft.rent ?? "",
      });
      setPhase("saved");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the report.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    if (await copyText(prompt)) {
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card ai-reorg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-skill-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ai-reorg-head">
          <h2 id="ai-skill-title" className="font-display text-2xl text-stone-900">
            {spec.title}
          </h2>
          <button type="button" className="ai-reorg-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {phase === "run" ? (
          <p className="mt-3 text-stone-700" role="status">
            {spec.doing}
            {folder ? ` Folder sorter/${folder}.` : ""}
          </p>
        ) : null}

        {phase === "snag" ? (
          <div className="ai-reorg-warn" role="note" aria-labelledby="ai-skill-warn-title">
            <p id="ai-skill-warn-title" className="ai-reorg-warn-title">
              <span aria-hidden="true">⚠</span> {AI_UNAVAILABLE_TITLE}
            </p>
            <p>{harnessSnag(spec.skill, folder)}</p>
            <p className="ai-reorg-label">Prompt for the harness</p>
            <span className="harness-help-copyrow">
              <code className="ai-reorg-example">{prompt}</code>
              <button type="button" onClick={() => void copyPrompt()}>
                <Icon name={copied ? "check" : "copy"} />
                <span>Copy</span>
              </button>
            </span>
          </div>
        ) : null}

        {phase === "ready" && shown ? (
          <>
            <p className="mt-3 text-stone-700">
              {task === "walkthrough"
                ? "You still type this on FreeTaxUSA. Nothing here files or pays."
                : "Review this, then save it into the tax-year folder. Nothing is written until you do."}
            </p>
            <pre className="ai-reorg-example mt-3 whitespace-pre-wrap">{shown}</pre>
            {draft?.rent ? (
              <>
                <p className="mt-3 text-sm font-medium text-stone-800">Owe Audit Breakdown - Rent.md</p>
                <pre className="ai-reorg-example mt-1 whitespace-pre-wrap">{draft.rent}</pre>
              </>
            ) : null}
            {task !== "walkthrough" ? (
              <div className="mt-3">
                <button type="button" className="btn-primary" disabled={busy || !folder} onClick={() => void save()}>
                  {busy ? "Saving…" : "Save into the folder"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {phase === "saved" ? <p className="mt-3 text-stone-800">Saved. Refresh shows it in the folder.</p> : null}

        {error ? (
          <p className="mt-2 text-sm text-rust" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
