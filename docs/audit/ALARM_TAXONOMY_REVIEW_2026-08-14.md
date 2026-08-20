<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Alarm Taxonomy Review — 2026-08-14

> Docs-only review, read-only DB queries against the live
> `public.ldi_alarm_ms_code` catalog. No runtime system touched. This
> is a taxonomy/coverage review, not a re-run of
> `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` (2026-08-11) -- that audit
> covers simulator _behavior_; this one covers the _catalog data_
> itself. See `docs/operations/SOP_COMPLETION_REVIEW.md` for the
> overlapping SOP-linkage finding, not repeated here.

## Catalog size and severity distribution

```sql
SELECT severity, count(*) FROM public.ldi_alarm_ms_code GROUP BY severity ORDER BY count(*) DESC;
```

| Severity | Count | % of 1,820 |
| -------- | ----- | ---------- |
| Major    | 1,431 | 78.6%      |
| Warning  | 201   | 11.0%      |
| Minor    | 145   | 8.0%       |
| Critical | 43    | 2.4%       |

Real vendor-derived distribution (imported per the 892-row real export
merge + earlier 1,820-code catalog work), not simulator output. The
2.4% Critical share is a genuine taxonomy property of the source data,
separate from the fidelity audit's earlier finding that the
_simulator_ couldn't reach Critical severity before Phase F added
`RARE_CRITICAL_CODES` -- that finding was about simulator behavior,
not catalog composition; the catalog always had real Critical codes,
the simulator just wasn't using any until Phase F.

## Structured-field coverage: real, but narrow by design

```sql
SELECT
 count(*) FILTER (WHERE cause IS NOT NULL AND cause <> '') AS has_cause,
 count(*) FILTER (WHERE sop_reference IS NOT NULL AND sop_reference <> '') AS has_sop
FROM public.ldi_alarm_ms_code;
-- has_cause=25, has_sop=0 (out of 1,820)
```

The 25 rows with `cause`/`impact`/`recovery_action` populated are
almost exactly the simulator's active code set (19-21 codes per
`alarm-sync-linter.js`) plus a handful of hand-picked extra Critical
codes. This is **intentional, scoped coverage** -- the 1,795 other
rows are real vendor codes this simulator will likely never fire, and
writing structured guidance for all 1,820 would be effort spent on
codes with no operational path to ever appearing in `ldi_alarm_log`.
Not a gap; a reasonable scope boundary, worth stating explicitly so a
future reviewer doesn't mistake 25/1820 for an oversight.

**`sop_reference` at 0/1820 (including the 25 curated rows) is the
real gap** -- covered in `SOP_COMPLETION_REVIEW.md`, not duplicated
here.

## Alarm type coverage

```sql
SELECT count(*) FILTER (WHERE alarm_type IS NOT NULL AND alarm_type <> '') FROM public.ldi_alarm_ms_code;
-- 1820 / 1820
```

100% -- every row has an `alarm_type` classification. No gap here.

## Simulator-to-catalog sync

```text
$ node tests/lint/alarm-sync-linter.js
[+] Simulator (nodered_data/flows.json): Found 21 alarm codes
[+] Master (live DB, ldi_alarm_ms_code): Found 1820 alarm codes
```

Linter reports 21 simulator codes this run (the fidelity audit's
2026-08-11 run reported 19 -- the 2-code difference is the Phase F
`RARE_CRITICAL_CODES` addition, `01180016`/`0C020014`, applied after
that audit). Every simulator code resolves in the master catalog, 0
orphans -- this part of the taxonomy is solid and re-confirmed live,
not assumed from the older audit.

## What this review does not cover

- Whether the 1,795 non-curated codes' `alarm_msg`/`alarm_detail` text
  is itself accurate to the real vendor source -- that was the import
  process's job (892-row merge, 1,820-code catalog build), not
  re-verified here.
- Alarm _behavior_ (firing rate, debounce effectiveness, correlation
  quality) -- that's `LDI_ALARM_FIDELITY_AUDIT.md`'s scope, and its
  score (58/100) is known-stale per `BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md`,
  not re-run here since this review is catalog-data-only.

## Summary

Taxonomy structure is sound: severity distribution is real vendor
data, alarm-type classification is complete, simulator/master sync is
clean with 0 orphans. The one real, actionable gap is `sop_reference`
-- addressed as a recommendation in `SOP_COMPLETION_REVIEW.md`, not
duplicated as a second open item here.
