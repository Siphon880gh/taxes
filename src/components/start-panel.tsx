"use client";

import type { ReactNode } from "react";
import { PANEL_LEDES, ROUTES, spokenPrefix, stagedLabel, type FrameMode, type Route, type StageOverview } from "@/lib/flow";
import { OWED_AUDIT_NAME, RENT_BREAKDOWN_NAME, type OwedReportsState } from "@/lib/owed-reports";

type Props = {
  overview: StageOverview | null;
  reports: OwedReportsState;
  auditDisabled: boolean;
  checklist: { done: number; total: number };
  openCount: number;
  nextQuestion: string | null;
  onOpen: (mode: FrameMode) => void;
  onOpenAudit: () => void;
  onAnswerNext: () => void;
  onOpenChecklist: () => void;
};

/** Where things stand for each step, in a few words. */
function cues(props: Props) {
  const { overview, reports, checklist, openCount } = props;
  const unreachable = reports.status === "error" && overview == null;
  const staged = overview == null ? (unreachable ? "Sorter not reachable; open it for details" : "Checking sorter/stage…") : stagedLabel(overview.staged);
  const summaries = overview == null ? null : overview.summaries ? "Summaries.md found" : "No Summaries.md yet";
  let audit: string | null = null;
  if (reports.status === "ready") {
    const { audits, rentBreakdowns } = reports.reports;
    audit = audits.length
      ? `${OWED_AUDIT_NAME} found${rentBreakdowns.length ? ", with the rent breakdown" : ""}`
      : rentBreakdowns.length
        ? `${RENT_BREAKDOWN_NAME} found`
        : `No ${OWED_AUDIT_NAME} yet`;
  }
  const self =
    checklist.total === 0
      ? "No forms yet; answer the first chart question"
      : `${checklist.done} of ${checklist.total} forms confirmed${openCount ? ` · ${openCount} open ${openCount === 1 ? "question" : "questions"}` : ""}`;
  return { staged, empty: overview?.staged === 0, summaries, audit, self };
}

function RouteCard({ route, cue, children }: { route: Route; cue: string | null; children: ReactNode }) {
  const headingId = `route-${route.id}-heading`;
  return (
    <li className="flow-card">
      <h4 id={headingId}>
        <span className="flow-step" aria-hidden="true">
          {route.step}
        </span>
        <span className="sr-only">{spokenPrefix(route)}</span>
        <span className="route-lead" aria-hidden="true">
          {route.lead}
        </span>
        {route.label}
      </h4>
      <p>{route.summary}</p>
      {cue ? <p className="flow-cue">{cue}</p> : null}
      <div className="flow-actions">{children}</div>
    </li>
  );
}

/** The default panel: step 1, then three routes to pick from, and how the chart relates to them. */
export function StartPanel(props: Props) {
  const { onOpen, onOpenAudit, onAnswerNext, onOpenChecklist, auditDisabled, nextQuestion } = props;
  const cue = cues(props);
  const [preparer, audit, self] = ROUTES;
  return (
    <div className="start-panel">
      <h2 id="check-heading" className="font-display text-2xl text-stone-900">
        Start here
      </h2>
      <p className="panel-lede">{PANEL_LEDES.start}</p>
      <ol className="flow-steps">
        <li className="flow-step-block">
          <h3 id="flow-step-1">
            <span className="flow-step" aria-hidden="true">
              1
            </span>
            <span className="sr-only">Step 1: </span>
            Gather and sort your documents
          </h3>
          <div className="flow-card">
            <p>Upload W-2s, 1099s, statements and last year&apos;s return. The sorter files them into folders in sorter/stage, which every route below reads.</p>
            <p className="flow-cue" role="status">
              {cue.staged}
            </p>
            {cue.empty ? <p className="flow-empty">Nothing to sort yet. Start by uploading, or skip to route 2c, which works without documents.</p> : null}
            <div className="flow-actions">
              <button type="button" className="btn-primary" onClick={() => onOpen("sorter")}>
                Open Document Sorter
              </button>
            </div>
          </div>
        </li>
        <li className="flow-step-block">
          <h3 id="flow-step-2">
            <span className="flow-step" aria-hidden="true">
              2
            </span>
            <span className="sr-only">Step 2: </span>
            Pick one route
          </h3>
          <ul className="flow-routes">
            <RouteCard route={preparer} cue={cue.summaries}>
              <button type="button" className="btn-secondary" onClick={() => onOpen("costs")}>
                Open Tax Pro Costs
              </button>
            </RouteCard>
            <RouteCard route={audit} cue={cue.audit}>
              <button
                type="button"
                className="btn-secondary"
                aria-disabled={auditDisabled || undefined}
                aria-describedby={auditDisabled ? "flow-audit-note" : undefined}
                onClick={onOpenAudit}
              >
                Open Return &amp; Owe Audit
              </button>
              {auditDisabled ? (
                <p id="flow-audit-note" className="flow-note">
                  Grayed out until the skill writes {OWED_AUDIT_NAME} into sorter/stage.
                </p>
              ) : null}
            </RouteCard>
            <RouteCard route={self} cue={cue.self}>
              <button type="button" className="btn-secondary" onClick={() => onOpen("guide")}>
                Open Path guide
              </button>
              {nextQuestion ? (
                <button type="button" className="btn-secondary" onClick={onAnswerNext}>
                  Answer next: {nextQuestion}
                </button>
              ) : null}
              <button type="button" className="btn-secondary" onClick={onOpenChecklist}>
                Open Forms Needed
              </button>
            </RouteCard>
          </ul>
        </li>
      </ol>
      <aside className="flow-chart-note" aria-label="About the path chart and Forms Needed">
        <h3>Path guide (2c) is the guided path</h3>
        <p>
          Its chart asks one question at a time, starting with Filing status, and each answer adds the forms and lines that Forms Needed and Tax Pro Costs (2a)
          use. Answer it whenever you like, before or after sorting; the more you answer, the more complete your path gets.
        </p>
        <p>Forms Needed opens that list from any route.</p>
      </aside>
    </div>
  );
}

/** The end of every other panel: from step 1, pick a route; from a route, the other two and Start here. */
export function FlowNext({
  current,
  auditDisabled,
  onOpen,
  onOpenAudit,
}: {
  current: Exclude<FrameMode, "start">;
  auditDisabled: boolean;
  onOpen: (mode: FrameMode) => void;
  onOpenAudit: () => void;
}) {
  const routes = ROUTES.filter((route) => route.mode !== current);
  return (
    <nav className="flow-next" aria-label="Next step">
      <p>{current === "sorter" ? "Documents sorted? Next, pick one route:" : "Or take another route:"}</p>
      <div className="flow-actions">
        {routes.map((route) => {
          const isAudit = route.mode === "audit";
          return (
            <button
              key={route.id}
              type="button"
              className="btn-secondary"
              aria-disabled={isAudit && auditDisabled ? true : undefined}
              onClick={() => (isAudit ? onOpenAudit() : onOpen(route.mode))}
            >
              <span className="flow-step" aria-hidden="true">
                {route.step}
              </span>
              <span className="sr-only">{spokenPrefix(route)}</span>
              <span className="route-lead" aria-hidden="true">
                {route.lead}
              </span>
              {route.label}
            </button>
          );
        })}
        <button type="button" className="flow-back" onClick={() => onOpen("start")}>
          Back to Start here
        </button>
      </div>
    </nav>
  );
}
