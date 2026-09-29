#!/usr/bin/env node
'use strict';
/**
 * Synthetic data for the drilling and VCP dashboards.
 *
 * Writes generated rows into an eap_backup-shaped database created by
 * database/mock/eap_backup-schema.sql, so the drilling folder, the VCP folder,
 * the VCP alert rules and migrations 084-086 can run with no factory data.
 *
 * Every figure below is invented: machine counts, setpoints, recipes, panel
 * sizes, lot codes and alarm texts are round, generic values chosen to
 * exercise each dashboard state. They are not measurements of any plant.
 * What the generator does keep is the shape the dashboards parse:
 *
 *   drilling (public.machine_event)
 *     - event codes and message formats the panels match: "[START]: X.tlp",
 *       "[Rpm]: a -> b  [Feed]: a -> b", "spindle ON: <mask>",
 *       "Run Hits: n", "Online: hh:mm:ss  Stop: hh:mm:ss", "Alarm Time: mm:ss"
 *     - each fleet state the overview shows: RUN, STOP, TOOL_CHANGE,
 *       ALARM / BIT BROKEN, STALE RUN and COMM LOSS
 *   vcp (public.vcp_upp, vcp_alarm, vcp_status_change)
 *     - one row per line per minute; preset_<bath> is the reading and
 *       actual_<bath> the setpoint (the source swaps the tags)
 *     - plating_time x line_speed = 54; plating_area_a = height x width in dm2
 *     - both sides of a station share one current; voltage differs per side
 *     - status rows carry previous_status; alarms come in Triggered/Reset pairs
 *
 * Usage:
 *   node scripts/mock/eap-mock-data.js --hours=24                 # dry run: writes SQL, prints counts
 *   node scripts/mock/eap-mock-data.js --hours=24 --apply         # writes into the mock database
 *   node scripts/mock/eap-mock-data.js --undo --apply             # removes every generated row
 *
 * Options: --seed=N  --drilling=N (machines, default 12)  --out=<file.sql>
 *          --incidents (the last 35 minutes breach each VCP alert rule once;
 *          without it the plant is healthy and every rule stays quiet)
 *          --container=ims-timescaledb  --database=eap_backup  --psql-user=<role>
 *
 * Safety: --apply runs inside one transaction that first checks for the
 * public.mock_dataset marker table and aborts without it, so it cannot write
 * into a restored plant database. Generated rows carry a MOCK- prefix
 * (message_id / log_id), and --undo deletes exactly those.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARKER_CHECK = `DO $$
BEGIN
    IF to_regclass('public.mock_dataset') IS NULL THEN
        RAISE EXCEPTION 'refusing to write: % has no public.mock_dataset marker. Run database/mock/eap_backup-schema.sql on a dedicated database first.', current_database();
    END IF;
END
$$;`;

/* ------------------------------------------------------------------ random */
function makeRandom(seed) {
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = list => list[Math.floor(rand() * list.length)];
  const weighted = list => {
    const total = list.reduce((a, x) => a + x[1], 0);
    let t = rand() * total;
    for (const x of list) { t -= x[1]; if (t <= 0) return x[0]; }
    return list[list.length - 1][0];
  };
  return { rand, gauss, int, pick, weighted };
}

