#!/usr/bin/env node
/**
 * LDI Alarm Sync Linter
 * Ensures every alarm code the Node-RED simulator can generate exists in
 * the live Alarm Master table (ldi_alarm_ms_code) -- i.e. no alarm the
 * simulator writes can ever fail to resolve a message/severity via the
 * v_ldi_alarm_context join.
 *
 * World-Class QA (2026-08-07): rewritten. The previous version compared
 * two frozen, disconnected artifacts that nothing kept in sync --
 * database/migrations/036-ldi-alarm-master-mock.sql (superseded the
 * moment the real 1,820-code Alarm Master import landed, migration 061)
 * and nodered_data/flows/ldi_alarm_simulator.json (a stale duplicate of
 * the live simulator, last updated 2026-08-06, never touched by any of
 * this session's simulator edits to nodered_data/flows.json). It had been
 * vacuously passing all session, checking two unchanging legacy files
 * against each other rather than the real, live system.
 *
 * Also, the old exact-match semantics ("master codes == simulator codes")
 * only made sense when the master WAS a small curated list built to match
 * the simulator. Now that the master is the real, ~1,820-code vendor
 * reference list, the simulator is expected to generate a small subset of
 * it, not all of it -- the correct invariant is one-directional: every
 * code the simulator emits must exist in the master (referential
 * integrity), not that the master and simulator sets are identical.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SIMULATOR_PATH = path.join(process.cwd(), 'nodered_data', 'flows.json');
const CONTAINER = process.env.TIMESCALEDB_CONTAINER || 'ims-timescaledb';
const DB_USER = process.env.POSTGRES_USER || 'ims_admin';
const DB_NAME = process.env.POSTGRES_DB || 'ims';

console.log('IMS Alarm Sync Linter');
console.log('='.repeat(50));

try {
  // 1. Extract every code the simulator can actually generate, from the
  //    3 specific places codes are emitted -- not a blanket regex over
  //    the whole function body, since codes are no longer uniformly
  //    5-digit and a loose pattern would risk matching unrelated quoted
  //    strings (machine IDs, match-type labels, etc.).
  const simData = JSON.parse(fs.readFileSync(SIMULATOR_PATH, 'utf8'));
  const alarmNode = simData.find(n => n.type === 'function' && n.id === 'almsim_gen');

  if (!alarmNode || !alarmNode.func) {
    throw new Error('Failed to find the almsim_gen alarm-generator node in nodered_data/flows.json.');
  }
  const func = alarmNode.func;
  const simCodes = new Set();

  // NOISE_CUM = [["code", weight], ["code", weight], ...]
  const noiseCumMatch = func.match(/const NOISE_CUM = (\[[\s\S]*?\]);/);
  if (!noiseCumMatch) throw new Error('Failed to find NOISE_CUM table in almsim_gen.');
  for (const m of noiseCumMatch[1].matchAll(/\[\s*["']([^"']+)["']\s*,/g)) {
    simCodes.add(m[1]);
  }

  // ALIGN_CODES = ["code", "code", ...]
  const alignCodesMatch = func.match(/const ALIGN_CODES = (\[[^\]]*\]);/);
  if (!alignCodesMatch) throw new Error('Failed to find ALIGN_CODES array in almsim_gen.');
  for (const m of alignCodesMatch[1].matchAll(/["']([^"']+)["']/g)) {
    simCodes.add(m[1]);
  }

  // RARE_CRITICAL_CODES = ["code", "code", ...] -- LDI Alarm Fidelity Audit
  // fix #8 (2026-08-11): low-probability genuine-Critical branch.
  const rareCriticalMatch = func.match(/const RARE_CRITICAL_CODES = (\[[^\]]*\]);/);
  if (rareCriticalMatch) {
    for (const m of rareCriticalMatch[1].matchAll(/["']([^"']+)["']/g)) {
      simCodes.add(m[1]);
    }
  }

  // condition-driven: newRow(r.eqp_id, 'CODE', ts, r.log_id) and the
  // ALIGN_CODES[...] pick -- the literal ones are e.g. '91008', '70004',
  // '91009'; the ALIGN_CODES pick is already covered above.
  for (const m of func.matchAll(/newRow\(r\.eqp_id,\s*["']([^"']+)["']/g)) {
    simCodes.add(m[1]);
  }

  if (simCodes.size === 0) {
    throw new Error('Failed to parse any simulator alarm codes from almsim_gen.');
  }
  console.log(`[+] Simulator (nodered_data/flows.json): Found ${simCodes.size} alarm codes`);

  // 2. Master codes, from the live database (source of truth as of
  //    migration 061 -- the real ~1,820-code Alarm Master import).
  const out = execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c',
     'SELECT alarm_id FROM public.ldi_alarm_ms_code;'],
    { encoding: 'utf8' }
  );
  const masterCodes = new Set(out.split('\n').map(s => s.trim()).filter(Boolean));

  if (masterCodes.size === 0) {
    throw new Error('Failed to read master alarm codes from the live database.');
  }
  console.log(`[+] Master (live DB, ldi_alarm_ms_code): Found ${masterCodes.size} alarm codes`);

  // 3. Referential integrity: every simulator-generatable code must exist
  //    in the master. The reverse is NOT required -- the master is now
  //    the full real vendor list, the simulator only needs a subset.
  let errors = 0;
  for (const code of simCodes) {
    if (!masterCodes.has(code)) {
      console.error(`  ERROR  Simulator code ${code} does not exist in the live Alarm Master!`);
      errors++;
    }
  }

  console.log('='.repeat(50));
  if (errors > 0) {
    console.error(`LINT FAILED — ${errors} simulator code(s) have no Alarm Master entry.`);
    process.exit(1);
  } else {
    console.log(`LINT PASSED — all ${simCodes.size} simulator codes resolve in the Alarm Master.`);
    process.exit(0);
  }

} catch (e) {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
}
