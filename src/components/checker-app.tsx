"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MermaidView } from "@/components/mermaid-view";
import { DocumentSorter, SUMMARIES_SKILL_NOTE } from "@/components/document-sorter";
import { PromptBuilder } from "@/components/prompt-builder";
import { pickShortcutLetter, ShortcutLayer, ShortcutText, ShortcutTip, useShortcut } from "@/components/shortcut-layer";
import { decodeNumbers, encodeNumbers, numberEntryError, suggestionText } from "@/lib/graph/allocate";
import { DISCLAIMER } from "@/lib/disclaimer";
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
  instanceScope,
  readAnswer,
  readComment,
  sessionToJson,
  removeInstance,
  renameInstance,
  repeatableNodes,
  selectInstance,
  setNodeComment,
  tips,
  visibleCommentNodeIds,
} from "@/lib/graph";
import { answerOf } from "@/lib/graph/session";
import { parseYear } from "@/lib/graph/thresholds";
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

function firstDockTab(node: GraphNode): "answer" | "info" | "comments" {
  if (asksForAnswer(node)) return "answer";
  if (node.tipId) return "info";
  return "comments";
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

const YEARS = [
  { id: "y2024", label: "2024" },
  { id: "y2025", label: "2025" },
  { id: "y2026", label: "2026" },
] as const;

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
  const [frameMode, setFrameMode] = useState<"checklist" | "costs" | "sorter">("checklist");
  const [sorterReminder, setSorterReminder] = useState(false);
  const [suggestSummaries, setSuggestSummaries] = useState(false);
  const [chartToolsNode, setChartToolsNode] = useState<HTMLDivElement | null>(null);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [levelExpanded, setLevelExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [libraryStuck, setLibraryStuck] = useState(false);
  const librarySentinel = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const framesRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [dockTab, setDockTab] = useState<"answer" | "info" | "comments">("answer");
  const dockRef = useRef<HTMLElement>(null);
  const dockBaseHeight = useRef<number | null>(null);
  const dockHeightBeforeCollapse = useRef<number | null>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [fitFocus, setFitFocus] = useState<{ key: number; ids: string[]; answeredId: string } | null>(null);
  const fitFocusKey = useRef(0);
  const dockScale =
    dockHeight == null || !dockBaseHeight.current
      ? 1
      : Math.min(1.65, Math.max(0.85, dockHeight / dockBaseHeight.current));

  function clampDockHeight(next: number) {
    const max = Math.min(window.innerHeight * 0.72, 42 * 16);
    return Math.min(max, Math.max(9 * 16, next));
  }

  function collapseDock() {
    if (!dockCollapsed) {
      const dock = dockRef.current;
      dockHeightBeforeCollapse.current = dockHeight ?? dock?.getBoundingClientRect().height ?? null;
    }
    setDockCollapsed(true);
  }

  function expandDock() {
    setChecklistOpen(false);
    setDockCollapsed(false);
    if (dockHeightBeforeCollapse.current != null) setDockHeight(dockHeightBeforeCollapse.current);
  }

  function openChecklist() {
    collapseDock();
    setChecklistOpen(true);
  }

  function showFrame(mode: "checklist" | "costs" | "sorter") {
    setFrameMode(mode);
    if (!dockCollapsed) openChecklist();
  }

  function resizeDock(event: ReactPointerEvent<HTMLButtonElement>) {
    const dock = dockRef.current;
    if (!dock) return;
    const collapsedAtStart = dockCollapsed;
    const startY = event.clientY;
    const startHeight = collapsedAtStart
      ? dockHeightBeforeCollapse.current ?? dock.getBoundingClientRect().height
      : dock.getBoundingClientRect().height;
    if (dockBaseHeight.current == null) dockBaseHeight.current = startHeight;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      if (collapsedAtStart) {
        setChecklistOpen(false);
        setDockCollapsed(false);
      }
      setDockHeight(clampDockHeight(startHeight + (startY - ev.clientY)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function nudgeDock(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const dock = dockRef.current;
    if (!dock) return;
    if (dockCollapsed) {
      setChecklistOpen(false);
      setDockCollapsed(false);
    }
    const current = dockCollapsed
      ? dockHeightBeforeCollapse.current ?? dockHeight ?? dock.getBoundingClientRect().height
      : dockHeight ?? dock.getBoundingClientRect().height;
    if (dockBaseHeight.current == null) dockBaseHeight.current = current;
    setDockHeight(clampDockHeight(current + (event.key === "ArrowUp" ? 28 : -28)));
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
  const returnYear = YEARS.find((year) => year.id === answerOf(session, "year"))?.label ?? "Not selected";

  useEffect(() => {
    setDraft(readAnswer(session, selectedId)?.text ?? "");
  }, [selectedId, session]);

  useLayoutEffect(() => {
    const frames = framesRef.current;
    const page = mainRef.current;
    if (!frames || !page) return;
    const fit = () => {
      page.style.paddingBottom = `${Math.ceil(frames.getBoundingClientRect().height) + 12}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frames);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sentinel = librarySentinel.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setLibraryStuck(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!modalId && !purposeOpen && !promptOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalId(null);
      if (event.key === "Escape") setPurposeOpen(false);
      if (event.key === "Escape") setPromptOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalId, purposeOpen, promptOpen]);

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

  function loadBlank() {
    const next = blankSession();
    setSession(next);
    setSelectedId("filing_status");
    setDockTab(firstDockTab(getNode("filing_status")));
    setToastId(null);
    setImportError(null);
    setModalId(null);
    setLevelExpanded(false);
    setExpandedGroups([]);
    setTopCollapsed(false);
    setDraft("");
  }

  function loadCase(id: string) {
    const next = applyCase(id);
    setSession(next);
    const firstOpen = openQuestions(next)[0] ?? "form_1040";
    setSelectedId(firstOpen);
    setDockTab(firstDockTab(getNode(firstOpen)));
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
    setDockTab(firstDockTab(getNode(nextId)));
    setToastId(null);
    setImportError(null);
    setModalId(null);
    setLevelExpanded(false);
    setExpandedGroups([]);
    setTopCollapsed(false);
    setDraft("");
  }

  function exportChart() {
    const blob = new Blob([sessionToJson(session)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "taxes-chart.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importChart(file: File) {
    try {
      adoptSession(importSession(await file.text()));
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
      setDockTab(firstDockTab(getNode(nextId)));
      setLevelExpanded(false);
    }
  }

  function showTip(tipId: string, nodeId?: string) {
    const node = nodeId ? getNode(nodeId) : null;
    if (node?.tipId) {
      setSelectedId(node.id);
      setDockTab("info");
      setTopCollapsed(true);
      setToastId(null);
      expandDock();
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
    setDockTab(firstDockTab(getNode(id)));
    setTopCollapsed(true);
    expandDock();
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
      setDockTab(firstDockTab(getNode(nextId)));
    }
    setLevelExpanded(false);
  }

  const dialogOpen = Boolean(promptOpen || purposeOpen || modalId);
  const pageKeys = !dialogOpen;
  const dockShowsExpand = dockCollapsed;
  const checklistShowsExpand = !checklistOpen && !dockShowsExpand;
  const headerShowsExpand = topCollapsed && !dockShowsExpand && !checklistShowsExpand;
  const showAdd = Boolean(selected && repeatable && stored?.answerId === "yes" && !dockCollapsed);
  const answerFormOpen = Boolean(
    selected?.kind === "question" &&
    asksForAnswer(selected) &&
    dockTab !== "comments" &&
    !(selected.tipId && dockTab === "info") &&
    !dockCollapsed,
  );
  const showTextAnswer = Boolean(answerFormOpen && selected?.textInput);
  const showNumberAnswer = Boolean(answerFormOpen && selected?.numberInputs);
  const showAnswerTab = Boolean(selected && asksForAnswer(selected));
  const showInfoTab = Boolean(selected?.tipId);
  const choiceTaken = new Set<string>(["e", "i", "f", "t", "c", "l"]);
  if (!dockCollapsed || checklistOpen) choiceTaken.add("h");
  if (dockShowsExpand || checklistShowsExpand || headerShowsExpand) choiceTaken.add("x");
  if (showAdd) choiceTaken.add("d");
  if (showTextAnswer || showNumberAnswer) choiceTaken.add("u");
  if (showAnswerTab) choiceTaken.add("a");
  if (showInfoTab) choiceTaken.add("n");
  if (selected) choiceTaken.add("o");
  if (selected && !dockCollapsed) choiceTaken.add("s");
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
  useShortcut("dock-toggle", dockCollapsed ? "x" : "h", dockCollapsed ? "Expand" : "Hide", dockCollapsed ? 1 : 0, () => (dockCollapsed ? expandDock() : collapseDock()), pageKeys);
  useShortcut("checklist-toggle", checklistOpen ? "h" : "x", checklistOpen ? "Hide" : "Expand", checklistOpen ? 0 : 1, () => (checklistOpen ? setChecklistOpen(false) : openChecklist()), pageKeys && (checklistOpen || checklistShowsExpand));
  useShortcut("answer-tab", "a", "Answer", 0, () => setDockTab("answer"), pageKeys && showAnswerTab && !dockCollapsed);
  useShortcut("info-tab", "n", "Information", 1, () => setDockTab("info"), pageKeys && showInfoTab && !dockCollapsed);
  useShortcut("comments-tab", "o", "Comments", 1, () => setDockTab("comments"), pageKeys && Boolean(selected) && !dockCollapsed);
  useShortcut("ask-ai", "s", "Ask AI", 1, () => setPromptOpen(true), pageKeys && Boolean(selected) && !dockCollapsed);
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
    <div className="min-h-screen">
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
                Return year
              </p>
              <div className="flex gap-2" role="group" aria-labelledby="year-label">
                {YEARS.map((year) => {
                  const pressed = answerOf(session, "year") === year.id;
                  return (
                    <button
                      key={year.id}
                      type="button"
                      aria-pressed={pressed}
                      className={pressed ? "year-btn year-btn-on" : "year-btn"}
                      onClick={() => answer("year", year.id)}
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
        <div ref={librarySentinel} className="h-px" aria-hidden="true" />
        <div className="library-stack">
        <section aria-labelledby="cases-heading" className="path-library">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-stone-300 bg-[#fffdf8] px-4 py-3">
            {libraryStuck || topCollapsed ? (
              <div className="path-library-identity">
                <p className="font-display text-lg text-stone-900">Tax Final Confirmation</p>
                <span className="text-sm text-stone-700">Return year: {returnYear}</span>
                {topCollapsed ? (
                  <button type="button" className="btn-secondary" onClick={() => setTopCollapsed(false)}><ShortcutText text="Expand" index={headerShowsExpand ? 1 : -1} /></button>
                ) : null}
              </div>
            ) : null}
            <h2 id="cases-heading" className="font-display text-2xl text-stone-900">
              Path library
            </h2>
            <label className="ml-auto flex items-center gap-2 text-sm font-medium text-stone-700" htmlFor="case-library">
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
                Click a box to answer it. The <span className="info-dot info-dot-inline">i</span> opens a note and does not answer the question.
              </p>
          </div> : null}
          <MermaidView
            source={source}
            nodeIds={view.ids}
            nodeTips={nodeTips}
            edgeTips={visibleEdgeTips}
            selectedId={selectedId}
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

        <div ref={framesRef} className="bottom-frames">
        <section
          className={checklistOpen ? "checklist-frame" : "checklist-frame is-collapsed"}
          aria-labelledby="check-heading"
        >
          <div className="frame-switch" role="group" aria-label="Which panel this frame shows">
            <button type="button" aria-pressed={frameMode === "checklist"} onClick={() => showFrame("checklist")}>
              Checklist
            </button>
            <button type="button" aria-pressed={frameMode === "costs"} onClick={() => showFrame("costs")}>
              Tax Pro Costs
            </button>
            <span className="frame-switch-divider" aria-hidden="true" />
            <button type="button" aria-pressed={frameMode === "sorter"} onClick={() => showFrame("sorter")}>
              Document Sorter
            </button>
          </div>
          <button
            type="button"
            className="question-dock-collapse"
            aria-expanded={checklistOpen}
            aria-label={checklistOpen ? "Collapse this frame" : "Expand this frame"}
            onClick={checklistOpen ? () => setChecklistOpen(false) : openChecklist}
          >
            <ShortcutText text={checklistOpen ? "Hide" : "Expand"} index={checklistOpen || checklistShowsExpand ? (checklistOpen ? 0 : 1) : -1} />
          </button>
          {checklistOpen ? (
            <div className="checklist-frame-inner">
              {sorterReminder ? (
                <p className="sorter-reminder" role="status">
                  <span>
                    Open this codebase in Cursor and invoke the skill tax-document-classification.
                    {suggestSummaries ? ` ${SUMMARIES_SKILL_NOTE}` : ""}
                  </span>
                  <button type="button" onClick={() => setSorterReminder(false)}>Dismiss</button>
                </p>
              ) : null}
              {frameMode === "checklist" ? (
                <>
                  <h2 id="check-heading" className="font-display text-2xl text-stone-900">
                    {checklistTitle(session)}
                  </h2>
                  {checklist.length === 0 ? (
                    <p className="mt-2 text-stone-700">Answer a question to list forms and lines. Nothing is assumed yet.</p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-3">
                      {checklist.map((item) => (
                        <li key={item.id} className="rounded-md border border-stone-200 bg-[#fffdf8] px-3 py-2">
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
                  )}
                </>
              ) : frameMode === "costs" ? (
                <>
                  <h2 id="check-heading" className="font-display text-2xl text-stone-900">
                    Tax Pro Costs
                  </h2>
                  <p className="mt-2 text-sm text-stone-600">
                    Published prices for preparing a return of this shape. These are not tax figures and not a quote unless a case study loaded one.
                  </p>
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
                          </p>
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
              ) : (
                <DocumentSorter
                  onUploaded={() => setSorterReminder(true)}
                  onSuggestSummaries={setSuggestSummaries}
                />
              )}
            </div>
          ) : (
            <button type="button" className="question-dock-tile" onClick={openChecklist}>
              <p id="check-heading" className="truncate font-medium text-stone-900">{frameMode === "costs" ? "Tax Pro Costs" : frameMode === "sorter" ? "Document Sorter" : checklistTitle(session)}</p>
            </button>
          )}
        </section>
        <aside
          ref={dockRef}
          className={dockCollapsed ? "question-dock is-collapsed" : "question-dock"}
          aria-label="Selected chart node"
          style={dockCollapsed
            ? { height: "3rem", maxHeight: "3rem", ["--dock-scale" as string]: 1 }
            : { height: dockHeight ?? undefined, maxHeight: dockHeight ?? undefined, ["--dock-scale" as string]: dockScale }}
        >
          <button
            type="button"
            className="question-dock-resize"
            aria-label="Resize the bottom panel"
            onPointerDown={resizeDock}
            onKeyDown={nudgeDock}
          />
          <button
            type="button"
            className="question-dock-collapse"
            aria-expanded={!dockCollapsed}
            aria-label={dockCollapsed ? "Expand the bottom panel" : "Collapse the bottom panel"}
            onClick={dockCollapsed ? expandDock : collapseDock}
          >
            <ShortcutText text={dockCollapsed ? "Expand" : "Hide"} index={dockCollapsed ? 1 : 0} />
          </button>
          {dockCollapsed ? (
            <button type="button" className="question-dock-tile" onClick={expandDock}>
              <p className="truncate font-medium text-stone-900">{selected ? selected.title : "Pick a box"}</p>
            </button>
          ) : null}
          <div className={dockCollapsed ? "hidden" : "question-dock-inner flex flex-col gap-4"}>
            <section className="panel" aria-labelledby="question-heading">
              <div className="flex items-start justify-between gap-3">
                <h2 id="question-heading" className="font-display text-2xl text-stone-900">
                  {selected ? selected.title : "Pick a box"}
                </h2>
                <div className="flex items-center gap-2">
                  {selected ? (
                    <ShortcutTip label="Ask AI" index={1}>
                    <button type="button" className="ai-open" aria-label={`Ask AI about ${selected.title}`} onClick={() => setPromptOpen(true)}>
                      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <path fill="currentColor" d="M8 1.2 9.1 6 14 7.2 9.1 8.4 8 13.2 6.9 8.4 2 7.2 6.9 6z" />
                      </svg>
                    </button>
                    </ShortcutTip>
                  ) : null}
                  {repeatable && stored?.answerId === "yes" ? (
                    <ShortcutTip label="Add another" index={1}>
                    <button type="button" className="add-instance" onClick={addAnotherInstance} aria-label={`Add another ${repeatable.singular}`} title={`Add another ${repeatable.singular}`}>
                      +
                    </button>
                    </ShortcutTip>
                  ) : null}
                </div>
              </div>
              {(() => {
                const scope = selected ? instanceScope(selected.id) ?? (repeatableNodes[selected.id] ? selected.id : null) : null;
                const names = scope ? session.instances[scope] ?? [] : [];
                if (!scope || names.length < 2) return null;
                const active = session.activeInstance[scope] ?? 0;
                return (
                  <div className="instance-switch" role="tablist" aria-label="Which record this path is checking">
                    {names.map((name, index) => (
                      <button
                        key={`${scope}-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={index === active}
                        className={index === active ? "year-btn year-btn-on" : "year-btn"}
                        onClick={() => switchInstance(scope, index)}
                      >
                        {name.trim() || `Record ${index + 1}`}
                      </button>
                    ))}
                  </div>
                );
              })()}
              {selected?.kind === "check" ? (
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
              {selected ? (
                <div className="dock-tabs" role="tablist" aria-label="Answer, information, or comments">
                  {asksForAnswer(selected) ? (
                    <button type="button" role="tab" aria-selected={dockTab === "answer"} className={dockTab === "answer" ? "dock-tab dock-tab-on" : "dock-tab"} onClick={() => setDockTab("answer")}>
                      <ShortcutText text="Answer" index={0} />
                    </button>
                  ) : null}
                  {selected.tipId ? (
                    <button type="button" role="tab" aria-selected={dockTab === "info"} className={dockTab === "info" ? "dock-tab dock-tab-on" : "dock-tab"} onClick={() => setDockTab("info")}>
                      <ShortcutText text="Information" index={1} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dockTab === "comments"}
                    aria-label={selectedComment?.trim() ? "Comments, this box has a comment" : "Comments"}
                    className={`dock-tab${dockTab === "comments" ? " dock-tab-on" : ""}${selectedComment?.trim() ? " dock-tab-noted" : ""}`}
                    onClick={() => setDockTab("comments")}
                  >
                    <ShortcutText text="Comments" index={1} />
                    {selectedComment?.trim() ? <span className="dock-tab-mark" aria-hidden="true" /> : null}
                  </button>
                </div>
              ) : null}
              {selected && dockTab === "comments" ? (
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
              ) : selected?.tipId && dockTab === "info" ? (
                <DockInfo tipId={selected.tipId} session={session} />
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
                </>
              ) : selected?.tipId ? (
                <DockInfo tipId={selected.tipId} session={session} />
              ) : !selected ? (
                <p className="mt-2 text-stone-700">Choose a box on the chart.</p>
              ) : null}
              {open.length > 0 ? (
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

            {session.revealed.includes("deduction_result") ? (
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
          </div>
        </aside>
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
              setDockTab(firstDockTab(getNode(nextId)));
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
