import { freeEntry, getNode, listNodes } from "./nodes";
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
  comments: Record<string, string> = {},
  instanceComments: Record<string, Record<string, string>> = {},
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
    const entry = freeEntry(node);
    if (entry && stored.answerId === entry.answerId) {
      used[id] = stored;
      entry.next.forEach(visit);
    }
  };

  visit("year");
  const notes = adoptScopedComments(comments, instanceComments, activeInstance);
  return { answers: used, instances, instanceAnswers: scoped, activeInstance, revealed, quote, caseStudyId, comments: notes.comments, instanceComments: notes.instanceComments };
}

function adoptScopedComments(
  comments: Record<string, string>,
  instanceComments: Record<string, Record<string, string>>,
  activeInstance: Record<string, number>,
): { comments: Record<string, string>; instanceComments: Record<string, Record<string, string>> } {
  const nodeComments = { ...comments };
  const scoped: Record<string, Record<string, string>> = {};
  for (const [scope, bucket] of Object.entries(instanceComments)) scoped[scope] = { ...bucket };
  for (const [nodeId, text] of Object.entries(nodeComments)) {
    const scope = instanceScope(nodeId);
    if (!scope) continue;
    delete nodeComments[nodeId];
    if (!text.trim()) continue;
    const bucket = { ...(scoped[scope] ?? {}) };
    const key = answerKey(activeInstance[scope] ?? 0, nodeId);
    if (!bucket[key]?.trim()) bucket[key] = text;
    scoped[scope] = bucket;
  }
  for (const bucket of Object.values(scoped)) {
    for (const [key, text] of Object.entries(bucket)) {
      if (!text.trim()) delete bucket[key];
    }
  }
  return { comments: nodeComments, instanceComments: scoped };
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
    return rebuild({ ...session.answers, [nodeId]: stored }, session.quote, session.caseStudyId, instances, session.instanceAnswers, session.activeInstance, session.comments, session.instanceComments);
  }
  const index = session.activeInstance[scope] ?? 0;
  const bucket = { ...(session.instanceAnswers[scope] ?? {}), [answerKey(index, nodeId)]: stored };
  return rebuild(session.answers, session.quote, session.caseStudyId, instances, { ...session.instanceAnswers, [scope]: bucket }, session.activeInstance, session.comments, session.instanceComments);
}

export function selectInstance(session: Session, scope: string, index: number): Session {
  const names = session.instances[scope] ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= names.length) return session;
  return rebuild(session.answers, session.quote, session.caseStudyId, session.instances, session.instanceAnswers, { ...session.activeInstance, [scope]: index }, session.comments, session.instanceComments);
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
    session.comments,
    session.instanceComments,
  );
}

export function activeInstanceName(session: Session, scope: string): string | null {
  const name = session.instances[scope]?.[session.activeInstance[scope] ?? 0]?.trim();
  return name || null;
}

export function renameInstance(session: Session, nodeId: string, index: number, name: string): Session {
  const current = session.instances[nodeId];
  if (!current || !Number.isInteger(index) || index < 0 || index >= current.length) return session;
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
  const commentBucket: Record<string, string> = {};
  for (const [key, value] of Object.entries(session.instanceComments[nodeId] ?? {})) {
    const splitAt = key.indexOf(":");
    const itemIndex = Number(key.slice(0, splitAt));
    if (itemIndex === index) continue;
    const shifted = itemIndex > index ? itemIndex - 1 : itemIndex;
    commentBucket[answerKey(shifted, key.slice(splitAt + 1))] = value;
  }
  const instanceComments = nodeId === "se" || nodeId === "rental"
    ? { ...session.instanceComments, [nodeId]: commentBucket }
    : session.instanceComments;
  return rebuild(
    session.answers,
    session.quote,
    session.caseStudyId,
    { ...session.instances, [nodeId]: current.filter((_, itemIndex) => itemIndex !== index) },
    { ...session.instanceAnswers, [nodeId]: bucket },
    { ...session.activeInstance, [nodeId]: nextActive },
    session.comments,
    instanceComments,
  );
}

export function readComment(session: Session, nodeId: string): string | undefined {
  const scope = instanceScope(nodeId);
  if (!scope) return session.comments[nodeId];
  const index = session.activeInstance[scope] ?? 0;
  return session.instanceComments[scope]?.[answerKey(index, nodeId)];
}

/** Node ids whose comment cue belongs on the chart for the active business or rental. */
export function visibleCommentNodeIds(session: Session): string[] {
  const ids = new Set<string>();
  for (const [id, text] of Object.entries(session.comments)) {
    if (text.trim() && !instanceScope(id)) ids.add(id);
  }
  for (const scope of ["se", "rental"] as const) {
    const prefix = `${session.activeInstance[scope] ?? 0}:`;
    for (const [key, text] of Object.entries(session.instanceComments[scope] ?? {})) {
      if (!text.trim() || !key.startsWith(prefix)) continue;
      const nodeId = key.slice(prefix.length);
      if (instanceScope(nodeId) === scope) ids.add(nodeId);
    }
  }
  return [...ids];
}

