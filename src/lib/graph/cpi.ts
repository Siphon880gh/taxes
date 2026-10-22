/**
 * CPI-U, all items, U.S. city average, not seasonally adjusted (BLS series CUUR0000SA0).
 * Updated by hand with `npm run update-cpi`. See docs/UPDATE_INFLATION.md. Do not change the 2023 base.
 */
export const CPI_U = {
  surveyYearAverage2023: 304.702,
  latest: 336.94,
  latestMonth: "2026-09",
  checked: "2026-10-21",
} as const;

export type CpiFigure = { latest: number; latestMonth: string };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09" → "September 2026". */
export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** "2026-10-21" → "October 21, 2026". */
export function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** Whole calendar months from a YYYY-MM month to the month of `today`. */
export function monthsSince(yearMonth: string, today: Date): number {
  const [year, month] = yearMonth.split("-").map(Number);
  return (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month);
}

export function cpiFactor(figure: CpiFigure = CPI_U): number {
  return figure.latest / CPI_U.surveyYearAverage2023;
}

/** Data older than this many months likely has a newer BLS release (CPI comes out monthly, about two weeks after the month ends). */
export const CPI_STALE_AFTER_MONTHS = 2;
