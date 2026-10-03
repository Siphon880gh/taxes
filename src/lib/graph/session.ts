import { getNode, listNodes } from "./nodes";
import type { Session, StoredAnswer } from "./types";

export function instanceScope(nodeId: string): "se" | "rental" | null {
  const node = getNode(nodeId);
  if (nodeId === "schedule_c" || (node.section === "se" && nodeId !== "se" && nodeId !== "note_se_no")) return "se";
  if (nodeId === "schedule_e" || (node.section === "rental" && nodeId !== "rental" && nodeId !== "note_rental_no")) return "rental";
  return null;
}

function answerKey(index: number, nodeId: string): string {
  return `${index}:${nodeId}`;
}

function seedInstanceAnswers(
  answers: Record<string, StoredAnswer>,
  instances: Record<string, string[]>,
  instanceAnswers: Record<string, Record<string, StoredAnswer>>,
): Record<string, Record<string, StoredAnswer>> {
  const next: Record<string, Record<string, StoredAnswer>> = { ...instanceAnswers };
  for (const scope of ["se", "rental"] as const) {
    const bucket = { ...(next[scope] ?? {}) };
    const count = instances[scope]?.length ?? 0;
    for (let index = 0; index < count; index += 1) {
      for (const [nodeId, stored] of Object.entries(answers)) {
        if (instanceScope(nodeId) !== scope) continue;
        const key = answerKey(index, nodeId);
        if (!bucket[key]) bucket[key] = stored;
      }
    }
    next[scope] = bucket;
  }
  return next;
}

export const repeatableNodes: Record<string, { singular: string; plural: string }> = {
  w2: { singular: "W-2", plural: "W-2s" },
  se: { singular: "business activity", plural: "business activities" },
  payapps: { singular: "payment platform", plural: "payment platforms" },
  rental: { singular: "rental property", plural: "rental properties" },
  interest: { singular: "interest or dividend statement", plural: "interest or dividend statements" },
  capgain: { singular: "brokerage or capital-asset statement", plural: "brokerage or capital-asset statements" },
  retirement: { singular: "retirement distribution", plural: "retirement distributions" },
  education: { singular: "education form", plural: "education forms" },
  dependents: { singular: "dependent", plural: "dependents" },
};

function defaultInstanceName(nodeId: string, position: number): string {
  return `${repeatableNodes[nodeId].singular.replace(/^./, (letter) => letter.toUpperCase())} ${position}`;
}

export function rebuild(
  answers: Record<string, StoredAnswer>,
  quote: number | null,
  caseStudyId: string | null,
  instances: Record<string, string[]> = {},
  instanceAnswers: Record<string, Record<string, StoredAnswer>> = {},
  activeInstance: Record<string, number> = {},
): Session {
  const revealed: string[] = [];
  const used: Record<string, StoredAnswer> = {};
  const scoped = seedInstanceAnswers(answers, instances, instanceAnswers);

  const visit = (id: string) => {
    if (revealed.includes(id)) return;
    revealed.push(id);
    const node = getNode(id);
    if (node.kind !== "question") return;
    const scope = instanceScope(id);
    const stored = scope ? scoped[scope]?.[answerKey(activeInstance[scope] ?? 0, id)] : answers[id];
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
  return { answers: used, instances, instanceAnswers: scoped, activeInstance, revealed, quote, caseStudyId };
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
  const stored = { answerId, text };
  const scope = instanceScope(nodeId);
  const instances =
    answerId === "yes" && repeatableNodes[nodeId] && !session.instances[nodeId]?.length
      ? { ...session.instances, [nodeId]: [defaultInstanceName(nodeId, 1)] }
      : session.instances;
  if (!scope) {
    return rebuild({ ...session.answers, [nodeId]: stored }, session.quote, session.caseStudyId, instances, session.instanceAnswers, session.activeInstance);
  }
  const index = session.activeInstance[scope] ?? 0;
  const bucket = { ...(session.instanceAnswers[scope] ?? {}), [answerKey(index, nodeId)]: stored };
  return rebuild(session.answers, session.quote, session.caseStudyId, instances, { ...session.instanceAnswers, [scope]: bucket }, session.activeInstance);
}

export function selectInstance(session: Session, scope: string, index: number): Session {
  const names = session.instances[scope] ?? [];
  if (!names[index]) return session;
  return rebuild(session.answers, session.quote, session.caseStudyId, session.instances, session.instanceAnswers, { ...session.activeInstance, [scope]: index });
}

export function readAnswer(session: Session, nodeId: string): StoredAnswer | undefined {
  const scope = instanceScope(nodeId);
  if (!scope) return session.answers[nodeId];
  const index = session.activeInstance[scope] ?? 0;
  return session.instanceAnswers[scope]?.[answerKey(index, nodeId)];
}

export function addInstance(session: Session, nodeId: string): Session {
  if (!repeatableNodes[nodeId]) return session;
  const current = session.instances[nodeId] ?? [];
  const nextIndex = current.length;
  const active = session.activeInstance[nodeId] ?? 0;
  const bucket = { ...(session.instanceAnswers[nodeId] ?? {}) };
  for (const [key, value] of Object.entries(bucket)) {
    const splitAt = key.indexOf(":");
    if (Number(key.slice(0, splitAt)) !== active) continue;
    bucket[answerKey(nextIndex, key.slice(splitAt + 1))] = value;
  }
  return rebuild(
    session.answers,
    session.quote,
    session.caseStudyId,
    { ...session.instances, [nodeId]: [...current, defaultInstanceName(nodeId, nextIndex + 1)] },
    { ...session.instanceAnswers, [nodeId]: bucket },
    { ...session.activeInstance, [nodeId]: nextIndex },
  );
}

export function activeInstanceName(session: Session, scope: string): string | null {
  const name = session.instances[scope]?.[session.activeInstance[scope] ?? 0]?.trim();
  return name || null;
}

export function renameInstance(session: Session, nodeId: string, index: number, name: string): Session {
  const current = session.instances[nodeId];
  if (!current?.[index]) return session;
  const next = [...current];
  next[index] = name;
  return { ...session, instances: { ...session.instances, [nodeId]: next } };
}

export function removeInstance(session: Session, nodeId: string, index: number): Session {
  const current = session.instances[nodeId];
  if (!current || current.length < 2) return session;
  const bucket: Record<string, StoredAnswer> = {};
  for (const [key, value] of Object.entries(session.instanceAnswers[nodeId] ?? {})) {
    const splitAt = key.indexOf(":");
    const itemIndex = Number(key.slice(0, splitAt));
    if (itemIndex === index) continue;
    const nextIndex = itemIndex > index ? itemIndex - 1 : itemIndex;
    bucket[answerKey(nextIndex, key.slice(splitAt + 1))] = value;
  }
  const active = session.activeInstance[nodeId] ?? 0;
  const nextActive = active > index ? active - 1 : Math.min(active, current.length - 2);
  return rebuild(
    session.answers,
    session.quote,
    session.caseStudyId,
    { ...session.instances, [nodeId]: current.filter((_, itemIndex) => itemIndex !== index) },
    { ...session.instanceAnswers, [nodeId]: bucket },
    { ...session.activeInstance, [nodeId]: nextActive },
  );
}

export function answerOf(session: Session, nodeId: string): string | undefined {
  return readAnswer(session, nodeId)?.answerId;
}

export function openQuestions(session: Session): string[] {
  return session.revealed.filter((id) => {
    const node = getNode(id);
    return node.kind === "question" && !readAnswer(session, id);
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
