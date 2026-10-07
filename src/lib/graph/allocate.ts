import { readAnswer } from "./session";
import type { Session } from "./types";

export function encodeNumbers(values: Record<string, string>): string {
  return Object.entries(values)
    .filter(([, value]) => value.trim() !== "")
    .map(([id, value]) => `${id}=${value.trim()}`)
    .join(";");
}

export function decodeNumbers(text: string | undefined): Record<string, string> {
  const values: Record<string, string> = {};
  if (!text) return values;
  for (const part of text.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    values[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return values;
}

export function readNumber(text: string | undefined, id: string): number | null {
  const raw = decodeNumbers(text)[id];
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw.replace(/[$,]/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function count(amount: number): string {
  return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Two-decimal factor written the way a line note is, such as .27. */
export function decimalFactor(ratio: number): string {
  if (ratio === 1) return "1";
  const rounded = ratio.toFixed(2);
  return rounded.startsWith("0.") ? rounded.slice(1) : rounded;
}

function numbersOf(session: Session | null, nodeId: string): string | undefined {
  if (!session) return undefined;
  return readAnswer(session, nodeId)?.text;
}

function sqftParts(session: Session | null): { rental: number; total: number; ratio: number; bill: number | null } | null {
  const text = numbersOf(session, "alloc_sqft");
  const rental = readNumber(text, "rentalSqft");
  const total = readNumber(text, "totalSqft");
  if (rental == null || total == null || total <= 0 || rental > total) return null;
  return { rental, total, ratio: rental / total, bill: readNumber(text, "taxBill") };
}

function occupantParts(session: Session | null): { rental: number; total: number; ratio: number; bill: number | null } | null {
  const text = numbersOf(session, "alloc_occupants");
  const rental = readNumber(text, "rentalPeople");
  const total = readNumber(text, "totalPeople");
  if (rental == null || total == null || total <= 0 || rental > total) return null;
  return { rental, total, ratio: rental / total, bill: readNumber(text, "waterBill") };
}

export function numberEntryError(nodeId: string, text: string): string | null {
  if (nodeId === "alloc_sqft") {
    const rental = readNumber(text, "rentalSqft");
    const total = readNumber(text, "totalSqft");
    if (rental == null || total == null || total <= 0 || rental > total) {
      return "Enter the rental square feet and the whole property square feet. Rental square feet stay within the whole property.";
    }
    return null;
  }
  if (nodeId === "alloc_occupants") {
    const rental = readNumber(text, "rentalPeople");
    const total = readNumber(text, "totalPeople");
    if (rental == null || total == null || total <= 0 || rental > total) {
      return "Enter how many people live in the rental units and how many live on the property. The rental count stays within everyone on the property.";
    }
    return null;
  }
  if (nodeId === "rental_fees") {
    const rso = readNumber(text, "rso");
    const scep = readNumber(text, "scep");
    if ((rso == null || rso === 0) && (scep == null || scep === 0)) {
      return "Enter the RSO amount, the SCEP amount, or both.";
    }
    return null;
  }
  if (nodeId === "rental_repairs") {
    const repairs = readNumber(text, "repairs");
    const permits = readNumber(text, "permits") ?? 0;
    if (repairs == null || repairs + permits <= 0) {
      return "Enter the repair cost. Add a permit cost when the repair had one.";
    }
    return null;
  }
  if (nodeId === "rental_insurance") {
    const premium = readNumber(text, "premium");
    if (premium == null || premium <= 0) return "Enter the insurance premium.";
    return null;
  }
  return null;
}

export function numberEntryChart(nodeId: string, text: string | undefined): string | null {
  if (nodeId === "alloc_sqft") {
    const rental = readNumber(text, "rentalSqft");
    const total = readNumber(text, "totalSqft");
    if (rental == null || total == null) return null;
    return `Square feet<br/>${count(rental)} rental / ${count(total)} total`;
  }
  if (nodeId === "alloc_occupants") {
    const rental = readNumber(text, "rentalPeople");
    const total = readNumber(text, "totalPeople");
    if (rental == null || total == null) return null;
    return `Occupants<br/>${count(rental)} rental / ${count(total)} on the property`;
  }
  if (nodeId === "rental_fees") {
    const rso = readNumber(text, "rso");
    const scep = readNumber(text, "scep");
    const parts = [rso ? `RSO ${money(rso)}` : "", scep ? `SCEP ${money(scep)}` : ""].filter(Boolean);
    return parts.length ? `Rental fees<br/>${parts.join(" · ")}` : null;
  }
  if (nodeId === "rental_repairs") {
    const repairs = readNumber(text, "repairs");
    const permits = readNumber(text, "permits");
    if (repairs == null) return null;
    const permit = permits && permits > 0 ? `<br/>Permit ${money(permits)}` : "";
    return `Repairs ${money(repairs)}${permit}`;
  }
  if (nodeId === "rental_insurance") {
    const premium = readNumber(text, "premium");
    return premium && premium > 0 ? `Insurance premium<br/>${money(premium)}` : null;
  }
  return null;
}

function sqftSentence(session: Session | null, line: string): string | null {
  const parts = sqftParts(session);
  if (!parts) return null;
  const factor = decimalFactor(parts.ratio);
  const split = `${count(parts.rental)} / ${count(parts.total)} = ${factor}`;
  if (parts.bill != null && parts.bill > 0 && line.includes("line 16")) {
    return `Suggest multiplying ${money(parts.bill)} by ${factor} for ${line}. ${split}.`;
  }
  return `Suggest multiplying ${line} by ${factor}. ${split}.`;
}

function waterSentence(session: Session | null): string | null {
  const parts = occupantParts(session);
  if (!parts) return null;
  const fraction = `${count(parts.rental)}/${count(parts.total)}`;
  const split = `${count(parts.rental)} / ${count(parts.total)} = ${decimalFactor(parts.ratio)}`;
  if (parts.bill != null && parts.bill > 0) {
    return `Suggest multiplying ${money(parts.bill)} by ${fraction} for Schedule E line 17 (utilities). ${split}.`;
  }
  return `Suggest multiplying Schedule E line 17 (utilities) by ${fraction}. ${split}.`;
}

function feesSentence(session: Session | null): string | null {
  const text = numbersOf(session, "rental_fees");
  const rso = readNumber(text, "rso");
  const scep = readNumber(text, "scep");
  const paid = [rso && rso > 0 ? `RSO ${money(rso)}` : "", scep && scep > 0 ? `SCEP ${money(scep)}` : ""].filter(Boolean);
  if (!paid.length) return null;
  const sum = (rso ?? 0) + (scep ?? 0);
  const together = paid.length > 1 ? ` Together ${money(sum)}.` : "";
  return `Suggest verifying ${paid.join(" and ")} on Schedule E line 19 (other).${together}`;
}

function repairsSentence(session: Session | null): string | null {
  const text = numbersOf(session, "rental_repairs");
  const repairs = readNumber(text, "repairs");
  const permits = readNumber(text, "permits");
  if (repairs == null) return null;
  if (permits != null && permits > 0) {
    return `Suggest verifying repairs ${money(repairs)} plus permit costs ${money(permits)} on Schedule E line 14. A permit for an improvement is not part of this suggestion.`;
  }
  return `Suggest verifying repairs ${money(repairs)} on Schedule E line 14.`;
}

function insuranceSentence(session: Session | null): string | null {
  const premium = readNumber(numbersOf(session, "rental_insurance"), "premium");
  if (premium == null || premium <= 0 || !session) return null;
  const amount = money(premium);
  const alloc = readAnswer(session, "rental_alloc")?.answerId;
  const parts = sqftParts(session);
  if ((alloc === "sqft" || alloc === "both") && parts) {
    return `Suggest multiplying ${amount} by ${decimalFactor(parts.ratio)} for Schedule E line 9 (insurance). The factor is rental square feet divided by the whole property.`;
  }
  if (alloc === "all_rental") {
    return `Suggest verifying ${amount} on Schedule E line 9 (insurance). The whole property is rented, so the full premium is the amount to compare.`;
  }
  if (alloc === "days") {
    return `Suggest verifying ${amount} on Schedule E line 9 (insurance). Personal-use days stay on line 2. This box does not turn those days into a percentage of the premium.`;
  }
  if (alloc === "sqft" || alloc === "both") {
    return `Premium ${amount}. Enter the square feet to get a factor for Schedule E line 9 (insurance).`;
  }
  return `Suggest verifying ${amount} on Schedule E line 9 (insurance).`;
}

const CHECK_SENTENCE: Record<string, (session: Session | null) => string | null> = {
  check_sqft_factor: (session) => sqftSentence(session, "Schedule E line 16 (taxes)"),
  check_water_factor: (session) => waterSentence(session),
  check_rental_fees: (session) => feesSentence(session),
  check_repairs: (session) => repairsSentence(session),
  check_insurance: (session) => insuranceSentence(session),
};

export function suggestionChart(id: string, session: Session | null): string | null {
  const sentence = CHECK_SENTENCE[id]?.(session);
  if (!sentence) return null;
  return sentence.replace(". ", ".<br/>");
}

export function suggestionText(id: string, session: Session): string | null {
  return CHECK_SENTENCE[id]?.(session) ?? null;
}
