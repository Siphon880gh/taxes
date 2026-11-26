import type { TaxYear } from "./types";

/** The tax years the app has figures for. Each is an answer on the chart's "year" box. */
export const TAX_YEARS = [
  { id: "y2025", year: 2025, label: "2025" },
  { id: "y2026", year: 2026, label: "2026" },
] as const satisfies readonly { id: string; year: TaxYear; label: string }[];

export type TaxYearId = (typeof TAX_YEARS)[number]["id"];

/** A blank chart starts on the newest year with sourced figures. */
export const DEFAULT_TAX_YEAR_ID: TaxYearId = "y2026";

/** "2025", "2026", or null when the year box is unanswered or answered unknown. */
export function taxYearLabel(answerId: string | undefined): string | null {
  return TAX_YEARS.find((item) => item.id === answerId)?.label ?? null;
}

export function isTaxYearId(value: string): value is TaxYearId {
  return TAX_YEARS.some((item) => item.id === value);
}
