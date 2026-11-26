"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/harness-help";
import {
  examplePrompt,
  keepParam,
  NO_AI_BODY,
  NO_AI_TITLE,
  parseAiPlan,
  parseAiStatus,
  providerLabel,
  type AiApplyResult,
  type AiPlan,
  type AiStatus,
  UPLOADS_FOLDER,
} from "@/lib/ai-reorganize";
import { copyText } from "@/lib/copy-text";
import { cdCommand, cleanPath, loadHarness, saveHarness, type HarnessMode } from "@/lib/harness-path";
import { sorterFetch } from "@/lib/sorter-client";
import { sorterEndpoint, unreachableMessage } from "@/lib/sorter-endpoint";
import { useDialogFocus } from "@/lib/use-dialog-focus";

/**
 * "Ask AI to reorganize" for the Document Sorter.
 * With an OpenAI or Anthropic key in the app's .env, sorter/api.php proposes a move plan that the user reviews and
 * applies here. Without one (the default), the dialog names the uploads folder and walks the user through doing it
 * with their own AI harness, then refreshing.
 */

type CopyId = "folder" | "prompt" | "out";

export function AiReorganizeDialog({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => Promise<void> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [copied, setCopied] = useState<CopyId | null>(null);
  const [path, setPath] = useState(() => loadHarness("uploadsPath") ?? "");
  const [mode, setMode] = useState<HarnessMode>(() => (loadHarness("uploadsMode") === "command" ? "command" : "path"));
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [kept, setKept] = useState<boolean[]>([]);
  const [result, setResult] = useState<AiApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDialogFocus(true, dialogRef);

  const loadStatus = useCallback(async () => {
    setLoadError(null);
    const endpoint = sorterEndpoint();
    if (!endpoint.ok) {
      setLoadError(endpoint.message);
      return;
    }
    try {
      const response = await sorterFetch(`${endpoint.url}?action=ai-status`);
      const body: unknown = await response.json();
      const parsed = parseAiStatus(body);
      if (!response.ok || !parsed) {
        const message = typeof body === "object" && body && "error" in body ? String(body.error) : "";
        setLoadError(message || "Could not check the AI setup.");
        return;
      }
      setStatus(parsed);
    } catch (err) {
      setLoadError(unreachableMessage(err));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

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

  // Only relative paths come from the app. An absolute path appears only when the user types their own.
  const folder = UPLOADS_FOLDER;
  const own = cleanPath(path);
  const target = own || folder;
  const shown = mode === "command" ? cdCommand(target) : target;
  const prompt = examplePrompt();

  async function copy(id: CopyId, text: string, done: string) {
    if (await copyText(text)) {
      setAnnounce(done);
      setCopied(id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 1600);
    } else {
      setAnnounce("Copy failed. Select the text and copy it.");
    }
  }

  function changePath(value: string) {
    setPath(value);
    saveHarness("uploadsPath", cleanPath(value));
  }

  function changeMode(next: HarnessMode) {
    setMode(next);
    saveHarness("uploadsMode", next);
  }

  function clearPath() {
    setPath("");
    saveHarness("uploadsPath", null);
    inputRef.current?.focus();
    setAnnounce("Saved folder path cleared.");
  }

  async function refreshAll() {
    setBusy(true);
    try {
      await onRefresh();
      await loadStatus();
      setAnnounce("File list refreshed.");
    } finally {
      setBusy(false);
    }
  }

  async function post(fields: Record<string, string>) {
    const endpoint = sorterEndpoint();
    if (!endpoint.ok) throw new Error(endpoint.message);
    const payload = new FormData();
    for (const [key, value] of Object.entries(fields)) payload.append(key, value);
    const response = await sorterFetch(endpoint.url, { method: "POST", body: payload });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok || body.ok !== true) throw new Error(typeof body.error === "string" ? body.error : "The sorter refused that request.");
    return body;
  }

  async function askForPlan() {
    setBusy(true);
    setError(null);
    setResult(null);
    setPlan(null);
    setAnnounce("Asking AI for a plan…");
    try {
      const next = parseAiPlan(await post({ action: "ai-plan" }));
      if (!next) throw new Error("The AI reply was not a move plan. Try again.");
      setPlan(next);
      setKept(next.moves.map(() => true));
      setAnnounce(next.moves.length ? `AI proposed ${next.moves.length} moves. Review them, then apply.` : "AI found nothing to move.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get a plan.");
      setAnnounce("");
    } finally {
      setBusy(false);
    }
  }

  async function applyPlan() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const body = await post({
        action: "ai-apply",
        plan: JSON.stringify(plan.moves.map(({ path: p, category }) => ({ path: p, category }))),
        token: plan.token,
        keep: keepParam(kept),
      });
      const applied: AiApplyResult = {
        moved: Array.isArray(body.moved) ? (body.moved as AiApplyResult["moved"]) : [],
        failed: Array.isArray(body.failed) ? (body.failed as AiApplyResult["failed"]) : [],
      };
      setResult(applied);
      setPlan(null);
      await onRefresh();
      setAnnounce(`Moved ${applied.moved.length} ${applied.moved.length === 1 ? "document" : "documents"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the plan.");
    } finally {
      setBusy(false);
    }
  }

  const keptCount = kept.filter(Boolean).length;

  // A render helper, not a nested component, so the button keeps focus when the icon swaps.
  function copyButton(id: CopyId, text: string, label: string, done: string) {
    return (
      <button key={id} type="button" disabled={!text} aria-label={label} onClick={() => void copy(id, text, done)}>
        <Icon name={copied === id ? "check" : "copy"} />
        <span>Copy</span>
      </button>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card ai-reorg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-reorg-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ai-reorg-head">
          <h2 id="ai-reorg-title" className="font-display text-2xl text-stone-900">
            Ask AI to reorganize
          </h2>
          <button type="button" className="ai-reorg-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {!status && !loadError ? <p className="mt-3 text-stone-700">Checking the AI setup…</p> : null}
        {loadError ? (
          <p className="mt-3 text-sm text-rust" role="alert">
            {loadError}
          </p>
        ) : null}

        {status && !status.configured ? (
          <>
            <div className="ai-reorg-warn" role="note" aria-labelledby="ai-reorg-warn-title">
              <p id="ai-reorg-warn-title" className="ai-reorg-warn-title">
                <span aria-hidden="true">⚠</span> {NO_AI_TITLE}
              </p>
              <p>{NO_AI_BODY}</p>
              <p className="ai-reorg-label">Uploads folder (inside this app&apos;s folder)</p>
              <span className="harness-help-copyrow">
                <code className="ai-reorg-path">{folder}</code>
                {copyButton("folder", folder, "Copy the uploads folder path", "Copied the uploads folder path.")}
              </span>
            </div>

            <ol className="ai-reorg-steps">
              <li>Open this app&apos;s folder in Cursor, Claude Code or another AI harness. AGENTS.md at the app root tells it how documents in <code>{UPLOADS_FOLDER}</code> should be sorted.</li>
              <li>
                Ask it to reorganize the tax documents. Example prompt (yours can differ):
                <span className="harness-help-copyrow">
                  <code className="ai-reorg-example">{prompt}</code>
                  {copyButton("prompt", prompt, "Copy the example prompt", "Copied the example prompt.")}
                </span>
              </li>
              <li>
                Refresh the app to see the new folders.{" "}
                <button type="button" className="btn-secondary ai-reorg-refresh" disabled={busy} onClick={() => void refreshAll()}>
                  Refresh
                </button>
              </li>
            </ol>

            <section className="ai-reorg-section" aria-labelledby="ai-reorg-path-title">
              <h3 id="ai-reorg-path-title" className="ai-reorg-subhead">
                Folder path and command
              </h3>
              <p className="harness-help-hint">
                If your copy of this folder is somewhere else (for example the app runs on a server), this browser can remember
                its path, so next time you can copy the path or a ready-made <code>cd</code> command. It is saved only in this
                browser.
              </p>
              <label className="harness-help-field-label" htmlFor="ai-reorg-path-input">
                Your uploads folder (optional)
              </label>
              <span className="harness-help-copyrow">
                <input
                  ref={inputRef}
                  id="ai-reorg-path-input"
                  className="harness-help-input"
                  value={path}
                  placeholder="/Users/you/…/sorter"
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => changePath(event.target.value)}
                />
                <button type="button" disabled={!path} onClick={clearPath}>
                  <Icon name="clear" />
                  <span>Clear</span>
                </button>
              </span>
              <p className="harness-help-hint">
                Mac: right-click the folder in Finder, hold Option, choose Copy as Pathname. Windows: Shift + right-click, choose
                Copy as path.
              </p>
              <div className="ai-reorg-switchrow">
                <span className={mode === "path" ? "is-on" : undefined} onClick={() => changeMode("path")}>
                  Path
                </span>
                <button
                  type="button"
                  role="switch"
                  className="ai-reorg-switch"
                  aria-checked={mode === "command"}
                  aria-label="Show as a cd command"
                  onClick={() => changeMode(mode === "command" ? "path" : "command")}
                />
                <span className={mode === "command" ? "is-on" : undefined} onClick={() => changeMode("command")}>
                  Command
                </span>
              </div>
              <span className="harness-help-copyrow">
                <code className="ai-reorg-path" aria-live="polite">
                  {shown}
                </code>
                {copyButton(
                  "out",
                  shown,
                  mode === "command" ? "Copy the cd command" : "Copy the folder path",
                  mode === "command" ? "Copied the cd command. Paste it into a terminal." : "Copied the folder path.",
                )}
              </span>
              <p className="harness-help-hint">
                {mode === "command"
                  ? own
                    ? "Example command: paste it into a terminal, then start your AI harness there (for example claude)."
                    : "Example command, run from this app's folder. Save your own path above for one that works from anywhere."
                  : "Paste the path into your AI tool’s Open Folder, or switch to Command for a cd line."}
              </p>
            </section>

            <details className="why-not-auto">
              <summary className="why-not-auto__summary">
                <span className="why-not-auto__icon" aria-hidden="true">i</span>
                Why there is no built-in AI
              </summary>
              <div className="why-not-auto__body">
                <p>
                  The app is free and cannot cover the ongoing cost of AI tokens, so by default it has no AI or billing set up.
                  Your own AI harness does the reorganizing with tokens you already have.
                </p>
                <p>
                  To ask AI from inside the app instead, put an <code>OPENAI_API_KEY</code> (ChatGPT) or{" "}
                  <code>ANTHROPIC_API_KEY</code> (Claude) in the app&apos;s <code>.env</code> (see <code>.example.env</code>). This
                  dialog then proposes moves for you to review and apply.
                </p>
              </div>
            </details>
          </>
        ) : null}

        {status && status.configured ? (
          <>
            <p className="mt-3 text-stone-700">
              Uses {providerLabel(status.provider)}, model {status.model}. AI sees the file names and folders in{" "}
              <code className="break-all">{UPLOADS_FOLDER}</code>, proposes moves, and nothing moves until you apply them.
            </p>
            {!plan ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={busy} onClick={() => void askForPlan()}>
                  {busy ? "Asking AI…" : "Propose a reorganization"}
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void refreshAll()}>
                  Refresh
                </button>
              </div>
            ) : (
              <form
                className="mt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void applyPlan();
                }}
              >
                {plan.summary ? <p className="text-stone-800">{plan.summary}</p> : null}
                {plan.skipped > 0 ? (
                  <p className="text-sm text-stone-600">
                    Left out {plan.skipped} suggested {plan.skipped === 1 ? "move" : "moves"} that named an unknown file or an unusable folder.
                  </p>
                ) : null}
                {plan.moves.length === 0 ? (
                  <p className="mt-2 text-stone-700">Nothing to move. Every document already looks sorted.</p>
                ) : (
                  <fieldset className="ai-reorg-plan">
                    <legend className="text-sm font-medium text-stone-800">Proposed moves (uncheck any to skip)</legend>
                    <ul>
                      {plan.moves.map((move, index) => (
                        <li key={move.path}>
                          <label>
                            <input
                              type="checkbox"
                              checked={kept[index] ?? false}
                              disabled={busy}
                              onChange={(event) => setKept((list) => list.map((on, i) => (i === index ? event.target.checked : on)))}
                            />
                            <span>
                              <span className="break-all font-medium text-stone-900">{move.path}</span>
                              <span className="text-stone-600"> → </span>
                              <span className="break-all text-stone-900">{move.category}/</span>
                              {move.reason ? <span className="block text-sm text-stone-600">{move.reason}</span> : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {plan.moves.length > 0 ? (
                    <button type="submit" className="btn-primary" disabled={busy || keptCount === 0}>
                      Apply {keptCount} {keptCount === 1 ? "move" : "moves"}
                    </button>
                  ) : null}
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPlan(null)}>
                    Discard plan
                  </button>
                </div>
              </form>
            )}
            {result ? (
              <div className="mt-3 text-stone-800">
                <p>
                  Moved {result.moved.length} {result.moved.length === 1 ? "document" : "documents"}.
                </p>
                {result.failed.length > 0 ? (
                  <ul className="mt-1 text-sm text-rust">
                    {result.failed.map((item) => (
                      <li key={item.path}>
                        {item.path}: {item.error}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {error ? (
          <p className="mt-2 text-sm text-rust" role="alert">
            {error}
          </p>
        ) : null}
        <p className="ai-reorg-status" role="status" aria-live="polite">
          {announce}
        </p>
        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
