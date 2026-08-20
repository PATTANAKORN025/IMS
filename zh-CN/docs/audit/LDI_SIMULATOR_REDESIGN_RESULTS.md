<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# LDI Simulator Behavioral Redesign — Results

> 实施了 2026-08-11 批准的 6 点设计，以响应 `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` (真实性得分 58/100)：**漂移、故障频率、突发行为、防抖、相关性语义、关键事件分布。**
>
> 状态：**实施已完成、已部署且已通过机制验证。** 定量重新评分和 24 小时浸泡报告有明确的时间限制 — 见 [§4](#4-what-is-not-in-this-document-yet) — 如果不伪造数字，则无法提前生成，本报告不会这样做。

---

## 1. Migration SQL

| 文件                                                                                                                                                                                                                                                                                                                          | 作用                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`database/migrations/069-ldi-alarm-debounce-and-link-basis.sql`](../../database/migrations/069-ldi-alarm-debounce-and-link-basis.sql) (新)                                                                                                                                                                                  | 创建 `public.ldi_alarm_state` (防抖状态: `equipmentid`, `errorcode`, `first_fired`, `last_fired`, `fire_count`); 添加 `ldi_alarm_log.link_basis` (`causal` \| `nearest`); 更新 `v_ldi_alarm_context` 以将 `link_basis` 暴露为尾随列 (`CREATE OR REPLACE VIEW` 无法重新排序现有列，因此它是附加的，而不是内联插入的)。 |
| [`database/migrations/036-ldi-alarm-master-mock.sql`](../../database/migrations/036-ldi-alarm-master-mock.sql) (已编辑 — 此文件在每次 `mock` 切换时都会重新运行，不像正常的增量迁移，因此就地编辑它是既定惯例，而不是违反“永远不要编辑合并的迁移”的规则) | 向模拟目录添加 2 个真实的 Critical 级别供应商代码 (`01180016` 紧急停止, `0C020014` 安全传感器触发)，使其从 19 个代码增加到 21 个。                                                                                                                                                                                                  |

两者都已实时应用: `docker exec ims-timescaledb psql ... < 069-...sql` (干净应用, `CREATE TABLE`/`ALTER TABLE`/`CREATE VIEW`/`GRANT`)，然后 `bash scripts/switch-data-mode.sh mock` (重新播种 036, 已确认 `INSERT 0 21`)。

## 2. Diff of `flows.json`

此文件上的原始 `git diff` 无法阅读 — 每个节点的函数体都是一个经过 JSON 转义的行。下面是三个已更改函数体 (`ldisim_gen`, `almsim_gen`, `almsim_db`) 的正确差异，提取自 git 历史记录和工作树。

**按发现总结的更改：**

