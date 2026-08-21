<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# LDI Simulator Behavioral Redesign — Results

> เป็นการนำการออกแบบ 6 ประการที่ได้รับอนุมัติเมื่อ 2026-08-11 มาใช้ เพื่อตอบสนองต่อ `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` (คะแนนความสมจริง 58/100): **ดริฟต์, ความถี่ของข้อบกพร่อง, พฤติกรรมการเกิดแบบปะทุ, debounce, ความหมายของสหสัมพันธ์, การกระจายตัวของเหตุการณ์ระดับ critical**
>
> สถานะ: **การนำไปปฏิบัติเสร็จสมบูรณ์, ดีพลอยแล้ว, และได้รับการตรวจสอบทางกลไกแล้ว** การประเมินคะแนนเชิงปริมาณซ้ำและรายงานการทดสอบแช่ (soak report) ตลอด 24 ชม. นั้นมีการจำกัดเวลาไว้อย่างชัดเจน — ดู [§4](#4-what-is-not-in-this-document-yet) — และไม่สามารถจัดทำล่วงหน้าโดยปราศจากการกุตัวเลขขึ้นมาเองได้ ซึ่งรายงานฉบับนี้จะไม่มีการทำเช่นนั้น

---

## 1. Migration SQL

| ไฟล์                                                                                                                                                                                                                                                                                                                          | สิ่งที่ทำ                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`database/migrations/069-ldi-alarm-debounce-and-link-basis.sql`](../../../database/migrations/069-ldi-alarm-debounce-and-link-basis.sql) (ใหม่)                                                                                                                                                                                  | สร้าง `public.ldi_alarm_state` (สถานะ debounce: `equipmentid`, `errorcode`, `first_fired`, `last_fired`, `fire_count`); เพิ่ม `ldi_alarm_log.link_basis` (`causal` \| `nearest`); อัปเดต `v_ldi_alarm_context` เพื่อเปิดเผย `link_basis` เป็นคอลัมน์ต่อท้าย (`CREATE OR REPLACE VIEW` ไม่สามารถจัดลำดับคอลัมน์ที่มีอยู่ใหม่ได้ ดังนั้นจึงถูกต่อท้าย ไม่ได้แทรกในบรรทัด) |
| [`database/migrations/036-ldi-alarm-master-mock.sql`](../../../database/migrations/036-ldi-alarm-master-mock.sql) (แก้ไขแล้ว — ไฟล์นี้จะรันใหม่ในทุกการสวิตช์ `mock` ไม่เหมือน migration แบบเพิ่มหน่วยปกติ ดังนั้นการแก้ไขทับที่เดิมจึงเป็นธรรมเนียมปฏิบัติที่ยอมรับ ไม่ใช่การละเมิดกฎ "ห้ามแก้ไข migration ที่ถูกผสานแล้ว") | เพิ่มรหัสจากผู้จำหน่ายที่มีระดับความรุนแรง Critical จริง 2 รหัส (`01180016` Emergency Stop, `0C020014` Safety sensor triggered) ลงในแค็ตตาล็อก mock ทำให้มีจำนวนเพิ่มจาก 19 เป็น 21 รหัส                                                                                                                                                                                                  |

ทั้งคู่นำมาใช้งานจริง: `docker exec ims-timescaledb psql ... < 069-...sql` (ใช้งานอย่างสะอาดเรียบร้อย, `CREATE TABLE`/`ALTER TABLE`/`CREATE VIEW`/`GRANT`), จากนั้น `bash scripts/switch-data-mode.sh mock` (หว่านข้อมูล 036 อีกรอบ, ยืนยันว่า `INSERT 0 21`)

## 2. Diff of `flows.json`

ดิบๆของ `git diff` บนไฟล์นี้อ่านไม่ออก — โค้ดของทุกโหนดถูกหลีกตัวอักษรแบบ JSON ในบรรทัดเดียว. ด้านล่างนี้คือความแตกต่าง (diff) ที่ถูกต้องของโค้ดสามฟังก์ชันที่มีการเปลี่ยนแปลง (`ldisim_gen`, `almsim_gen`, `almsim_db`), ดึงมาจากประวัติของ git และ working tree

