"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  cdCommand,
  cleanPath,
  loadHarness,
  saveHarness,
  type HarnessMode,
  type HarnessTile,
} from "@/lib/harness-path";

/**
 * "Add / edit with AI" helper in the bottom frame's tab strip.
 * This app has no built-in AI (it keeps the app free). The panel points people at this app's folder so they can open it
 * in Cursor, Claude Code or another AI harness and run the local skills with their own tokens. Purely informational.
 * The folder name is fixed here because the static build cannot read its own folder name.
 * Two accordion tiles (one open at a time): how it works, and a folder path this browser remembers, shown as the path
 * or a cd command. Path, mode and last-opened tile persist in localStorage under harnessAi:app/taxes:*.
 */
export const APP_FOLDER = "taxes";

/**
 * Tile 1 says plainly what this panel feeds the app: primary input (its main content), complete (main content already
 * generated and shipped; more is optional) or supplementary (an optional extra).
 */
const INPUT_ROLE: "primary" | "complete" | "supplementary" = "primary";
const ROLE_BADGE = { primary: "Primary", complete: "Complete · add more", supplementary: "Supplementary" } as const;
const INPUT_WHAT = (
  <>
    your tax documents (W-2s, 1099s, receipts and statements) placed in <code>sorter/stage/</code>
  </>
);

const SKILLS = [
  ["tax-document-classification", "sorts the files in sorter/stage/ into tax-prep folders"],
  ["tax-document-summaries", "writes sorter/stage/Summaries.md for a tax professional"],
  ["tax-return-owed-audit", "checks a prepared return and the balance due"],
  ["freetaxusa-walkthrough", "fills FreeTaxUSA from the sorted documents"],
] as const;

