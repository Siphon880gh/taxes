import { getNode, listNodes } from "./nodes";
import type { Session, StoredAnswer } from "./types";

export function rebuild(
  answers: Record<string, StoredAnswer>,
  quote: number | null,
  caseStudyId: string | null,
): Session {
  const revealed: string[] = [];
  const used: Record<string, StoredAnswer> = {};

  const visit = (id: string) => {
    if (revealed.includes(id)) return;
    revealed.push(id);
    const node = getNode(id);
    if (node.kind !== "question") return;
    const stored = answers[id];
    if (!stored) return;
    const choice = node.answers?.find((answer) => answer.id === stored.answerId);
    if (choice) {
      used[id] = stored;
      choice.next.forEach(visit);
      return;
    }
    if (node.textInput && stored.answerId === node.textInput.answerId) {
      used[id] = stored;
      node.textInput.next.forEach(visit);
    }
  };

  visit("year");
  return { answers: used, revealed, quote, caseStudyId };
}

export function blankSession(): Session {
  return rebuild({ year: { answerId: "y2025" } }, null, null);
}

export function applyAnswer(
  session: Session,
  nodeId: string,
  answerId: string,
  text?: string,
): Session {
  return rebuild(
    { ...session.answers, [nodeId]: { answerId, text } },
    session.quote,
    session.caseStudyId,
  );
}

export function answerOf(session: Session, nodeId: string): string | undefined {
  return session.answers[nodeId]?.answerId;
}

export function openQuestions(session: Session): string[] {
  return session.revealed.filter((id) => {
    const node = getNode(id);
    return node.kind === "question" && !session.answers[id];
  });
}

export function assertGraphIntact(): string[] {
  const errors: string[] = [];
  const ids = new Set(listNodes().map((node) => node.id));
  if (ids.size !== listNodes().length) errors.push("Duplicate node id");
  for (const node of listNodes()) {
    if (node.kind === "question") {
      const answers = node.answers ?? [];
      if (!answers.some((answer) => answer.id === "unknown")) {
        errors.push(`${node.id} has no unknown answer`);
      }
      for (const answer of answers) {
        for (const next of answer.next) {
          if (!ids.has(next)) errors.push(`${node.id} → missing ${next}`);
        }
      }
      if (node.textInput) {
        for (const next of node.textInput.next) {
          if (!ids.has(next)) errors.push(`${node.id} text → missing ${next}`);
        }
      }
    }
    for (const next of node.flowsTo ?? []) {
      if (!ids.has(next)) errors.push(`${node.id} flow → missing ${next}`);
    }
  }
  return errors;
}
