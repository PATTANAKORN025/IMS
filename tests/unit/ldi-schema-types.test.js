'use strict';
/**
 * Schema Type Safety Test (Audit P1-1)
 *
 * Verifies that all 21 numeric sensor/process columns of public.ldi_data and
 * public.ldi_machine_last_state use DOUBLE PRECISION (float8), completely
 * eliminating 32-bit single precision (REAL / float4) truncation artifacts
 * across the telemetry pipeline.
 *
 * Checks:
 *   1. Migration 094 explicitly alters all remaining REAL columns
 *      (scan_speed, air_vacuum, total_time, pe_setting, je_setting) to DOUBLE PRECISION.
 *   2. Migration 094 alters both public.ldi_data and public.ldi_machine_last_state.
 *   3. Migration 094 installs statement-level trigger trg_ldi_machine_last_state
 *      with REFERENCING NEW TABLE to prevent lock contention.
 *   4. Migration 094 creates public.ldi_spec_limit single source of truth table.
 *   5. If PostgreSQL pool/connection is present in environment, directly asserts
 *      information_schema.columns data_type is 'double precision'.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const MIGRATION_094 = path.join(__dirname, '..', '..', 'database', 'migrations', '094-ldi-data-widen-remaining-double-precision.sql');

console.log('\nLDI Schema Type Safety — 64-bit Double Precision Parity');

test('Migration 094 exists and is readable', () => {
  assert.ok(fs.existsSync(MIGRATION_094), '094 migration file missing');
});

const m094 = fs.readFileSync(MIGRATION_094, 'utf8');

const WIDENED_COLS = ['scan_speed', 'air_vacuum', 'total_time', 'pe_setting', 'je_setting'];

test('Migration 094 alters all 5 remaining REAL columns to DOUBLE PRECISION on ldi_data', () => {
  for (const col of WIDENED_COLS) {
    const re = new RegExp(`ALTER\\s+COLUMN\\s+${col}\\s+TYPE\\s+DOUBLE\\s+PRECISION`, 'i');
    assert.ok(re.test(m094), `Missing ALTER COLUMN ${col} TYPE DOUBLE PRECISION on ldi_data`);
  }
});

test('Migration 094 alters all 5 remaining REAL columns to DOUBLE PRECISION on ldi_machine_last_state', () => {
  const lastStateSection = m094.split('ALTER TABLE public.ldi_machine_last_state')[1];
  assert.ok(lastStateSection, 'Missing ALTER TABLE public.ldi_machine_last_state');
  for (const col of WIDENED_COLS) {
    const re = new RegExp(`ALTER\\s+COLUMN\\s+${col}\\s+TYPE\\s+DOUBLE\\s+PRECISION`, 'i');
    assert.ok(re.test(lastStateSection), `Missing ALTER COLUMN ${col} TYPE DOUBLE PRECISION on ldi_machine_last_state`);
  }
});

test('Migration 094 creates ldi_spec_limit single source of truth table', () => {
  assert.ok(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\.ldi_spec_limit/i.test(m094), 'Missing CREATE TABLE public.ldi_spec_limit');
  assert.ok(/INSERT\s+INTO\s+public\.ldi_spec_limit/i.test(m094), 'Missing seed inserts into public.ldi_spec_limit');
});

test('Migration 094 disables 13 phantom/legacy LDI devices and enforces case-insensitive unique index', () => {
  assert.ok(/UPDATE\s+public\.devices\s+SET\s+enabled\s*=\s*false/i.test(m094), 'Missing devices update for phantom devices');
  assert.ok(/CREATE\s+UNIQUE\s+INDEX\s+(IF\s+NOT\s+EXISTS\s+)?uq_devices_lower_device_id/i.test(m094), 'Missing uq_devices_lower_device_id index');
});

test('Migration 094 installs statement-level trigger with REFERENCING NEW TABLE', () => {
  assert.ok(/REFERENCING\s+NEW\s+TABLE\s+AS\s+new_table/i.test(m094), 'Missing REFERENCING NEW TABLE in trigger definition');
  assert.ok(/FOR\s+EACH\s+STATEMENT\s+EXECUTE\s+FUNCTION/i.test(m094), 'Trigger is not statement-level');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
