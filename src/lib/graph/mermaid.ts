import { getNode, listNodes } from "./nodes";
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
  return `${named}<br/>Verify in FreeTaxUSA. Not an instruction to start a form.`;
}

export function nodeLabel(id: string, session: Session | null): string {
  const node = getNode(id);
  if (id === "schedule_c") return scheduleCLabel(session);
  if (session && node.kind === "question") {
    const stored = session.answers[id];
    if (stored) {
      if (node.textInput && stored.answerId === node.textInput.answerId) {
        return `${escapeUser(node.title)}<br/>${escapeUser(stored.text?.trim() || "Entered")}`;
      }
      const choice = node.answers?.find((answer) => answer.id === stored.answerId);
      const label = choice?.label ?? stored.answerId;
      return `${escapeUser(node.title)}<br/>${escapeUser(label)}`;
    }
  }
  return node.chart;
}

type Edge = { from: string; to: string; label: string };

export function edgesFor(session: Session | null): Edge[] {
  const edges: Edge[] = [];
  const nodes = session ? session.revealed.map((id) => getNode(id)) : listNodes();
  const revealed = new Set(session ? session.revealed : listNodes().map((node) => node.id));
  for (const node of nodes) {
    if (node.kind === "question") {
      const answers = session
        ? node.answers?.filter((answer) => answer.id === session.answers[node.id]?.answerId)
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
      if (session && node.textInput && session.answers[node.id]?.answerId === node.textInput.answerId) {
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
      if (session.answers[id]?.answerId === "unknown") return true;
      return id.startsWith("flag_");
    });
    if (unknownIds.length > 0) {
      lines.push("  classDef unknown fill:#fff7ed,stroke:#c2410c,stroke-width:2px");
      lines.push(`  class ${unknownIds.join(",")} unknown`);
    }
  }
  return lines.join("\n");
}
