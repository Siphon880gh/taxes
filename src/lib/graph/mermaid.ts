import { getNode, listNodes } from "./nodes";
import { activeInstanceName, instanceScope, readAnswer } from "./session";
import type { SectionId, Session } from "./types";

function escapeUser(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    return "'";
  });
}

function escapeLabel(value: string): string {
  return value.replace(/"/g, "'").replace(/\$/g, "USD ").replace(/\r?\n/g, " ");
}

export function scheduleCLabel(session: Session | null): string {
  const names = session?.answers.se_names?.text?.trim();
  const safeNames = names ? escapeUser(names) : "";
  const named =
    names && /nursing/i.test(names) && /coding/i.test(names)
      ? "Schedule C is for self-employment income and expenses, including the 1099-NEC freelance jobs (nursing and coding)."
      : names
        ? `Schedule C is for self-employment income and expenses, including the 1099-NEC freelance jobs (${safeNames}).`
        : "Schedule C is for self-employment income and expenses, including 1099-NEC freelance jobs.";
  return withInstance(`${named}<br/>Verify on the prepared return. Not an instruction to start a form.`, "schedule_c", session);
}

function withInstance(label: string, id: string, session: Session | null): string {
  if (!session) return label;
  const scope = instanceScope(id);
  if (!scope) return label;
  const name = activeInstanceName(session, scope);
  if (!name) return label;
  return `${label}<br/>Checking ${escapeUser(name)}`;
}

export function nodeLabel(id: string, session: Session | null): string {
  const node = getNode(id);
  if (id === "schedule_c") return scheduleCLabel(session);
  if (session && node.kind === "question") {
    const stored = readAnswer(session, id);
    if (stored) {
      if (node.textInput && stored.answerId === node.textInput.answerId) {
        return withInstance(`${escapeUser(node.title)}<br/>${escapeUser(stored.text?.trim() || "Entered")}`, id, session);
      }
      const choice = node.answers?.find((answer) => answer.id === stored.answerId);
      const label = choice?.label ?? stored.answerId;
      return withInstance(`${escapeUser(node.title)}<br/>${escapeUser(label)}`, id, session);
    }
  }
  return withInstance(node.chart, id, session);
}

export type Edge = { from: string; to: string; label: string };

/** A fan-out wider than this is drawn as section clusters instead of one box per topic. */
export const NODE_GROUP_THRESHOLD = 7;

/** Same section names as the decision-graph writeup. A cluster uses the category, not a bucket. */
const sectionTitle: Record<SectionId, string> = {
  start: "Year and filing status",
  income: "W-2 wages",
  se: "Self-employment",
  payments: "Payment apps and Form 1099-K",
  rental: "Rental real estate",
  invest: "Interest, capital gains, and digital assets",
  other: "Retirement, HSA, education, estimates, and dependents",
  deductions: "Standard deduction and itemizing",
  flow: "How the schedules meet Form 1040",
};

export type ChartGroup = {
  id: string;
  title: string;
  count: number;
  memberIds: string[];
  /** True when the member topics are drawn under the cluster. */
  open: boolean;
  /** An answered topic stays visible, so its cluster cannot collapse. */
  lockedOpen: boolean;
};

export type ChartView = {
  ids: string[];
  edges: Edge[];
  groups: ChartGroup[];
};

function groupId(from: string, section: SectionId): string {
  return `group_${from}_${section}`;
}

function groupLabel(group: ChartGroup): string {
  return `${group.title}<br/>${group.count} topics`;
}

type WorkingGroup = ChartGroup & { from: string; edgeLabel: string };

export function chartView(session: Session, expandedGroupIds: readonly string[] = []): ChartView {
  const revealed = new Set(session.revealed);
  const expanded = new Set(expandedGroupIds);
  const groups: WorkingGroup[] = [];
  const claimed = new Set<string>();

  for (const id of session.revealed) {
    const node = getNode(id);
    if (node.kind !== "question") continue;
    const stored = readAnswer(session, id);
    if (!stored) continue;
    const answer = node.answers?.find((item) => item.id === stored.answerId);
    const next =
      answer?.next ??
      (node.textInput && stored.answerId === node.textInput.answerId ? node.textInput.next : null);
    const edgeLabel = answer?.edge ?? answer?.label ?? node.textInput?.edge ?? "Entered";
    if (!next) continue;
    const members = next.filter((to) => revealed.has(to) && !claimed.has(to));
    if (members.length <= NODE_GROUP_THRESHOLD) continue;

    const bySection = new Map<SectionId, string[]>();
    for (const memberId of members) {
      const section = getNode(memberId).section;
      const list = bySection.get(section);
      if (list) list.push(memberId);
      else bySection.set(section, [memberId]);
    }
    for (const [section, sectionMembers] of bySection) {
      if (sectionMembers.length < 2) continue;
      const lockedOpen = sectionMembers.some((memberId) => readAnswer(session, memberId));
      const idForGroup = groupId(id, section);
      groups.push({
        id: idForGroup,
        title: sectionTitle[section],
        count: sectionMembers.length,
        memberIds: sectionMembers,
        open: lockedOpen || expanded.has(idForGroup),
        lockedOpen,
        from: id,
        edgeLabel,
      });
      sectionMembers.forEach((memberId) => claimed.add(memberId));
    }
  }

  const hidden = new Set(groups.filter((group) => !group.open).flatMap((group) => group.memberIds));
  const memberGroup = new Map<string, WorkingGroup>();
  for (const group of groups) {
    for (const memberId of group.memberIds) memberGroup.set(memberId, group);
  }

  const ids: string[] = [];
  const seenGroups = new Set<string>();
  for (const id of session.revealed) {
    const group = memberGroup.get(id);
    if (group && !seenGroups.has(group.id)) {
      ids.push(group.id);
      seenGroups.add(group.id);
    }
    if (!hidden.has(id)) ids.push(id);
  }

  const edges: Edge[] = [];
  for (const edge of edgesFor(session)) {
    if (hidden.has(edge.from) || hidden.has(edge.to)) continue;
    if (groups.some((group) => group.from === edge.from && group.memberIds.includes(edge.to))) continue;
    edges.push(edge);
  }
  for (const group of groups) {
    edges.push({ from: group.from, to: group.id, label: group.edgeLabel });
    if (!group.open) continue;
    for (const memberId of group.memberIds) {
      edges.push({ from: group.id, to: memberId, label: "" });
    }
  }

  return {
    ids,
    edges,
    groups: groups.map((group) => ({
      id: group.id,
      title: group.title,
      count: group.count,
      memberIds: group.memberIds,
      open: group.open,
      lockedOpen: group.lockedOpen,
    })),
  };
}

export function edgesFor(session: Session | null): Edge[] {
  const edges: Edge[] = [];
  const nodes = session ? session.revealed.map((id) => getNode(id)) : listNodes();
  const revealed = new Set(session ? session.revealed : listNodes().map((node) => node.id));
  for (const node of nodes) {
    if (node.kind === "question") {
      const answers = session
        ? node.answers?.filter((answer) => answer.id === readAnswer(session, node.id)?.answerId)
        : node.answers;
      for (const answer of answers ?? []) {
        for (const to of answer.next) {
          if (revealed.has(to)) {
            edges.push({ from: node.id, to, label: answer.edge ?? answer.label });
          }
        }
      }
      if (!session && node.textInput) {
        for (const to of node.textInput.next) {
          edges.push({ from: node.id, to, label: node.textInput.edge ?? "Entered" });
        }
      }
      if (session && node.textInput && readAnswer(session, node.id)?.answerId === node.textInput.answerId) {
        for (const to of node.textInput.next) {
          if (revealed.has(to)) {
            edges.push({ from: node.id, to, label: node.textInput.edge ?? "Entered" });
          }
        }
      }
    }
    for (const to of node.flowsTo ?? []) {
      if (revealed.has(to)) {
        edges.push({ from: node.id, to, label: "flows onto" });
      }
    }
  }
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mermaidSource(session: Session | null, expandedGroupIds: readonly string[] = []): string {
  const view = session ? chartView(session, expandedGroupIds) : null;
  const ids = view ? view.ids : listNodes().map((node) => node.id);
  const groups = new Map(view?.groups.map((group) => [group.id, group]) ?? []);
  const lines = ["flowchart TD"];
  for (const id of ids) {
    const group = groups.get(id);
    const label = group ? groupLabel(group) : nodeLabel(id, session);
    lines.push(`  ${id}["${escapeLabel(label)}"]`);
  }
  for (const edge of view ? view.edges : edgesFor(session)) {
    if (!edge.label) {
      lines.push(`  ${edge.from} --> ${edge.to}`);
      continue;
    }
    lines.push(`  ${edge.from} -->|${JSON.stringify(escapeLabel(edge.label))}| ${edge.to}`);
  }
  if (session && view) {
    const unknownIds = ids.filter((id) => {
      if (groups.has(id)) return false;
      if (readAnswer(session, id)?.answerId === "unknown") return true;
      return id.startsWith("flag_");
    });
    if (unknownIds.length > 0) {
      lines.push("  classDef unknown fill:#fff7ed,stroke:#c2410c,stroke-width:2px");
      lines.push(`  class ${unknownIds.join(",")} unknown`);
    }
    if (view.groups.length > 0) {
      lines.push("  classDef cluster fill:#f5f5f4,stroke:#57534e,stroke-dasharray:4 3");
      lines.push(`  class ${view.groups.map((group) => group.id).join(",")} cluster`);
    }
  }
  return lines.join("\n");
}
