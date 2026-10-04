"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MermaidView } from "@/components/mermaid-view";
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
  openQuestions,
  instanceScope,
  readAnswer,
  removeInstance,
  renameInstance,
  repeatableNodes,
  selectInstance,
  tips,
} from "@/lib/graph";
import { answerOf } from "@/lib/graph/session";
import { parseYear } from "@/lib/graph/thresholds";
import type { Session, TipBody } from "@/lib/graph/types";

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
  const [modalId, setModalId] = useState<string | null>(null);
  const [costOpen, setCostOpen] = useState(false);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [levelExpanded, setLevelExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [libraryStuck, setLibraryStuck] = useState(false);
  const librarySentinel = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [dockTab, setDockTab] = useState<"answer" | "info">("answer");
  const dockRef = useRef<HTMLElement>(null);
  const dockBaseHeight = useRef<number | null>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);
  const dockScale =
    dockHeight == null || !dockBaseHeight.current
      ? 1
      : Math.min(1.65, Math.max(0.85, dockHeight / dockBaseHeight.current));

  function clampDockHeight(next: number) {
    const max = Math.min(window.innerHeight * 0.72, 42 * 16);
    return Math.min(max, Math.max(9 * 16, next));
  }

  function resizeDock(event: ReactPointerEvent<HTMLButtonElement>) {
    const dock = dockRef.current;
    if (!dock) return;
    const startY = event.clientY;
    const startHeight = dock.getBoundingClientRect().height;
    if (dockBaseHeight.current == null) dockBaseHeight.current = startHeight;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
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
    const current = dockHeight ?? dock.getBoundingClientRect().height;
    if (dockBaseHeight.current == null) dockBaseHeight.current = current;
    setDockHeight(clampDockHeight(current + (event.key === "ArrowUp" ? 28 : -28)));
  }

  const view = useMemo(() => chartView(session, expandedGroups), [session, expandedGroups]);
  const source = useMemo(() => mermaidSource(session, expandedGroups), [session, expandedGroups]);
  const checklist = useMemo(() => buildChecklist(session), [session]);
  const cost = useMemo(() => costReport(session), [session]);
  const deduction = useMemo(() => deductionNarrative(session), [session]);
  const open = openQuestions(session);
  const selected = session.revealed.includes(selectedId) ? getNode(selectedId) : null;
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

  useEffect(() => {
    const sentinel = librarySentinel.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setLibraryStuck(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!modalId && !costOpen && !purposeOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalId(null);
      if (event.key === "Escape") setCostOpen(false);
      if (event.key === "Escape") setPurposeOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalId, costOpen, purposeOpen]);

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
    setToastId(null);
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
    setToastId(null);
    setModalId(null);
    setLevelExpanded(false);
    setExpandedGroups([]);
    setTopCollapsed(false);
    setDraft("");
  }

  function answer(nodeId: string, answerId: string, text?: string) {
    const next = applyAnswer(session, nodeId, answerId, text);
    setSession(next);
    setDraft("");
    if (!next.revealed.includes(selectedId)) {
      setSelectedId(openQuestions(next)[0] ?? nodeId);
      setLevelExpanded(false);
    }
  }

  function showTip(tipId: string, nodeId?: string) {
    const node = nodeId ? getNode(nodeId) : null;
    const hasChoices = Boolean(node && node.kind === "question" && (node.answers?.length || node.textInput));
    if (node && hasChoices && node.tipId) {
      setSelectedId(node.id);
      setDockTab("info");
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
    setDockTab("answer");
    setTopCollapsed(true);
  }

  function addAnotherInstance() {
    if (!selected || !repeatable) return;
    setSession((current) => addInstance(current, selected.id));
  }

  return (
    <div className="min-h-screen">
      <header className={topCollapsed ? "hidden" : "border-b border-stone-300 bg-[#fffdf8]"}>
        {topCollapsed ? null : (
          <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-stone-500">Return review</p>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl text-stone-900 sm:text-4xl">Tax Final Confirmation</h1>
                <button type="button" className="info-dot info-dot-inline" aria-label="About Tax Final Confirmation" onClick={() => setPurposeOpen(true)}>
                  i
                </button>
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

      <main className="flex w-full flex-col gap-6 px-4 py-6 pb-[25rem] sm:px-6 lg:px-8">
        <div ref={librarySentinel} className="h-px" aria-hidden="true" />
        <section aria-labelledby="cases-heading" className="path-library">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-stone-300 bg-[#fffdf8] px-4 py-3">
            {libraryStuck || topCollapsed ? (
              <div className="path-library-identity">
                <p className="font-display text-lg text-stone-900">Tax Final Confirmation</p>
                <span className="text-sm text-stone-700">Return year: {returnYear}</span>
                {topCollapsed ? (
                  <button type="button" className="btn-secondary" onClick={() => setTopCollapsed(false)}>Expand</button>
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
          </div>
        </section>
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
              <button type="button" className="btn-secondary" onClick={() => setCostOpen(true)}>
                Preparation cost comparison
              </button>
          </div> : null}
          <MermaidView
            source={source}
            nodeIds={view.ids}
            nodeTips={nodeTips}
            edgeTips={visibleEdgeTips}
            selectedId={selectedId}
            onSelect={selectNode}
            onTip={showTip}
            levelNodes={levelNodes.map((id) => {
              const group = view.groups.find((item) => item.id === id);
              return { id, title: group ? `${group.title} (${group.count})` : getNode(id).title };
            })}
            levelExpanded={levelExpanded}
            onToggleLevel={() => setLevelExpanded((expanded) => !expanded)}
          />
          <p className="mt-2 text-sm text-stone-600">
            A rust outline marks an answer left unknown. Those nodes are not treated as a yes.
          </p>
        </section>

        <aside
          ref={dockRef}
          className="question-dock"
          aria-label="Selected chart node"
          style={{ height: dockHeight ?? undefined, maxHeight: dockHeight ?? undefined, ["--dock-scale" as string]: dockScale }}
        >
          <button
            type="button"
            className="question-dock-resize"
            aria-label="Resize the bottom panel"
            onPointerDown={resizeDock}
            onKeyDown={nudgeDock}
          />
          <div className="question-dock-inner flex flex-col gap-4">
            <section className="panel" aria-labelledby="question-heading">
              <div className="flex items-start justify-between gap-3">
                <h2 id="question-heading" className="font-display text-2xl text-stone-900">
                  {selected ? selected.title : "Pick a box"}
                </h2>
                {repeatable && stored?.answerId === "yes" ? (
                  <button type="button" className="add-instance" onClick={addAnotherInstance} aria-label={`Add another ${repeatable.singular}`} title={`Add another ${repeatable.singular}`}>
                    +
                  </button>
                ) : null}
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
                        onClick={() => setSession((current) => selectInstance(current, scope, index))}
                      >
                        {name.trim() || `Record ${index + 1}`}
                      </button>
                    ))}
                  </div>
                );
              })()}
              {selected && selected.kind === "question" && selected.tipId && (selected.answers?.length || selected.textInput) ? (
                <div className="dock-tabs" role="tablist" aria-label="Answer or information">
                  <button type="button" role="tab" aria-selected={dockTab === "answer"} className={dockTab === "answer" ? "dock-tab dock-tab-on" : "dock-tab"} onClick={() => setDockTab("answer")}>
                    Answer
                  </button>
                  <button type="button" role="tab" aria-selected={dockTab === "info"} className={dockTab === "info" ? "dock-tab dock-tab-on" : "dock-tab"} onClick={() => setDockTab("info")}>
                    Information
                  </button>
                </div>
              ) : selected?.tipId ? (
                <button type="button" className="btn-secondary mt-3" onClick={() => showTip(selected.tipId!)}>
                  i · Note on this box
                </button>
              ) : null}
              {selected && selected.kind === "question" && selected.tipId && dockTab === "info" && (selected.answers?.length || selected.textInput) ? (
                <DockInfo tipId={selected.tipId} session={session} />
              ) : selected?.kind === "question" ? (
                <>
                  <p className="mt-2 text-stone-800">{selected.prompt}</p>
                  {selected.help ? <p className="mt-2 text-sm text-stone-600">{selected.help}</p> : null}
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
                        Use this answer
                      </button>
                    </form>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2">
                    {selected.answers?.map((choice) => {
                      const pressed = stored?.answerId === choice.id && !stored.text;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          aria-pressed={pressed}
                          className={choice.id === "unknown" ? "btn-unknown" : pressed ? "btn-primary" : "btn-secondary"}
                          onClick={() => answer(selected.id, choice.id)}
                        >
                          {choice.label}
                        </button>
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
                          + Add another
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
              ) : selected ? (
                <>
                  <p className="mt-2 text-stone-800">{selected.help ?? selected.chart}</p>
                  <p className="mt-2 text-sm text-stone-600">
                    This is a line to verify on the prepared return. It is not an instruction to start the form.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-stone-700">Choose a box on the chart.</p>
              )}
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

        <div className="grid items-start gap-6">
          <section className="panel" aria-labelledby="check-heading">
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
          </section>

        </div>
      </main>

      {costOpen ? (
        <div className="sidebar-backdrop" role="presentation" onClick={() => setCostOpen(false)}>
          <aside
            className="cost-sidebar"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cost-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="cost-heading" className="font-display text-2xl text-stone-900">
                Preparation cost comparison
              </h2>
              <button type="button" className="btn-secondary" onClick={() => setCostOpen(false)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-stone-600">
              Published prices for preparing a return of this shape. These are not tax figures and not a quote unless a case study loaded one.
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
          </aside>
        </div>
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
                Read more
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
  );
}
