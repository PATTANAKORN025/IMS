# LDI Simulator Behavioral Redesign — Results

> Implements the 6-point design approved 2026-08-11 in response to `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` (realism score 58/100): **drift, fault frequency, burst behavior, debounce, correlation semantics, critical-event distribution.**
>
> Status: **implementation complete, deployed, and mechanically verified.** The quantitative re-score and the 24h soak report are explicitly time-gated — see [§4](#4-what-is-not-in-this-document-yet) — and cannot be produced early without fabricating numbers, which this report will not do.

---

## 1. Migration SQL

| File                                                                                                                                                                                                                                                                                                                          | What it does                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`database/migrations/069-ldi-alarm-debounce-and-link-basis.sql`](../../database/migrations/069-ldi-alarm-debounce-and-link-basis.sql) (new)                                                                                                                                                                                  | Creates `public.ldi_alarm_state` (debounce state: `equipmentid`, `errorcode`, `first_fired`, `last_fired`, `fire_count`); adds `ldi_alarm_log.link_basis` (`causal` \| `nearest`); updates `v_ldi_alarm_context` to expose `link_basis` as a trailing column (`CREATE OR REPLACE VIEW` cannot reorder existing columns, so it's appended, not inserted inline). |
| [`database/migrations/036-ldi-alarm-master-mock.sql`](../../database/migrations/036-ldi-alarm-master-mock.sql) (edited — this file is re-run on every `mock` switch, unlike normal incremental migrations, so editing it in place is the established convention, not a violation of the "never edit a merged migration" rule) | Adds 2 real Critical-severity vendor codes (`01180016` Emergency Stop, `0C020014` Safety sensor triggered) to the mock catalog, taking it from 19 to 21 codes.                                                                                                                                                                                                  |

Both applied live: `docker exec ims-timescaledb psql ... < 069-...sql` (clean apply, `CREATE TABLE`/`ALTER TABLE`/`CREATE VIEW`/`GRANT`), then `bash scripts/switch-data-mode.sh mock` (re-seeds 036, confirmed `INSERT 0 21`).

## 2. Diff of `flows.json`

Raw `git diff` on this file is unreadable — every node's function body is one JSON-escaped line. Below is a proper diff of the three changed function bodies (`ldisim_gen`, `almsim_gen`, `almsim_db`), extracted from git history and the working tree.

**Summary of what changed, per finding:**

| Finding                                            | Change                                                                                                                                                                                                                                                                                 | Where                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Static miscalibration (root cause of #5 frequency) | `LDI-02.temp_mu` 26.49→21.72 (was outside the 20-24 spec band by construction); DF-OUTER/SM `air_vacuum` hardcoded `0.0` (always >-8, a regression of migration 054) → real per-machine nominal (-12.9 to -14.6) + `vac_sd: 0.45`, now a genuine OU process instead of a flat constant | `ldisim_gen`, `P` table   |
| #1 drift                                           | New `driftStep()` state machine (`nominal→drifting→faulted→serviced→cooldown`), independent per machine × {vac, temp, rh, align}, `DRIFT_CFG` timing/magnitude table                                                                                                                   | `ldisim_gen`              |
| #5 fault frequency                                 | New `calibrate()` clamps PE/JE (mean,sd) so nominal P(\|x\|>10) is a rare tail event, not baseline-guaranteed (e.g. a channel with mean=-14.76, sd=21.32 was already miscalibrated against the ±10 spec)                                                                               | `ldisim_gen`              |
| #6 burst/flood                                     | New `ldi_alarm_state` debounce table; `almsim_gen` checks/skips codes still in a 12-minute cooldown; `almsim_db` upserts state after every insert                                                                                                                                      | `almsim_gen`, `almsim_db` |
| #7 correlation semantics                           | `newRow()` now takes an explicit `linkBasis` param; condition-driven/critical codes pass `'causal'`, noise codes pass `'nearest'`, written to the new `link_basis` column instead of being inferred from whether `related_log_id` happens to be null                                   | `almsim_gen`, `almsim_db` |
| #8 critical distribution                           | New `RARE_CRITICAL_CODES`/`RARE_CRITICAL_PROB` branch, independent of the noise/condition pools                                                                                                                                                                                        | `almsim_gen`              |

<details>
<summary><strong>Full diff (455 lines) — click to expand</strong></summary>

```diff
=== nodered_data/flows.json :: node 'ldisim_gen' ===
@@ -2,8 +2,19 @@
 // ══════════════════════════════════════════════════════════════════
 // LDI LIVE SIMULATOR — Ornstein-Uhlenbeck mean-reverting sensor model
 // สร้างข้อมูลที่ "เคลื่อนไหวต่อเนื่อง" เหมือนเซ็นเซอร์จริง ไม่ใช่สุ่มอิสระ
+//
+// LDI Alarm Fidelity Audit (docs/audit/LDI_ALARM_FIDELITY_AUDIT.md,
+// 2026-08-11) found the fleet was chronically out-of-spec by construction,
+// not intermittently faulted: LDI-02's nominal temp_mu (26.49) was already
+// outside the 20-24 spec band; DF-OUTER/SM air_vacuum was hardcoded to the
+// 0.0 zero-coercion test constant, which is always > -8 (always "out of
+// spec"); and pe/je channels were literally memoryless per-tick noise with
+// several channels' configured (mean,sd) already implying a high baseline
+// P(|x|>10). Fixed here, plus a real drift lifecycle (nominal -> drifting
+// -> faulted -> serviced -> cooldown) for vacuum/environment/alignment so
+// faults are discrete, bounded episodes instead of a permanent condition.
 // ══════════════════════════════════════════════════════════════════
-const P = { ...original 10-machine table, vac:0.0 for DF-OUTER/SM, LDI-02 temp_mu:26.49... };
+const P = { ...same table, vac now real per-machine nominal + vac_sd:0.45, LDI-02 temp_mu:21.72... };
 const SENTINEL = 1.79769313486232;
 // DESIGN_STRESS: exercises layout edge cases (real dropouts, long strings,
 // spec-boundary values, extra machines) that realistic mock data rarely hits.
@@ -29,6 +40,82 @@
  return prev + THETA * (mu - prev) * DT + sigma * Math.sqrt(DT) * gauss();
 }
 function r(x, n) { const p = Math.pow(10, n); return Math.round(x * p) / p; }
+function randMs(minMin, maxMin) { return (minMin + Math.random() * (maxMin - minMin)) * 60000; }
+
+// ── PE/JE calibration: several channels' source (mean,sd) pairs implied a
+// high baseline P(|x|>10) against the +/-10 spec purely from the numbers
+// themselves (e.g. a channel with mean=-14.76, sd=21.32 is out of spec on
+// most independent draws). Clamp the effective nominal mean well inside the
+// limit and cap sd so mean+3*sd stays inside it too -- nominal-state OOS
+// becomes a rare tail event (~0.1%/tick) instead of a coin flip, matching a
+// tightly-controlled production process. Real fault episodes are then
+// modeled explicitly via the drift lifecycle below, not baseline noise. ──
+const PE_JE_LIMIT = 10;
+function calibrate(meanSd) {
+ const mean = Math.max(-0.5 * PE_JE_LIMIT, Math.min(0.5 * PE_JE_LIMIT, meanSd[0]));
+ const sd = Math.min(meanSd[1], Math.max(0.3, (PE_JE_LIMIT - Math.abs(mean)) / 3.2));
+ return [mean, sd];
+}
+const PCAL = {};
+for (const id of Object.keys(P)) {
+ const p = P[id];
+ PCAL[id] = {
+  pe: p.pe ? p.pe.map(ch => ch ? calibrate(ch) : null) : null,
+  je: p.je.map(ch => ch ? calibrate(ch) : null)
+ };
+}
+
+// ── Drift lifecycle: nominal -> drifting -> faulted -> serviced -> cooldown.
+// A shared state machine reused for vacuum, environment (temp/humidity) and
+// alignment (pe/je) faults, each with independent per-machine state so
+// unrelated fault types don't all trip together. `bias` is the value added
+// on top of the parameter's calibrated nominal mean; it ramps linearly to
+// its target during 'drifting', holds during 'faulted', then drops to 0
+// once 'serviced' -- discrete, bounded fault episodes instead of a
+// permanent condition (LDI Alarm Fidelity Audit finding #5/#6). ──
+function driftStep(d, now, cfg) {
+ if (!d) d = { phase: 'nominal', bias: 0, cooldownUntil: 0 };
+ switch (d.phase) {
+  case 'drifting': {
+   const frac = Math.min(1, (now - d.driftStart) / (d.until - d.driftStart));
+   d.bias = d.target * frac;
+   if (now >= d.until) { d.phase = 'faulted'; d.until = now + randMs(cfg.faultMin, cfg.faultMax); }
+   break;
+  }
+  case 'faulted':
+   d.bias = d.target;
+   if (now >= d.until) { d.phase = 'serviced'; }
+   break;
+  case 'serviced':
+   d.bias = 0;
+   d.cooldownUntil = now + randMs(cfg.cooldownMin, cfg.cooldownMax);
+   d.phase = 'nominal';
+   break;
+  default: // nominal
+   d.bias = 0;
+   if (now >= d.cooldownUntil && Math.random() < cfg.onsetProb) {
+    d.phase = 'drifting';
+    d.driftStart = now;
+    d.until = now + randMs(cfg.driftMin, cfg.driftMax);
+    d.target = cfg.targetFn();
+   }
+ }
+ return d;
+}
+// onsetProb is per 2s tick. vac/env ~= 1 onset / ~1.3 days per machine;
+// align ~= 1 onset / ~19h per machine (registration drift is the most
+// common real LDI fault mode) -- fleet-wide that's ~20-30 discrete fault
+// episodes/day, each producing a handful of debounced alarms while active.
+const DRIFT_CFG = {
+ vac: { onsetProb: 0.000015, driftMin: 20, driftMax: 45, faultMin: 15, faultMax: 30, cooldownMin: 180, cooldownMax: 480,
+    targetFn: () => (Math.random() < 0.5 ? 1 : -1) * (11 + Math.random() * 8) },
+ temp: { onsetProb: 0.000012, driftMin: 15, driftMax: 40, faultMin: 10, faultMax: 25, cooldownMin: 180, cooldownMax: 480,
+    targetFn: () => (Math.random() < 0.5 ? 1 : -1) * (4.5 + Math.random() * 3) },
+ rh: { onsetProb: 0.000012, driftMin: 15, driftMax: 40, faultMin: 10, faultMax: 25, cooldownMin: 180, cooldownMax: 480,
+    targetFn: () => (Math.random() < 0.5 ? 1 : -1) * (9 + Math.random() * 6) },
+ align: { onsetProb: 0.00002, driftMin: 15, driftMax: 35, faultMin: 10, faultMax: 20, cooldownMin: 120, cooldownMax: 360,
+    targetFn: () => (Math.random() < 0.5 ? 1 : -1) * (13 + Math.random() * 8) }
+};

 const st = flow.get('sim_state') || {};
 const now = Date.now();
@@ -37,17 +124,20 @@
 const ALL_IDS = Object.keys(P).concat(Object.keys(STRESS_MACHINES));
 for (const id of ALL_IDS) {
  const p = P[STRESS_MACHINES[id] || id];
+ const pcal = PCAL[STRESS_MACHINES[id] || id];
  let s = st[id];
  if (!s) {
-  s = { temp: p.temp_mu, rh: p.rh_mu, board: 1,
+  s = { temp: p.temp_mu, rh: p.rh_mu, vac: p.vac, board: 1,
    ...
-    acc: 0, gapTicks: 0, speedFaultTicks: 0 };
+    acc: 0, gapTicks: 0, speedFaultTicks: 0,
+    drift: { vac: null, temp: null, rh: null, align: null } };
  }
+ if (!s.drift) s.drift = { vac: null, temp: null, rh: null, align: null };
  ...
- // ── OU drift ของสภาพแวดล้อม ──
- s.temp = ou(s.temp, p.temp_mu, p.temp_sd);
- s.rh = ou(s.rh, p.rh_mu, p.rh_sd);
+ // ── drift lifecycle step (independent per fault type) ──
+ s.drift.vac = driftStep(s.drift.vac, now, DRIFT_CFG.vac);
+ s.drift.temp = driftStep(s.drift.temp, now, DRIFT_CFG.temp);
+ s.drift.rh = driftStep(s.drift.rh, now, DRIFT_CFG.rh);
+ s.drift.align = driftStep(s.drift.align, now, DRIFT_CFG.align);
+
+ // ── OU drift ของสภาพแวดล้อม + vacuum (all three now real OU processes,
+ // not a flat constant -- see header comment) ──
+ s.temp = ou(s.temp, p.temp_mu + s.drift.temp.bias, p.temp_sd);
+ s.rh = ou(s.rh, p.rh_mu + s.drift.rh.bias, p.rh_sd);
+ s.vac = ou(s.vac, p.vac + s.drift.vac.bias, p.vac_sd);
  ...
-  air_vacuum: p.vac,   // ← DF OUTER/SM = 0 พอดี (ทดสอบบั๊ก zero-coercion)
+  air_vacuum: dropout ? 0 : r(s.vac, 2),
  ...
+ const alignBias = s.drift.align.bias;
- if (p.pe) {
+ if (pcal.pe) {
   ...
-   out[a] = p.pe[a][0] + za * p.pe[a][1];
-   out[b] = p.pe[b][0] + zb * p.pe[b][1];
+   out[a] = pcal.pe[a][0] + za * pcal.pe[a][1] + (a === 0 ? alignBias : 0);
+   out[b] = pcal.pe[b][0] + zb * pcal.pe[b][1] + (b === 0 ? alignBias : 0);
   ...
  for (let k = 0; k < 4; k++) {
-  const j = p.je[k];
-  rec['je_' + (k + 1)] = j ? r(Math.max(0, j[0] + Math.abs(gauss()) * j[1]), 1) : null;
+  const j = pcal.je[k];
+  rec['je_' + (k + 1)] = j ? r(Math.max(0, j[0] + Math.abs(gauss()) * j[1] + (k === 0 ? Math.abs(alignBias) : 0)), 1) : null;
  }

=== nodered_data/flows.json :: node 'almsim_gen' ===
@@ -13,28 +14,24 @@
 // equipment/calibration faults) + condition-driven codes (fired only
 // when the matching telemetry parameter is actually out of spec right
 // now, per the same thresholds v_ldi_alarm_context/migration 054+057
-// uses).
+// uses) + a rare genuine-Critical branch.
 //
-// [superseded historical commentary removed]
+// LDI Alarm Fidelity Audit (docs/audit/LDI_ALARM_FIDELITY_AUDIT.md,
+// 2026-08-11) findings addressed here: #6 burst/flood (debounce cooldown
+// via public.ldi_alarm_state), #7 correlation semantics (explicit
+// link_basis instead of inferring causal-vs-coincidental from whether
+// related_log_id happens to be null), #8 severity distribution
+// (RARE_CRITICAL adds real Critical-severity codes at low probability).
 // ══════════════════════════════════════════════════════════════════
 const pool = global.get('pgPool');
 ...
 const ALIGN_CODES = ["90001", "90004", "90005", "90012"];
+const RARE_CRITICAL_CODES = ["01180016", "0C020014"]; // Emergency Stop / Safety sensor triggered
+const RARE_CRITICAL_PROB = 0.00002; // per machine per 10s tick
 const RATE_PER_TICK = 0.01194 * 20 * (15 / 20); // unchanged overall pacing, noise share only
+const COOLDOWN_MIN = 12; // debounce window: suppress re-fire of the same (machine, code) within this many minutes

 function pick(table) { ... }
 function poissonCount(rate) { ... }
-function newRow(eq, code, ts, relatedLogId) {
+function newRow(eq, code, ts, relatedLogId, linkBasis) {
  return {
   ...
-  related_log_id: relatedLogId || null
+  related_log_id: relatedLogId || null,
+  link_basis: linkBasis
  };
 }

-const rows = [];
 const now = Date.now();

-// ── background noise (unconditioned, real historical distribution) ──
-const nNoise = poissonCount(RATE_PER_TICK);
-for (let k = 0; k < nNoise; k++) {
- rows.push(newRow(pick(MACHINES), pick(NOISE_CUM), new Date(now - Math.floor(Math.random() * 9000))));
-}
+function generate(cooldownSet) {
+ const rows = [];
+ const debounced = (eq, code) => cooldownSet.has(eq + '|' + code);
+
+ // ── background noise ──
+ const nNoise = poissonCount(RATE_PER_TICK);
+ for (let k = 0; k < nNoise; k++) {
+  const eq = pick(MACHINES), code = pick(NOISE_CUM);
+  if (debounced(eq, code)) continue;
+  rows.push(newRow(eq, code, new Date(now - Math.floor(Math.random() * 9000)), null, 'nearest'));
+ }

-// ── condition-driven alarms ... ──
-const sql = ` ... `;
-pool.query(sql, [], function (err, result) {
- if (err) { node.error(...); return; }
- const ts = new Date();
- const fires = () => Math.random() < 0.25;
- for (const r of (result.rows || [])) {
-  if (...) { rows.push(newRow(r.eqp_id, '91008', ts, r.log_id)); }
-  if (...) { rows.push(newRow(r.eqp_id, ALIGN_CODES[...], ts, r.log_id)); }
-  if (...) { rows.push(newRow(r.eqp_id, '70004', ts, r.log_id)); }
-  if (...) { rows.push(newRow(r.eqp_id, '91009', ts, r.log_id)); }
+ // ── rare genuine-Critical events, independent of telemetry state ──
+ for (const [eq] of MACHINES) {
+  if (Math.random() < RARE_CRITICAL_PROB) {
+   const code = RARE_CRITICAL_CODES[Math.floor(Math.random() * RARE_CRITICAL_CODES.length)];
+   if (!debounced(eq, code)) rows.push(newRow(eq, code, new Date(now), null, 'nearest'));
   }
  }
- if (rows.length === 0) { node.status(...); return; }
- node.status(...);
- node.send({ payload: rows });
-});
+
+ const sql = ` ... unchanged ... `;
+ return new Promise((resolve) => {
+  pool.query(sql, [], function (err, result) {
+   if (err) { node.error(...); resolve(rows); return; }
+   const ts = new Date();
+   const fires = () => Math.random() < 0.25;
+   for (const r of (result.rows || [])) {
+    if (...) { if (!debounced(r.eqp_id, '91008')) rows.push(newRow(r.eqp_id, '91008', ts, r.log_id, 'causal')); }
+    if (...) { const code = ALIGN_CODES[...]; if (!debounced(r.eqp_id, code)) rows.push(newRow(r.eqp_id, code, ts, r.log_id, 'causal')); }
+    if (...) { if (!debounced(r.eqp_id, '70004')) rows.push(newRow(r.eqp_id, '70004', ts, r.log_id, 'causal')); }
+    if (...) { if (!debounced(r.eqp_id, '91009')) rows.push(newRow(r.eqp_id, '91009', ts, r.log_id, 'causal')); }
+   }
+   resolve(rows);
+  });
+ });
+}
+
+// debounce lookup: which (machine, code) pairs are still within cooldown
+pool.query(
+ `SELECT equipmentid, errorcode FROM public.ldi_alarm_state WHERE last_fired > NOW() - INTERVAL '${COOLDOWN_MIN} minutes'`,
+ [],
+ function (err, result) {
+  if (err) { node.error('Alarm sim debounce query failed: ' + err.message); return; }
+  const cooldownSet = new Set((result.rows || []).map(r => r.equipmentid + '|' + r.errorcode));
+  generate(cooldownSet).then(rows => {
+   if (rows.length === 0) { node.status({ fill: 'grey', shape: 'ring', text: 'no alarm' }); return; }
+   node.status({ fill: 'yellow', shape: 'dot', text: rows.length + ' alarm: ' + rows.map(r => r.errorcode).join(',') });
+   node.send({ payload: rows });
+  });
+ }
+);
 return null;

=== nodered_data/flows.json :: node 'almsim_db' ===
@@ -1,8 +1,7 @@
 const pool = global.get('pgPool');
 const rows = msg.payload || [];
 if (!pool || rows.length === 0) return null;
-const cols = ['logid','logdate','errorcode','errortime','equipmentid','factory','process','related_log_id'];
+const cols = ['logid','logdate','errorcode','errortime','equipmentid','factory','process','related_log_id','link_basis'];
 const ph = rows.map(...).join(',');
 const params = [];
 for (const r of rows) for (const c of cols) params.push(r[c]);
@@ -11,5 +10,21 @@
 pool.query(sql, params, function (err) {
  if (err) { node.error('Alarm sim INSERT failed: ' + err.message); return; }
  node.log('Alarm sim: inserted ' + rows.length);
+
+ // LDI Alarm Fidelity Audit fix #6 (burst/flood): record/refresh debounce
+ // state for every (machine, code) that fired this tick.
+ const pairs = [...new Set(rows.map(r => r.equipmentid + '|' + r.errorcode))].map(k => k.split('|'));
+ if (pairs.length === 0) return;
+ const stateVals = [];
+ const statePh = pairs.map((p, i) => { stateVals.push(p[0], p[1]); return '($' + (i*2+1) + ',$' + (i*2+2) + ',NOW(),NOW(),1)'; }).join(',');
+ const stateSql = 'INSERT INTO public.ldi_alarm_state (equipmentid, errorcode, first_fired, last_fired, fire_count) VALUES ' +
+  statePh + ' ON CONFLICT (equipmentid, errorcode) DO UPDATE SET last_fired = EXCLUDED.last_fired, fire_count = ldi_alarm_state.fire_count + 1';
+ pool.query(stateSql, stateVals, function (err2) {
+  if (err2) node.error('Alarm sim debounce state upsert failed: ' + err2.message);
+ });
 });
 return null;
```

(The `P` table and the unabridged condition-driven `if` blocks are elided above with `...` for readability — every literal value change is itemized in the summary table; the full unabridged diff, including the complete before/after `P` table, is preserved in this session's tooling output and reproducible via `git diff nodered_data/flows.json` against commit prior to this change.)

</details>

Two supporting lint fixes were required for CI to stay green (both files previously parsed only `NOISE_CUM`/`ALIGN_CODES`, missing the new `RARE_CRITICAL_CODES` array, and `orphan-object-linter.js` only scanned the stale `nodered_data/flows/` directory, not the real `nodered_data/flows.json`):

- `tests/lint/alarm-sync-linter.js`, `tests/lint/rca-mapping-coverage.js` — added `RARE_CRITICAL_CODES` parsing.
- `tests/lint/orphan-object-linter.js` — added `nodered_data/flows.json` to its reference-search scope (was invisible to it entirely, a pre-existing gap this change exposed).

## 3. Deployment verification (structural — mechanisms confirmed working)

Deployed via `docker restart ims-node-red` (flow reload confirmed clean: `Started flows`, 0 errors in logs), then `TRUNCATE ldi_data, ldi_alarm_log, ldi_alarm_state` for a clean post-deploy baseline. Full regression suite re-run: `alarm-sync-linter` (21/21), `dashboard-linter` (0 errors), `rca-mapping-coverage` (19/21 classified, 2 new Critical codes correctly UNCLASSIFIED, still above the 45% floor), `query-budget-linter`, `orphan-object-linter` (0 orphans after the fix), all 5 unit test files, both smoke tests, both e2e checks — all PASS. `golden-dataset-spc.js` still shows its pre-existing, previously-documented 5/7 Known Gap (materialized-view test-coverage issue from migration 064) — unchanged by this work, not a new regression.

With ~9 minutes of live data post-deploy:

- **Vacuum regression fixed and confirmed live**: `LDI-05`..`LDI-08` (previously hardcoded `0.0`, permanently "out of spec") now show real varying readings, e.g. `LDI-08: min=-16.05 max=-14.00 avg=-14.91` — comfortably inside the -8/-30 band.
- **`link_basis` populated correctly**: of the first 10 alarms, 3 `causal` (condition-driven) / 7 `nearest` (noise) — the explicit split works as designed.
- **Debounce state recording correctly**: `ldi_alarm_state` populated with one row per (machine, code) fired, `fire_count` incrementing on repeats (confirmed via `ON CONFLICT ... DO UPDATE`).

This is real evidence the fix mechanisms work. It is **not** enough data to re-score frequency, burst-rate, or Critical-event distribution — those need hours, not minutes, to accumulate a statistically meaningful sample (the original audit's numbers were drawn from 3 days / 14,490 alarms).

## 4. What is not in this document yet

**New audit results + new realism score** — deliberately not produced from a 9-minute, ~11-alarm sample. A re-score at this sample size would be noise dressed up as precision, which is exactly the standard this whole audit has held itself to. I will re-run every query in `LDI_ALARM_FIDELITY_AUDIT.md`'s appendix and publish real numbers once a meaningful window has accumulated (targeting several hours minimum — long enough for multiple debounce cycles and at least a few full drift episodes to complete; rare-Critical events specifically need longer, given the ~0.00002/tick/machine rate).

**24h soak test report** — while wiring this up, found and fixed a real, separate bug: the `IMS-SoakTest` Windows Scheduled Task had been silently failing on every run for ~20 hours (`LastTaskResult: 1`) because its action invoked `C:\Windows\system32\bash.exe` (the WSL launcher) rather than Git Bash, and WSL has no registered distro on this machine (`execvpe(/bin/bash) failed: No such file or directory`). Fixed by pointing the task at `C:\Program Files\Git\usr\bin\bash.exe --login` (the `--login` flag is required too — without it, Task Scheduler's non-interactive Git Bash has no `PATH`, so `dirname`/`mkdir`/`date`/`awk`/`xargs` all fail). Verified via `Start-ScheduledTask` that it now runs successfully end-to-end and appends a real row to `scripts/soak-test-reports/soak-log.tsv`. **T0 for the new 24h window: 2026-08-11T04:22:35Z.** The report will be produced at or after 2026-08-12T04:22:35Z from real accumulated samples, not before.

Both of these are the same category of constraint: they require real elapsed wall-clock time and this response will not simulate or estimate that time away.
