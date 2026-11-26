"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stageOverviewFrom, type StageOverview } from "./flow";
import { stageListingFrom, type SortState, type StageFile } from "./return-folders";
import { owedReportsFrom, type OwedReportsState } from "./owed-reports";
import { sorterFetch } from "./sorter-client";
import { sorterEndpoint, unreachableMessage } from "./sorter-endpoint";

/** How often coming back to the window re-checks for the reports, at most. */
const FOCUS_RECHECK_MS = 5000;

/**
 * Watches sorter/api.php for Owed Audit.md and Owe Audit Breakdown - Rent.md: on load, when the window gets focus
 * again (the skill runs in another app), on refresh(), and whenever the Document Sorter hands over a fresh status.
 */
export function useOwedReports() {
  const [state, setState] = useState<OwedReportsState>({ status: "loading" });
  /** Staged document count and whether Summaries.md exists, for the Start here progress cues; null until known. */
  const [overview, setOverview] = useState<StageOverview | null>(null);
  const [listing, setListing] = useState<{ files: StageFile[]; categories: string[]; sortStates: Record<string, SortState>; summaryFolders: string[] }>({ files: [], categories: [], sortStates: {}, summaryFolders: [] });
  const lastCheck = useRef(0);

  const refresh = useCallback(async (): Promise<OwedReportsState> => {
    lastCheck.current = Date.now();
    const endpoint = sorterEndpoint();
    let next: OwedReportsState;
    if (!endpoint.ok) {
      next = { status: "error", message: endpoint.message };
    } else {
      try {
        const response = await sorterFetch(endpoint.url);
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        const reports = response.ok ? owedReportsFrom(body) : null;
        if (response.ok) {
          setOverview(stageOverviewFrom(body));
          setListing(stageListingFrom(body) ?? { files: [], categories: [], sortStates: {}, summaryFolders: [] });
        }
        next = reports ? { status: "ready", reports } : { status: "error", message: body.error || "The document sorter did not answer." };
      } catch (err) {
        next = { status: "error", message: unreachableMessage(err) };
      }
    }
    setState(next);
    return next;
  }, []);

  /** Take the reports from a status the Document Sorter already fetched. */
  const accept = useCallback((body: unknown) => {
    const reports = owedReportsFrom(body);
    if (!reports) return;
    setOverview(stageOverviewFrom(body));
    setListing(stageListingFrom(body) ?? { files: [], categories: [], sortStates: {}, summaryFolders: [] });
    lastCheck.current = Date.now();
    setState({ status: "ready", reports });
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > FOCUS_RECHECK_MS) void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  return { state, overview, listing, refresh, accept };
}
