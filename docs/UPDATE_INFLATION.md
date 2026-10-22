# Updating the inflation figure by hand

The Tax Pro Costs estimate takes the NSA 2023 national-average preparer fees and raises them by CPI-U
inflation. The CPI-U number is typed in by hand. Nothing fetches it automatically, and the app makes no network calls for it.
The panel shows "Inflation data through <Month YYYY>". Once that month is more than two months old, it adds a hint
that newer data is probably out.

The number lives in one place, `src/lib/graph/cpi.ts`. The cost estimate and the BLS citation in
`src/lib/graph/sources.ts` both read it, so you only change it there, using the script below.

## 1. When new data comes out

BLS publishes CPI once a month, usually about two weeks after the month ends. For example, October data comes out in mid-November.
The release schedule and latest release are at <https://www.bls.gov/news.release/cpi.nr0.htm>.

## 2. Find the number

You need the **CPI-U, all items, U.S. city average, not seasonally adjusted** index (series `CUUR0000SA0`).

- Easiest: open the series page <https://data.bls.gov/timeseries/CUUR0000SA0>. Pick the latest month in the
  table (the most recent year, rightmost filled-in month). The value looks like `337.512`.
- Or, in the news release, go to Table 1 and use the "Unadjusted indexes" column for "All items".

Do **not** use the seasonally adjusted index, a percent change, or the CPI-W series.
Write down the month as `YYYY-MM` (for example `2026-10`) and the index value.

Do not change the 2023 annual-average base, **304.702**. It matches the NSA 2023 survey year.

## 3. Preview, then apply

From the repo root:

```sh
# Preview only. Nothing is written.
npm run update-cpi -- --month 2026-10 --value 337.512 --dry-run

# Apply. --checked defaults to today; pass it to record a different retrieval date.
npm run update-cpi -- --month 2026-10 --value 337.512
npm run update-cpi -- --month 2026-10 --value 337.512 --checked 2026-11-13
```

The preview prints the old and new index, the old and new inflation factor, and the Weng 2025 example range before and
after. Inflation is a few percent a year, so a normal month moves that range by only a few dollars.

The script refuses:

- a month not in `YYYY-MM` form,
- a month older than the one already in use (re-entering the same month is allowed, for BLS revisions),
- a month that has not ended yet,
- an index that is not a plain number like `337.5`, or one more than 10% below or 15% above the current value.
  That usually means the wrong series or a typo.

## 4. Verify

```sh
npm test            # some estimate tests assume the current figure; update their expected numbers if they fail
npx tsc --noEmit
npm run build       # refreshes out/
```

Then open the app and go to **Tax Pro Costs**. Check that the note says "Inflation data through <the new month>" and the stale hint is gone.
`tests/graph.test.ts` pins the Weng 2025 range (`834` / `959`) and the factor (`1.1058`). After a real update,
change those expected values to the ones the dry run printed.

## 5. Commit

```sh
git add src/lib/graph/cpi.ts tests/graph.test.ts
git commit -m "Update CPI-U to <Month YYYY> (<value>)"
```

`out/` is gitignored, so you don't commit it. Rebuilding it is enough.