**สรุปสิ่งที่เปลี่ยนแปลง, ตามข้อค้นพบ:**

| ข้อค้นพบ                                            | การเปลี่ยนแปลง                                                                                                                                                                                                                                                                                 | จุดที่เปลี่ยน                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| การปรับเทียบสถิตที่ผิดพลาด (สาเหตุของความถี่ใน #5) | `LDI-02.temp_mu` 26.49→21.72 (แต่เดิมอยู่นอกขอบเขตของข้อกำหนด 20-24 ตั้งแต่ขั้นตอนการสร้าง); DF-OUTER/SM `air_vacuum` ค่าที่ถูกฮาร์ดโค้ดเป็น `0.0` (มักจะ >-8 ตลอด ซึ่งเป็นการถดถอยจาก migration 054) → ค่าทั่วไปเฉพาะของเครื่องจริง (-12.9 ถึง -14.6) + `vac_sd: 0.45` ซึ่งตอนนี้กลายเป็นกระบวนการ OU ของแท้ แทนที่จะเป็นค่าคงที่แบบแนวระนาบ | `ldisim_gen`, ตาราง `P`   |
| #1 ดริฟต์                                           | กลไกการรักษาสถานะ `driftStep()` ตัวใหม่ (`nominal→drifting→faulted→serviced→cooldown`), แยกอิสระต่อเครื่อง × {vac, temp, rh, align}, `DRIFT_CFG` ตารางกำหนดเวลา/ขนาด                                                                                                                   | `ldisim_gen`              |
| #5 ความถี่ของข้อบกพร่อง                                 | ฟังก์ชัน `calibrate()` ตัวใหม่ควบคุม PE/JE (mean,sd) ดังนั้นตัวกำหนด P(\|x\|>10) ทั่วไปคือเหตุการณ์ tail แบบหายาก, ไม่ใช่สิ่งที่รับประกันตามเส้นฐาน (เช่น ช่องสัญญาณที่มี mean=-14.76, sd=21.32 ได้รับการปรับเทียบผิดเทียบกับข้อกำหนด ±10)                                                                               | `ldisim_gen`              |
| #6 เกิดแบบปะทุ/น้ำท่วม                                     | ตาราง debounce `ldi_alarm_state` ตัวใหม่; `almsim_gen` ตรวจสอบ/ข้ามโค้ดที่ยังอยู่ในช่วงคูลดาวน์ 12 นาที; `almsim_db` อัปเสิร์ตสถานะหลังจากแทรกแต่ละครั้ง                                                                                                                                      | `almsim_gen`, `almsim_db` |
| #7 ความหมายของสหสัมพันธ์                           | `newRow()` ตอนนี้จะรับพารามิเตอร์ `linkBasis` แบบชัดเจน; โค้ดที่อิงตามเงื่อนไข/แบบวิกฤต ส่งผ่านค่า `'causal'`, โค้ดที่มีสัญญาณรบกวนส่งผ่านค่า `'nearest'`, แล้วเขียนลงไปในคอลัมน์ใหม่ `link_basis` แทนการอนุมานว่า `related_log_id` นั้นเป็นแค่ตัวแปรว่าง (null) อย่างบังเอิญ                                   | `almsim_gen`, `almsim_db` |
| #8 การกระจายตัวระดับ critical                           | สาขาของ `RARE_CRITICAL_CODES`/`RARE_CRITICAL_PROB` ที่ใหม่, เป็นอิสระจากพูลของทั้ง noise/condition                                                                                                                                                                                        | `almsim_gen`              |

<details>
<summary><strong>ความแตกต่างแบบเต็ม (455 บรรทัด) — คลิกเพื่อขยาย</strong></summary>

```diff
=== nodered_data/flows.json :: node 'ldisim_gen' ===
@@ -2,8 +2,19 @@
 // ══════════════════════════════════════════════════════════════════
 // LDI LIVE SIMULATOR — Ornstein-Uhlenbeck mean-reverting sensor model
-// สร้างข้อมูลที่ "เคลื่อนไหวต่อเนื่อง" เหมือนเซ็นเซอร์จริง ไม่ใช่สุ่มอิสระ
+// Generates data that is "continuously moving" to resemble actual sensors, rather than independent random sampling
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
+ // ── OU drift of environmental conditions + vacuum (all three now real OU processes,
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

(ตาราง `P` และบล็อก `if` ที่ขับเคลื่อนด้วยเงื่อนไขที่ไม่ได้ถูกตัดทอนถูกละไว้ด้านบนด้วย `...` เพื่อให้อ่านง่าย — การเปลี่ยนแปลงของค่าตามตัวอักษรทุกค่ามีการแจกแจงรายการอยู่ในตารางสรุป; ผลต่างรูปแบบเต็มที่ไม่ถูกตัดทอน ซึ่งรวมถึงตาราง `P` ก่อน/หลังแบบสมบูรณ์ จะถูกเก็บรักษาไว้ในส่วนเอาต์พุตของการใช้เครื่องมือของเซสชันนี้และสามารถจำลองรูปแบบซ้ำผ่านทาง `git diff nodered_data/flows.json` หากนำมาเปรียบเทียบกับคอมมิตที่เกิดขึ้นก่อนหน้าการเปลี่ยนแปลงนี้)

</details>

การแก้ไขการลิ้นต์ (lint fixes) ที่สนับสนุนสองรายการจำเป็นสำหรับ CI เพื่อให้ยังคงเป็นสีเขียว (ไฟล์ทั้งสองไฟล์ก่อนหน้านี้แยกวิเคราะห์เฉพาะ `NOISE_CUM`/`ALIGN_CODES`, ขาดอาร์เรย์ `RARE_CRITICAL_CODES` ใหม่ และ `orphan-object-linter.js` จะสแกนเฉพาะไดเรกทอรี `nodered_data/flows/` ที่เก่าแล้วเท่านั้น ไม่ใช่ `nodered_data/flows.json` จริง):

- `tests/lint/alarm-sync-linter.js`, `tests/lint/rca-mapping-coverage.js` — เพิ่มการแยกวิเคราะห์ `RARE_CRITICAL_CODES`
- `tests/lint/orphan-object-linter.js` — เพิ่ม `nodered_data/flows.json` ลงในขอบเขตการค้นหาอ้างอิง (ก่อนหน้านี้มองไม่เห็นเลย ซึ่งเป็นช่องโหว่ที่มีอยู่แล้วที่การเปลี่ยนแปลงนี้เปิดเผยขึ้น)

## 3. Deployment verification (structural — mechanisms confirmed working)

ดีพลอยผ่าน `docker restart ims-node-red` (ยืนยันการโหลดโฟลว์ว่าไม่มีปัญหา: `Started flows`, พบข้อผิดพลาด 0 รายการในล็อก) จากนั้นใช้คำสั่ง `TRUNCATE ldi_data, ldi_alarm_log, ldi_alarm_state` เพื่อล้างข้อมูลเบื้องต้นหลังจากการดีพลอยให้สะอาด. มีการรันชุดทดสอบการถดถอย (regression suite) ทั้งหมดซ้ำ: `alarm-sync-linter` (21/21), `dashboard-linter` (พบ 0 ข้อผิดพลาด), `rca-mapping-coverage` (19/21 แบ่งแยกไว้, โค้ด Critical ตัวใหม่ 2 รายการอย่างถูกต้องระบุเป็น UNCLASSIFIED, ทั้งคู่ยังอยู่เหนือกว่าระดับขั้นต่ำที่ 45%), `query-budget-linter`, `orphan-object-linter` (หลังจากแก้ไขพบโค้ดหลงเหลือ 0 อัน), ทดสอบทั้ง 5 ชุดทดสอบ, ทดสอบแบบ smoke test ทั้งสองแบบ, และ ทดสอบ e2e ทั้งคู่ — ทั้งหมดระบุว่า PASS (ผ่าน). ใน `golden-dataset-spc.js` ก็ยังแสดงสิ่งที่มีอยู่ก่อนหน้าเช่นที่เคยมีการบันทึกข้อมูลปัญหาของ Known Gap ระดับ 5/7 (พบปัญหาครอบคลุมถึงระบบ materialized-view ที่เริ่มตอน migration 064) — การทำงานทั้งหมดไม่มีผลเปลี่ยนแปลงในส่วนนี้ ซึ่งถือว่าไม่เกิดปัญหาการถดถอยขึ้นมาใหม่.

ด้วยข้อมูลสด 9 นาทีหลังจากการดีพลอย:

- **แก้ปัญหาผลตกหล่นระบบสุญญากาศและยืนยันใช้จริง**: `LDI-05`..`LDI-08` (ก่อนหน้านี้โค้ดถูกแก้ไขจำกัดค่าที่ `0.0` เป็นการกำหนดว่าอยู่นอกระยะตลอดกาลแบบ "out of spec") ตอนนี้สามารถอ่านค่าความแปรปรวนจริงได้แล้ว, เช่น `LDI-08: min=-16.05 max=-14.00 avg=-14.91` — ซึ่งอยู่ในขอบเขตพิกัด -8/-30 อย่างพอดี.
- **`link_basis` ป้อนข้อมูลถูกต้อง**: จาก 10 สัญญาณเตือนเริ่มแรก, แบ่งเป็น 3 สำหรับ `causal` (ที่ขับเคลื่อนด้วยเงื่อนไข) / 7 สำหรับ `nearest` (noise) — ซึ่งนับว่าการแบ่งแยกที่ชัดเจนนี้สามารถทำผลได้ตามที่ออกแบบ.
- **บันทึกสถานะ Debounce อย่างถูกต้อง**: `ldi_alarm_state` ป้อนข้อมูลหนึ่งแถวต่อ (เครื่องจักร, รหัส) ของการเตือนแต่ละครั้ง, พร้อม `fire_count` ที่ทำการเพิ่มค่าสำหรับการเกิดขึ้นซ้ำ (ยืนยันว่าผ่านมาทาง `ON CONFLICT ... DO UPDATE`).

นี่เป็นหลักฐานที่ชัดเจนว่ากลไกการแก้ไขใช้งานได้จริง. แต่มัน **ไม่เพียงพอ** ที่จะใช้เป็นข้อมูลสำหรับการประเมินคะแนนใหม่ของ ความถี่ อัตราการเกิดซ้ำ (burst-rate) หรือกระจายตัวของเหตุการณ์ Critical — เพื่อหาตัวอย่างในทางสถิติที่มีความหมาย มันต้องการเวลาประเมินผลเป็นหลายชั่วโมง ไม่ใช่แค่นับเป็นนาที (ตัวเลขสำหรับการประเมินรอบแรกนั้นใช้อ้างอิงมาจาก กรอบข้อมูลระยะเวลา 3 วัน / 14,490 สัญญาณแจ้งเตือน).

## 4. What is not in this document yet

**ผลการตรวจสอบใหม่ + คะแนนความสมจริงใหม่** — จงใจไม่ออกเอกสารให้จากกลุ่มตัวอย่างที่มีแค่ ~11 สัญญาณแจ้งเตือน ที่ใช้เวลาทดสอบแค่ 9 นาที. การประเมินคะแนนอีกรอบในกลุ่มตัวอย่างแบบย่อยนี้ ถือเป็นแค่เพียงข้อมูลที่สวมรอยถึงความแม่นยำเท่านั้น ซึ่งนี่คือมาตรฐานที่ทั้งการประเมินชุดนี้ได้รับการตั้งเอาไว้. ฉันจะทำการตรวจสอบด้วย Query ค้นหาทุกๆส่วนที่มีในภาคผนวกของ `LDI_ALARM_FIDELITY_AUDIT.md` ใหม่อีกครั้ง และตีพิมพ์ตัวเลขที่เกิดขึ้นจริงมาทันทีที่มีข้อมูลการสะสมอยู่ในระดับที่นับได้ว่าเป็นที่น่าพอใจแล้ว (โดยตั้งเป้าเอาไว้อย่างน้อยในระดับไม่กี่ชั่วโมง — ซึ่งจะนานพอสำหรับครบรอบวัฏจักรการเกิด debounce ได้หลายครั้ง และการดริฟท์หลายหนที่มีจุดจบอย่างสมบูรณ์ และมีเฉพาะเหตุการณ์แบบ Rare-Critical เท่านั้น ที่จะต้องประเมินนานกว่าเดิม อัตราส่วนราวๆ ~0.00002/tick/ต่อเครื่อง).

**รายงานการทดสอบ Soak ระยะเวลา 24 ชม.** — ในขณะที่ดำเนินการต่อสายนี้ พบและแก้ไขบักที่มีอยู่และแยกส่วนได้ตัวจริง: โดยหน้าต่างจัดการอย่าง `IMS-SoakTest` จากฝั่ง Windows Scheduled Task มักจะมีข้อผิดพลาดเงียบๆ ของทุกครั้งของการรันกินเวลาราวๆ 20 ชั่วโมงแล้ว (`LastTaskResult: 1`) เพราะใน action มันทำการดันไปรันที่ `C:\Windows\system32\bash.exe` (ตัวสร้าง WSL) แต่กลับไม่ไปจัดการเรียกที่ Git Bash แทน, และในตัว WSL ไม่ได้บันทึกการจัดเก็บตัว distro เพื่อเปิดในเครื่องนี้ด้วย (`execvpe(/bin/bash) failed: No such file or directory`). ได้แก้ไขให้เป็นไปชี้เป้ายังงานของ `C:\Program Files\Git\usr\bin\bash.exe --login` (จำเป็นจะต้องใช้ `--login` เพื่อประกาศค่าแฟล็กตัวนี้ — หากไม่ใส่แฟล็กตัวนี้, งาน Git Bash อันไม่เป็นแบบโต้ตอบจาก Task Scheduler ของ Task Scheduler จะไม่มีค่า `PATH`, จนพวก `dirname`/`mkdir`/`date`/`awk`/`xargs` ทำงานผิดพลาดล้มเหลวไปหมด). ซึ่งยืนยันว่าการใช้ `Start-ScheduledTask` ตอนนี้ทำให้ทำการรันตัวนี้ทำงานสำเร็จไปได้ตลอดรอดฝั่งทั้งแต่ต้นจนจบและดันแถวข้อมูลไปที่ตารางเก็บของ `scripts/soak-test-reports/soak-log.tsv` ได้จริง. **กำหนด T0 ของกรอบเวลา 24 ชั่วโมงใหม่ได้ที่: 2026-08-11T04:22:35Z.** ส่วนของตัวรายงานควรจะออกตอนช่วง 2026-08-12T04:22:35Z จากค่าของกลุ่มตัวอย่างสะสมมาจริงๆ, และไม่ใช่ไปออกก่อนถึงเวลาดังกล่าวนั้น.

ทั้งสองจุดต่างมีข้อผูกมัดเหมือนกันตรงที่ว่า: เป็นสิ่งที่ต้องการระยะเวลาในการประเมินผลผ่านเวลาแบบตามจริง และนี่คือคำตอบที่เราเองก็จะไม่มีทางเลือกให้สามารถใช้วิธีสมมติหรือพยายามหลบเลี่ยงจากระยะเวลาที่ประเมินไปได้เลย.