| 发现                                            | 更改                                                                                                                                                                                                                                                                                 | 位置                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 静态校准错误 (频率 #5 的根本原因) | `LDI-02.temp_mu` 26.49→21.72 (按构造位于 20-24 规格范围之外); DF-OUTER/SM `air_vacuum` 硬编码 `0.0` (始终 >-8，迁移 054 的回归) → 真实的每台机器标称值 (-12.9 至 -14.6) + `vac_sd: 0.45`，现在是真正的 OU 过程，而不是平坦的常数 | `ldisim_gen`, `P` 表   |
| #1 漂移                                           | 新的 `driftStep()` 状态机 (`nominal→drifting→faulted→serviced→cooldown`), 每台机器独立 × {vac, temp, rh, align}, `DRIFT_CFG` 时间/幅度表                                                                                                                   | `ldisim_gen`              |
| #5 故障频率                                 | 新的 `calibrate()` 钳制 PE/JE (mean,sd) 以便标称 P(\|x\|>10) 是一种罕见的尾部事件，而不是基线保证 (例如，mean=-14.76, sd=21.32 的通道已经相对于 ±10 规格错误校准)                                                                               | `ldisim_gen`              |
| #6 突发/泛滥                                     | 新的 `ldi_alarm_state` 防抖表; `almsim_gen` 检查/跳过仍在 12 分钟冷却期内的代码; `almsim_db` 在每次插入后更新插入状态                                                                                                                                      | `almsim_gen`, `almsim_db` |
| #7 相关性语义                           | `newRow()` 现在采用显式 `linkBasis` 参数; 条件驱动/关键代码传递 `'causal'`, 噪声代码传递 `'nearest'`, 写入新列 `link_basis`，而不是从 `related_log_id` 是否碰巧为空来推断                                   | `almsim_gen`, `almsim_db` |
| #8 关键分布                           | 新的 `RARE_CRITICAL_CODES`/`RARE_CRITICAL_PROB` 分支, 独立于噪声/条件池                                                                                                                                                                                        | `almsim_gen`              |

<details>
<summary><strong>完整差异 (455 行) — 点击展开</strong></summary>

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

(上面的 `P` 表和未删减的条件驱动 `if` 块在上面用 `...` 略去以提高可读性 — 每一个字面值更改都在摘要表中列出；未删减的完整差异，包括完整的更改前后 `P` 表，都保存在此会话的工具输出中，并可通过对该更改之前的提交执行 `git diff nodered_data/flows.json` 来重现。)

</details>

需要两个支持性的 lint 修复才能使 CI 保持绿色 (这两个文件以前只解析 `NOISE_CUM`/`ALIGN_CODES`，缺少新的 `RARE_CRITICAL_CODES` 数组，并且 `orphan-object-linter.js` 只扫描陈旧的 `nodered_data/flows/` 目录，而不是真正的 `nodered_data/flows.json`)：

- `tests/lint/alarm-sync-linter.js`, `tests/lint/rca-mapping-coverage.js` — 添加了 `RARE_CRITICAL_CODES` 解析。
- `tests/lint/orphan-object-linter.js` — 将 `nodered_data/flows.json` 添加到其参考搜索范围内 (以前对它完全不可见，这是此更改暴露出的一个先前存在的差距)。

## 3. Deployment verification (structural — mechanisms confirmed working)

通过 `docker restart ims-node-red` 部署 (已确认流程重新加载干净：`Started flows`，日志中 0 个错误)，然后 `TRUNCATE ldi_data, ldi_alarm_log, ldi_alarm_state` 建立一个干净的部署后基线。完全重新运行回归套件：`alarm-sync-linter` (21/21)、`dashboard-linter` (0 个错误)、`rca-mapping-coverage` (19/21 已分类，2 个新的 Critical 代码被正确标记为 UNCLASSIFIED，仍高于 45% 的底线)、`query-budget-linter`、`orphan-object-linter` (修复后 0 个孤儿)，所有 5 个单元测试文件，两项冒烟测试，两项 e2e 检查 — 全部 PASS。`golden-dataset-spc.js` 仍然显示其先前存在的、已被记录的 5/7 Known Gap（自迁移 064 起的物化视图测试覆盖率问题）— 本次工作未对其进行更改，这不是新的回归。

利用部署后约 9 分钟的实时数据：

- **真空回归已修复并确认为实时状态**：`LDI-05`..`LDI-08` (以前硬编码为 `0.0`，永久“不合格”) 现在显示出真实的波动读数，例如 `LDI-08: min=-16.05 max=-14.00 avg=-14.91` — 舒服地落入 -8/-30 范围内。
- **`link_basis` 填充正确**：在前 10 个报警中，3 个 `causal` (条件驱动) / 7 个 `nearest` (噪声) — 显式拆分按设计工作。
- **正确记录防抖状态**：`ldi_alarm_state` 中填充了每次触发的 (机器, 代码) 的单行，`fire_count` 在重复时递增 (已通过 `ON CONFLICT ... DO UPDATE` 确认)。

这是修复机制真正有效的证据。这**不足以**重新评分频率、突发速率或 Critical 事件分布 — 这些需要几个小时而不是几分钟来积累具有统计意义的样本（原始审计的数字取自 3 天 / 14,490 个报警）。

## 4. What is not in this document yet

**新审计结果 + 新的真实性评分** — 故意不从 9 分钟、约 11 个报警的样本中生成。在这种样本量下进行的重新评分将是伪装成精度的噪音，这正是整个审计工作一直秉持的标准。我将在累积了有意义的窗口后，重新运行 `LDI_ALARM_FIDELITY_AUDIT.md` 附录中的每个查询，并公布实际数字（目标是至少数小时 — 足以完成多个防抖周期和至少几个完整的漂移事件；考虑到约 0.00002/tick/机器 的速率，罕见的 Critical 事件特别需要更长的时间）。

**24 小时浸泡测试报告** — 在连接此时，发现并修复了一个真正的、单独的错误：`IMS-SoakTest` Windows 计划任务在每次运行的约 20 个小时内一直在默默失败（`LastTaskResult: 1`），因为它的操作调用了 `C:\Windows\system32\bash.exe`（WSL 启动器）而不是 Git Bash，并且 WSL 在此计算机上没有注册的发行版（`execvpe(/bin/bash) failed: No such file or directory`）。通过将任务指向 `C:\Program Files\Git\usr\bin\bash.exe --login` 进行修复（也需要 `--login` 标志 — 没有它，任务计划程序的非交互式 Git Bash 没有 `PATH`，因此 `dirname`/`mkdir`/`date`/`awk`/`xargs` 全都失败）。通过 `Start-ScheduledTask` 验证现在它可以端到端成功运行，并将一行真实的追加到 `scripts/soak-test-reports/soak-log.tsv`。**新的 24 小时窗口的 T0：2026-08-11T04:22:35Z。** 报告将在 2026-08-12T04:22:35Z 或之后根据真实累积的样本生成，而不是在此之前。

这两个都是相同类别的限制：它们需要实际经过的挂钟时间，而本回复不会通过模拟或估计消除该时间。
