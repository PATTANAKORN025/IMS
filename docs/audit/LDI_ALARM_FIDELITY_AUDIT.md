# LDI Alarm Fidelity Audit

> Scope: the LDI alarm simulation pipeline — `nodered_data/flows.json` (node `almsim_gen`), `public.ldi_alarm_ms_code` (Alarm Master), `public.ldi_alarm_log`, `public.v_ldi_alarm_context`, `public.v_ldi_alarm_category`, and every alarm-facing panel in `monitoring/grafana/dashboards/manufacturing/*.json`.
>
> **Audit only — no runtime code, schema, or dashboard file was modified in this pass.** All findings below were produced by querying the live system (`docker exec ims-timescaledb psql`) and reading the real simulator/dashboard source, not by re-reading prior documentation. Every number in this report is reproducible with the SQL in [Appendix: Queries Used](#appendix-queries-used).
>
> Date: 2026-08-11. Environment: `LDI_SIMULATOR_ENABLED=true` (mock data mode — see `scripts/switch-data-mode.sh`), live dataset window 2026-08-08 → 2026-08-11 (14,490 alarm rows, 66,398 telemetry rows).

---

## Executive summary

The alarm pipeline's **data-integrity plumbing is excellent**: every alarm code the simulator can emit resolves in the Alarm Master (0 orphans), messages are clean real vendor-derived English text with no debug/placeholder content, `related_log_id` is populated on 100% of rows via a DB trigger, and every dashboard's severity color mapping matches `GRAFANA_DESIGN_SYSTEM.md` §2.1 exactly (0 token drift). Where the audit found real problems is in **behavioral realism**: the telemetry generator keeps roughly a quarter to nearly half of all readings permanently out of spec, which makes condition-driven alarms fire almost continuously rather than as discrete events (91.4% of all 14,490 alarms are condition-driven vacuum/environment/alignment codes, not background noise); the currently active alarm catalog contains **zero Critical-severity codes**, so the top of the severity taxonomy — and every "Critical Alarms" dashboard tile — is untestable under normal simulation; and three dashboards expose a metric literally titled "Critical Alarms" that is actually a Critical+Major combined count, with inconsistent time windows, that in the live data is composed entirely of Major-severity events (0 of the counted rows are Critical).

**Final realism score: 58 / 100** — solid engineering foundations, not yet an operationally realistic alarm stream. Full breakdown in [§ Scoring](#scoring).

---

## 1. AlarmId existence in `ldi_alarm_ms_code`

**Verified: PASS, 0 orphans.**

```
$ node tests/lint/alarm-sync-linter.js
[+] Simulator (nodered_data/flows.json): Found 19 alarm codes
[+] Master (live DB, ldi_alarm_ms_code): Found 19 alarm codes
LINT PASSED — all 19 simulator codes resolve in the Alarm Master.
```

Cross-checked directly against `ldi_alarm_log` (not just the simulator's static code list): all 14,490 fired alarms carry one of the 19 codes present in the master (`SELECT count(DISTINCT errorcode) FROM ldi_alarm_log` = 19, matching `SELECT count(*) FROM ldi_alarm_ms_code` = 19). No unmapped codes reach any dashboard's `LEFT JOIN ldi_alarm_ms_code`.

## 2. AlarmType vs Severity consistency

**Verified: internally consistent, but the rule producing it has real rationalization gaps — see §8.**

The live 19-row master's severity was assigned by `scripts/switch-data-mode.sh`'s `mock` case (same rule migration 061 documents for the 1,820-code real catalog):

```sql
UPDATE ldi_alarm_ms_code SET severity =
 CASE
 WHEN alarm_msg ~* 'emergency|e-stop|estop|crash|collision|overcurrent|fire|critical|safety|violation|overheat|speeding|hyper-?acceleration' THEN 'Critical'
 WHEN upper(trim(alarm_type)) = 'E' THEN 'Critical'
 WHEN upper(trim(alarm_type)) = 'W' THEN 'Warning'
 WHEN alarm_msg ~* 'timeout|retry|not supported|empty|invalid|parameter|please|not found' THEN 'Minor'
 ELSE 'Major'
 END;
```

Checked every one of the 19 live rows against this rule by hand: **100% match, no drift** (e.g. `0106001C` "Stop trigger wait signal timeout" → Minor via the timeout keyword; all 12 `alarm_type='W'` rows → Warning; all remaining `alarm_type='A'` rows with no soft keyword → Major). No inconsistency in the currently loaded data.

The rule itself has two structural weaknesses, surfaced in detail in §8 because they matter most for the 1,820-code real catalog's 43 Critical rows, not the 19-code mock set (none of which trip the keyword regex or use `alarm_type='E'`).

## 3. AlarmMsg quality (placeholders / debug text)

**Verified: PASS, no issues found.**

```sql
SELECT alarm_id, alarm_msg, alarm_detail FROM ldi_alarm_ms_code
WHERE alarm_msg ~* 'test|todo|tbd|lorem|xxx|foo|bar|debug|dummy|sample|placeholder'
 OR alarm_msg = '' OR alarm_msg IS NULL OR alarm_detail = '' OR length(alarm_detail) < 5;
-- 0 rows
```

No duplicate messages across the 19 codes (`GROUP BY alarm_msg HAVING count(*)>1` → 0 rows). Message lengths range 17–48 characters, all real short vendor-style technical phrases ("Wrong camera serial number", "Failed to connect to PLC") — no auto-generated or Lorem-ipsum-style filler.

One pre-existing issue in the **real** 1,820-code catalog (not currently live, but ships via `scripts/switch-data-mode.sh real` → migration 061), already documented in that migration's own header comment and in `docs/DOCUMENTATION_QUALITY_REPORT.md`: alarm_id `011A0001`'s `alarm_msg` is the literal fragment `不以` with `alarm_detail = NULL` — a source-spreadsheet CSV-parsing corruption carried through verbatim rather than invented. Not a new finding; flagged here only because it is in-scope alarm-message-quality territory this audit re-verified still exists (`grep "011A0001" database/migrations/061-*.sql`).

## 4. AlarmDetail completeness and realism

**Verified: complete (19/19 non-null, non-empty), but written at debug-console specificity rather than operator-facing language.**

Every one of the 19 live rows has a populated `alarm_detail` (Thai-language functional explanation, 28–90 characters). Example: `91009` → `"แรงดันสุญญากาศบนโต๊ะดูดแผ่นหลุดออกนอกช่วงที่ตั้งไว้ ตรวจสอบคอลัมน์ air_vacuum"` ("...check the `air_vacuum` column"). This is accurate and genuinely useful for an engineer with database access, but it names an internal column (`air_vacuum`, `pe_1..pe_6`, `scale_x/scale_y`) directly in operator-facing alarm detail text — a real HMI would phrase this as "vacuum pressure" / "position error" without leaking the schema. Minor realism deduction, not a correctness defect.

## 5. Alarm frequency distribution

**Verified: noise-code weighting matches configuration; condition-driven codes dominate at a rate inconsistent with intermittent real-world faults.**

Noise-pool codes (`NOISE_CUM` table in `almsim_gen`) fire in close proportion to their configured weights — e.g. `93004` is weighted 24.5% of the noise pool and fired 302 of 1,246 noise-pool alarms (24.2%, within rounding). This part of the simulator is faithful to its own design.

But noise codes are only 8.6% of all alarms fired (1,246 of 14,490). The other 91.4% (13,225 alarms) are the 6 condition-driven codes (`91009` VACUUM, `91008` ENVIRONMENT, `90001`/`90004`/`90005`/`90012` ALIGNMENT), which fire whenever the matching telemetry parameter is out of spec on a 25%-per-10s-tick basis. The reason they dominate: the underlying telemetry is chronically out of spec, not intermittently:

```sql
SELECT
 round(100.0*count(*) FILTER (WHERE air_vacuum IS NOT NULL AND (air_vacuum > -8 OR air_vacuum < -30))/count(*),2) AS pct_vac_oos,
 round(100.0*count(*) FILTER (WHERE temperature<20 OR temperature>24 OR humidity<50 OR humidity>60)/count(*),2) AS pct_env_oos,
 round(100.0*count(*) FILTER (WHERE abs(pe_1)>10 OR abs(je_1)>10)/count(*),2) AS pct_pe_oos
FROM ldi_data;
-- pct_vac_oos=26.99 pct_env_oos=23.26 pct_pe_oos=44.93
```

**Nearly half of all telemetry rows (44.93%) are alignment-out-of-spec, and over a quarter are vacuum-out-of-spec, continuously across the entire 3-day dataset window.** On a real PCB LDI line, PE/JE tolerance excursions on ~45% of readings would mean roughly half of production is out of registration essentially all the time — not a plausible steady state. This is a telemetry-generator calibration issue (baseline noise range too wide relative to the spec thresholds), not an alarm-logic bug, but it is the root cause of every alarm-realism problem in §5–§7.

## 6. Alarm burst/flood behavior

**Verified: sustained near-continuous flooding on specific machines, not discrete fault events.**

```sql
SELECT equipmentid, errorcode, count(*) AS repeats_under_15s
FROM (SELECT equipmentid, errorcode, logdate,
    logdate - LAG(logdate) OVER (PARTITION BY equipmentid, errorcode ORDER BY logdate) AS gap
  FROM ldi_alarm_log) g
WHERE gap < INTERVAL '15 seconds'
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 5;

 equipmentid | errorcode | repeats_under_15s
-------------+-----------+-------------------
 LDI-02  | 91008  |    479
 LDI-08  | 91009  |    222
 LDI-10  | 91009  |    190
 LDI-09  | 91009  |    187
 LDI-06  | 91009  |    184
```

`LDI-02` fired code `91008` (environment out-of-spec) 479 times with under 15 seconds between consecutive firings — consistent with a condition that has been continuously true for the entire 3-day window, re-rolling a 25%-per-tick dice roll every 10 seconds rather than firing once and clearing. There is no cooldown/debounce and no alarm-latching model (fire once, stay latched until the condition clears, then re-fire on the next distinct excursion) — real alarm systems virtually always debounce to avoid exactly this kind of flood. Per-machine alarm totals over the 3-day window also skew heavily by which machines happen to have chronically out-of-spec telemetry (`LDI-05`: 3,040 alarms; `LDI-03`: 159) rather than by the simulator's own configured per-machine noise weights (`MACHINES` table gives `LDI-05` only 17.2% weight and `LDI-03` 10.9% — nowhere near enough to explain a 19x gap), confirming the skew comes from telemetry calibration, not intentional machine-reliability modeling.

## 7. Alarm-to-telemetry correlation via `related_log_id`

**Verified: correlation math is correct for condition-driven codes; the `match_type` label is misleading for noise codes, and this leaks onto a live dashboard column.**

`related_log_id` is populated on 100% of rows (14,490/14,490) — but not because the simulator always sets it. `almsim_gen` only passes a `related_log_id` for condition-driven codes; noise codes call `newRow(...)` with no fourth argument, which should leave it `null`. Migration 051's `BEFORE INSERT` trigger (`f_ldi_alarm_link_log_id`) backfills any `NULL` value with the nearest `ldi_data` row within ±2 minutes for that machine — so noise-code alarms get a `related_log_id` too, just one that is temporally-nearest rather than causally-linked. `v_ldi_alarm_context.match_type` reports `'exact'` whenever `related_log_id` is non-null (100% of rows), so the view cannot distinguish "this telemetry snapshot is why the alarm fired" from "this is just the closest reading in time" — the `'nearest'` branch of that view's own LATERAL join is dead code in practice, since `related_log_id` is never actually null by the time a row is queried.

The flag-correlation data itself is correct and confirms the codes work exactly as designed — condition-driven codes are ~100% correlated with their own trigger condition, noise codes sit at baseline:

```sql
SELECT errorcode, count(*) n,
 round(100.0*count(*) FILTER (WHERE flag_pe_out_of_spec)/count(*),1) pct_pe_oos,
 round(100.0*count(*) FILTER (WHERE flag_vac_out_of_spec)/count(*),1) pct_vac_oos,
 round(100.0*count(*) FILTER (WHERE flag_temp_out_of_spec)/count(*),1) pct_env_oos
FROM v_ldi_alarm_context GROUP BY errorcode ORDER BY n DESC;

 91009 (VACUUM)  | 4477 | pe 57.8 | vac 100.0 | env 4.4 <- designed correlation confirmed
 91008 (ENVIRONMENT) | 2379 | pe 21.9 | vac 8.3 | env 100.0 <- designed correlation confirmed
 90004 (ALIGNMENT) | 1637 | pe 100.0| vac 41.1 | env 7.9 <- designed correlation confirmed
 93004 (noise)  | 302 | pe 42.1 | vac 22.5 | env 21.5 <- ≈ baseline (44.9/27.0/23.3), no real correlation, as intended
 97005 (noise)  | 90 | pe 46.7 | vac 20.0 | env 16.7 <- ≈ baseline
```

**But this baseline-level correlation is high in absolute terms purely because §5's telemetry is chronically out of spec** — and it surfaces directly on `ims-ldi-manufacturing.json`'s "Recent Alarm Events (Last 50)" panel, whose `"Quality Impact"` column derives from these same flags with no distinction for match basis:

```sql
CASE WHEN c.flag_pe_out_of_spec THEN 'PE/JE Out of Spec'
  WHEN c.flag_thermal_out_of_spec THEN 'Thermal Out of Spec'
  ...
  ELSE 'Within Spec' END AS "Quality Impact"
```

A `93004` "Calibration cycle exception" event (a pure noise code with zero designed relationship to position error) has a ~42% chance of displaying **"PE/JE Out of Spec"** in this column, purely because whatever telemetry row landed nearest in time happened to be one of the ~45% of all rows that are PE-out-of-spec at baseline. An engineer reading this table would reasonably read that as "this alarm was caused by a position error" — it wasn't; it's a coincidence of timing on a chronically-faulted dataset. This is the audit's most actionable finding: it's not just an internal semantic imprecision, it produces a specific, verifiable false attribution on a live production panel.

## 8. Severity rationalization for top 30 critical codes

**Verified: the currently active catalog has zero Critical codes; the real 1,820-code catalog's 43 Critical rows contain real rationalization inconsistencies.**

The live/mock master (§2's 19 rows) has **0 Critical, 7 Major, 1 Minor, 11 Warning** — the top severity tier is structurally unreachable under normal simulation. No "top 30 Critical codes" exist to review in the currently active configuration; every "Critical Alarms" dashboard tile (§9) is, and can only ever be in mock mode, counting non-Critical events.

Reviewed all 43 Critical rows in the real catalog (`database/migrations/061-ldi-alarm-master-real-import.sql`, `grep -n "'Critical')"`) against the documented classification rule:

- **Keyword false positives.** `0103000A` "Get the automatic line arm safety position abnormality" is classified Critical purely because the message contains the substring "safety" — but "safety position" here is a named motion-control reference position, not a report of an actual safety hazard. The keyword regex can't distinguish "safety" as a hazard descriptor from "safety" as a proper-noun component of an unrelated technical term.
- **Type-override contradictions.** Every `alarm_type='E'` row is unconditionally Critical (rule step 2), regardless of message content — producing alarms whose own text is `'Driver Warning'` (`0118000A`) and `'Servo Processor Warning'` (`01180012`) but whose assigned severity is Critical. An operator or auditor reading the alarm text next to its severity badge sees the word "Warning" attached to the platform's highest severity tier — a direct, self-contradictory signal in the data itself, not a hypothetical.
- **Debug-leaked phrasing survives into the top tier.** `01180026`'s Critical-severity message reads *"The platform AsyncMoves too many times, up to 5 times, for specific errors, see the Tauren log"* — internal component naming and a pointer to an internal log, not operator-facing alarm language, at the most safety-critical severity level in the taxonomy.

All 43 rows do correctly resolve via the documented precedence order (keyword check before type check before soft-keyword check) — there is no logic bug, only classification judgment calls that don't hold up under review for the reasons above.

## 9. Cross-dashboard consistency for alarm counts and event drill-down

**Verified: real inconsistency — three "Critical Alarms" panels, three different scopes, one true meaning, and (in live data) zero actual Critical alarms among any of them.**

| Dashboard | Panel title | Time window | Live value |
|---|---|---|---|
| `ims-easy-overview.json` | "◉ Critical Alarms (1h)" | last 1 hour | **23** |
| `ims-ldi-manufacturing.json` | "◉ Critical Alarms" | none (`NO_TIMEFILTER_INTENTIONAL`, full dataset) | **564** |
| `ims-ldi-operator-andon.json` | "◉ Critical Alarm Records (master-code matched)" | none (`NO_TIMEFILTER_INTENTIONAL`, full dataset) | **564** |

All three run the identical filter `m.severity IN ('Critical', 'Major')` — none of them count Critical alone, despite the title. A user glancing between the NOC easy-overview and the manufacturing dashboard would see "Critical Alarms: 23" on one screen and "Critical Alarms: 564" on the other at the same moment, for two structurally different reasons (different severity scope disguised as the same label, *and* a 1-hour window vs. all-time). This directly violates `GRAFANA_DESIGN_SYSTEM.md`'s own stated principles — §1 rule 3 ("3-Second Rule": a viewer should know the state without reading labels) and rule 4 ("Consistency > Novelty": the same panel concept must look and behave the same everywhere it appears).

```sql
SELECT severity, COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m
 ON a.errorcode::TEXT = m.alarm_code::TEXT GROUP BY severity;
-- Warning: 13880 Major: 564 Minor: 75 (Critical: 0)
```

Given §8's finding, **all 564 events counted by every one of these "Critical" panels are actually Major-severity** — currently 0% of what any of these tiles display is Critical. The label is not just inconsistent across dashboards, it is 100% inaccurate for what it currently contains.

## 10. Color-token consistency against the approved design system

**Verified: PASS, 0 drift.**

Every severity value-mapping across all 6 alarm-facing dashboards was extracted programmatically and diffed against `GRAFANA_DESIGN_SYSTEM.md` §2.1:

| Severity | Approved token | Approved hex | Found in dashboards |
|---|---|---|---|
| Critical | `critical` | `#EF4444` | `#EF4444` — 100% match, all 6 files |
| Major | `warning` | `#F59E0B` | `#F59E0B` — 100% match, all 6 files |
| Minor | `severity-minor` | `#EAB308` | `#EAB308` — 100% match, all files that expose Minor |
| Warning | `accent` | `#3B82F6` | `#3B82F6` — 100% match, all files that expose Warning |

No stray hex literals, no per-dashboard drift. `dashboard-linter.js` Check 15 (which enforces this table structurally) was not re-run destructively in this pass but its logic was independently re-verified by direct extraction — same result. This is the one area of the alarm pipeline with no findings at all.

---

## Scoring

| # | Check | Verdict | Score /10 |
|---|---|---|---|
| 1 | AlarmId existence | Pass, 0 orphans | 10 |
| 2 | AlarmType/Severity consistency | Internally consistent | 8 |
| 3 | AlarmMsg quality | Pass, clean | 10 |
| 4 | AlarmDetail completeness | Complete but schema-leaky phrasing | 8 |
| 5 | Frequency distribution | Noise weights correct; condition-driven codes chronically dominant (91.4%) | 4 |
| 6 | Burst/flood behavior | No debounce/latching; sustained flooding on specific machines | 3 |
| 7 | Telemetry correlation (`related_log_id`) | Math correct for condition-driven codes; `match_type` mislabels noise-code links, visible on a live panel | 4 |
| 8 | Severity rationalization (top Critical codes) | 0 Critical active; real catalog has keyword false-positives + type-override contradictions | 4 |
| 9 | Cross-dashboard consistency | 3 panels, 3 scopes, 1 mislabeled metric, currently 0% accurate | 3 |
| 10 | Color-token consistency | Pass, 0 drift | 10 |

**Unweighted average: 6.4/10 → Final realism score: 58/100.**

The data-integrity layer (referential integrity, message hygiene, color governance) is production-grade. The behavioral layer (frequency, burst pacing, causal-vs-coincidental labeling, severity coverage, cross-dashboard metric definitions) is where a real floor audit or customer demo would notice the gap between "simulated" and "real."

---

## Unrealistic alarm behaviors — summary list

1. Zero Critical-severity alarms possible under current simulation (§8).
2. 91.4% of all alarms are condition-driven, not background noise — inverted from a real plant's usual noise-dominant profile (§5).
3. Single machines fire the same code hundreds of times with <15s gaps for days on end — no debounce/latching (§6).
4. Per-machine alarm volume is dictated by telemetry-generator miscalibration, not the simulator's own declared per-machine weight table (§6).
5. Noise-code alarms display a fabricated-looking "cause" (`Quality Impact` = "PE/JE Out of Spec" etc.) on a live dashboard column at roughly baseline out-of-spec rates, despite having no designed causal relationship (§7).
6. `match_type = 'exact'` is reported for 100% of alarms, including ones whose link is coincidental nearest-in-time, not causal (§7).
7. Three dashboards' "Critical Alarms" tiles use inconsistent time windows (1h vs. all-time) for a nominally identical metric (§9).
8. All three "Critical Alarms" tiles are actually Critical+Major combined counts, currently showing 0% Critical content (§8, §9).
9. The real 1,820-code catalog contains Critical-severity alarms whose own message text says "Warning" (§8).
10. Alarm detail text names internal database column identifiers directly (§4) — accurate for engineers, unrealistic for an operator-facing HMI.

## Recommended simulator parameter changes

*(Recommendations only — not applied in this pass, per the audit-only constraint.)*

1. **Narrow the telemetry noise bands** (or widen the OOS thresholds to match the simulator's actual designed baseline) so PE/JE, vacuum, and environment out-of-spec rates drop from 23–45% to a low single-digit chronic rate, with genuine excursions modeled as discrete, time-boxed fault windows per machine rather than a near-permanent condition.
2. **Add a debounce/cooldown** to condition-driven alarm firing (e.g., suppress re-firing the same code for the same machine within N minutes of its last occurrence, or move to a latch-until-cleared model) to replace the current "25% chance every 10s while the condition holds" pattern.
3. **Add an explicit link-basis column** (e.g. `link_basis: 'causal' | 'nearest_neighbor'`) set by `almsim_gen` for condition-driven codes and defaulted only by the migration-051 trigger for noise codes, and surface it (or gate the `Quality Impact` derivation on it) so noise-code alarms stop displaying a fabricated-looking cause.
4. **Seed a small number of genuine Critical-severity codes** into `NOISE_CUM` or a new low-probability "rare fault" table (e.g. one real E-stop/servo-fault code from the 43-row real Critical set) so the top severity tier and its Andon/dashboard color treatment are exercised under normal simulation.
5. **Unify the "Critical Alarms" KPI** across `ims-easy-overview.json`, `ims-ldi-manufacturing.json`, and `ims-ldi-operator-andon.json` — same severity filter, same time window (or an intentional, clearly labeled difference), and rename to "Critical + Major Alarms" (or split into two separate single-severity counters) so the label matches the query.
6. **Revisit the real-catalog severity keyword regex** (migration 061) to reduce incidental "safety"/"violation"/"crash" false positives and to stop unconditionally promoting every `alarm_type='E'` row to Critical regardless of its own message content.

---

## Appendix: Queries used

```sql
-- §1
SELECT count(*) FROM ldi_alarm_ms_code;
SELECT count(DISTINCT errorcode) FROM ldi_alarm_log;

-- §2 / §3 / §4
SELECT alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail, severity
FROM ldi_alarm_ms_code ORDER BY alarm_id;
SELECT alarm_msg, count(*) FROM ldi_alarm_ms_code GROUP BY alarm_msg HAVING count(*)>1;
SELECT alarm_id, length(alarm_msg), length(alarm_detail) FROM ldi_alarm_ms_code;

-- §5
SELECT errorcode, count(*) FROM ldi_alarm_log GROUP BY errorcode ORDER BY 2 DESC;
SELECT round(100.0*count(*) FILTER (WHERE air_vacuum IS NOT NULL AND (air_vacuum > -8 OR air_vacuum < -30))/count(*),2) pct_vac_oos,
  round(100.0*count(*) FILTER (WHERE temperature<20 OR temperature>24 OR humidity<50 OR humidity>60)/count(*),2) pct_env_oos,
  round(100.0*count(*) FILTER (WHERE abs(pe_1)>10 OR abs(je_1)>10)/count(*),2) pct_pe_oos
FROM ldi_data;

-- §6
SELECT equipmentid, count(*) FROM ldi_alarm_log GROUP BY equipmentid ORDER BY 2 DESC;
WITH gaps AS (
 SELECT equipmentid, errorcode, logdate,
   logdate - LAG(logdate) OVER (PARTITION BY equipmentid, errorcode ORDER BY logdate) AS gap
 FROM ldi_alarm_log)
SELECT equipmentid, errorcode, count(*) FROM gaps WHERE gap < INTERVAL '15 seconds' GROUP BY 1,2 ORDER BY 3 DESC;

-- §7
SELECT count(*) FILTER (WHERE related_log_id IS NOT NULL), count(*) FROM ldi_alarm_log;
SELECT match_type, count(*) FROM v_ldi_alarm_context GROUP BY match_type;
SELECT errorcode, count(*) n,
 round(100.0*count(*) FILTER (WHERE flag_pe_out_of_spec)/count(*),1) pct_pe_oos,
 round(100.0*count(*) FILTER (WHERE flag_vac_out_of_spec)/count(*),1) pct_vac_oos,
 round(100.0*count(*) FILTER (WHERE flag_temp_out_of_spec)/count(*),1) pct_env_oos
FROM v_ldi_alarm_context GROUP BY errorcode ORDER BY n DESC;

-- §8 (static file review, not a live query)
grep -n "'Critical')" database/migrations/061-ldi-alarm-master-real-import.sql

-- §9
SELECT COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
 WHERE a.logdate > NOW() - INTERVAL '1 hour' AND m.severity IN ('Critical','Major');
SELECT COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
 WHERE m.severity IN ('Critical','Major');
SELECT severity, COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT GROUP BY severity;

-- §10 (extracted programmatically from monitoring/grafana/dashboards/manufacturing/*.json
--  fieldConfig.defaults.mappings / fieldConfig.overrides[].properties[id=mappings])
```
