import { getNode } from "./nodes";
import { applyAnswer, importSession, sessionToJson } from "./session";
import type { GraphNode, Session } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeFacts(node: GraphNode) {
  return {
    id: node.id,
    title: node.title,
    kind: node.kind,
    section: node.section,
    prompt: node.prompt ?? null,
    help: node.help ?? null,
    chart: node.chart,
    answers: (node.answers ?? []).map((answer) => ({ id: answer.id, label: answer.label })),
    textInput: node.textInput
      ? { answerId: node.textInput.answerId, placeholder: node.textInput.placeholder }
      : null,
    numberInputs: node.numberInputs
      ? {
          answerId: node.numberInputs.answerId,
          fields: node.numberInputs.fields.map((field) => ({ id: field.id, label: field.label, optional: Boolean(field.optional) })),
        }
      : null,
  };
}

/** Prompt for one chart node. Includes the session file and the node the reply must address. */
export function nodePrompt(session: Session, node: GraphNode): string {
  const facts = nodeFacts(node);
  const choices = facts.answers.map((answer) => `- ${answer.id}: ${answer.label}`).join("\n");
  const choiceRule = facts.numberInputs
    ? `This box takes numbers. For the entered amounts, answerId is "${facts.numberInputs.answerId}" and text is semicolon-separated id=value pairs using these field ids: ${facts.numberInputs.fields.map((field) => field.id).join(", ")}. Example: rentalSqft=400;totalSqft=1481. Choice ids:\n${choices}`
    : facts.textInput
      ? `This box takes free text. The only answerId is "${facts.textInput.answerId}". Put the words from the prepared return in text.`
      : facts.answers.length
        ? `answerId must be one of:\n${choices}`
        : "This box is a line to verify. It has no answer choices. Do not invent an answerId for it.";
  return [
    "You are helping someone double-check a tax return that is already prepared. This is not tax advice and not an instruction to prepare or file a return.",
    "",
    "The app draws a decision chart from a session JSON file. It starts at the tax year and follows each answered question to the next nodes. Revealed boxes are computed. Do not include a revealed field, and do not invent node ids.",
    "",
    "Current session:",
    sessionToJson(session),
    "",
    "Node in question:",
    JSON.stringify(facts, null, 2),
    "",
    "How one answer is stored: { \"answerId\": \"<choice id>\", \"text\": \"<only when this box asks for text>\" }.",
    "The chart walks that answer's next list. Other answers on the same box lead to different boxes.",
    "",
    choiceRule,
    "",
    "Have a short conversation before any JSON. Use only the session and the node text above. Do not invent forms, schedules, or line numbers that are not already named there.",
    "In plain language: summarize the financial situation the session shows; list the forms needed; name the important lines; say what is still missing or unknown; and offer tips to minimize taxable income and maximize deductions. Also list the common real-world situations that map onto this box's choices, and ask which one matches the prepared return.",
    "When the user wants the result rendered, return only valid JSON with no markdown fences and no commentary.",
    "",
    "To apply this box only, return:",
    JSON.stringify(
      facts.numberInputs
        ? { nodeId: node.id, answerId: facts.numberInputs.answerId, text: "rentalSqft=400;totalSqft=1481" }
        : facts.textInput
          ? { nodeId: node.id, answerId: facts.textInput.answerId, text: "words from the prepared return" }
          : { nodeId: node.id, answerId: facts.answers[0]?.id ?? "unknown" },
      null,
      2,
    ),
    "",
    "To replace the whole chart instead, return a session object and nothing else. Keys: answers, instances, instanceAnswers, activeInstance, comments, instanceComments, quote, caseStudyId.",
    "answers maps a node id to { \"answerId\", \"text?\" }.",
    "instances maps a repeatable node id to an array of record names.",
    "instanceAnswers maps a scope, \"se\" or \"rental\", to keys \"index:nodeId\".",
    "activeInstance maps a scope to the index currently on the chart.",
    "comments maps a node id to a note for a box that is not inside a business or rental. instanceComments maps a scope, \"se\" or \"rental\", to keys \"index:nodeId\". quote is a number or null. caseStudyId is a string or null.",
  ].join("\n");
}

function unwrapJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

/** Apply one answer for nodeId, or a full session file. Throws without changing the caller's session. */
export function applyNodeReply(session: Session, nodeId: string, raw: string): Session {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJson(raw));
  } catch {
    throw new Error("That reply is not JSON.");
  }
  if (!isRecord(parsed)) throw new Error("That reply is not a chart answer.");
  if (typeof parsed.answerId === "string") {
    const node = getNode(nodeId);
    if (typeof parsed.nodeId === "string" && parsed.nodeId !== nodeId) {
      throw new Error("That reply is for a different box.");
    }
    const text = typeof parsed.text === "string" ? parsed.text : undefined;
    const entryId = node.numberInputs?.answerId ?? node.textInput?.answerId;
    if (entryId && parsed.answerId === entryId) {
      if (!text?.trim()) throw new Error("That reply needs the text from the prepared return.");
      return applyAnswer(session, nodeId, parsed.answerId, text);
    }
    const choice = node.answers?.find((answer) => answer.id === parsed.answerId);
    if (!choice) throw new Error("That reply is not one of this box's answers.");
    return applyAnswer(session, nodeId, choice.id);
  }
  if ("answers" in parsed) return importSession(JSON.stringify(parsed));
  throw new Error("That reply is not a chart answer.");
}
