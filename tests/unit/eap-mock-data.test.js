'use strict';
/**
 * The synthetic drilling/VCP generator replaces factory data for development,
 * CI and demos. This checks, with no database:
 *
 *   - the run is deterministic for a seed and an end time
 *   - every vcp_upp column it writes exists in database/mock/eap_backup-schema.sql
 *   - the relationships the VCP panels rely on hold (time x speed = 54, area,
 *     shared side current, swapped bath tags, status chain, alarm pairs)
 *   - every drilling message format the panels parse is produced, and the
 *     fleet shows the COMM LOSS and STALE RUN machines
 *   - the healthy run breaches no alert rule and --incidents breaches each
 *   - the SQL refuses to run without the mock marker, tags every row MOCK-,
 *     and no vendor or plant name appears in the generator or schema
 *
 * Exits non-zero on any failure, like every other test in this folder.
 */

const fs = require('fs');
const path = require('path');
const { generate, toSql, uppColumns, UNDO_SQL, MARKER_CHECK } = require('../../scripts/mock/eap-mock-data.js');

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'database', 'mock', 'eap_backup-schema.sql'), 'utf8');
const GENERATOR = fs.readFileSync(path.join(ROOT, 'scripts', 'mock', 'eap-mock-data.js'), 'utf8');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const END = new Date('2026-09-28T03:00:00Z');
const healthy = generate({ hours: 48, seed: 7, drilling: 12, end: END });
const again = generate({ hours: 48, seed: 7, drilling: 12, end: END });
const incidents = generate({ hours: 48, seed: 7, drilling: 12, end: END, incidents: true });
const meta = { runId: 'test', seed: 7, hours: 48 };

/* ------------------------------------------------------------ determinism */
check('same seed and end time give identical SQL', toSql(healthy, meta) === toSql(again, meta));
check('a different seed gives different data',
  toSql(generate({ hours: 48, seed: 8, drilling: 12, end: END }), meta) !== toSql(healthy, meta));

/* ------------------------------------------------------------------ schema */
const staticColumns = uppColumns().filter(c => !/_(\d+)[ab]?$/.test(c) && !/^(actual|preset)_(clean|copperplating[12]|ao|hotwater|dry|heating|peeloff|rectifier)$/.test(c));
const missing = staticColumns.filter(c => !new RegExp(`\\b${c.replace(/"/g, '"?')}\\b`).test(SCHEMA));
check('every fixed vcp_upp column exists in the mock schema', missing.length === 0, missing.join(', '));
check('mock schema builds the 18 stations, 18 pumps and nine baths',
  /FOR i IN 1\.\.18/.test(SCHEMA) && /actual_current_%sa/.test(SCHEMA) && /actual_pump_%s/.test(SCHEMA)
  && /'clean','copperplating1','copperplating2','ao','hotwater','dry','heating','peeloff','rectifier'/.test(SCHEMA));
check('column count matches the source shape (no preset_amp_15b)',
  uppColumns().length === 33 + 18 + 18 * 9 + 17 && !uppColumns().includes('preset_amp_15b'), String(uppColumns().length));
