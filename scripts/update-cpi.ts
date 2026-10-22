/**
 * Hand update of the CPI-U figure behind the tax pro estimate. No network calls.
 *   npm run update-cpi -- --month 2026-10 --value 337.5 [--checked 2026-11-12] [--dry-run]
 * See docs/UPDATE_INFLATION.md.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyCase } from "../src/lib/graph/cases";
import { proEstimate } from "../src/lib/graph/cost";
import { CPI_U, cpiFactor, monthLabel } from "../src/lib/graph/cpi";
import { parseCpiArgs } from "./cpi-args";

const file = path.resolve(__dirname, "../src/lib/graph/cpi.ts");

function replaceField(source: string, field: string, value: string): string {
  const pattern = new RegExp(`(\\n  ${field}: )[^,\\n]+,`);
  if (!pattern.test(source)) throw new Error(`Could not find ${field} in ${file}.`);
  return source.replace(pattern, `$1${value},`);
}

async function main() {
  let update;
  try {
    update = parseCpiArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error("Usage: npm run update-cpi -- --month YYYY-MM --value N [--checked YYYY-MM-DD] [--dry-run]");
    process.exit(1);
  }
  const next = { latest: update.value, latestMonth: update.month };
  const weng = applyCase("weng-2025");
  const before = proEstimate(weng);
  const after = proEstimate(weng, { cpi: next });
  const range = (estimate: typeof before) => (estimate ? `$${estimate.low.toLocaleString("en-US")}–$${estimate.high.toLocaleString("en-US")}` : "none");
  console.log(`CPI-U        ${CPI_U.latest.toFixed(3)} (${monthLabel(CPI_U.latestMonth)})  →  ${update.value.toFixed(3)} (${monthLabel(update.month)})`);
  console.log(`Factor       ×${cpiFactor().toFixed(4)}  →  ×${cpiFactor(next).toFixed(4)}   (2023 base ${CPI_U.surveyYearAverage2023} stays fixed)`);
  console.log(`Weng 2025    ${range(before)}  →  ${range(after)}`);
  console.log(`Checked date ${CPI_U.checked}  →  ${update.checked}`);
  if (update.dryRun) {
    console.log("Dry run: nothing was written.");
    return;
  }
  let source = await readFile(file, "utf8");
  source = replaceField(source, "latest", String(update.value));
  source = replaceField(source, "latestMonth", JSON.stringify(update.month));
  source = replaceField(source, "checked", JSON.stringify(update.checked));
  await writeFile(file, source);
  console.log(`Wrote ${path.relative(process.cwd(), file)}. Next: npm test && npm run build, then commit.`);
}

void main();
