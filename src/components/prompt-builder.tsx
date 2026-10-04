"use client";

import { useEffect, useState } from "react";
import { ShortcutText, useShortcut } from "@/components/shortcut-layer";
import type { GraphNode } from "@/lib/graph/types";

const CHATGPT_URL = "https://chatgpt.com/";
const CLAUDE_URL = "https://claude.ai/new";

export function PromptBuilder({
  node,
  prompt,
  onClose,
  onApply,
}: {
  node: GraphNode;
  prompt: string;
  onClose: () => void;
  onApply: (raw: string) => void;
}) {
  const [step, setStep] = useState<"build" | "import">("build");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const explanation = node.prompt || node.help || node.chart;

  useEffect(() => {
    setStep("build");
    setDraft("");
    setError(null);
    setCopied(false);
  }, [node.id]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function openIn(url: string) {
    void copyPrompt().then(() => window.open(url, "_blank", "noopener,noreferrer"));
  }

  useShortcut("copy-prompt", "y", "Copy prompt", 3, () => void copyPrompt(), step === "build");
  useShortcut("open-chatgpt", "g", "ChatGPT", 4, () => openIn(CHATGPT_URL), step === "build");
  useShortcut("prompt-back", "k", "Back", 3, () => { setStep("build"); setError(null); }, step === "import");
  useShortcut("prompt-next", "j", "Next: Import JSON", 13, () => { setError(null); setStep("import"); }, step === "build");

  function apply() {
    try {
      onApply(draft);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That reply is not a chart answer.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card prompt-builder" role="dialog" aria-modal="true" aria-labelledby="prompt-builder-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="prompt-builder-title" className="font-display text-2xl text-stone-900">
          {step === "build" ? "Prompt Builder" : "Import JSON"}
        </h2>
        {step === "build" ? (
          <>
            <p className="mt-3 text-sm text-stone-600">
              Explanation about <span className="prompt-chip">{node.title}</span>
            </p>
            <p className="mt-2 text-stone-800">{explanation}</p>
            <p className="mt-4 text-sm font-medium text-stone-700">Dynamic Prompt Preview</p>
            <pre className="prompt-preview mt-2">{prompt}</pre>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-secondary" onClick={() => void copyPrompt()}>
                {copied ? "Copied" : <ShortcutText text="Copy prompt" index={3} />}
              </button>
              <span className="text-sm text-stone-600">Open in</span>
              <button type="button" className="prompt-service" onClick={() => openIn(CHATGPT_URL)}>
                <ChatGptMark /> <ShortcutText text="ChatGPT" index={4} />
              </button>
              <button type="button" className="prompt-service" onClick={() => openIn(CLAUDE_URL)}>
                <ClaudeMark /> Claude
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-stone-700">
              Paste the JSON the model returned for {node.title}. One answer for this box is applied. A full session file replaces the chart. Anything else is left unused.
            </p>
            <label className="mt-3 block text-sm font-medium text-stone-700" htmlFor="prompt-json">
              JSON
            </label>
            <textarea
              id="prompt-json"
              className="mt-1 min-h-40 w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-900"
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            {error ? (
              <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
                {error}
              </p>
            ) : null}
          </>
        )}
        <div className="prompt-footer">
          <button type="button" className="btn-secondary" onClick={step === "import" ? () => { setStep("build"); setError(null); } : onClose}>
            {step === "import" ? <ShortcutText text="Back" index={3} /> : "Cancel"}
          </button>
          {step === "build" ? (
            <button type="button" className="btn-primary" onClick={() => { setError(null); setStep("import"); }}>
              <ShortcutText text="Next: Import JSON" index={13} />
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={apply}>
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatGptMark() {
  return (
    <svg className="prompt-service-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="#10a37f" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.4" fill="#10a37f" />
    </svg>
  );
}

function ClaudeMark() {
  return (
    <svg className="prompt-service-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="#d97757" d="M8 1.2 9.1 6 14 7.2 9.1 8.4 8 13.2 6.9 8.4 2 7.2 6.9 6z" />
    </svg>
  );
}