check('schema refuses a database that holds plant tables without the marker',
  /RAISE EXCEPTION 'refusing to run/.test(SCHEMA) && /to_regclass\('public\.mock_dataset'\) IS NULL/.test(SCHEMA));

/* --------------------------------------------------------------------- vcp */
const upp = healthy.vcp.upp;
check('one row per line per minute', upp.length === 3 * (48 * 60 + 1), String(upp.length));
check('plating_time x line_speed = 54 on every row',
  upp.every(r => Math.abs(r.plating_time * r.line_speed - 54) < 1e-9));
check('plating_area_a = height x width in dm2, plating_area_b a copy',
  upp.every(r => Math.abs(r.plating_area_a - Number(((r.height / 100) * (r.width / 100)).toFixed(2))) < 1e-9 && r.plating_area_b === r.plating_area_a));
check('actual_* baths are fixed setpoints and preset_* readings move',
  new Set(upp.filter(r => r.equipment_id === 'VCP01-VCP').map(r => r.actual_clean)).size === 1
  && new Set(upp.filter(r => r.equipment_id === 'VCP01-VCP').map(r => r.preset_clean)).size > 10);
const plating = upp.flatMap(r => r.stations.filter(s => s.amps > 0));
check('some stations plate', plating.length > 1000, String(plating.length));
check('both sides share one current and differ in voltage',
  plating.every(s => s.voltageA > 0 && s.voltageB > 0) && plating.some(s => s.voltageA !== s.voltageB));
check('healthy run: actual current equals its setpoint', plating.every(s => s.amps === s.preset));
check('healthy run: preset_amp_1a is set on every row where any station plates',
  upp.every(r => !r.stations.some(s => s.amps > 0) || r.stations[0].percent > 0));
check('equipment ids keep the -VCP shape the dashboards parse',
  upp.every(r => /^VCP0[1-3]-VCP$/.test(r.equipment_id)));
check('device timestamps are 14 digits (plus ms on upp)',
  upp.every(r => /^[0-9]{17}$/.test(r.timestamp)) && healthy.vcp.alarms.every(a => /^[0-9]{14}$/.test(a.error_time)));

const byLine = {};
for (const s of healthy.vcp.status) (byLine[s.equipment_id] = byLine[s.equipment_id] || []).push(s);
check('status rows chain previous_status to the prior row',
  Object.values(byLine).every(rows => rows.every((r, i) => i === 0 || r.previous_status === rows[i - 1].current_status)));
check('status rows change state', healthy.vcp.status.every(s => s.previous_status !== s.current_status));

const open = {};
let unmatchedReset = 0;
for (const a of [...healthy.vcp.alarms].sort((x, y) => x.log_date - y.log_date)) {
  const key = `${a.equipment_id}|${a.error_code}`;
  if (a.alarm_status === 'Triggered') open[key] = (open[key] || 0) + 1;
  else if (open[key]) open[key]--; else unmatchedReset++;
}
check('every Reset follows a Triggered of the same code', unmatchedReset === 0, String(unmatchedReset));
check('no code is open twice at once on one line', Object.values(open).every(n => n <= 1));

/* ---------------------------------------------------------------- drilling */
const events = healthy.drilling.events;
const has = re => events.some(e => re.test(e.event_message));
check('program start "[START]: X.tlp"', events.some(e => e.event_code === '0101' && /^\[START\]:/.test(e.event_message) && /[A-Za-z0-9_-]+\.tlp/.test(e.event_message)));
check('rpm/feed change "[Rpm]: a -> b  [Feed]: a -> b" on 0109',
  events.some(e => e.event_code === '0109' && /\[Rpm\]:[^>]+->\s*[0-9.]+/.test(e.event_message) && /\[Feed\]:[^>]+->\s*[0-9.]+/.test(e.event_message)));
check('spindle mask on 0211 ("spindle ON" and "tool diameter" forms)',
  has(/spindle\s*ON:\s*[0-9]+/i) && has(/tool diameter:(\s+\S+){6}/i));
check('job end "Run Hits: n" on 0201', events.some(e => e.event_code === '0201' && /Run Hits:\s*[0-9]+/.test(e.event_message)));
check('shift report "Online:/Stop:" on 0209',
  events.some(e => e.event_code === '0209' && /Online:\s*[0-9]{2}:[0-9]{2}:[0-9]{2}/.test(e.event_message) && /Stop:\s*[0-9]{2}:[0-9]{2}:[0-9]{2}/.test(e.event_message)));
check('alarm recovery "Alarm Time: mm:ss" on 0204', events.some(e => e.event_code === '0204' && /Alarm Time:\s*[0-9]{2}:[0-9]{2}/.test(e.event_message)));
check('bit breakage, laser, shank, tool life, overload, air, magazine alarms all occur',
  ['0408', '0409', '0424', '0414', '0124', '0102', '0406'].every(code => events.some(e => e.event_code === code)));
check('emergency stop is followed by its release', has(/^Emergency Stop pressed$/) && has(/Emergency Stop Released/));
const lastSeen = id => Math.max(...events.filter(e => e.equipment_id === id).map(e => e.event_time.getTime()));
check('last machine silent for 3 h (COMM LOSS)', END - lastSeen('MOCK-DRL-012') >= 3 * 3600e3);
check('second-to-last machine silent 1-2 h (STALE RUN window)',
  END - lastSeen('MOCK-DRL-011') >= 3600e3 && END - lastSeen('MOCK-DRL-011') < 2 * 3600e3);
check('every machine reports', new Set(events.map(e => e.equipment_id)).size === 12);
check('events stay inside the window', events.every(e => e.event_time >= healthy.start && e.event_time <= END));

/* ---------------------------------------------------------------- incidents */
const lateHealthy = healthy.vcp.upp.filter(r => r.log_date > END - 15 * 60e3);
const lateIncident = incidents.vcp.upp.filter(r => r.log_date > END - 15 * 60e3);
check('healthy run: QC flags always agree', healthy.vcp.upp.every(r => r.current_check === r.frequency_check));
check('healthy run: pumps read their setpoint', healthy.vcp.upp.every(r => r.pumps.every(p => p.actual === p.set)));
check('--incidents: VCP01 silent for the last 15 minutes', !lateIncident.some(r => r.equipment_id === 'VCP01-VCP')
  && lateHealthy.some(r => r.equipment_id === 'VCP01-VCP'));
const v2 = lateIncident.filter(r => r.equipment_id === 'VCP02-VCP');
check('--incidents: VCP02 plates with station 3 off setpoint, preset_amp_1a zero, pump 9 dead, QC flags split',
  v2.length > 0 && v2.every(r => r.stations[2].amps - r.stations[2].preset === 8 && r.stations[0].percent === 0
    && r.pumps[8].actual === 0 && r.current_check !== r.frequency_check));
const v3 = lateIncident.filter(r => r.equipment_id === 'VCP03-VCP');
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
check('--incidents: VCP03 copperplating2 > 4 C over setpoint (15-minute rule window)',
  mean(v3.map(r => r.preset_copperplating2 - r.actual_copperplating2)) > 4);
// the support-bath rule averages 30 minutes, so the breach must fill that window
const v3Support = incidents.vcp.upp.filter(r => r.equipment_id === 'VCP03-VCP' && r.log_date > END - 30 * 60e3);
check('--incidents: VCP03 hotwater > 10 C over setpoint across the 30-minute rule window',
  mean(v3Support.map(r => r.preset_hotwater - r.actual_hotwater)) > 10.5);

/* ------------------------------------------------------------------ safety */
const sql = toSql(healthy, meta);
check('SQL is one transaction that checks the marker first', sql.startsWith(`BEGIN;\n${MARKER_CHECK}`) && sql.trimEnd().endsWith('COMMIT;'));
check('undo checks the marker and deletes only MOCK- rows',
  UNDO_SQL.includes(MARKER_CHECK) && (UNDO_SQL.match(/DELETE FROM/g) || []).length === 8
  && UNDO_SQL.split('\n').filter(l => l.startsWith('DELETE')).every(l => /LIKE 'MOCK-%'|run_id <> 'schema'/.test(l)));
check('every generated id carries the MOCK- prefix',
  events.every(e => e.message_id.startsWith('MOCK-'))
  && [...healthy.vcp.upp, ...healthy.vcp.alarms, ...healthy.vcp.status].every(r => r.log_id.startsWith('MOCK-')));
// generic markers only: the generator's own values are invented, so plant or
// host identifiers here would mean something was pasted in from a real system
const banned = /@[a-z0-9-]+\.(com|co\.th)|(10|192\.168)\.\d+\.\d+\.?\d*/i;
check('no e-mail addresses or private IPs in generator or schema', !banned.test(GENERATOR) && !banned.test(SCHEMA));
check('generator never reads plant data: no measured-profile tables, no SELECT from vcp or drilling tables',
  !/SELECT[^;]*FROM public\.(vcp_|eap_api_vcp_|machine_event)/i.test(GENERATOR));

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
