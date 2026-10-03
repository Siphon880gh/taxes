import { getNode, listNodes } from "./nodes";
import { activeInstanceName, instanceScope, readAnswer } from "./session";
import type { Session } from "./types";

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

type Edge = { from: string; to: string; label: string };

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

export function mermaidSource(session: Session | null): string {
  const ids = session ? session.revealed : listNodes().map((node) => node.id);
  const lines = ["flowchart TD"];
  for (const id of ids) {
    lines.push(`  ${id}["${escapeLabel(nodeLabel(id, session))}"]`);
  }
  for (const edge of edgesFor(session)) {
    lines.push(`  ${edge.from} -->|${JSON.stringify(escapeLabel(edge.label))}| ${edge.to}`);
  }
  if (session) {
    const unknownIds = ids.filter((id) => {
      if (readAnswer(session, id)?.answerId === "unknown") return true;
      return id.startsWith("flag_");
    });
    if (unknownIds.length > 0) {
      lines.push("  classDef unknown fill:#fff7ed,stroke:#c2410c,stroke-width:2px");
      lines.push(`  class ${unknownIds.join(",")} unknown`);
    }
  }
  return lines.join("\n");
}
