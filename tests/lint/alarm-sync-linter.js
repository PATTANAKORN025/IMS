#!/usr/bin/env node
/**
 * LDI Alarm Sync Linter
 * Ensures the alarm codes in the Node-RED simulator exactly match the master list
 * defined in the PostgreSQL schema migrations.
 */

const fs = require('fs');
const path = require('path');

const SIMULATOR_PATH = path.join(process.cwd(), 'nodered_data', 'flows', 'ldi_alarm_simulator.json');
const MASTER_SQL_PATH = path.join(process.cwd(), 'database', 'migrations', '036-ldi-alarm-master-mock.sql');

console.log('IMS Alarm Sync Linter');
console.log('='.repeat(50));

try {
  // 1. Extract Master Codes
  const sqlContent = fs.readFileSync(MASTER_SQL_PATH, 'utf8');
  const masterRegex = /\('(\d{5})',/g;
  let match;
  const masterCodes = new Set();
  while ((match = masterRegex.exec(sqlContent)) !== null) {
    masterCodes.add(match[1]);
  }

  if (masterCodes.size === 0) {
    throw new Error('Failed to parse master alarm codes from SQL migration.');
  }
  console.log(`[+] Master (SQL): Found ${masterCodes.size} alarm codes`);

  // 2. Extract Simulator Codes
  const simData = JSON.parse(fs.readFileSync(SIMULATOR_PATH, 'utf8'));
  // Looked up by node id, not name -- the node's name describes what it does
  // (e.g. "real distribution" vs "correlated + noise") and is expected to
  // change as the generation strategy evolves; the id is the stable handle.
  const alarmNode = simData.find(n => n.type === 'function' && n.id === 'almsim_gen');

  if (!alarmNode || !alarmNode.func) {
    throw new Error('Failed to find the almsim_gen alarm-generator node in simulator JSON.');
  }

  // Matches a quoted 5-digit code wherever it appears -- as a [code, weight]
  // CUM-table tuple, a bare array-of-codes literal, or a single-quoted
  // literal passed directly to a function call. Deliberately shape-agnostic:
  // the simulator's generation strategy (weighted tables, condition-driven
  // emission, etc.) is expected to keep evolving, and this check's only job
  // is "does it reference exactly the master code list," not how.
  const simCodeRegex = /["'](\d{5})["']/g;
  const simCodes = new Set();
  while ((match = simCodeRegex.exec(alarmNode.func)) !== null) {
    simCodes.add(match[1]);
  }

  if (simCodes.size === 0) {
    throw new Error('Failed to parse simulator alarm codes from function block.');
  }
  console.log(`[+] Simulator (Node-RED): Found ${simCodes.size} alarm codes`);

  // 3. Compare
  let errors = 0;
  
  // Check missing in simulator
  for (const code of masterCodes) {
    if (!simCodes.has(code)) {
      console.error(`  ERROR  Master code ${code} is missing from simulator!`);
      errors++;
    }
  }

  // Check extra in simulator
  for (const code of simCodes) {
    if (!masterCodes.has(code)) {
      console.error(`  ERROR  Simulator code ${code} does not exist in master SQL!`);
      errors++;
    }
  }

  console.log('='.repeat(50));
  if (errors > 0) {
    console.error(`LINT FAILED — ${errors} inconsistencies found.`);
    process.exit(1);
  } else {
    console.log('LINT PASSED — Simulator perfectly syncs with Master SQL.');
    process.exit(0);
  }

} catch (e) {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
}