const round = (value, digits) => Number(value.toFixed(digits));
const pad = (n, w = 2) => String(n).padStart(w, '0');
const hms = seconds => {
  const s = Math.max(0, Math.round(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
// Device clocks write Bangkok local time as a digit string.
const deviceStamp = date => {
  const local = new Date(date.getTime() + 7 * 3600 * 1000);
  return `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}`
    + `${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}${pad(local.getUTCSeconds())}`;
};
const iso = date => date.toISOString().replace('T', ' ').replace('Z', '+00');

/* ---------------------------------------------------------------- drilling */
// Alarm catalogue: code, event_type, message template, relative weight. The
// texts are generic and written to hit each category the anomaly board draws.
const DRILL_ALARMS = [
  ['0408', 'ALARM', s => `Spindle #${s} bit broken (BBD) at hole ${'{hole}'}`, 6],
  ['0417', 'ALARM', s => `Spindle #${s} tool is broken, T{tool}`, 3],
  ['0409', 'ALARM', s => `Spindle #${s} laser diameter error T{tool} C0.{dia}`, 4],
  ['0410', 'ALARM', s => `Spindle #${s} laser length error T{tool}`, 2],
  ['0424', 'ALARM', s => `Spindle #${s} shank clamp error`, 3],
  ['0425', 'ALARM', s => `Spindle #${s} collet open error`, 2],
  ['0414', 'ALARM', s => `Spindle #${s} tool life reached T{tool}`, 3],
  ['0406', 'ALARM', () => 'Tool magazine position error', 2],
  ['0124', 'ALARM', s => `Spindle #${s} over current`, 2],
  ['0113', 'ALARM', () => 'Spindle coolant flow low', 2],
  ['0102', 'ALARM', () => 'Main air low pressure', 2],
  ['0702', 'ALARM', () => 'Table clamp pin not locked', 1],
  ['0305', 'ALARM', () => 'X axis servo driver error', 1],
];

function drillingMachines(count) {
  const list = [];
  for (let i = 1; i <= count; i++) list.push(`MOCK-DRL-${pad(i, 3)}`);
  return list;
}

function generateDrilling(r, start, end, machineCount) {
  const events = [];
  const status = [];
  const logs = [];
  let seq = 0;
  const id = () => `MOCK-DRL-${pad(seq++, 8)}`;
  const machines = drillingMachines(machineCount);

  machines.forEach((equipmentId, index) => {
    // Fixed roles so every overview state appears in a small fleet:
    // the last machine goes silent 3 h before the end (COMM LOSS), the one
    // before it stops reporting 75 min before the end while running (STALE RUN).
    const silentFrom = index === machines.length - 1 ? new Date(end.getTime() - 3 * 3600e3)
      : index === machines.length - 2 ? new Date(end.getTime() - 75 * 60e3) : end;
    const push = (at, code, type, message, extra = {}) => {
      if (at > silentFrom || at > end) return;
      events.push({
        message_id: id(), equipment_id: equipmentId, message_type: 'EVENT', event_type: type,
        event_code: code, event_message: message, event_time: at,
        sent_time: new Date(at.getTime() + 1000), source: 'mock', source_file: `mock_${equipmentId}.log`,
        magazine_no: extra.magazine || null, spindle: extra.spindle || null, raw_item_code: null,
      });
    };

    let t = new Date(start.getTime() + r.int(0, 600) * 1000);
    let job = r.int(100, 900);
    let hole = 0;
    let onlineSec = 0;
    let stopSec = 0;
    let shiftHits = 0;
    let nextShiftEnd = nextShiftBoundary(t);

    while (t < end) {
      // shift summary at 08:00 and 20:00 Bangkok
      if (t >= nextShiftEnd) {
        push(nextShiftEnd, '0209', 'INFO', `Shift report  Online: ${hms(onlineSec)}  Stop: ${hms(stopSec)}  Hits: ${shiftHits}`);
        onlineSec = 0; stopSec = 0; shiftHits = 0;
        nextShiftEnd = nextShiftBoundary(new Date(nextShiftEnd.getTime() + 1000));
      }

      // one job: start, recipe, spindle mask, cycle start, run, end
      job++;
      hole = 0;
      const program = `JOB${pad(job, 4)}_L${r.int(1, 8)}.tlp`;
      const mask = r.weighted([[63, 70], [31, 10], [47, 10], [59, 10]]);
      const rpmFrom = r.pick([100, 110, 120, 130]);
      const rpmTo = rpmFrom + r.pick([10, 20, 30]);
      const feedFrom = round(1.5 + r.rand(), 1);
      const feedTo = round(feedFrom + 0.2 + r.rand() * 0.4, 1);
      push(t, '0101', 'RUN', `[START]: ${program} start: 0`);
      t = step(t, 5, 20, r);
      push(t, '0211', 'INFO', r.rand() < 0.5
        ? `spindle ON: ${mask}`
        : `tool diameter: ${[1, 2, 4, 8, 16, 32].map(b => (mask & b ? `0.${r.int(15, 35)}` : 'OFF')).join(' ')}`);
      t = step(t, 5, 20, r);
      push(t, '0109', 'RUN', `[Rpm]: ${rpmFrom} -> ${rpmTo}  [Feed]: ${feedFrom} -> ${feedTo}`);
      t = step(t, 5, 30, r);
      push(t, '0112', 'RUN', `Cycle start Hole: ${hole}`);

      const jobMinutes = r.int(25, 90);
      const jobEnd = new Date(t.getTime() + jobMinutes * 60e3);
      while (t < jobEnd && t < end) {
        const runFor = r.int(4, 15) * 60;
        t = new Date(t.getTime() + runFor * 1000);
        onlineSec += runFor;
        const hits = Math.round(runFor * (8 + r.rand() * 4));
        hole += hits;
        shiftHits += hits;

        const roll = r.rand();
        if (roll < 0.10) {
          // tool change
          const from = r.int(1, 30);
          const to = r.int(1, 30);
          push(t, '0110', 'TOOL_CHANGE', `ATC T${from}M${r.int(1, 9)} -> T${to}M${r.int(1, 9)} Hole: ${hole}`, { magazine: String(r.int(1, 4)) });
          t = step(t, 30, 120, r);
          push(t, '0112', 'RUN', `Cycle start Hole: ${hole}`);
        } else if (roll < 0.16) {
          // alarm, operator recovery, restart
          const [code, type, text] = r.weighted(DRILL_ALARMS.map(a => [a, a[3]]));
          const spindle = r.int(1, 6);
          const message = text(spindle).replace('{hole}', hole).replace('{tool}', r.int(1, 30)).replace('{dia}', r.int(15, 35));
          push(t, code, type, message, { spindle: String(spindle) });
          const down = r.int(40, 900);
          t = new Date(t.getTime() + down * 1000);
          stopSec += down;
          push(t, '0204', 'INFO', `Alarm Time: ${pad(Math.floor(down / 60))}:${pad(down % 60)}`);
          t = step(t, 10, 60, r);
          push(t, '0112', 'RUN', `Cycle start Hole: ${hole}`);
        } else if (roll < 0.17) {
          // emergency stop and release
          push(t, '0101', 'E', 'Emergency Stop pressed');
          const down = r.int(60, 300);
          t = new Date(t.getTime() + down * 1000);
          stopSec += down;
          push(t, '0101', 'INFO', 'Emergency Stop Released');
          t = step(t, 10, 60, r);
          push(t, '0112', 'RUN', `Cycle start Hole: ${hole}`);
        }
      }
      push(t, '0201', 'RUN', `Job end ${program} Run Hits: ${hole}`);
      t = step(t, 5, 30, r);
      push(t, '0108', 'STOP', `Machine stop Hole: ${hole}`);
      // idle between jobs; one machine in five sits idle for longer
      const idle = (index % 5 === 2 ? r.int(20, 90) : r.int(2, 15)) * 60;
      t = new Date(t.getTime() + idle * 1000);
      stopSec += idle;
    }

    // the STALE RUN machine must go quiet mid-cycle, whatever its schedule was doing
    if (index === machines.length - 2 && silentFrom < end) {
      push(silentFrom, '0112', 'RUN', `Cycle start Hole: ${hole}`);
    }
    const last = events.filter(e => e.equipment_id === equipmentId).pop();
    status.push({
      equipment_id: equipmentId, message_id: id(),
      agent_status: silentFrom < end ? 'DISCONNECTED' : 'RUNNING',
      current_file: `mock_${equipmentId}.log`,
      last_data_time: last ? last.event_time : start,
      last_error: silentFrom < end ? 'no new data in watched folder' : null,
      heartbeat: silentFrom < end ? silentFrom : end,
      event_time: last ? last.event_time : start,
    });
    logs.push({ message_id: id(), equipment_id: equipmentId, level: 'INFO', event_name: 'agent_start', message: 'mock agent started', event_time: start });
    if (silentFrom < end) {
      logs.push({ message_id: id(), equipment_id: equipmentId, level: 'WARN', event_name: 'no_data', message: 'no new data in watched folder', event_time: new Date(silentFrom.getTime() + 600e3) });
    }
  });
  return { events, status, logs };
}

function step(t, lo, hi, r) {
  return new Date(t.getTime() + r.int(lo, hi) * 1000);
}

// Next 08:00 or 20:00 Bangkok (01:00 / 13:00 UTC) strictly after t.
function nextShiftBoundary(t) {
  const d = new Date(t.getTime());
  d.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 26; i++) {
    if (d > t && (d.getUTCHours() === 1 || d.getUTCHours() === 13)) return d;
    d.setUTCHours(d.getUTCHours() + 1);
  }
  return d;
}

/* --------------------------------------------------------------------- vcp */
const BATHS = ['clean', 'copperplating1', 'copperplating2', 'ao', 'hotwater', 'dry', 'heating', 'peeloff', 'rectifier'];

// Invented line profiles: round setpoints, one line per behaviour worth drawing.
const VCP_LINES = [
  { id: 'VCP01-VCP', amps: 300, cellOhm: 0.010, pumpLevel: 20, pumpFrequency: 40, alarmsPerHour: 6,
    setpoints: { clean: 35, copperplating1: 25, copperplating2: 25, ao: 30, hotwater: 45, dry: 75, heating: 60, peeloff: 30, rectifier: 30, prep: 30 } },
  { id: 'VCP02-VCP', amps: 350, cellOhm: 0.008, pumpLevel: 30, pumpFrequency: 50, alarmsPerHour: 8,
    setpoints: { clean: 35, copperplating1: 25, copperplating2: 25, ao: 30, hotwater: 45, dry: 80, heating: 55, peeloff: 30, rectifier: 30, prep: 30 } },
  { id: 'VCP03-VCP', amps: 320, cellOhm: 0.009, pumpLevel: 60, pumpFrequency: 100, alarmsPerHour: 10,
    setpoints: { clean: 40, copperplating1: 25, copperplating2: 25, ao: 30, hotwater: 40, dry: 70, heating: 55, peeloff: 30, rectifier: 30, prep: 25 } },
];
// [plating_time minutes, line_speed m/min, weight]: time x speed = 54 m of tank.
const VCP_RECIPES = [[60, 0.9, 5], [75, 0.72, 3], [90, 0.6, 2]];
// [width mm, height mm, thickness mm, weight]
const VCP_PANELS = [[500, 600, 1.0, 5], [520, 620, 1.2, 3], [450, 600, 0.8, 2], [600, 700, 1.6, 1]];
const VCP_DENSITY = [[1.5, 4], [1.8, 3], [2.0, 2], [1.2, 1]];
const VCP_WAVEFORMS = [['', 6], ['AC DUMMY', 2], ['DC DUMMY', 1], ['TEST 1:1', 1]];
const VCP_ALARMS = [
  ['0901', 'Rinse 1 entrance flow meter abnormal', 'Warning'],
  ['0902', 'Rinse 2 exit flow meter abnormal', 'Warning'],
  ['0311', 'Rinse tank low level', 'Warning'],
  ['0312', 'Anti-oxidant tank low level', 'Warning'],
  ['0313', 'Clamp strip tank low level', 'Warning'],
  ['0320', 'Pre-dip tank low level', 'ALARM'],
  ['0321', 'Cleaner tank high level', 'ALARM'],
  ['0501', 'Unloader paused', 'ALARM'],
  ['0502', 'Unloader robot fault', 'ALARM'],
  ['0480', 'Heater tank temperature abnormal', 'ALARM'],
];

// --incidents: over the last 35 minutes each VCP alert rule gets one breach
// (35, not 15: the support-bath rule averages a 30-minute window).
// VCP01 stops sending (feed silent); VCP02 plates with one station side 8 A over
// its setpoint, preset_amp_1a at zero, pump 9 reading 0 and the two QC flags
// disagreeing; VCP03 runs copperplating2 6 C hot and hotwater 12 C hot.
const INCIDENT_MINUTES = 35;

function generateVcp(r, start, end, incidents) {
  const upp = [];
  const status = [];
  const alarms = [];
  let seq = 0;
  const id = kind => `MOCK-VCP-${kind}-${pad(seq++, 8)}`;
  const minutes = Math.floor((end - start) / 60e3);

  for (const line of VCP_LINES) {
    const ohm = [];
    for (let i = 0; i < 18; i++) ohm.push([line.cellOhm * (1 + r.gauss() * 0.04), line.cellOhm * (1 + r.gauss() * 0.04)]);
    const bath = {};
    const cell = new Array(18).fill(null);
    let current = r.rand() < 0.7 ? 'RUN' : 'IDLE';
    let held = 0;
    let lot = null;
    let lotAge = 0;
    let recipe;
    let panel;
    let density;
    let copperAmps;
    let trx;
    let stationOn = [];
    const open = [];

    for (let m = 0; m <= minutes; m++) {
      const at = new Date(start.getTime() + m * 60e3);
      const late = incidents && at.getTime() > end.getTime() - INCIDENT_MINUTES * 60e3;
      if (late && line.id === 'VCP01-VCP' && at.getTime() > end.getTime() - 20 * 60e3) continue;
      if (!lot || lotAge > 180 + r.int(0, 180)) {
        lot = `MOCK-LOT-${pad(r.int(1, 99999), 5)}`;
        lotAge = 0;
        recipe = r.weighted(VCP_RECIPES.map(x => [x, x[2]]));
        panel = r.weighted(VCP_PANELS.map(x => [x, x[3]]));
        density = r.weighted(VCP_DENSITY);
        copperAmps = r.pick([250, 300, 350, 400]);
        trx = `MOCK-TRX-${line.id}-${m}`;
        stationOn = [];
        for (let i = 0; i < 18; i++) stationOn.push(r.rand() > 0.05);
      }
      lotAge++;

      // state machine: mean dwell about 4 h RUN, 2 h IDLE, 8 min DOWN
      held++;
      const dwell = current === 'RUN' ? 240 : current === 'IDLE' ? 120 : 8;
      if (held > dwell * (0.4 + r.rand() * 1.2)) {
        const previous = current;
        current = current === 'RUN' ? (r.rand() < 0.8 ? 'IDLE' : 'DOWN') : (r.rand() < 0.8 ? 'RUN' : (current === 'IDLE' ? 'DOWN' : 'IDLE'));
        held = 0;
        status.push({
          log_id: id('st'), log_date: at, transaction_id: trx, equipment_id: line.id,
          event_time: deviceStamp(at), current_status: current, previous_status: previous, factory: 'MOCK',
        });
      }
      if (late && line.id !== 'VCP01-VCP' && current !== 'RUN') {
        status.push({
          log_id: id('st'), log_date: at, transaction_id: trx, equipment_id: line.id,
          event_time: deviceStamp(at), current_status: 'RUN', previous_status: current, factory: 'MOCK',
        });
        current = 'RUN';
        held = 0;
      }
      if (late && line.id !== 'VCP01-VCP') for (let i = 0; i < 18; i++) stationOn[i] = true;
      const plating = current === 'RUN';
      const area = round((panel[1] / 100) * (panel[0] / 100), 2);
      const row = {
        log_id: id('up'), log_date: at, trx_id: trx, jobkey: lot, equipment_id: line.id, factory: 'MOCK',
        timestamp: `${deviceStamp(new Date(at.getTime() - 2000))}000`, waveform: r.weighted(VCP_WAVEFORMS),
        line_speed: recipe[1], plating_time: recipe[0], density, thickness: panel[2], width: panel[0], height: panel[1],
        plating_area_a: area, plating_area_b: area, copper_a_preset_current: copperAmps, copper_b_preset_current: copperAmps,
        current_check: r.rand() < 0.5 ? '1' : '0', pump_frequency: line.pumpFrequency,
        copper_thick_low: 0, copper_thick_high: 0, actual_tank: 0,
        shielding_board: panel[1], actual_shielding_board: panel[1], preset_shielding_board: panel[1],
        actual_frequency_1: line.pumpFrequency, preset_frequency_1: line.pumpFrequency,
        stations: [], pumps: [],
      };
      row.frequency_check = row.current_check;
      if (late && line.id === 'VCP02-VCP') { row.current_check = '1'; row.frequency_check = '0'; }

      for (const [name, setpoint] of Object.entries(line.setpoints)) {
        if (name === 'prep') {
          row.actual_prep = setpoint;
          continue;
        }
        const controlled = name === 'copperplating1' || name === 'copperplating2' || name === 'rectifier';
        const cooling = (plating || controlled) ? 0 : -Math.min(6, held * 0.05);
        const hot = late && line.id === 'VCP03-VCP' ? ({ copperplating2: 6, hotwater: 12 }[name] || 0) : 0;
        const target = setpoint + cooling + hot;
        const prev = bath[name];
        // a heater fault (hot) is a step, not a slow drift, so the rule window sees it whole
        const persistence = hot ? 0.3 : 0.95;
        bath[name] = prev === undefined ? target + r.gauss() * 0.5 : target + persistence * (prev - target) + r.gauss() * 0.3;
        row[`actual_${name}`] = setpoint;
        row[`preset_${name}`] = round(bath[name], 1);
      }
      row.pre_clean = row.preset_clean;
      row.preset_cleaning_temp = row.preset_clean;
      row.actual_cleaning_temp = row.actual_clean;

      for (let i = 0; i < 18; i++) {
        const on = plating && stationOn[i];
        cell[i] = on ? (cell[i] === null ? line.amps : line.amps + 0.9 * (cell[i] - line.amps) + r.gauss() * line.amps * 0.01) : null;
        const amps = on ? Math.round(cell[i]) : 0;
        const offSetpoint = late && line.id === 'VCP02-VCP' && i === 2 && on;
        row.stations.push({
          amps, preset: offSetpoint ? amps - 8 : amps,
          // preset_amp is part of the recipe the line runs, set on every station while
          // plating, even one the lot leaves unpowered (the alert reads station 1 only)
          percent: plating ? ((late && line.id === 'VCP02-VCP' && i === 0) ? 0 : 80) : 0,
          voltageA: on ? round(amps * ohm[i][0], 3) : 0, voltageB: on ? round(amps * ohm[i][1], 3) : 0,
        });
        const deadPump = late && line.id === 'VCP02-VCP' && i === 8;
        row.pumps.push({ set: line.pumpLevel, actual: deadPump ? 0 : line.pumpLevel });
      }
      upp.push(row);

      // alarms: Poisson arrivals, one open incident per code, heavy-tailed open time
      if (r.rand() < line.alarmsPerHour / 60) {
        const [code, message, type] = r.pick(VCP_ALARMS);
        if (!open.some(a => a.code === code)) {
          const u = r.rand();
          const openFor = u < 0.5 ? r.int(2, 60) : u < 0.9 ? r.int(60, 900) : r.int(900, 5400);
          alarms.push({ log_id: id('al'), log_date: at, equipment_id: line.id, job_key: lot, error_code: code,
            error_msg: message, error_type: type, alarm_status: 'Triggered', error_time: deviceStamp(at), factory: 'MOCK', process: 'VCP' });
          open.push({ code, message, type, lot, clearAt: new Date(at.getTime() + openFor * 1000) });
        }
      }
      for (let k = open.length - 1; k >= 0; k--) {
        const a = open[k];
        if (a.clearAt <= at) {
          alarms.push({ log_id: id('al'), log_date: a.clearAt, equipment_id: line.id, job_key: a.lot, error_code: a.code,
            error_msg: a.message, error_type: a.type, alarm_status: 'Reset', error_time: deviceStamp(a.clearAt), factory: 'MOCK', process: 'VCP' });
          open.splice(k, 1);
        }
      }
    }
  }
  return { upp, status, alarms };
}

/* ---------------------------------------------------------------- SQL text */
const quote = value => {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return `'${iso(value)}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
};

function insert(table, columns, rows, toCells, batch = 500) {
  const out = [];
  for (let i = 0; i < rows.length; i += batch) {
    const values = rows.slice(i, i + batch).map(row => `(${toCells(row).map(quote).join(',')})`);
    out.push(`INSERT INTO ${table} (${columns.join(',')}) VALUES\n${values.join(',\n')};`);
  }
  return out.join('\n');
}

function uppColumns() {
  const columns = [
    'log_id', 'log_date', 'trx_id', 'jobkey', 'equipment_id', 'factory', '"timestamp"', 'waveform',
    'line_speed', 'plating_time', 'density', 'thickness', 'width', 'height',
    'plating_area_a', 'plating_area_b', 'copper_a_preset_current', 'copper_b_preset_current',
    'current_check', 'frequency_check', 'pump_frequency', 'actual_frequency_1', 'preset_frequency_1',
    'shielding_board', 'actual_shielding_board', 'preset_shielding_board',
    'copper_thick_low', 'copper_thick_high', 'actual_tank',
    'actual_prep', 'pre_clean', 'preset_cleaning_temp', 'actual_cleaning_temp',
  ];
  for (const bath of BATHS) columns.push(`actual_${bath}`, `preset_${bath}`);
  for (let i = 1; i <= 18; i++) {
    columns.push(`actual_current_${i}a`, `actual_current_${i}b`, `preset_current_${i}a`, `preset_current_${i}b`,
      `actual_voltage_${i}a`, `actual_voltage_${i}b`, `actual_pump_${i}`, `preset_pump_${i}`, `preset_amp_${i}a`);
    if (i !== 15) columns.push(`preset_amp_${i}b`);
  }
  return columns;
}

function uppCells(row) {
  const cells = [
    row.log_id, row.log_date, row.trx_id, row.jobkey, row.equipment_id, row.factory, row.timestamp, row.waveform,
    row.line_speed, row.plating_time, row.density, row.thickness, row.width, row.height,
    row.plating_area_a, row.plating_area_b, row.copper_a_preset_current, row.copper_b_preset_current,
    row.current_check, row.frequency_check, row.pump_frequency, row.actual_frequency_1, row.preset_frequency_1,
    row.shielding_board, row.actual_shielding_board, row.preset_shielding_board,
    row.copper_thick_low, row.copper_thick_high, row.actual_tank,
    row.actual_prep, row.pre_clean, row.preset_cleaning_temp, row.actual_cleaning_temp,
  ];
  for (const bath of BATHS) cells.push(row[`actual_${bath}`], row[`preset_${bath}`]);
  for (let i = 1; i <= 18; i++) {
    const s = row.stations[i - 1];
    const p = row.pumps[i - 1];
    cells.push(s.amps, s.amps, s.preset, s.preset, s.voltageA, s.voltageB, p.actual, p.set, s.percent);
    if (i !== 15) cells.push(s.percent);
  }
  return cells;
}

function toSql(data, meta) {
  const parts = ['BEGIN;', MARKER_CHECK];
  parts.push(`INSERT INTO public.mock_dataset (run_id, seed, hours, generator) VALUES (${quote(meta.runId)}, ${meta.seed}, ${meta.hours}, 'scripts/mock/eap-mock-data.js');`);
  parts.push(insert('public.machine_event',
    ['message_id', 'equipment_id', 'message_type', 'event_type', 'event_code', 'event_message', 'event_time', 'sent_time', 'source', 'source_file', 'magazine_no', 'spindle', 'raw_item_code'],
    data.drilling.events,
    e => [e.message_id, e.equipment_id, e.message_type, e.event_type, e.event_code, e.event_message, e.event_time, e.sent_time, e.source, e.source_file, e.magazine_no, e.spindle, e.raw_item_code]));
  parts.push(insert('public.eap_status',
    ['equipment_id', 'message_id', 'agent_status', 'current_file', 'last_data_time', 'last_error', 'heartbeat', 'event_time'],
    data.drilling.status,
    s => [s.equipment_id, s.message_id, s.agent_status, s.current_file, s.last_data_time, s.last_error, s.heartbeat, s.event_time])
    .replace(/;$/, '\nON CONFLICT (equipment_id) DO UPDATE SET message_id = EXCLUDED.message_id, agent_status = EXCLUDED.agent_status, last_data_time = EXCLUDED.last_data_time, last_error = EXCLUDED.last_error, heartbeat = EXCLUDED.heartbeat, event_time = EXCLUDED.event_time;'));
  parts.push(insert('public.agent_log', ['message_id', 'equipment_id', 'level', 'event_name', 'message', 'event_time'],
    data.drilling.logs, l => [l.message_id, l.equipment_id, l.level, l.event_name, l.message, l.event_time]));
  parts.push(insert('public.vcp_upp', uppColumns(), data.vcp.upp, uppCells, 200));
  if (data.vcp.status.length) {
    parts.push(insert('public.vcp_status_change',
      ['log_id', 'log_date', 'transaction_id', 'equipment_id', 'event_time', 'current_status', 'previous_status', 'factory'],
      data.vcp.status, s => [s.log_id, s.log_date, s.transaction_id, s.equipment_id, s.event_time, s.current_status, s.previous_status, s.factory]));
  }
  if (data.vcp.alarms.length) {
    parts.push(insert('public.vcp_alarm',
      ['log_id', 'log_date', 'equipment_id', 'job_key', 'error_code', 'error_msg', 'error_type', 'alarm_status', 'error_time', 'factory', 'process'],
      data.vcp.alarms, a => [a.log_id, a.log_date, a.equipment_id, a.job_key, a.error_code, a.error_msg, a.error_type, a.alarm_status, a.error_time, a.factory, a.process]));
  }
  parts.push('COMMIT;');
  return parts.join('\n');
}

const UNDO_SQL = `BEGIN;
${MARKER_CHECK}
DELETE FROM public.machine_event WHERE message_id LIKE 'MOCK-%';
DELETE FROM public.eap_status WHERE message_id LIKE 'MOCK-%';
DELETE FROM public.agent_log WHERE message_id LIKE 'MOCK-%';
DELETE FROM public.vcp_upp WHERE log_id LIKE 'MOCK-%';
DELETE FROM public.vcp_status_change WHERE log_id LIKE 'MOCK-%';
DELETE FROM public.vcp_alarm WHERE log_id LIKE 'MOCK-%';
DELETE FROM public.mock_dataset WHERE run_id <> 'schema';
COMMIT;`;

/* --------------------------------------------------------------------- API */
function generate({ hours = 24, seed = 20260928, drilling = 12, incidents = false, end = new Date() } = {}) {
  const r = makeRandom(seed);
  const stop = new Date(end.getTime());
  stop.setUTCSeconds(0, 0);
  const start = new Date(stop.getTime() - hours * 3600e3);
  return {
    start, end: stop,
    drilling: generateDrilling(r, start, stop, drilling),
    vcp: generateVcp(r, start, stop, incidents),
  };
}

function psqlUser(explicit) {
  if (explicit) return explicit;
  if (process.env.PGUSER) return process.env.PGUSER;
  // The role name only, never printed.
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const hit = fs.readFileSync(envPath, 'utf8').match(/^POSTGRES_USER=(.*)$/m);
    if (hit) return hit[1].trim();
  }
  throw new Error('no database role: pass --psql-user=<role>, set PGUSER, or run from the repo root with .env');
}

function runPsql(sql, { container, database, user }) {
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: sql, stdio: ['pipe', 'inherit', 'inherit'], maxBuffer: 1 << 30 });
}

module.exports = { generate, toSql, uppColumns, makeRandom, UNDO_SQL, MARKER_CHECK, VCP_LINES, DRILL_ALARMS };

/* -------------------------------------------------------------------- main */
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = name => args.includes(`--${name}`);
  const opt = (name, fallback) => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const target = {
    container: opt('container', 'ims-timescaledb'),
    database: opt('database', 'eap_backup'),
  };

  if (flag('undo')) {
    if (!flag('apply')) {
      console.log('dry run: would delete every row with a MOCK- id from the mock database');
      console.log('re-run with --undo --apply to delete');
      process.exit(0);
    }
    runPsql(UNDO_SQL, { ...target, user: psqlUser(opt('psql-user')) });
    console.log('removed generated rows');
    process.exit(0);
  }

  const hours = Number(opt('hours', '24'));
  const seed = Number(opt('seed', '20260928'));
  const drilling = Number(opt('drilling', '12'));
  if (!(hours > 0 && hours <= 24 * 90)) throw new Error('--hours must be between 0 and 2160');
  if (!(drilling >= 3 && drilling <= 200)) throw new Error('--drilling must be between 3 and 200');

  const data = generate({ hours, seed, drilling, incidents: flag('incidents') });
  const runId = `mock-${seed}-${data.end.toISOString()}`;
  const sql = toSql(data, { runId, seed, hours });
  console.log(`${runId}: ${hours} h ending ${data.end.toISOString()}`);
  console.log(`  machine_event      ${data.drilling.events.length}`);
  console.log(`  eap_status         ${data.drilling.status.length}`);
  console.log(`  agent_log          ${data.drilling.logs.length}`);
  console.log(`  vcp_upp            ${data.vcp.upp.length}`);
  console.log(`  vcp_status_change  ${data.vcp.status.length}`);
  console.log(`  vcp_alarm          ${data.vcp.alarms.length}`);

  if (flag('apply')) {
    runPsql(sql, { ...target, user: psqlUser(opt('psql-user')) });
    console.log(`written to ${target.container}/${target.database}`);
  } else {
    const out = opt('out', path.join(os.tmpdir(), `eap-mock-${seed}.sql`));
    fs.writeFileSync(out, sql, 'utf8');
    console.log(`dry run: SQL written to ${out}; re-run with --apply to load it`);
  }
}
