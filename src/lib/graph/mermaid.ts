import { numberEntryChart, suggestionChart } from "./allocate";
import { freeEntry, getNode, listNodes } from "./nodes";
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
  const suggestion = suggestionChart(id, session);
  if (suggestion) return withInstance(suggestion, id, session);
  if (session && node.kind === "question") {
    const stored = readAnswer(session, id);
    if (stored) {
      const entry = freeEntry(node);
      if (entry && stored.answerId === entry.answerId) {
        if (node.numberInputs) {
          return withInstance(numberEntryChart(id, stored.text) ?? `${escapeUser(node.title)}<br/>Entered`, id, session);
        }
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

/** A fan-out or a chart level wider than this is drawn as section clusters instead of one box per topic. */
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

type WorkingGroup = ChartGroup & {
  from: string;
  edgeLabel: string;
  incoming: { from: string; label: string }[];
  /** Unanswered topics stay behind the cluster when a level would otherwise exceed the threshold. */
  showAnsweredOnly: boolean;
};

function concealedMembers(session: Session, group: WorkingGroup, expanded: Set<string>): string[] {
  if (!group.open) return group.memberIds;
  if (group.showAnsweredOnly && !expanded.has(group.id)) {
    return group.memberIds.filter((id) => !readAnswer(session, id));
  }
  return [];
}

function assemble(session: Session, groups: WorkingGroup[], expanded: Set<string>): { ids: string[]; edges: Edge[] } {
  const hidden = new Set(groups.flatMap((group) => concealedMembers(session, group, expanded)));
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
    const covered = groups.some(
      (group) => group.memberIds.includes(edge.to) && group.incoming.some((source) => source.from === edge.from),
    );
    if (covered) continue;
    edges.push(edge);
  }
  for (const group of groups) {
    const seen = new Set<string>();
    for (const source of group.incoming) {
      if (hidden.has(source.from) || seen.has(source.from)) continue;
      seen.add(source.from);
      edges.push({ from: source.from, to: group.id, label: source.label });
    }
    if (!group.open) continue;
    for (const memberId of group.memberIds) {
      if (hidden.has(memberId)) continue;
      edges.push({ from: group.id, to: memberId, label: "" });
    }
  }

  const present = new Set(ids);
  const reachable = new Set<string>();
  const queue = present.has("year") ? ["year"] : [];
  while (queue.length) {
    const from = queue.shift()!;
    if (reachable.has(from)) continue;
    reachable.add(from);
    for (const edge of edges) {
      if (edge.from === from && present.has(edge.to)) queue.push(edge.to);
    }
  }
  return {
    ids: ids.filter((id) => reachable.has(id)),
    edges: edges.filter((edge) => reachable.has(edge.from) && reachable.has(edge.to)),
  };
}

function levelsOf(ids: string[], edges: Edge[]): Map<number, string[]> {
  const depth = new Map<string, number>([["year", 0]]);
  const queue = ["year"];
  const present = new Set(ids);
  while (queue.length) {
    const from = queue.shift()!;
    const level = depth.get(from)!;
    for (const edge of edges) {
      if (edge.from !== from || !present.has(edge.to) || depth.has(edge.to)) continue;
      depth.set(edge.to, level + 1);
      queue.push(edge.to);
    }
  }
  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const level = depth.get(id) ?? 0;
    const list = byLevel.get(level);
    if (list) list.push(id);
    else byLevel.set(level, [id]);
  }
  return byLevel;
}

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
    const entry = freeEntry(node);
    const next = answer?.next ?? (entry && stored.answerId === entry.answerId ? entry.next : null);
    const edgeLabel = answer?.edge ?? answer?.label ?? entry?.edge ?? "Entered";
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
        incoming: [{ from: id, label: edgeLabel }],
        showAnsweredOnly: false,
      });
      sectionMembers.forEach((memberId) => claimed.add(memberId));
    }
  }

  let view = assemble(session, groups, expanded);
  for (let pass = 0; pass < 8; pass++) {
    const byLevel = levelsOf(view.ids, view.edges);
    const wide = [...byLevel.entries()].find(([, ids]) => ids.length > NODE_GROUP_THRESHOLD);
    if (!wide) break;
    const [level, levelIds] = wide;
    const onLevel = new Set(levelIds);
    let changed = false;
    for (const group of groups) {
      if (!group.open || expanded.has(group.id)) continue;
      const sitting = group.memberIds.filter((id) => onLevel.has(id));
      if (sitting.length < 2 || group.showAnsweredOnly) continue;
      if (sitting.some((id) => !readAnswer(session, id))) {
        group.showAnsweredOnly = true;
        group.lockedOpen = false;
        changed = true;
      }
    }
    if (!changed) {
      for (const group of groups) {
        if (!group.open || expanded.has(group.id)) continue;
        const sitting = group.memberIds.filter((id) => onLevel.has(id));
        if (sitting.length < 2) continue;
        group.open = false;
        group.lockedOpen = false;
        group.showAnsweredOnly = false;
        changed = true;
      }
    }
    if (changed) {
      view = assemble(session, groups, expanded);
      continue;
    }

    const grouped = new Set(groups.flatMap((group) => group.memberIds));
    const bySection = new Map<SectionId, string[]>();
    for (const id of levelIds) {
      if (grouped.has(id) || groups.some((group) => group.id === id)) continue;
      const section = getNode(id).section;
      const list = bySection.get(section);
      if (list) list.push(id);
      else bySection.set(section, [id]);
    }
    for (const [section, sectionMembers] of bySection) {
      if (sectionMembers.length < 2) continue;
      const idForGroup = `group_level_${level}_${section}_${[...sectionMembers].sort().join("_")}`;
      if (groups.some((group) => group.id === idForGroup)) continue;
      const incoming: { from: string; label: string }[] = [];
      for (const memberId of sectionMembers) {
        for (const edge of view.edges) {
          if (edge.to !== memberId || incoming.some((source) => source.from === edge.from)) continue;
          incoming.push({ from: edge.from, label: edge.label });
        }
      }
      if (!incoming.length) continue;
      groups.push({
        id: idForGroup,
        title: sectionTitle[section],
        count: sectionMembers.length,
        memberIds: sectionMembers,
        open: expanded.has(idForGroup),
        lockedOpen: false,
        from: incoming[0].from,
        edgeLabel: incoming[0].label,
        incoming,
        showAnsweredOnly: false,
      });
      changed = true;
    }
    if (!changed) break;
    view = assemble(session, groups, expanded);
  }

  return {
    ids: view.ids,
    edges: view.edges,
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
      const entry = freeEntry(node);
      if (!session && entry) {
        for (const to of entry.next) {
          edges.push({ from: node.id, to, label: entry.edge ?? "Entered" });
        }
      }
      if (session && entry && readAnswer(session, node.id)?.answerId === entry.answerId) {
        for (const to of entry.next) {
          if (revealed.has(to)) {
            edges.push({ from: node.id, to, label: entry.edge ?? "Entered" });
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
