"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MermaidView } from "@/components/mermaid-view";
import { DocumentSorter, SUMMARIES_SKILL_NOTE } from "@/components/document-sorter";
import { OwedAuditPanel } from "@/components/owed-audit-panel";
import { PromptBuilder } from "@/components/prompt-builder";
import { HarnessHelp } from "@/components/harness-help";
import { FlowNext, StartPanel } from "@/components/start-panel";
import { pickShortcutLetter, ShortcutLayer, ShortcutText, ShortcutTip, useShortcut } from "@/components/shortcut-layer";
import { decodeNumbers, encodeNumbers, numberEntryError, suggestionText } from "@/lib/graph/allocate";
import { DISCLAIMER } from "@/lib/disclaimer";
import { readStoredQuote, writeStoredQuote } from "@/lib/quote-storage";
import { clearStoredSession, readStoredSession, writeStoredSession } from "@/lib/session-storage";
import { documentCoverage } from "@/lib/document-coverage";
import { auditTab } from "@/lib/owed-reports";
import { CHECKLIST_LEDE, flowSegments, PANEL_LEDES, rememberedRoute, ROUTE_LEADS, ROUTE_STORAGE_KEY, showsPath, spokenPrefix, type FrameMode } from "@/lib/flow";
import { useOwedReports } from "@/lib/use-owed-reports";
import type { PdfHints } from "@/lib/pdf-hints";
import {
  checklistMarkdown,
  checklistProgress,
  confirmedFromExport,
  readConfirmed,
  confirmedForYear,
  toggleConfirmedForYear,
  writeConfirmed,
} from "@/lib/checklist-progress";
import {
  applyAnswer,
  applyCase,
  addInstance,
  blankSession,
  buildChecklist,
  caseStudies,
  checklistTitle,
  costReport,
  deductionNarrative,
  edgeTips,
  chartView,
  getNode,
  mermaidSource,
  applyNodeReply,
  nodePrompt,
  openQuestions,
  importSession,
  parseQuoteAmount,
  instanceScope,
  readAnswer,
  readComment,
  removeInstance,
  renameInstance,
  repeatableNodes,
  selectInstance,
  setNodeComment,
  setQuote,
  tips,
  visibleCommentNodeIds,
} from "@/lib/graph";
import { answerOf, sessionFile } from "@/lib/graph/session";
import { parseYear } from "@/lib/graph/thresholds";
import { isTaxYearId, TAX_YEARS, taxYearLabel } from "@/lib/graph/tax-years";
import { onTabListKeyDown } from "@/lib/tablist-keys";
import type { GraphNode, Session, TipBody } from "@/lib/graph/types";


function visibleChartId(ids: readonly string[], groups: { id: string; memberIds: string[] }[], id: string): string | null {
  if (ids.includes(id)) return id;
  const group = groups.find((item) => item.memberIds.includes(id));
  return group && ids.includes(group.id) ? group.id : null;
}

function fitCurrentIds(
  ids: readonly string[],
  groups: { id: string; memberIds: string[] }[],
  chartEdges: { from: string; to: string }[],
  id: string,
  extra: readonly string[] = [],
): string[] {
  const raw = new Set<string>([id, ...extra]);
  for (const edge of chartEdges) {
    if (edge.to === id) raw.add(edge.from);
    if (edge.from === id) raw.add(edge.to);
  }
  const shown = new Set<string>();
  for (const item of raw) {
    const visible = visibleChartId(ids, groups, item);
    if (visible) shown.add(visible);
  }
  return [...shown];
}

function AnswerChoice({
  choiceId,
  label,
  className,
  pressed,
  shortcut,
  onPick,
}: {
  choiceId: string;
  label: string;
  className: string;
  pressed: boolean;
  shortcut: { key: string; index: number } | null;
  onPick: () => void;
}) {
  useShortcut(`answer-${choiceId}`, shortcut?.key ?? "", label, shortcut?.index ?? 0, onPick, Boolean(shortcut));
  return (
    <button type="button" aria-pressed={pressed} className={className} onClick={onPick}>
      <ShortcutText text={label} index={shortcut ? shortcut.index : -1} />
    </button>
  );
}

function asksForAnswer(node: GraphNode): boolean {
  return node.kind === "question" && Boolean(node.answers?.length || node.textInput || node.numberInputs);
}

function panelForNode(node: GraphNode): "answer" | "comments" {
  if (asksForAnswer(node) || node.tipId || node.kind === "check") return "answer";
  return "comments";
}

function AnswerMark({ answered }: { answered: boolean }) {
  return (
    <svg className={answered ? "node-pill-check is-done" : "node-pill-check"} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M4.6 8.2 6.9 10.5 11.4 5.7" />
    </svg>
  );
}