export type IconName = "copy" | "check" | "clear";
const ICON_PATHS: Record<IconName, ReactNode> = {
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  clear: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="harness-help-ico"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export function HarnessHelp() {
  const [open, setOpen] = useState(false);
  const [bottom, setBottom] = useState(0);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState<"folder" | "out" | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstTileRef = useRef<HTMLButtonElement>(null);
  const focusTileRef = useRef<HarnessTile | null>("about");
  const [tile, setTile] = useState<HarnessTile | null>("about");
  const [path, setPath] = useState("");
  const [mode, setMode] = useState<HarnessMode>("path");

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const strip = toggleRef.current?.closest(".bottom-frames") ?? toggleRef.current;
      if (strip) setBottom(Math.max(0, window.innerHeight - strip.getBoundingClientRect().top) + 8);
    };
    place();
    const focusTarget =
      focusTileRef.current === "path" ? inputRef : focusTileRef.current === "about" ? copyRef : firstTileRef;
    focusTarget.current?.focus({ preventScroll: true });
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

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const flashCopied = (which: "folder" | "out") => {
    setCopied(which);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 1600);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(APP_FOLDER);
      setStatus(`Copied “${APP_FOLDER}”. Paste it into system search.`);
      flashCopied("folder");
    } catch {
      setStatus("Copy failed. Select the folder name and copy it.");
    }
  };

  const clean = cleanPath(path);
  const shown = mode === "command" ? cdCommand(clean) : clean;

  const copyShown = async () => {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown);
      setStatus(
        mode === "command"
          ? "Copied the cd command. Paste it into a terminal."
          : "Copied the folder path. Paste it into your AI tool’s Open Folder.",
      );
      flashCopied("out");
    } catch {
      setStatus("Copy failed. Select the text and copy it.");
    }
  };

  const openPanel = () => {
    const saved = loadHarness("openTile");
    const nextTile: HarnessTile = saved === "path" ? "path" : "about";
    focusTileRef.current = nextTile;
    setTile(nextTile);
    setPath(loadHarness("path") ?? "");
    setMode(loadHarness("mode") === "command" ? "command" : "path");
    setStatus("");
    setOpen(true);
  };

  const toggleTile = (name: HarnessTile) => {
    if (tile === name) {
      setTile(null); // collapsing keeps the last opened tile remembered
      return;
    }
    setTile(name);
    saveHarness("openTile", name);
  };

  const changePath = (value: string) => {
    setPath(value);
    saveHarness("path", cleanPath(value));
  };

  const changeMode = (next: HarnessMode) => {
    setMode(next);
    saveHarness("mode", next);
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
          if (open) setOpen(false);
          else openPanel();
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
              <div className="harness-help-acc">
                <h3>
                  <button
                    ref={firstTileRef}
                    type="button"
                    id="harness-help-t-about"
                    className="harness-help-tile"
                    aria-expanded={tile === "about"}
                    aria-controls="harness-help-p-about"
                    onClick={() => toggleTile("about")}
                  >
                    <span>How to add or edit with AI</span>
                    <svg className="harness-help-chev" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </h3>
                <div
                  id="harness-help-p-about"
                  className="harness-help-body"
                  role="region"
                  aria-labelledby="harness-help-t-about"
                  hidden={tile !== "about"}
                >
                  <p className="harness-help-role">
                    <span className={`harness-help-badge harness-help-badge--${INPUT_ROLE}`}>{ROLE_BADGE[INPUT_ROLE]}</span>{" "}
                    {INPUT_ROLE === "primary" ? (
                      <>This is where the app’s main content comes from: {INPUT_WHAT}.</>
                    ) : INPUT_ROLE === "complete" ? (
                      <>This app’s main content is complete: {INPUT_WHAT}. You can still generate more if you want.</>
                    ) : (
                      <>Optional extra: {INPUT_WHAT} the app can use to do more.</>
                    )}
                  </p>
                  <p>This app has no built-in AI, which keeps it free. Use the AI tool you already have, with your own tokens:</p>
                  <ol>
                    <li>
                      Open system search (<kbd>⌘</kbd> <kbd>Space</kbd> for Spotlight on a Mac, or the Windows search box) and find the
                      folder named:
                      <span className="harness-help-copyrow">
                        <code>{APP_FOLDER}</code>
                        <button ref={copyRef} type="button" onClick={copy} aria-label={`Copy folder name ${APP_FOLDER}`}>
                          <Icon name={copied === "folder" ? "check" : "copy"} />
                          <span>Copy</span>
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
                  <p className="harness-help-hint">
                    Tip: save the folder path under <strong>Your folder path</strong> so you can skip the search next time.
                  </p>
                </div>
                <h3>
                  <button
                    type="button"
                    id="harness-help-t-path"
                    className="harness-help-tile"
                    aria-expanded={tile === "path"}
                    aria-controls="harness-help-p-path"
                    onClick={() => toggleTile("path")}
                  >
                    <span>Your folder path</span>
                    <svg className="harness-help-chev" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </h3>
                <div
                  id="harness-help-p-path"
                  className="harness-help-body"
                  role="region"
                  aria-labelledby="harness-help-t-path"
                  hidden={tile !== "path"}
                >
                  <p>
                    We can remember your folder path for you here, so next time you can copy it, or a ready-made{" "}
                    <code>cd</code> command, without searching. It stays in this browser only.
                  </p>
                  <label className="harness-help-field-label" htmlFor="harness-help-path">
                    Full path to your <code>{APP_FOLDER}</code> folder
                  </label>
                  <span className="harness-help-copyrow">
                    <input
                      ref={inputRef}
                      id="harness-help-path"
                      className="harness-help-input"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder={`/Users/you/…/${APP_FOLDER}`}
                      value={path}
                      onChange={(event) => changePath(event.target.value)}
                    />
                    <button
                      type="button"
                      aria-label="Clear saved folder path"
                      onClick={() => {
                        changePath("");
                        setStatus("Cleared the saved folder path.");
                        inputRef.current?.focus();
                      }}
                    >
                      <Icon name="clear" />
                      <span>Clear</span>
                    </button>
                  </span>
                  <p className="harness-help-hint">
                    Mac: right-click the folder in Finder, hold <kbd>Option</kbd>, choose <em>Copy … as Pathname</em>.
                    Windows: <kbd>Shift</kbd> + right-click, <em>Copy as path</em>.
                  </p>
                  <div className="harness-help-switchrow">
                    <span className={mode === "path" ? "is-on" : undefined} onClick={() => changeMode("path")}>
                      Path
                    </span>
                    <button
                      type="button"
                      role="switch"
                      className="harness-help-switch"
                      aria-checked={mode === "command"}
                      aria-label="Show as a cd command"
                      onClick={() => changeMode(mode === "command" ? "path" : "command")}
                    />
                    <span className={mode === "command" ? "is-on" : undefined} onClick={() => changeMode("command")}>
                      Command
                    </span>
                  </div>
                  <span className="harness-help-copyrow">
                    <code className={shown ? "harness-help-out" : "harness-help-out is-empty"} aria-live="polite">
                      {shown || "Type or paste the folder path above."}
                    </code>
                    <button type="button" disabled={!shown} onClick={copyShown}>
                      <Icon name={copied === "out" ? "check" : "copy"} />
                      <span>Copy</span>
                    </button>
                  </span>
                  {shown ? (
                    <p className="harness-help-hint">
                      {mode === "command"
                        ? "Paste the command into a terminal, then start your AI harness there (for example claude)."
                        : "Paste the path into your AI tool’s Open Folder, or switch to Command for a cd line."}
                    </p>
                  ) : null}
                </div>
              </div>
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