export function setNodeComment(session: Session, nodeId: string, text: string): Session {
  const scope = instanceScope(nodeId);
  if (!scope) {
    const comments = { ...session.comments };
    if (text.trim()) comments[nodeId] = text;
    else delete comments[nodeId];
    return { ...session, comments };
  }
  const index = session.activeInstance[scope] ?? 0;
  const bucket = { ...(session.instanceComments[scope] ?? {}) };
  if (text.trim()) bucket[answerKey(index, nodeId)] = text;
  else delete bucket[answerKey(index, nodeId)];
  const comments = { ...session.comments };
  delete comments[nodeId];
  return { ...session, comments, instanceComments: { ...session.instanceComments, [scope]: bucket } };
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
      const entry = freeEntry(node);
      if (entry) {
        for (const next of entry.next) {
          if (!ids.has(next)) errors.push(`${node.id} entry → missing ${next}`);
        }
      }
    }
    for (const next of node.flowsTo ?? []) {
      if (!ids.has(next)) errors.push(`${node.id} flow → missing ${next}`);
    }
  }
  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredAnswer(value: unknown): StoredAnswer {
  if (!isRecord(value) || typeof value.answerId !== "string" || !value.answerId) {
    throw new Error("That file is not a chart session.");
  }
  if (value.text !== undefined && typeof value.text !== "string") {
    throw new Error("That file is not a chart session.");
  }
  return value.text === undefined ? { answerId: value.answerId } : { answerId: value.answerId, text: value.text };
}

function readAnswerMap(value: unknown): Record<string, StoredAnswer> {
  if (!isRecord(value)) throw new Error("That file has no answers.");
  const answers: Record<string, StoredAnswer> = {};
  for (const [id, stored] of Object.entries(value)) answers[id] = readStoredAnswer(stored);
  return answers;
}

/** Fields needed to rebuild a chart. Revealed nodes are derived and omitted. */
export function sessionFile(session: Session) {
  return {
    answers: session.answers,
    instances: session.instances,
    instanceAnswers: session.instanceAnswers,
    activeInstance: session.activeInstance,
    comments: session.comments,
    instanceComments: session.instanceComments,
    quote: session.quote,
    caseStudyId: session.caseStudyId,
  };
}

export function sessionToJson(session: Session): string {
  return JSON.stringify(sessionFile(session), null, 2);
}

export function importSession(json: string): Session {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file is not JSON.");
  }
  if (!isRecord(parsed)) throw new Error("That file is not a chart session.");
  const answers = readAnswerMap(parsed.answers);
  const instances: Record<string, string[]> = {};
  if (parsed.instances !== undefined) {
    if (!isRecord(parsed.instances)) throw new Error("That file is not a chart session.");
    for (const [id, names] of Object.entries(parsed.instances)) {
      if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
        throw new Error("That file is not a chart session.");
      }
      instances[id] = names;
    }
  }
  const instanceAnswers: Record<string, Record<string, StoredAnswer>> = {};
  if (parsed.instanceAnswers !== undefined) {
    if (!isRecord(parsed.instanceAnswers)) throw new Error("That file is not a chart session.");
    for (const [scope, bucket] of Object.entries(parsed.instanceAnswers)) {
      if (!isRecord(bucket)) throw new Error("That file is not a chart session.");
      instanceAnswers[scope] = {};
      for (const [key, stored] of Object.entries(bucket)) instanceAnswers[scope][key] = readStoredAnswer(stored);
    }
  }
  const activeInstance: Record<string, number> = {};
  if (parsed.activeInstance !== undefined) {
    if (!isRecord(parsed.activeInstance)) throw new Error("That file is not a chart session.");
    for (const [id, index] of Object.entries(parsed.activeInstance)) {
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
        throw new Error("That file is not a chart session.");
      }
      activeInstance[id] = index;
    }
  }
  const comments: Record<string, string> = {};
  if (parsed.comments !== undefined) {
    if (!isRecord(parsed.comments)) throw new Error("That file is not a chart session.");
    for (const [id, text] of Object.entries(parsed.comments)) {
      if (typeof text !== "string") throw new Error("That file is not a chart session.");
      if (text.trim()) comments[id] = text;
    }
  }
  const instanceComments: Record<string, Record<string, string>> = {};
  if (parsed.instanceComments !== undefined) {
    if (!isRecord(parsed.instanceComments)) throw new Error("That file is not a chart session.");
    for (const [scope, bucket] of Object.entries(parsed.instanceComments)) {
      if (!isRecord(bucket)) throw new Error("That file is not a chart session.");
      instanceComments[scope] = {};
      for (const [key, text] of Object.entries(bucket)) {
        if (typeof text !== "string") throw new Error("That file is not a chart session.");
        if (text.trim()) instanceComments[scope][key] = text;
      }
    }
  }
  const quote = parsed.quote === undefined ? null : parsed.quote;
  if (quote !== null && (typeof quote !== "number" || !Number.isFinite(quote))) {
    throw new Error("That file is not a chart session.");
  }
  const caseStudyId = parsed.caseStudyId === undefined ? null : parsed.caseStudyId;
  if (caseStudyId !== null && typeof caseStudyId !== "string") {
    throw new Error("That file is not a chart session.");
  }
  try {
    return rebuild(answers, quote, caseStudyId, instances, instanceAnswers, activeInstance, comments, instanceComments);
  } catch {
    throw new Error("That file does not match this chart.");
  }
}
