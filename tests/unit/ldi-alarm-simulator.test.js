'use strict';
/**
 * Replays the real LDI telemetry simulator (ldi_simulator.json, ldisim_gen)
 * and the real alarm simulator (ldi_alarm_simulator.json, almsim_gen) together
 * for 24 simulated hours in a vm sandbox, with a seeded Math.random, a fake
 * clock and a fake pg pool that answers the two queries almsim_gen makes
 * (debounce state, latest telemetry per machine).
 *
 * Asserts the shape the dashboards depend on, not any plant's numbers:
 *   - condition-driven (causal) alarms outnumber background noise
 *   - the fleet alarm rate stays in single digits per hour
 *   - vacuum (91009) and alignment codes actually occur
 *   - an alarm's process/factory match the machine's telemetry profile
 *   - simulated ack/resolve only touches SIM-ALM-* rows, as 'simulator',
 *     and LDI_SIM_AUTO_LIFECYCLE=false turns it off
 * Exits non-zero on failure.
 */
const assert = require('assert');
const vm = require('vm');
const path = require('path');

const FLOWS = path.join(__dirname, '..', '..', 'nodered_data', 'flows');
const SIM = require(path.join(FLOWS, 'ldi_simulator.json')).find((n) => n.id === 'ldisim_gen').func;
const ALM = require(path.join(FLOWS, 'ldi_alarm_simulator.json')).find((n) => n.id === 'almsim_gen').func;
const ALIGN = ['90001', '90004', '90005', '90012'];
const CAUSAL = new Set(['91008', '91009', '70004', ...ALIGN]);

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function replay({ hours = 24, seed = 7, envOverrides = {} } = {}) {
  let clock = Date.parse('2026-09-01T00:00:00Z');
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(clock); }
    static now() { return clock; }
  }
  const rnd = mulberry32(seed);
  const FakeMath = Object.create(Math);
  FakeMath.random = rnd;

  const env = { get: (k) => envOverrides[k] };
  const latest = {};                 // eqp_id -> latest telemetry row
  const lastFired = {};              // 'eqp|code' -> ms
  const alarms = [];
  const updates = [];

  const pool = {
    query(sql, params, cb) {
      if (/FROM public\.ldi_alarm_state/.test(sql)) {
        const cutoff = clock - 20 * 60000;
        const rows = Object.entries(lastFired).filter(([, t]) => t > cutoff)
          .map(([k]) => { const [equipmentid, errorcode] = k.split('|'); return { equipmentid, errorcode }; });
        return cb(null, { rows });
      }
      if (/FROM public\.ldi_data/.test(sql)) {
        const cutoff = clock - 3 * 60000;
        return cb(null, { rows: Object.values(latest).filter((r) => Date.parse(r.time) > cutoff) });
      }
      if (/^\s*UPDATE public\.ldi_alarm_lifecycle/.test(sql)) { updates.push(sql); return cb(null, { rowCount: 0 }); }
      throw new Error('unexpected query: ' + sql.slice(0, 80));
    },
  };
  const flowStore = {};
  const base = {
    env, Date: FakeDate, Math: FakeMath, JSON, Number, String, Object, Array, Set, Promise,
    node: { status() {}, error(e) { throw new Error(e); }, warn() {}, send: (m) => {
      for (const a of m.payload) { alarms.push(a); lastFired[a.equipmentid + '|' + a.errorcode] = clock; }
    } },
    global: { get: (k) => (k === 'pgPool' ? pool : undefined) },
    flow: { get: (k) => flowStore[k], set: (k, v) => { flowStore[k] = v; } },
  };
  const simFn = vm.runInNewContext(`(function(msg){ ${SIM}\n })`, base);
  const almFn = vm.runInNewContext(`(function(msg){ ${ALM}\n })`, base);

  const ticks = hours * 1800;        // ldisim_gen runs every 2s
  for (let t = 0; t < ticks; t++) {
    clock += 2000;
    const out = simFn({});
    if (out) for (const row of out.payload) latest[row.eqp_id] = row;
    // almsim_gen runs every 10s; it sends from a promise, so let that settle
    if (t % 5 === 4) { almFn({}); await new Promise(setImmediate); }
  }
  return { alarms, updates, hours };
}

(async () => {
console.log('\nLDI alarm simulator — 24h replay');
const run = await replay();
const off = await replay({ hours: 1, envOverrides: { LDI_SIM_AUTO_LIFECYCLE: 'false' } });
const byCode = {};
for (const a of run.alarms) byCode[a.errorcode] = (byCode[a.errorcode] || 0) + 1;
const total = run.alarms.length;
const causal = run.alarms.filter((a) => CAUSAL.has(a.errorcode)).length;
const perHour = total / run.hours;
console.log(JSON.stringify(byCode));
console.log(`        ${total} alarms, ${perHour.toFixed(1)}/h, causal ${(100 * causal / total).toFixed(0)}%`);

test('fleet alarm rate is in single digits per hour', () => {
  assert.ok(perHour >= 1 && perHour < 10, `rate ${perHour.toFixed(1)}/h`);
});
test('causal alarms outnumber background noise', () => {
  assert.ok(causal / total > 0.6, `causal share ${(causal / total).toFixed(2)}`);
});
test('vacuum and alignment codes both occur', () => {
  assert.ok((byCode['91009'] || 0) > 0, 'no 91009');
  assert.ok(ALIGN.some((c) => byCode[c] > 0), 'no alignment code');
});
test('alarm process/factory match the machine telemetry profile', () => {
  const P = JSON.parse(SIM.match(/const P = (\{.*?\});\n/s)[1]);
  for (const a of run.alarms) {
    assert.strictEqual(a.process, P[a.equipmentid].process, a.equipmentid + ' process');
    assert.strictEqual(a.factory, P[a.equipmentid].factory, a.equipmentid + ' factory');
  }
});
test('simulated ack/resolve only touches SIM-ALM-* rows as simulator', () => {
  assert.ok(run.updates.length > 0, 'no lifecycle updates issued');
  for (const sql of run.updates) {
    assert.ok(/logid LIKE 'SIM-ALM-%'/.test(sql), 'unscoped update');
    assert.ok(/_by = 'simulator'/.test(sql), 'actor is not simulator');
  }
});
test('LDI_SIM_AUTO_LIFECYCLE=false issues no lifecycle updates', () => {
  assert.strictEqual(off.updates.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
})();
