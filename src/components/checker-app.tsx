"use client";

import { useEffect, useMemo, useState } from "react";
import { MermaidView } from "@/components/mermaid-view";
import { DISCLAIMER } from "@/lib/disclaimer";
import {
  applyAnswer,
  applyCase,
  blankSession,
  buildChecklist,
  caseStudies,
  checklistTitle,
  costReport,
  deductionNarrative,
  edgeTips,
  edgesFor,
  getNode,
  mermaidSource,
  openQuestions,
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

export function CheckerApp() {
  const [session, setSession] = useState<Session>(() => blankSession());
  const [selectedId, setSelectedId] = useState<string>("filing_status");
  const [toastId, setToastId] = useState<string | null>(null);
  const [modalId, setModalId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const source = useMemo(() => mermaidSource(session), [session]);
  const checklist = useMemo(() => buildChecklist(session), [session]);
  const cost = useMemo(() => costReport(session), [session]);
  const deduction = useMemo(() => deductionNarrative(session), [session]);
  const open = openQuestions(session);
  const selected = session.revealed.includes(selectedId) ? getNode(selectedId) : null;
  const stored = selected ? session.answers[selected.id] : undefined;
  const study = caseStudies.find((item) => item.id === session.caseStudyId) ?? null;
  const toast = toastId ? tips[toastId] : null;
  const modal = modalId ? tipBody(modalId, session) : null;

  useEffect(() => {
    setDraft(session.answers[selectedId]?.text ?? "");
  }, [selectedId, session]);

  useEffect(() => {
    if (!modalId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalId]);

  const nodeTips = useMemo(
    () =>
      session.revealed
        .map((id) => getNode(id))
        .filter((node) => node.tipId)
        .map((node) => ({
          id: node.id,
          tipId: node.tipId as string,
          label: `Information about ${node.title}`,
        })),
    [session],
  );

  const visibleEdgeTips = useMemo(() => {
    const visibleEdges = new Set(edgesFor(session).map((edge) => `${edge.from}->${edge.to}`));
    return edgeTips
      .filter((edge) => visibleEdges.has(`${edge.from}->${edge.to}`))
      .map((edge) => ({
        ...edge,
        label: `Information on the line from ${getNode(edge.from).title} to ${getNode(edge.to).title}`,
      }));
  }, [session]);

  function loadBlank() {
    const next = blankSession();
    setSession(next);
    setSelectedId("filing_status");
    setToastId(null);
    setModalId(null);
    setDraft("");
  }

  function loadCase(id: string) {
    const next = applyCase(id);
    setSession(next);
    const firstOpen = openQuestions(next)[0] ?? "form_1040";
    setSelectedId(firstOpen);
    setToastId(null);
    setModalId(null);
    setDraft("");
  }

  function answer(nodeId: string, answerId: string, text?: string) {
    const next = applyAnswer(session, nodeId, answerId, text);
    setSession(next);
    setDraft("");
    if (!next.revealed.includes(selectedId)) {
      setSelectedId(openQuestions(next)[0] ?? nodeId);
    }
  }

  function showTip(tipId: string) {
    setToastId(tipId);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-300 bg-[#fffdf8]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-stone-500">FreeTaxUSA</p>
              <h1 className="font-display text-3xl text-stone-900 sm:text-4xl">Final check</h1>
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
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        <section aria-labelledby="cases-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="cases-heading" className="font-display text-2xl text-stone-900">
              Start blank or open a case study
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <button type="button" className={study ? "case-card" : "case-card case-card-on"} onClick={loadBlank}>
              <span className="font-display text-xl">Start blank</span>
              <span className="text-sm text-stone-700">
                Tax year 2025 is selected. Nothing else is filled in. Answer only what is on the return you are checking.
              </span>
            </button>
            {caseStudies.map((item) => {
              const on = session.caseStudyId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={on ? "case-card case-card-on" : "case-card"}
                  aria-pressed={on}
                  onClick={() => loadCase(item.id)}
                >
                  <span className="font-display text-xl">{item.title}</span>
                  <span className="text-sm text-stone-700">{item.summary}</span>
                  <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
                    {on ? "Open — click again to reset" : "Open this saved path"}
                  </span>
                </button>
              );
            })}
          </div>
          {study ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
              {study.title} is a saved set of answers, not tax advice. Unanswered items stay on the unknown path or stay open. The info buttons on the chart still open the same notes.
            </p>
          ) : null}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.9fr)]">
          <section aria-labelledby="chart-heading" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="chart-heading" className="font-display text-2xl text-stone-900">
                What this path turns up
              </h2>
              <p className="text-sm text-stone-600">
                Click a box to answer it. The <span className="info-dot info-dot-inline">i</span> opens a note and does not answer the question.
              </p>
            </div>
            <MermaidView
              source={source}
              nodeIds={session.revealed}
              nodeTips={nodeTips}
              edgeTips={visibleEdgeTips}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onTip={showTip}
            />
            <p className="mt-2 text-sm text-stone-600">
              A rust outline marks an answer left unknown. Those nodes are not treated as a yes.
            </p>
          </section>

          <div className="flex flex-col gap-4">
            <section className="panel" aria-labelledby="question-heading">
              <h2 id="question-heading" className="font-display text-2xl text-stone-900">
                {selected ? selected.title : "Pick a box"}
              </h2>
              {selected?.tipId ? (
                <button type="button" className="btn-secondary mt-3" onClick={() => showTip(selected.tipId!)}>
                  i · Note on this box
                </button>
              ) : null}
              {selected?.kind === "question" ? (
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
                </>
              ) : selected ? (
                <>
                  <p className="mt-2 text-stone-800">{selected.help ?? selected.chart}</p>
                  <p className="mt-2 text-sm text-stone-600">
                    This is a line to verify in FreeTaxUSA. It is not an instruction to start the form.
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
                        <button type="button" className="text-left text-sm text-rust underline-offset-2 hover:underline" onClick={() => setSelectedId(id)}>
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
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
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

          <section className="panel" aria-labelledby="cost-heading">
            <h2 id="cost-heading" className="font-display text-2xl text-stone-900">
              Preparation cost comparison
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Published prices for preparing a return of this shape. These are not tax figures and not a quote unless a case study loaded one.
            </p>
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
          </section>
        </div>
      </main>

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
