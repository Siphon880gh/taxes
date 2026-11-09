"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * "Add / edit with AI" helper in the bottom frame's tab strip.
 * This app has no built-in AI (it keeps the app free). The panel points people at this app's folder so they can open it
 * in Cursor, Claude Code or another AI harness and run the local skills with their own tokens. Purely informational.
 * The folder name is fixed here because the static build cannot read its own folder name.
 */
export const APP_FOLDER = "taxes";

const SKILLS = [
  ["tax-document-classification", "sorts the files in sorter/stage/ into tax-prep folders"],
  ["tax-document-summaries", "writes sorter/stage/Summaries.md for a tax professional"],
  ["tax-return-owed-audit", "checks a prepared return and the balance due"],
  ["freetaxusa-walkthrough", "fills FreeTaxUSA from the sorted documents"],
] as const;

export function HarnessHelp() {
  const [open, setOpen] = useState(false);
  const [bottom, setBottom] = useState(0);
  const [status, setStatus] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const strip = toggleRef.current?.closest(".bottom-frames") ?? toggleRef.current;
      if (strip) setBottom(Math.max(0, window.innerHeight - strip.getBoundingClientRect().top) + 8);
    };
    place();
    copyRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(APP_FOLDER);
      setStatus(`Copied “${APP_FOLDER}”. Paste it into system search.`);
    } catch {
      setStatus("Copy failed. Select the folder name and copy it.");
    }
  };

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="harness-help-toggle"
        aria-expanded={open}
        aria-controls="harness-help-panel"
        aria-label="Add or edit with AI: how to use your own AI tool"
        title="Add / edit with AI"
        onClick={() => {
          setStatus("");
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">✦</span> <span className="harness-help-label">Add / edit with AI</span>
        <span className="harness-help-short" aria-hidden="true">AI</span>
      </button>
      {open
        ? createPortal(
            <section
              ref={panelRef}
              id="harness-help-panel"
              className="harness-help-panel"
              role="dialog"
              aria-modal="false"
              aria-labelledby="harness-help-title"
              style={{ bottom, maxHeight: `calc(100vh - ${bottom}px - 0.75rem)` }}
            >
              <div className="harness-help-head">
                <h2 id="harness-help-title">Add or edit with AI</h2>
                <button type="button" className="harness-help-close" aria-label="Close" onClick={close}>
                  ×
                </button>
              </div>
              <p>This app has no built-in AI, which keeps it free. Use the AI tool you already have, with your own tokens:</p>
              <ol>
                <li>
                  Open system search (<kbd>⌘</kbd> <kbd>Space</kbd> for Spotlight on a Mac, or the Windows search box) and find the
                  folder named:
                  <span className="harness-help-copyrow">
                    <code>{APP_FOLDER}</code>
                    <button ref={copyRef} type="button" onClick={copy} aria-label={`Copy folder name ${APP_FOLDER}`}>
                      Copy
                    </button>
                  </span>
                </li>
                <li>
                  Open that folder in <strong>Cursor</strong>, <strong>Claude Code</strong>, or your favorite AI harness.
                </li>
                <li>
                  Put your tax documents in <code>sorter/stage/</code> (or use Document Sorter), then ask it to run a skill
                  from <code>.agents/skills/</code>:
                  <ul>
                    {SKILLS.map(([name, what]) => (
                      <li key={name}>
                        <code>{name}</code>: {what}
                      </li>
                    ))}
                  </ul>
                </li>
              </ol>
              <p className="harness-help-status" role="status" aria-live="polite">
                {status}
              </p>
            </section>,
            document.body,
          )
        : null}
    </>
  );
}