function NumberEntry({
  nodeId,
  fields,
  initial,
  enabled,
  onSubmit,
}: {
  nodeId: string;
  fields: { id: string; label: string; optional?: boolean }[];
  initial: string;
  enabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [values, setValues] = useState(() => decodeNumbers(initial));
  const [error, setError] = useState<string | null>(null);
  function submit() {
    const text = encodeNumbers(values);
    const problem = numberEntryError(nodeId, text);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSubmit(text);
  }
  useShortcut("use-answer", "u", "Use this answer", 0, submit, enabled);
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {fields.map((field) => (
        <label key={field.id} className="flex flex-col gap-1 text-sm font-medium text-stone-700" htmlFor={`node-number-${field.id}`}>
          {field.optional ? `${field.label} (optional)` : field.label}
          <input
            id={`node-number-${field.id}`}
            inputMode="decimal"
            className="rounded-md border border-stone-300 bg-white px-3 py-2 font-normal text-stone-900"
            value={values[field.id] ?? ""}
            onChange={(event) => {
              setError(null);
              setValues((current) => ({ ...current, [field.id]: event.target.value }));
            }}
          />
        </label>
      ))}
      {error ? (
        <p className="text-sm text-rust" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary">
        <ShortcutText text="Use this answer" index={enabled ? 0 : -1} />
      </button>
    </form>
  );
}


/** "$834" or "$834–$959" for a low/high pair. */
function dollarSpan(low: number, high: number): string {
  const fmt = (amount: number) => `$${amount.toLocaleString("en-US")}`;
  return low === high ? fmt(low) : `${fmt(low)}–${fmt(high)}`;
}

function tipBody(tipId: string, session: Session): TipBody | null {
  const tip = tips[tipId];
  if (!tip?.readMore) return null;
  return tip.readMore({
    year: parseYear(answerOf(session, "year")),
    quote: session.quote,
    caseStudyId: session.caseStudyId,
  });
}

function DockInfo({ tipId, session }: { tipId: string; session: Session }) {
  const body = tipBody(tipId, session);
  const tip = tips[tipId];
  if (!body) {
    return <p className="mt-3 text-stone-800">{tip?.toast ?? "No note is stored for this box."}</p>;
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-stone-800">{body.title}</h3>
      {body.paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-stone-800">{paragraph}</p>
      ))}
      {body.bullets?.length ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-stone-800">
          {body.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {body.citations.map((citation) => (
        <a key={citation.url} className="text-sm text-rust underline-offset-2 hover:underline" href={citation.url} target="_blank" rel="noreferrer">
          {citation.title}
          <span className="text-stone-500"> · {citation.yearLabel}</span>
        </a>
      ))}
    </div>
  );
}

export function CheckerApp() {
  const [session, setSession] = useState<Session>(() => blankSession());
  const [selectedId, setSelectedId] = useState<string>("filing_status");
  const [toastId, setToastId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [modalId, setModalId] = useState<string | null>(null);
  const [frameMode, setFrameMode] = useState<FrameMode>("start");
  /** Owed Audit.md and Owe Audit Breakdown - Rent.md in sorter/stage; the Return & Owe Audit tab is grayed out without them. */
  const owedReports = useOwedReports();
  const auditState = auditTab(owedReports.state);
  /** Shown at the top of the panel after the grayed-out tab is pressed, until dismissed or the tab opens. */
  const [auditHint, setAuditHint] = useState<string | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  /** Files in sorter/stage as of the Document Sorter's last refresh; null until it has listed them. */
  const [stagedPaths, setStagedPaths] = useState<string[] | null>(null);
  /** Form names read inside the staged PDFs (sorter/api.php pdf-hints), by staged path. */
  const [pdfHints, setPdfHints] = useState<PdfHints>({});
  const [sorterReminder, setSorterReminder] = useState(false);
  const [suggestSummaries, setSuggestSummaries] = useState(false);
  const [chartToolsNode, setChartToolsNode] = useState<HTMLDivElement | null>(null);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [owedDialog, setOwedDialog] = useState(false);
  const [levelExpanded, setLevelExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [libraryStuck, setLibraryStuck] = useState(false);
  const librarySentinel = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const framesRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  /** Right-hand sheet: the selected node's answer, its comment, or Forms Needed. */
  const [sidePanel, setSidePanel] = useState<null | "answer" | "comments" | "forms">(null);
  const lastPanel = useRef<"answer" | "comments" | "forms">("answer");
  if (sidePanel) lastPanel.current = sidePanel;
  const panelMode = sidePanel ?? lastPanel.current;
  const focusPanel = useRef(false);
  const [infoFocus, setInfoFocus] = useState(0);
  /** After a route change: the page goes back to the top and focus moves to the new route's heading or panel. */
  const [routeFocus, setRouteFocus] = useState<{ key: number; target: "guide" | "panel" | "question" | "node" } | null>(null);
  const routePanelRef = useRef<HTMLElement>(null);
  const [fitFocus, setFitFocus] = useState<{ key: number; ids: string[]; answeredId: string } | null>(null);
  const fitFocusKey = useRef(0);
  function toggleSide(next: "answer" | "comments" | "forms") {
    setSidePanel((current) => {
      if (current === next) return null;
      focusPanel.current = true;
      return next;
    });
  }

  function focusRoute(target: "guide" | "panel" | "question" | "node") {
    setRouteFocus((current) => ({ key: (current?.key ?? 0) + 1, target }));
  }

  function showFrame(mode: FrameMode) {
    if (showsPath(mode)) {
      openGuide();
      return;
    }
    setFrameMode(mode);
    focusRoute("panel");
  }

  /**
   * Guide me on forms (route 2c): the path chart and its Path library. Nothing is picked for you: the side
   * panel opens when a box is clicked (or "Answer next" is pressed). Focus lands on the guide's heading.
   */
  function openGuide() {
    setAuditHint(null);
    if (!showsPath(frameMode) && sidePanel !== "forms") setSidePanel(null);
    setFrameMode("guide");
    focusRoute("guide");
  }

  /** "Answer next: Filing status": the guide with that box picked and its answer panel open. */
  function answerNext(id: string | undefined) {
    if (!id) {
      openGuide();
      return;
    }
    setAuditHint(null);
    setFrameMode("guide");
    setSelectedId(id);
    setSidePanel(panelForNode(getNode(id)));
    setLevelExpanded(false);
    setTopCollapsed(true);
    focusRoute("question");
  }

  /** The grayed-out tab checks again first (the skill may have just written the file), then opens or explains. */
  async function openAuditTab() {
    if (!auditState.disabled) {
      setAuditHint(null);
      showFrame("audit");
      return;
    }
    const after = auditTab(await owedReports.refresh());
    if (after.disabled) {
      setAuditHint(after.hint);
    } else {
      setAuditHint(null);
      showFrame("audit");
    }
  }

  // The reports went away while their tab was open (moved, deleted, or the sorter stopped answering):
  // fall back to the Document Sorter, where the returns go, and say why.
  if (frameMode === "audit" && auditState.disabled) {
    setFrameMode("sorter");
    setAuditHint(auditState.hint);
  }


  const view = useMemo(() => chartView(session, expandedGroups), [session, expandedGroups]);
  const source = useMemo(() => mermaidSource(session, expandedGroups), [session, expandedGroups]);
  const instancePagers = useMemo(
    () =>
      view.ids.flatMap((nodeId) => {
        const names = session.instances[nodeId] ?? [];
        if (names.length < 2) return [];
        return [{
          nodeId,
          activeIndex: Math.min(session.activeInstance[nodeId] ?? 0, names.length - 1),
          names,
          label: repeatableNodes[nodeId]?.singular ?? getNode(nodeId).title,
        }];
      }),
    [session.activeInstance, session.instances, view.ids],
  );
  const checklist = useMemo(() => buildChecklist(session), [session]);
  /** Ticks for the selected tax year only; every year's ticks stay saved and in Export. */
  const confirmedHere = useMemo(() => confirmedForYear(confirmed, answerOf(session, "year")), [confirmed, session]);
  const checklistStats = checklistProgress(checklist, confirmedHere);
  const coverage = useMemo(() => documentCoverage(session, stagedPaths ?? [], pdfHints), [session, stagedPaths, pdfHints]);
  const cost = useMemo(() => costReport(session), [session]);
  const deduction = useMemo(() => deductionNarrative(session), [session]);
  const open = openQuestions(session);
  const selected = session.revealed.includes(selectedId) ? getNode(selectedId) : null;
  const selectedComment = selected ? readComment(session, selected.id) : undefined;
  const repeatable = selected ? repeatableNodes[selected.id] : null;
  const instances = selected ? session.instances[selected.id] ?? [] : [];
  const stored = selected ? readAnswer(session, selected.id) : undefined;
  const study = caseStudies.find((item) => item.id === session.caseStudyId) ?? null;
  const toast = toastId ? tips[toastId] : null;
  const modal = modalId ? tipBody(modalId, session) : null;

  const nodeLevels = useMemo(() => {
    const levels = new Map<string, number>([["year", 0]]);
    const queue = ["year"];
    const outgoing = view.edges;
    while (queue.length) {
      const from = queue.shift()!;
      const level = levels.get(from)!;
      for (const edge of outgoing) {
        if (edge.from !== from || levels.has(edge.to)) continue;
        levels.set(edge.to, level + 1);
        queue.push(edge.to);
      }
    }
    for (const id of view.ids) {
      if (!levels.has(id)) levels.set(id, 0);
    }
    return levels;
  }, [view]);
  const selectedLevel = selectedId ? nodeLevels.get(selectedId) ?? 0 : 0;
  const levelNodes = view.ids.filter((id) => (nodeLevels.get(id) ?? 0) === selectedLevel);
  const yearAnswer = answerOf(session, "year");
  const returnYear = taxYearLabel(yearAnswer) ?? "Not selected";

  useEffect(() => {
    setDraft(readAnswer(session, selectedId)?.text ?? "");
  }, [selectedId, session]);

  // After a route change: scroll to the new route and move focus to its heading (or the picked question).
  useEffect(() => {
    if (!routeFocus) return;
    const frame = requestAnimationFrame(() => {
      if (routeFocus.target === "node") {
        // The answer panel just opened over the bottom of the page: keep the picked box in the strip of chart left
        // between the sticky Path library and the panel. Focus stays where the click left it.
        // Waits a beat for the page's bottom padding to grow with the panel, or there is no room to scroll into.
        window.setTimeout(() => {
          const node = document.querySelector("svg g.node.is-selected");
          const frames = document.querySelector(".bottom-frames");
          const stack = document.querySelector(".library-stack");
          if (!node || !frames) return;
          const box = node.getBoundingClientRect();
          const top = stack && getComputedStyle(stack).position === "sticky" ? stack.getBoundingClientRect().bottom : 0;
          const bottom = frames.getBoundingClientRect().top;
          if (box.top < top || box.bottom > bottom) window.scrollBy({ top: box.top - (top + bottom - box.height) / 2 });
        }, 80);
        return;
      }
      if (routeFocus.target === "question") {
        document.getElementById("question-heading")?.focus({ preventScroll: true });
        return;
      }
      // Path guide starts at its own heading, so the Path library and the chart come right after it (on a phone the
      // header alone is a screen tall); the other routes start at the top of the page.
      const guide = routeFocus.target === "guide" ? document.getElementById("guide-heading") : null;
      if (guide) guide.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
      (guide ?? routePanelRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [routeFocus]);

  // Remember whether Path guide was open, so a reload comes back to it (other routes start at Start here).
  const routeRestored = useRef(false);
  useEffect(() => {
    if (routeRestored.current) return;
    routeRestored.current = true;
    try {
      setFrameMode(rememberedRoute(window.localStorage.getItem(ROUTE_STORAGE_KEY)));
    } catch {
      // Storage blocked: start at Start here.
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(ROUTE_STORAGE_KEY, frameMode);
    } catch {
      // Storage blocked: nothing to remember.
    }
  }, [frameMode]);

  useLayoutEffect(() => {
    const frames = framesRef.current;
    const page = mainRef.current;
    if (!frames || !page) return;
    const fit = () => {
      const height = Math.ceil(frames.getBoundingClientRect().height);
      page.style.paddingBottom = `${height + 12}px`;
      document.documentElement.style.setProperty("--bottom-frames-height", `${height}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frames);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--bottom-frames-height");
    };
  }, []);

  useEffect(() => {
    const sentinel = librarySentinel.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setLibraryStuck(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
    // The Path library (and its sentinel) is only on the page in Path guide.
  }, [frameMode]);

  useEffect(() => {
    if (!modalId && !purposeOpen && !promptOpen && !owedDialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalId(null);
      if (event.key === "Escape") setPurposeOpen(false);
      if (event.key === "Escape") setPromptOpen(false);
      if (event.key === "Escape") setOwedDialog(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalId, purposeOpen, promptOpen, owedDialog]);

  useEffect(() => {
    if (!sidePanel || modalId || purposeOpen || promptOpen || owedDialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidePanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidePanel, modalId, purposeOpen, promptOpen, owedDialog]);

  useEffect(() => {
    if (!sidePanel || !focusPanel.current) return;
    focusPanel.current = false;
    document.getElementById("question-heading")?.focus({ preventScroll: true });
  }, [sidePanel]);

  useEffect(() => {
    if (!infoFocus || sidePanel !== "answer") return;
    document.getElementById("node-info")?.scrollIntoView({ block: "nearest" });
  }, [infoFocus, sidePanel]);

  useEffect(() => {
    if (sidePanel !== "answer" && sidePanel !== "comments") return;
    const frame = requestAnimationFrame(() => {
      const node = document.querySelector<SVGGElement>("svg g.node.is-selected");
      const viewport = document.querySelector<HTMLElement>(".chart-viewport");
      const panel = document.querySelector<HTMLElement>(".node-sidepanel");
      if (!node || !viewport || !panel) return;
      const box = node.getBoundingClientRect();
      const coverLeft = window.innerWidth - panel.getBoundingClientRect().width - 16;
      if (box.right > coverLeft) viewport.scrollLeft += box.right - coverLeft + 24;
    });
    return () => cancelAnimationFrame(frame);
  }, [sidePanel, selectedId]);

  const nodeTips = useMemo(
    () =>
      view.ids
        .filter((id) => !id.startsWith("group_"))
        .map((id) => getNode(id))
        .filter((node) => node.tipId)
        .map((node) => ({
          id: node.id,
          tipId: node.tipId as string,
          label: `Information about ${node.title}`,
        })),
    [view],
  );

  const visibleEdgeTips = useMemo(() => {
    const visibleEdges = new Set(view.edges.map((edge) => `${edge.from}->${edge.to}`));
    return edgeTips
      .filter((edge) => visibleEdges.has(`${edge.from}->${edge.to}`))
      .map((edge) => ({
        ...edge,
        label: `Information on the line from ${getNode(edge.from).title} to ${getNode(edge.to).title}`,
      }));
  }, [view]);

  /** Put the quote saved in this browser back on a session. Examples and imported files keep their own quote. */
  function withStoredQuote(next: Session): Session {
    const stored = readStoredQuote();
    return stored ? setQuote(next, stored.amount, stored.preparer) : next;
  }

  /** Change the quote on screen and in this browser's storage. */
  function changeQuote(amount: number | null, preparer: string | null) {
    writeStoredQuote({ amount, preparer: preparer?.trim() ? preparer : null });
    setSession((current) => setQuote(current, amount, preparer));
  }

  // Autosave: the restore effect below flips this on, so the blank first render never overwrites a saved session.
  const sessionRestored = useRef(false);
  useEffect(() => {
    if (sessionRestored.current) writeStoredSession(session);
  }, [session]);

  useEffect(() => {
    sessionRestored.current = true;
    setConfirmed(readConfirmed());
    const saved = readStoredSession();
    if (saved) {
      adoptSession(saved);
      return;
    }
    const stored = readStoredQuote();
    if (stored) setSession((current) => (current.caseStudyId ? current : setQuote(current, stored.amount, stored.preparer)));
    // Runs once on load; adoptSession only sets state.
  }, []);

  function loadBlank() {
    changeConfirmed([]);
    const next = withStoredQuote(blankSession());
    setSession(next);
    setSelectedId("filing_status");
    setToastId(null);
    setImportError(null);
    setModalId(null);
    setLevelExpanded(false);
    setExpandedGroups([]);
    setTopCollapsed(false);
    setDraft("");
  }

  /** Change which checklist items are confirmed, on screen and in this browser. */
  function changeConfirmed(next: string[]) {
    setConfirmed(next);
    writeConfirmed(next);
  }

  function downloadChecklist() {
    const markdown = checklistMarkdown({
      title: checklistTitle(session),
      returnYear,
      items: checklist,
      confirmed: confirmedHere,
      openQuestions: open.length,
      disclaimer: DISCLAIMER,
    });
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "taxes-checklist.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  function printChecklist() {
    document.body.classList.add("print-checklist");
    const done = () => {
      document.body.classList.remove("print-checklist");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  /** Clear what this browser saved (answers, comments, quote) and open a blank chart. Export keeps a copy first. */
  function startOver() {
    const ok = window.confirm(
      "Start over? This clears the answers, comments, and quote saved in this browser. Use Export first if you want a copy.",
    );
    if (!ok) return;
    clearStoredSession();
    writeStoredQuote({ amount: null, preparer: null });
    changeConfirmed([]);
    setQuoteDraft(null);
    setFrameMode("start");
    setSidePanel(null);
    loadBlank();
  }

  function loadCase(id: string) {
    changeConfirmed([]);
    const next = applyCase(id);
    setSession(next);
    const firstOpen = openQuestions(next)[0] ?? "form_1040";
    setSelectedId(firstOpen);
    setToastId(null);
    setImportError(null);
    setModalId(null);
    setLevelExpanded(false);
    setExpandedGroups([]);
    setTopCollapsed(false);
    setDraft("");
  }

  function adoptSession(next: Session) {
    setSession(next);
    const nextId = openQuestions(next)[0] ?? (next.revealed.includes("filing_status") ? "filing_status" : next.revealed[0] ?? "year");
    setSelectedId(nextId);
    setToastId(null);
    setImportError(null);
    setModalId(null);
    setLevelExpanded(false);
    setExpandedGroups([]);
    setTopCollapsed(false);
    setDraft("");
  }

  function exportChart() {
    // The chart file plus which checklist items are confirmed; importSession ignores the extra field.
    const blob = new Blob([JSON.stringify({ ...sessionFile(session), confirmed }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "taxes-chart.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importChart(file: File) {
    try {
      const text = await file.text();
      const imported = importSession(text);
      changeConfirmed(confirmedFromExport(text));
      // The imported file wins over the quote saved in this browser, including when it has no quote.
      writeStoredQuote({ amount: imported.quote, preparer: imported.quotePreparer });
      adoptSession(imported);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "That file is not a chart session.");
    }
  }

  function answer(nodeId: string, answerId: string, text?: string) {
    const before = new Set(session.revealed);
    const next = applyAnswer(session, nodeId, answerId, text);
    const appeared = next.revealed.filter((id) => !before.has(id));
    const nextView = chartView(next, expandedGroups);
    fitFocusKey.current += 1;
    const answeredId = visibleChartId(nextView.ids, nextView.groups, nodeId);
    setFitFocus({
      key: fitFocusKey.current,
      ids: fitCurrentIds(nextView.ids, nextView.groups, nextView.edges, nodeId, appeared),
      answeredId: answeredId ?? nodeId,
    });
    setSession(next);
    setDraft("");
    if (!next.revealed.includes(selectedId)) {
      const nextId = openQuestions(next)[0] ?? nodeId;
      setSelectedId(nextId);
      setLevelExpanded(false);
    }
  }

  /** Switch the tax year the figures, line numbers, and checklist use. Other answers are kept. */
  function changeTaxYear(answerId: string) {
    if (!isTaxYearId(answerId) || answerId === yearAnswer) return;
    setSession(applyAnswer(session, "year", answerId));
  }

  function showTip(tipId: string, nodeId?: string) {
    const node = nodeId ? getNode(nodeId) : null;
    if (node?.tipId) {
      setSelectedId(node.id);
      setSidePanel("answer");
      setInfoFocus((count) => count + 1);
      setTopCollapsed(true);
      setToastId(null);
      return;
    }
    setToastId(tipId);
  }

  function selectNode(id: string) {
    const group = view.groups.find((item) => item.id === id);
    if (group) {
      if (!group.lockedOpen) {
        setExpandedGroups((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
        setLevelExpanded(false);
      }
      return;
    }
    if ((nodeLevels.get(id) ?? 0) !== selectedLevel) setLevelExpanded(false);
    setSelectedId(id);
    setSidePanel(panelForNode(getNode(id)));
    setTopCollapsed(true);
    focusRoute("node");
  }

  function addAnotherInstance() {
    if (!selected || !repeatable) return;
    setSession((current) => addInstance(current, selected.id));
  }

  function switchInstance(scope: string, index: number) {
    const next = selectInstance(session, scope, index);
    if (next === session) return;
    setSession(next);
    if (!next.revealed.includes(selectedId)) {
      const nextId = next.revealed.includes(scope) ? scope : openQuestions(next)[0] ?? "filing_status";
      setSelectedId(nextId);
    }
    setLevelExpanded(false);
  }

  /** The Checklist's contents: progress, ticks, .md download, print, and which documents are on file. */
  function checklistBody() {
    return (
      <>
      {checklist.length === 0 ? (
        <p className="mt-2 text-stone-700">Answer a question to list forms and lines. Nothing is assumed yet.</p>
      ) : (
        <>
        <div className="checklist-toolbar">
          <p className="text-sm text-stone-800" role="status">
            {checklistStats.done} of {checklistStats.total} confirmed on the return
          </p>
          <progress className="checklist-progress" max={checklistStats.total} value={checklistStats.done} aria-label="Forms Needed items confirmed" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={downloadChecklist}>
              Download .md
            </button>
            <button type="button" className="btn-secondary" onClick={printChecklist}>
              Print
            </button>
          </div>
        </div>
        {coverage.expected.length > 0 ? (
          <p className="checklist-coverage" role="note">
            <span>
              {stagedPaths == null
                ? `This path calls for ${coverage.expected.length} source ${coverage.expected.length === 1 ? "document" : "documents"}.`
                : `Documents on file: ${coverage.found} of ${coverage.expected.length} this path calls for${coverage.missing ? ` (${coverage.missing} not found yet)` : ""}.`}
            </span>
            <button type="button" className="btn-secondary" onClick={() => {
                setSidePanel(null);
                showFrame("sorter");
              }}>
              {stagedPaths == null ? "Check in Document Sorter" : "Open Document Sorter"}
            </button>
          </p>
        ) : null}
        <ul className="mt-3 flex flex-col gap-3">
          {checklist.map((item) => (
            <li key={item.id} className={`rounded-md border px-3 py-2 ${confirmedHere.includes(item.id) ? "checklist-item-done" : "border-stone-200 bg-[#fffdf8]"}`}>
              <label className="checklist-confirm">
                <input
                  type="checkbox"
                  checked={confirmedHere.includes(item.id)}
                  onChange={() => changeConfirmed(toggleConfirmedForYear(confirmed, item.id, yearAnswer))}
                />
                Confirmed on the return
              </label>
              <p className="font-medium text-stone-900">
                {item.form}
                {item.line ? ` · ${item.line}` : ""}
              </p>
              <p className="text-sm text-stone-700">{item.summary}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-stone-500">
                {item.certainty === "sourced" ? "Line cited for the year shown" : "Verify on the form"}
                {item.source ? ` · ${item.source.yearLabel}` : ""}
              </p>
              {item.source ? (
                <a className="text-sm text-rust underline-offset-2 hover:underline" href={item.source.url} target="_blank" rel="noreferrer">
                  {item.source.title}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        </>
      )}
      </>
    );
  }

  const dialogOpen = Boolean(promptOpen || purposeOpen || modalId || owedDialog);
  const pageKeys = !dialogOpen;
  const headerShowsExpand = topCollapsed;
  const nodePanelOpen = sidePanel === "answer" || sidePanel === "comments";
  const showAdd = Boolean(selected && repeatable && stored?.answerId === "yes" && sidePanel === "answer");
  const answerFormOpen = Boolean(selected?.kind === "question" && asksForAnswer(selected) && sidePanel === "answer");
  const showTextAnswer = Boolean(answerFormOpen && selected?.textInput);
  const showNumberAnswer = Boolean(answerFormOpen && selected?.numberInputs);
  const showInfoTab = Boolean(selected?.tipId);
  const nodeAnswered = Boolean(stored);
  const hasComment = Boolean(selectedComment?.trim());
  // "w" hides or shows the chart widget (magnifier or overview map), so answer letters skip it.
  const choiceTaken = new Set<string>(["e", "i", "f", "t", "c", "l", "w"]);
  if (sidePanel) choiceTaken.add("h");
  if (headerShowsExpand) choiceTaken.add("x");
  if (showAdd) choiceTaken.add("d");
  if (showTextAnswer || showNumberAnswer) choiceTaken.add("u");
  if (showsPath(frameMode) && selected) {
    choiceTaken.add("a");
    choiceTaken.add("o");
  }
  if (showInfoTab && showsPath(frameMode)) choiceTaken.add("n");
  if (selected && nodePanelOpen) choiceTaken.add("s");
  if (!topCollapsed) {
    choiceTaken.add("b");
  }
  if (toast?.readMore) choiceTaken.add("r");
  const choiceShortcut = new Map<string, { key: string; index: number }>();
  if (answerFormOpen && pageKeys && selected?.answers) {
    for (const choice of selected.answers) {
      const found = pickShortcutLetter(choice.label, choiceTaken);
      if (!found) continue;
      choiceTaken.add(found.key);
      choiceShortcut.set(choice.id, found);
    }
  }
  useShortcut("export", "e", "Export", 0, exportChart, pageKeys);
  useShortcut("import", "i", "Import", 0, () => importInput.current?.click(), pageKeys);
  useShortcut("about", "b", "About", 1, () => setPurposeOpen(true), pageKeys && !topCollapsed);
  useShortcut("header-expand", "x", "Expand", 1, () => setTopCollapsed(false), pageKeys && headerShowsExpand);
  useShortcut("side-hide", "h", "Hide", 0, () => setSidePanel(null), pageKeys && sidePanel != null);
  useShortcut("node-answer", "a", "Node Answer", 5, () => setSidePanel("answer"), pageKeys && showsPath(frameMode) && Boolean(selected));
  useShortcut("node-info", "n", "Information", 1, () => {
    setSidePanel("answer");
    setInfoFocus((count) => count + 1);
  }, pageKeys && showInfoTab && showsPath(frameMode));
  useShortcut("node-comment", "o", "Node Comment", 6, () => setSidePanel("comments"), pageKeys && showsPath(frameMode) && Boolean(selected));
  useShortcut("ask-ai", "s", "Ask AI", 1, () => setPromptOpen(true), pageKeys && Boolean(selected) && nodePanelOpen);
  useShortcut("add-another", "d", "Add another", 1, addAnotherInstance, pageKeys && showAdd);
  useShortcut("use-answer", "u", "Use this answer", 0, () => {
    if (!selected?.textInput) return;
    const text = draft.trim();
    if (!text) return;
    answer(selected.id, selected.textInput.answerId, text);
  }, pageKeys && showTextAnswer);
  useShortcut("read-more", "r", "Read more", 0, () => { if (toast) setModalId(toast.id); }, pageKeys && Boolean(toast?.readMore));

  return (
    <ShortcutLayer>
    <div className="min-h-screen app-root">
      <section className="checklist-print" aria-hidden="true">
        <h1>{checklistTitle(session)}</h1>
        <p>
          Tax year: {returnYear} · {checklistStats.done} of {checklistStats.total} confirmed
          {open.length ? ` · ${open.length} open ${open.length === 1 ? "question" : "questions"} on the chart` : ""}
        </p>
        <ul>
          {checklist.map((item) => (
            <li key={item.id}>
              <p>
                <strong>
                  {confirmedHere.includes(item.id) ? "☑" : "☐"} {item.form}
                  {item.line ? ` · ${item.line}` : ""}
                </strong>
              </p>
              <p>{item.summary}</p>
              <p className="checklist-print-meta">
                {item.certainty === "sourced" ? "Line cited for the year shown" : "Verify on the form"}
                {item.source ? ` · ${item.source.yearLabel} · ${item.source.title}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <p className="checklist-print-meta">{DISCLAIMER}</p>
      </section>
      <header className={topCollapsed ? "hidden" : "border-b border-stone-300 bg-[#fffdf8]"}>
        {topCollapsed ? null : (
          <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-stone-500">Return review</p>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl text-stone-900 sm:text-4xl">Tax Final Confirmation</h1>
                <ShortcutTip label="About" index={1}>
                <button type="button" className="info-dot info-dot-inline" aria-label="About Tax Final Confirmation" onClick={() => setPurposeOpen(true)}>
                  i
                </button>
                </ShortcutTip>
              </div>
              <p className="mt-1 max-w-2xl text-stone-700">
                Walk the return you already prepared. The chart names schedules and lines to verify. It does not prepare a return.
              </p>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-stone-600" id="year-label">
                Tax year
              </p>
              <div className="flex gap-2" role="group" aria-labelledby="year-label">
                {TAX_YEARS.map((year) => {
                  const pressed = yearAnswer === year.id;
                  return (
                    <button
                      key={year.id}
                      type="button"
                      aria-pressed={pressed}
                      className={pressed ? "year-btn year-btn-on" : "year-btn"}
                      onClick={() => changeTaxYear(year.id)}
                    >
                      {year.label}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
            <p className="disclaimer" role="note">
              {DISCLAIMER}
            </p>
          </div>
        )}
      </header>

      <main ref={mainRef} className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {showsPath(frameMode) ? (
          <>
          <section className="guide-intro" aria-labelledby="guide-heading">
            <h2 id="guide-heading" tabIndex={-1} className="font-display text-2xl text-stone-900">
              <span className="flow-step" aria-hidden="true">
                2c
              </span>
              <span className="sr-only">Step 2c, </span>
              <span className="route-lead">{ROUTE_LEADS.guide}</span> Path guide
            </h2>
            <p className="panel-lede">{PANEL_LEDES.guide}</p>
            {auditHint ? (
              <p className="sorter-reminder" role="status">
                <span>{auditHint}</span>
                <button type="button" onClick={() => setAuditHint(null)}>Dismiss</button>
              </p>
            ) : null}
            {sorterReminder ? (
              <p className="sorter-reminder" role="status">
                <span>
                  Open this codebase in Cursor and invoke the skill tax-document-classification.
                  {suggestSummaries ? ` ${SUMMARIES_SKILL_NOTE}` : ""}
                </span>
                <button type="button" onClick={() => setSorterReminder(false)}>Dismiss</button>
              </p>
            ) : null}
            {open.length ? (
              <div className="flow-actions">
                <button type="button" className="btn-secondary" onClick={() => answerNext(open[0])}>
                  Answer next: {getNode(open[0]).title}
                </button>
              </div>
            ) : null}
          </section>
          <div ref={librarySentinel} className="h-px" aria-hidden="true" />
          <div className="library-stack">
          <section aria-labelledby="cases-heading" className="path-library">
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-stone-300 bg-[#fffdf8] px-4 py-3">
              {libraryStuck || topCollapsed ? (
                <div className="path-library-identity">
                  {/* The page's only h1 lives in the header; when the header is collapsed this compact title takes that role. */}
                  {topCollapsed ? (
                    <h1 className="font-display text-lg text-stone-900">Tax Final Confirmation</h1>
                  ) : (
                    <p className="font-display text-lg text-stone-900">Tax Final Confirmation</p>
                  )}

                  {topCollapsed ? (
                    <button type="button" className="btn-secondary" onClick={() => setTopCollapsed(false)}><ShortcutText text="Expand" index={headerShowsExpand ? 1 : -1} /></button>
                  ) : null}
                </div>
              ) : null}
              <h2 id="cases-heading" className="font-display text-2xl text-stone-900">
                Path library
              </h2>
              <label className="ml-auto flex items-center gap-2 text-sm font-medium text-stone-700" htmlFor="tax-year-select">
                Tax year
                <select
                  id="tax-year-select"
                  className="rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"
                  value={isTaxYearId(yearAnswer ?? "") ? yearAnswer : ""}
                  onChange={(event) => changeTaxYear(event.target.value)}
                >
                  {isTaxYearId(yearAnswer ?? "") ? null : <option value="" disabled>Not selected</option>}
                  {TAX_YEARS.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700" htmlFor="case-library">
                Open an example
                <select
                  id="case-library"
                  className="rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"
                  value={session.caseStudyId ?? "blank"}
                  onChange={(event) => {
                    if (event.target.value === "blank") loadBlank();
                    else loadCase(event.target.value);
                  }}
                >
                  <option value="blank">Start blank</option>
                  {caseStudies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn-secondary" onClick={exportChart}>
                <ShortcutText text="Export" index={0} />
              </button>
              <button type="button" className="btn-secondary" onClick={() => importInput.current?.click()}>
                <ShortcutText text="Import" index={0} />
              </button>
              <button type="button" className="btn-secondary" onClick={startOver}>
                Start over
              </button>
              <input
                ref={importInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Import a chart JSON file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importChart(file);
                }}
              />
            </div>
            <p className="mt-1 px-1 text-xs text-stone-600">Answers, comments, and the quote save in this browser as you go. Export downloads a copy you can import elsewhere.</p>
            {importError ? (
              <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
                {importError}
              </p>
            ) : null}
          </section>
          <div ref={setChartToolsNode} className="chart-tools-bar" />
          </div>
          {study ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
              {study.title} is a saved set of answers, not tax advice. Unanswered items stay on the unknown path or stay open. The info buttons on the chart still open the same notes.
            </p>
          ) : null}

          <section aria-label="What this path turns up" className="min-w-0">
            {!topCollapsed ? <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="chart-heading" className="font-display text-2xl text-stone-900">
                What this path turns up
              </h2>
                <p className="text-sm text-stone-600">
                  Click a box to open Node Answer. The <span className="info-dot info-dot-inline">i</span> opens a note and does not answer the question.
                </p>
            </div> : null}
            <MermaidView
              source={source}
              nodeIds={view.ids}
              nodeTips={nodeTips}
              edgeTips={visibleEdgeTips}
              selectedId={selectedId}
              rail={
                <div className="node-pills" role="group" aria-label="Node panels">
                  <button
                    type="button"
                    className="node-pill node-pill-primary"
                    aria-pressed={sidePanel === "answer"}
                    aria-controls="node-sidepanel"
                    title={nodeAnswered ? "Answered" : "Not answered yet"}
                    onClick={() => toggleSide("answer")}
                  >
                    <span><ShortcutText text="Node Answer" index={5} /></span>
                    <AnswerMark answered={nodeAnswered} />
                    <span className="sr-only">{nodeAnswered ? ", answered" : ", not answered"}</span>
                  </button>
                  <button
                    type="button"
                    className={hasComment ? "node-pill node-pill-noted" : "node-pill"}
                    aria-pressed={sidePanel === "comments"}
                    aria-controls="node-sidepanel"
                    onClick={() => toggleSide("comments")}
                  >
                    <span><ShortcutText text="Node Comment" index={6} /></span>
                    {hasComment ? <span className="node-pill-cue" aria-hidden="true" /> : null}
                    {hasComment ? <span className="sr-only">, has a comment</span> : null}
                  </button>
                  <button
                    type="button"
                    className="node-pill"
                    aria-pressed={sidePanel === "forms"}
                    aria-controls="node-sidepanel"
                    onClick={() => toggleSide("forms")}
                  >
                    <span>Forms Needed</span>
                    {checklistStats.total > 0 ? (
                      <span className="node-pill-count">
                        <span aria-hidden="true">
                          {checklistStats.done}/{checklistStats.total}
                        </span>
                        <span className="sr-only">
                          , {checklistStats.done} of {checklistStats.total} confirmed
                        </span>
                      </span>
                    ) : null}
                  </button>
                </div>
              }
              commentedNodeIds={visibleCommentNodeIds(session)}
              onSelect={selectNode}
              onTip={showTip}
              instancePagers={instancePagers}
              onSelectInstance={switchInstance}
              levelNodes={levelNodes.map((id) => {
                const group = view.groups.find((item) => item.id === id);
                return { id, title: group ? `${group.title} (${group.count})` : getNode(id).title };
              })}
              levelExpanded={levelExpanded}
              onToggleLevel={() => setLevelExpanded((expanded) => !expanded)}
              shortcutsEnabled={pageKeys}
              edges={view.edges}
              fitFocus={fitFocus}
              toolsNode={chartToolsNode}
            />
          </section>

          <FlowNext current="guide" auditDisabled={auditState.disabled} onOpen={showFrame} onOpenAudit={() => void openAuditTab()} />
          </>
        ) : (
          <section ref={routePanelRef} className="route-panel" aria-labelledby="check-heading" tabIndex={-1}>
          {auditHint ? (
            <p className="sorter-reminder" role="status">
              <span>{auditHint}</span>
              <button type="button" onClick={() => setAuditHint(null)}>Dismiss</button>
            </p>
          ) : null}
          {sorterReminder ? (
            <p className="sorter-reminder" role="status">
              <span>
                Open this codebase in Cursor and invoke the skill tax-document-classification.
                {suggestSummaries ? ` ${SUMMARIES_SKILL_NOTE}` : ""}
              </span>
              <button type="button" onClick={() => setSorterReminder(false)}>Dismiss</button>
            </p>
          ) : null}
          {frameMode === "start" ? (
            <StartPanel
              overview={owedReports.overview}
              reports={owedReports.state}
              auditDisabled={auditState.disabled}
              checklist={checklistStats}
              openCount={open.length}
              nextQuestion={open.length ? getNode(open[0]).title : null}
              onOpen={showFrame}
              onOpenAudit={() => void openAuditTab()}
              onAnswerNext={() => answerNext(open[0])}
              onOpenChecklist={() => toggleSide("forms")}
            />
          ) : frameMode === "costs" ? (
            <>
              <div className="walkthrough-open">
                <button
                  type="button"
                  aria-expanded={walkthroughOpen}
                  aria-controls="freetaxusa-walkthrough"
                  onClick={() => setWalkthroughOpen((open) => !open)}
                >
                  {walkthroughOpen ? "Hide FreeTaxUSA Walkthrough" : "FreeTaxUSA Walkthrough"}
                </button>
                {walkthroughOpen ? (
                  <div id="freetaxusa-walkthrough" className="walkthrough-body" role="region" aria-label="FreeTaxUSA Walkthrough">
                    <p>
                      After you upload the files and they are sorted, open this codebase in Cursor and invoke the skill freetaxusa-walkthrough.
                    </p>
                    <p>
                      The Cursor harness can open a browser tab inside Cursor and read the FreeTaxUSA screen while you fill the forms. It tells you what to do next, gives you the numbers you need, and names the file each number comes from.
                    </p>
                    <p>
                      It asks you when that step is done, or watches the screen for when you have done it.
                    </p>
                  </div>
                ) : null}
              </div>
              <h2 id="check-heading" className="font-display text-2xl text-stone-900">
                Tax Pro Costs
              </h2>
              <p className="panel-lede">{PANEL_LEDES.costs}</p>
              {owedReports.overview ? (
                <p className="flow-cue mt-1">
                  {owedReports.overview.summaries
                    ? "Summaries.md is in sorter/stage, ready to hand over."
                    : "No Summaries.md yet: open this codebase in Cursor and invoke the skill tax-document-summaries."}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-stone-600">
                Published prices for preparing a return of this shape. These are not tax figures and not a quote unless you enter one below or a case study loaded one.
              </p>
              <fieldset className="quote-entry">
                <legend>Your preparation quote</legend>
                <label htmlFor="quote-preparer">
                  Preparer or firm
                  <input
                    id="quote-preparer"
                    type="text"
                    value={session.quotePreparer ?? ""}
                    placeholder="Who quoted this return"
                    onChange={(event) => {
                      changeQuote(session.quote, event.target.value);
                    }}
                  />
                </label>
                <label htmlFor="quote-amount">
                  Quote in dollars
                  <input
                    id="quote-amount"
                    type="text"
                    inputMode="decimal"
                    value={quoteDraft ?? (session.quote == null ? "" : String(session.quote))}
                    placeholder="$975"
                    aria-invalid={quoteDraft != null && quoteDraft.trim() !== "" && parseQuoteAmount(quoteDraft) == null}
                    onChange={(event) => {
                      const text = event.target.value;
                      setQuoteDraft(text);
                      changeQuote(parseQuoteAmount(text), session.quotePreparer);
                    }}
                    onBlur={() => setQuoteDraft(null)}
                  />
                </label>
                {session.quote != null || session.quotePreparer ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuoteDraft(null);
                      changeQuote(null, null);
                    }}
                  >
                    Clear quote
                  </button>
                ) : null}
                {quoteDraft != null && quoteDraft.trim() !== "" && parseQuoteAmount(quoteDraft) == null ? (
                  <p className="text-rust" role="alert">Enter a dollar amount such as 975 or $1,250.</p>
                ) : null}
                <p>Saved in this browser and with the chart session. Importing a session file replaces the saved quote.</p>
              </fieldset>
              <p className="mt-2 text-sm text-stone-800" role="note">
                This is only for the forms and schedules reached so far, not a price for a finished return.
              </p>
              {open.length > 0 ? (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
                  Your path is not complete yet: {open.length} {open.length === 1 ? "decision remains" : "decisions remain"}. Finish the open boxes for a more accurate comparison.
                </p>
              ) : (
                <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950" role="status">
                  This path is fully clicked through. The comparison reflects the answers shown, subject to the notes on each price.
                </p>
              )}
              {cost.framing ? <p className="mt-3 text-sm text-stone-800">{cost.framing}</p> : null}
              {cost.quoteNote ? <p className="mt-2 text-sm font-medium text-stone-900">{cost.quoteNote}</p> : null}
              {cost.diyComparison ? <p className="mt-2 text-sm text-stone-800">{cost.diyComparison}</p> : null}
              {cost.estimate ? (
                <div className="pro-estimate" role="note" aria-label="Estimated tax pro fee">
                  <p className="pro-estimate-label">Estimate · not a quote</p>
                  <p className="pro-estimate-range">
                    Tax pro fee for the forms reached so far:{" "}
                    {cost.estimate.low === cost.estimate.high
                      ? `about $${cost.estimate.low.toLocaleString("en-US")}`
                      : `$${cost.estimate.low.toLocaleString("en-US")}–$${cost.estimate.high.toLocaleString("en-US")}`}
                  </p>
                  {cost.estimate.quotePosition && session.quote != null ? (
                    <p className="text-sm font-medium text-stone-900">
                      {cost.estimate.quotePosition === "within"
                        ? `The $${session.quote.toLocaleString("en-US")} quote is inside this ${cost.estimate.low === cost.estimate.high ? "estimate" : "range"}.`
                        : `The $${session.quote.toLocaleString("en-US")} quote is ${cost.estimate.quotePosition} this ${cost.estimate.low === cost.estimate.high ? "estimate" : "range"}.`}
                    </p>
                  ) : null}
                  <details className="estimate-breakdown">
                    <summary>How this estimate adds up</summary>
                    <table>
                      <caption className="sr-only">NSA 2023 averages and the same amounts raised by CPI-U</caption>
                      <thead>
                        <tr>
                          <th scope="col">Piece</th>
                          <th scope="col">NSA 2023</th>
                          <th scope="col">With inflation (×{cost.estimate.cpiFactor.toFixed(3)})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cost.estimate.parts.map((part) => (
                          <tr key={part.label}>
                            <th scope="row">{part.label}</th>
                            <td>{dollarSpan(part.y2023.low, part.y2023.high)}</td>
                            <td>{dollarSpan(part.adjusted.low, part.adjusted.high)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Estimate</th>
                          <td />
                          <td>{dollarSpan(cost.estimate.low, cost.estimate.high)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    <p className="text-xs text-stone-600">Each line is rounded on its own, so the lines can add up a dollar or two away from the estimate, which is rounded once from the full total.</p>
                  </details>
                  <p className="mt-1 text-sm text-stone-700">{cost.estimate.note}</p>
                  <p className="mt-1 text-sm text-stone-700">
                    {cost.estimate.inflationThrough}
                    {cost.estimate.inflationHint ? <span className="price-stale"> {cost.estimate.inflationHint}</span> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
                    {cost.estimate.citations.map((citation) => (
                      <a key={citation.url} className="text-rust underline-offset-2 hover:underline" href={citation.url} target="_blank" rel="noreferrer">
                        {citation.title}
                      </a>
                    ))}
                  </p>
                </div>
              ) : null}
              {cost.rows.length === 0 ? (
                <p className="mt-3 text-stone-700">The comparison appears once a year is selected.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {cost.rows.map((row) => (
                    <li key={row.id} className="rounded-md border border-stone-200 bg-[#fffdf8] px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium text-stone-900">{row.vendor}</p>
                        <p className="font-display text-xl text-stone-900">{row.amountLabel}</p>
                      </div>
                      <p className="text-sm text-stone-800">{row.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-stone-500">
                        {row.yearLabel}
                        {row.unverified ? " · Price unverified" : ""}
                        {row.checkedLabel ? ` · Last checked ${row.checkedLabel}` : ""}
                      </p>
                      {row.staleDays != null ? (
                        <p className="price-stale" role="status">
                          Last checked {row.staleDays} days ago, past the {cost.staleAfterDays}-day limit. Recheck the source before relying on this price.
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-stone-700">{row.note}</p>
                      {row.citation ? (
                        <a className="text-sm text-rust underline-offset-2 hover:underline" href={row.citation.url} target="_blank" rel="noreferrer">
                          {row.citation.title}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : frameMode === "sorter" ? (
            <DocumentSorter
              onUploaded={() => setSorterReminder(true)}
              onSuggestSummaries={setSuggestSummaries}
              revealed={session.revealed}
              onFiles={setStagedPaths}
              onPdfHints={setPdfHints}
              onStatus={owedReports.accept}
              lede={PANEL_LEDES.sorter}
            />
          ) : (
            <OwedAuditPanel
              state={owedReports.state}
              onRefresh={() => void owedReports.refresh()}
              onDialog={setOwedDialog}
              lede={PANEL_LEDES.audit}
            />
          )}
          {frameMode !== "start" ? (
            <FlowNext current={frameMode} auditDisabled={auditState.disabled} onOpen={showFrame} onOpenAudit={() => void openAuditTab()} />
          ) : null}
          </section>
        )}

        <aside
          id="node-sidepanel"
          className={sidePanel ? "node-sidepanel is-open" : "node-sidepanel"}
          aria-labelledby="question-heading"
          inert={sidePanel ? undefined : true}
          aria-hidden={sidePanel ? undefined : true}
        >
          <div className="node-sidepanel-head">
            <h2 id="question-heading" tabIndex={-1} className="font-display text-2xl text-stone-900">
              {panelMode === "forms" ? "Forms Needed" : selected ? selected.title : "Pick a box"}
            </h2>
            <div className="flex items-center gap-2">
              {panelMode !== "forms" && selected ? (
                      <ShortcutTip label="Ask AI" index={1}>
                      <button type="button" className="ai-open" aria-label={`Ask AI about ${selected.title}`} onClick={() => setPromptOpen(true)}>
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                          <path fill="currentColor" d="M8 1.2 9.1 6 14 7.2 9.1 8.4 8 13.2 6.9 8.4 2 7.2 6.9 6z" />
                        </svg>
                      </button>
                      </ShortcutTip>
                    ) : null}
                    {panelMode === "answer" && repeatable && stored?.answerId === "yes" ? (
                      <ShortcutTip label="Add another" index={1}>
                      <button type="button" className="add-instance" onClick={addAnotherInstance} aria-label={`Add another ${repeatable.singular}`} title={`Add another ${repeatable.singular}`}>
                        +
                      </button>
                      </ShortcutTip>
                    ) : null}
                    <button type="button" className="btn-secondary" onClick={() => setSidePanel(null)}>
                      <ShortcutText text="Hide" index={sidePanel ? 0 : -1} />
                    </button>
                  </div>
                </div>
          <div className="node-sidepanel-body flex flex-col gap-4">
            {panelMode === "forms" ? (
              <>
                <p className="panel-lede">{CHECKLIST_LEDE}</p>
                {checklistBody()}
              </>
            ) : (
            <>
              <section className="panel">
                {(() => {
                  const scope = selected ? instanceScope(selected.id) ?? (repeatableNodes[selected.id] ? selected.id : null) : null;
                  const names = scope ? session.instances[scope] ?? [] : [];
                  if (!scope || names.length < 2) return null;
                  const active = session.activeInstance[scope] ?? 0;
                  return (
                    <div className="instance-switch" role="tablist" aria-label="Which record this path is checking" onKeyDown={onTabListKeyDown}>
                      {names.map((name, index) => (
                        <button
                          key={`${scope}-${index}`}
                          type="button"
                          role="tab"
                          aria-selected={index === active}
                          tabIndex={index === active ? 0 : -1}
                          className={index === active ? "year-btn year-btn-on" : "year-btn"}
                          onClick={() => switchInstance(scope, index)}
                        >
                          {name.trim() || `Record ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {panelMode === "answer" && selected?.kind === "check" ? (
                  <>
                    <p className="mt-2 text-stone-800">{suggestionText(selected.id, session) ?? selected.help ?? selected.chart}</p>
                    {suggestionText(selected.id, session) && selected.help ? (
                      <p className="mt-2 text-sm text-stone-600">{selected.help}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-stone-600">
                      This is a line to verify on the prepared return. It is not an instruction to start the form.
                    </p>
                  </>
                ) : null}
                {panelMode === "comments" ? (
                  selected ? (
                  <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => event.preventDefault()}>
                    <label className="text-sm font-medium text-stone-700" htmlFor="node-comment">
                      Comment on this box
                    </label>
                    <textarea
                      id="node-comment"
                      className="min-h-24 rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"
                      value={selectedComment ?? ""}
                      placeholder="Add a comment"
                      onChange={(event) => {
                        const text = event.target.value;
                        setSession((current) => setNodeComment(current, selected.id, text));
                      }}
                    />
                  </form>
                ) : (
                  <p className="mt-2 text-stone-700">Choose a box on the chart.</p>
                )
                ) : selected && asksForAnswer(selected) ? (
                  <>
                    <p className="mt-2 text-stone-800">{selected.prompt}</p>
                    {selected.help ? <p className="mt-2 text-sm text-stone-600">{selected.help}</p> : null}
                    {selected.links?.length ? (
                      <ul className="mt-3 flex flex-col gap-2">
                        {selected.links.map((link) => (
                          <li key={link.href}>
                            <a className="text-sm text-rust underline-offset-2 hover:underline" href={link.href} target="_blank" rel="noreferrer">
                              {link.label}
                            </a>
                            <p className="text-sm text-stone-600">{link.detail}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {selected.numberInputs ? (
                      <NumberEntry
                        key={`${selected.id}:${stored?.text ?? ""}`}
                        nodeId={selected.id}
                        fields={selected.numberInputs.fields}
                        initial={stored?.text ?? ""}
                        enabled={pageKeys && showNumberAnswer}
                        onSubmit={(text) => answer(selected.id, selected.numberInputs!.answerId, text)}
                      />
                    ) : null}
                    {selected.textInput ? (
                      <form
                        className="mt-3 flex flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const text = draft.trim();
                          if (!text) return;
                          answer(selected.id, selected.textInput!.answerId, text);
                        }}
                      >
                        <label className="text-sm font-medium text-stone-700" htmlFor="node-text">
                          From the prepared return
                        </label>
                        <input
                          id="node-text"
                          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"
                          value={draft}
                          placeholder={selected.textInput.placeholder}
                          onChange={(event) => setDraft(event.target.value)}
                        />
                        <button type="submit" className="btn-primary">
                          <ShortcutText text="Use this answer" index={0} />
                        </button>
                      </form>
                    ) : null}
                    <div className="mt-3 flex flex-col gap-2">
                      {selected.answers?.map((choice) => {
                        const pressed = stored?.answerId === choice.id && !stored.text;
                        return (
                          <AnswerChoice
                            key={choice.id}
                            choiceId={choice.id}
                            label={choice.label}
                            pressed={pressed}
                            className={choice.id === "unknown" ? "btn-unknown" : pressed ? "btn-primary" : "btn-secondary"}
                            shortcut={choiceShortcut.get(choice.id) ?? null}
                            onPick={() => answer(selected.id, choice.id)}
                          />
                        );
                      })}
                    </div>
                    {repeatable && stored?.answerId === "yes" ? (
                      <div className="mt-4 border-t border-stone-200 pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-stone-800">
                            {instances.length} {instances.length === 1 ? repeatable.singular : repeatable.plural}
                          </h3>
                          <button type="button" className="text-sm text-rust underline-offset-2 hover:underline" onClick={addAnotherInstance}>
                            + <ShortcutText text="Add another" index={1} />
                          </button>
                        </div>
                        <p className="mt-1 text-sm text-stone-600">Name each record so you can verify it separately. The chart keeps the shared tax path in one place.</p>
                        <div className="mt-2 flex flex-col gap-2">
                          {instances.map((instance, index) => (
                            <div key={`${selected.id}-${index}`} className="flex items-center gap-2">
                              <input
                                className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
                                aria-label={`${repeatable.singular} ${index + 1} name`}
                                value={instance}
                                onChange={(event) => setSession((current) => renameInstance(current, selected.id, index, event.target.value))}
                              />
                              {instances.length > 1 ? (
                                <button type="button" className="btn-secondary" onClick={() => setSession((current) => removeInstance(current, selected.id, index))} aria-label={`Remove ${instance || `${repeatable.singular} ${index + 1}`}`}>
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {selected.tipId ? (
                      <div id="node-info" className="node-info">
                        <DockInfo tipId={selected.tipId} session={session} />
                      </div>
                    ) : null}
                  </>
                ) : selected?.tipId ? (
                  <div id="node-info">
                    <DockInfo tipId={selected.tipId} session={session} />
                  </div>
                ) : !selected ? (
                  <p className="mt-2 text-stone-700">Choose a box on the chart.</p>
                ) : null}
                {panelMode === "answer" && open.length > 0 ? (
                  <div className="mt-4 border-t border-stone-200 pt-3">
                    <h3 className="text-sm font-semibold text-stone-800">Still open</h3>
                    <ul className="mt-2 flex flex-col gap-1">
                      {open.map((id) => (
                        <li key={id}>
                          <button type="button" className="text-left text-sm text-rust underline-offset-2 hover:underline" onClick={() => selectNode(id)}>
                            {getNode(id).title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>

              {panelMode === "answer" && session.revealed.includes("deduction_result") ? (
                <section className="panel" aria-labelledby="deduction-heading">
                  <h2 id="deduction-heading" className="font-display text-2xl text-stone-900">
                    Standard vs itemized
                  </h2>
                  <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-sm text-stone-800">
                    {deduction.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
            )}
          </div>
        </aside>
        <div ref={framesRef} className="bottom-frames">
        <nav className="flow-frame" aria-label="Steps and routes">
          {/* Two rows at every width: labels on the first, each over its own button on the second. */}
          <div className="frame-bar">
            <div className="frame-switch" role="group" aria-label="Which panel this page shows">
              {flowSegments().map((segment) => {
                const columns = segment.tabs.map((tab) => {
                  const isAudit = tab.mode === "audit";
                  const count =
                    tab.mode === "sorter" && owedReports.overview
                      ? { shown: String(owedReports.overview.staged), spoken: `${owedReports.overview.staged} staged` }
                      : tab.mode === "guide" && open.length > 0
                        ? { shown: `${open.length} open`, spoken: `${open.length} open ${open.length === 1 ? "question" : "questions"}` }
                        : null;
                  return (
                    <div key={tab.mode} className="tab-col">
                      <span className="tab-label" aria-hidden="true">
                        {tab.lead ?? "\u00a0"}
                      </span>
                      <button
                        type="button"
                        aria-pressed={frameMode === tab.mode}
                        aria-disabled={isAudit ? auditState.disabled || undefined : undefined}
                        aria-describedby={isAudit && auditState.disabled ? "audit-tab-hint" : undefined}
                        title={isAudit ? (auditState.hint ?? undefined) : undefined}
                        onClick={() => (isAudit ? void openAuditTab() : showFrame(tab.mode))}
                      >
                        {tab.step ? (
                          <span className="tab-step" aria-hidden="true">
                            {tab.step}
                          </span>
                        ) : null}
                        <span className="sr-only">{spokenPrefix(tab)}</span>
                        {tab.label}
                        {count ? (
                          <span className="tab-count">
                            <span aria-hidden="true">{count.shown}</span>
                            <span className="sr-only">, {count.spoken}</span>
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                });
                if (!segment.group) return <Fragment key={segment.tabs[0].mode}>{columns}</Fragment>;
                const labelId = `tab-group-${segment.group}`;
                return (
                  <div key={segment.group} className="tab-group" role="group" aria-labelledby={labelId}>
                    <span id={labelId} className="tab-group-label">
                      {segment.label}
                    </span>
                    {columns}
                  </div>
                );
              })}
              {auditState.disabled ? (
                <span id="audit-tab-hint" className="sr-only">
                  {auditState.hint}
                </span>
              ) : null}
            </div>
            <div className="frame-tools" role="group" aria-label="Tools">
              {showsPath(frameMode) ? null : (
              <button
                type="button"
                className="checklist-open"
                aria-expanded={sidePanel === "forms"}
                aria-controls="node-sidepanel"
                onClick={() => toggleSide("forms")}
              >
                <span className="checklist-open-icon" aria-hidden="true">
                  ☑
                </span>
                Forms Needed
                {checklistStats.total > 0 ? (
                  <span className="tab-count">
                    <span aria-hidden="true">
                      {checklistStats.done}/{checklistStats.total}
                    </span>
                    <span className="sr-only">
                      , {checklistStats.done} of {checklistStats.total} confirmed
                    </span>
                  </span>
                ) : null}
              </button>
              )}
              <HarnessHelp />
            </div>
          </div>
        </nav>
        </div>
      </main>

      {promptOpen && selected ? (
        <PromptBuilder
          node={selected}
          prompt={nodePrompt(session, selected)}
          onClose={() => setPromptOpen(false)}
          onApply={(raw) => {
            const next = applyNodeReply(session, selected.id, raw);
            setSession(next);
            setDraft("");
            if (!next.revealed.includes(selected.id)) {
              const nextId = openQuestions(next)[0] ?? selected.id;
              setSelectedId(nextId);
            }
            setPromptOpen(false);
          }}
        />
      ) : null}

      {purposeOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPurposeOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="purpose-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="purpose-title" className="font-display text-2xl text-stone-900">What Tax Final Confirmation is for</h2>
            <p className="mt-3 text-stone-800">
              Use this after a professional or tax platform has already prepared the return. It is a structured double-check for forms, schedules, and details that may have been missed.
            </p>
            <p className="mt-3 text-stone-800">
              It does not prepare a return, replace professional advice, or tell you to add a form. Confirm any flagged item against the prepared return and its supporting records.
            </p>
            <button type="button" className="btn-primary mt-4" onClick={() => setPurposeOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          <button
            type="button"
            className="text-left"
            onClick={() => {
              if (toast.readMore) setModalId(toast.id);
            }}
          >
            {toast.toast}
          </button>
          <div className="mt-2 flex gap-2">
            {toast.readMore ? (
              <button type="button" className="btn-primary" onClick={() => setModalId(toast.id)}>
                <ShortcutText text="Read more" index={0} />
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => setToastId(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {modal && modalId ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalId(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tip-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="tip-title" className="font-display text-2xl text-stone-900">
              {modal.title}
            </h2>
            {modal.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-stone-800">
                {paragraph}
              </p>
            ))}
            {modal.bullets ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-stone-800">
                {modal.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
            <ul className="mt-4 flex flex-col gap-1 text-sm">
              {modal.citations.map((citation) => (
                <li key={citation.url}>
                  <a className="text-rust underline-offset-2 hover:underline" href={citation.url} target="_blank" rel="noreferrer">
                    {citation.title}
                  </a>
                  <span className="text-stone-500"> · {citation.yearLabel}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-stone-600">{DISCLAIMER}</p>
            <button type="button" className="btn-primary mt-4" onClick={() => setModalId(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
    </ShortcutLayer>
  );
}
