import assert from "node:assert/strict";
import test from "node:test";
import { applyCase } from "../src/lib/graph/cases";
import { applyAnswer, blankSession, setNodeComment } from "../src/lib/graph/session";
import { clearStoredSession, readStoredSession, SESSION_STORAGE_KEY, writeStoredSession } from "../src/lib/session-storage";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

test("a saved session comes back with its answers, comments, and quote", () => {
  const store = memoryStore();
  let session = applyAnswer(blankSession(), "filing_status", "single");
  session = setNodeComment(session, "filing_status", "Confirm with last year's return");
  session = { ...session, quote: 975, quotePreparer: "Corner CPA" };
  writeStoredSession(session, store);
  assert.ok(store.data.has(SESSION_STORAGE_KEY));
  const restored = readStoredSession(store);
  assert.ok(restored);
  assert.equal(restored.answers.filing_status?.answerId, "single");
  assert.equal(restored.comments.filing_status, "Confirm with last year's return");
  assert.equal(restored.quote, 975);
  assert.equal(restored.quotePreparer, "Corner CPA");
  assert.deepEqual(restored.revealed, session.revealed);
});

test("an example keeps its case-study id across a reload", () => {
  const store = memoryStore();
  writeStoredSession(applyCase("joint-w2-crypto"), store);
  assert.equal(readStoredSession(store)?.caseStudyId, "joint-w2-crypto");
});

test("a damaged or missing saved session reads as nothing", () => {
  const store = memoryStore();
  assert.equal(readStoredSession(store), null);
  store.setItem(SESSION_STORAGE_KEY, "{not json");
  assert.equal(readStoredSession(store), null);
  assert.equal(readStoredSession(null), null);
});

test("clearing removes the saved session", () => {
  const store = memoryStore();
  writeStoredSession(blankSession(), store);
  clearStoredSession(store);
  assert.equal(store.data.has(SESSION_STORAGE_KEY), false);
});
