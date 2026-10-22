import { CPI_U, monthsSince } from "../src/lib/graph/cpi";

export type CpiUpdate = { month: string; value: number; checked: string; dryRun: boolean };

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Read `--month YYYY-MM --value N [--checked YYYY-MM-DD] [--dry-run]`. Throws with a plain message on bad input. */
export function parseCpiArgs(
  argv: readonly string[],
  today: Date = new Date(),
  current: { latest: number; latestMonth: string } = CPI_U,
): CpiUpdate {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}".`);
    const [name, inline] = arg.slice(2).split("=", 2);
    if (!["month", "value", "checked", "dry-run"].includes(name)) throw new Error(`Unknown option --${name}.`);
    if (name === "dry-run") {
      flags.set(name, true);
      continue;
    }
    const value = inline ?? argv[i + 1];
    if (inline === undefined) i += 1;
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
    flags.set(name, value);
  }
  const month = flags.get("month");
  const rawValue = flags.get("value");
  if (typeof month !== "string") throw new Error("Pass --month YYYY-MM, the CPI month (for example 2026-10).");
  if (typeof rawValue !== "string") throw new Error("Pass --value N, the CPI-U all-items index for that month (for example 337.5).");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`--month must look like 2026-10, not "${month}".`);
  if (!/^\d{3}(\.\d{1,3})?$/.test(rawValue)) throw new Error(`--value must be an index like 337.5 or 337.512, not "${rawValue}".`);
  const value = Number(rawValue);
  if (value < current.latest * 0.9 || value > current.latest * 1.15) {
    throw new Error(
      `--value ${value} is not plausible next to the current ${current.latest} (allowed ${(current.latest * 0.9).toFixed(3)}–${(current.latest * 1.15).toFixed(3)}). Check you copied the all-items, not seasonally adjusted, index.`,
    );
  }
  if (month < current.latestMonth) throw new Error(`--month ${month} is older than the month already in use, ${current.latestMonth}.`);
  if (monthsSince(month, today) < 1) throw new Error(`--month ${month} has not finished yet, so BLS cannot have published it.`);
  const checkedFlag = flags.get("checked");
  const checked = typeof checkedFlag === "string" ? checkedFlag : isoDay(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checked)) throw new Error(`--checked must look like 2026-11-12, not "${checked}".`);
  return { month, value, checked, dryRun: flags.get("dry-run") === true };
}
