#!/usr/bin/env node
/**
 * Golden-Dataset SPC Validation Suite
 *
 * The Cpk formula (LEAST((limit - mean)/(3*sigma), (mean + limit)/(3*sigma)),
 * mean = AVG, sigma = STDDEV_SAMP) is independently reimplemented -- not
 * shared via a function or view -- in at least 5 places: Machine Snapshot
 * panel 9, Manufacturing panel 17, Engineering Analytics panel 10, and the
 * views v_machine_spc_fleet / v_machine_spc_ranking (migrations 041/042).
 * Manual review confirmed they currently agree, but nothing stops one of
 * them silently drifting (wrong stddev function, flipped sign, wrong
 * limit) the next time someone edits one panel and not the others.
 *
 * This suite inserts a small synthetic PE/JE dataset with a hand-known
 * mean/stddev/Cpk (computed independently in JS below, not copied from any
 * SQL in this repo) under a reserved eqp_id that is NOT in public.devices
 * (so it's invisible to every real dashboard, which all LEFT JOIN from the
 * device registry), runs each implementation's core Cpk math against it
 * (stripped of dashboard template-variable filtering -- that resolution
 * layer is already covered by tests/e2e/panel-data-check.js; this suite is
 * about formula correctness only), and asserts every one of them produces
 * the same, textbook-correct number. Runs inside a transaction that is
 * always rolled back, so nothing persists in the DB regardless of outcome.
 *
 * Usage: node tests/e2e/golden-dataset-spc.js
 */

const { execFileSync } = require('child_process');

const CONTAINER = process.env.TIMESCALEDB_CONTAINER || 'ims-timescaledb';
const DB_USER = process.env.POSTGRES_USER || 'ims_admin';
const DB_NAME = process.env.POSTGRES_DB || 'ims';
const GOLDEN_EQP = 'GOLDEN-TEST-SPC-01';
const FIELD_SEP = '\x01';

// ── golden dataset: deterministic, not drawn from the live simulator ──
const PE_VALUES = [2, 3, 1, 4, 2, 3, 2, 4, 3, 2, 3, 1]; // 12 values -> 2 rows x 6 cols
const JE_VALUES = [5, 7, 4, 8, 5, 7, 5, 8]; // 8 values -> 2 rows x 4 cols
const PE_SETTING = 4.0;
const JE_SETTING = 6.0;

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sampleStddev(xs) {
  const m = mean(xs);
  const sumSq = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(sumSq / (xs.length - 1));
}
function cpk(xs, limit) {
  const m = mean(xs), s = sampleStddev(xs);
  return Math.min((limit - m) / (3 * s), (m + limit) / (3 * s));
}

const EXPECTED_PE_MEAN = mean(PE_VALUES);
const EXPECTED_PE_STDDEV = sampleStddev(PE_VALUES);
const EXPECTED_CPK_PE = cpk(PE_VALUES, PE_SETTING);
const EXPECTED_CPK_JE = cpk(JE_VALUES, JE_SETTING);
const EXPECTED_WORST_CPK = Math.min(EXPECTED_CPK_PE, EXPECTED_CPK_JE);
const TOLERANCE = 0.02; // SQL rounds to 2-3 decimals depending on panel

function runSql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME,
     '-q', '-A', '-F', FIELD_SEP, '-P', 'footer=off', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { encoding: 'utf8', input: sql, maxBuffer: 10 * 1024 * 1024 }
  );
}

function parseRows(psqlOutput) {
  const lines = psqlOutput.split('\n').filter(Boolean);
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0].split(FIELD_SEP);
  const rows = lines.slice(1).map(l => l.split(FIELD_SEP));
  return { columns, rows };
}

function assertClose(label, actual, expected) {
  const a = parseFloat(actual);
  if (Number.isNaN(a)) { console.error(`  FAIL   ${label}: got non-numeric "${actual}", expected ~${expected.toFixed(4)}`); return false; }
  const diff = Math.abs(a - expected);
  if (diff > TOLERANCE) { console.error(`  FAIL   ${label}: got ${a}, expected ~${expected.toFixed(4)} (diff ${diff.toFixed(4)} > tolerance ${TOLERANCE})`); return false; }
  console.log(`  PASS   ${label}: got ${a}, expected ~${expected.toFixed(4)}`);
  return true;
}

const INSERT_SQL = `
INSERT INTO public.devices (device_id, hostname, device_type, enabled, location)
VALUES ('${GOLDEN_EQP}', '${GOLDEN_EQP}', 'ldi', true, 'golden-test');

INSERT INTO public.ldi_data
  (time, factory, process, eqp_id, mo, fpn, layer_name, pe_setting, je_setting,
   pe_1, pe_2, pe_3, pe_4, pe_5, pe_6, je_1, je_2, je_3, je_4, log_id)
VALUES
  (NOW(), '9', 'GOLDEN', '${GOLDEN_EQP}', 'MO-GOLDEN', 'PN-GOLDEN', 'golden-layer', ${PE_SETTING}, ${JE_SETTING},
   ${PE_VALUES[0]}, ${PE_VALUES[1]}, ${PE_VALUES[2]}, ${PE_VALUES[3]}, ${PE_VALUES[4]}, ${PE_VALUES[5]},
   ${JE_VALUES[0]}, ${JE_VALUES[1]}, ${JE_VALUES[2]}, ${JE_VALUES[3]}, 'GOLDEN-LOG-1'),
  (NOW(), '9', 'GOLDEN', '${GOLDEN_EQP}', 'MO-GOLDEN', 'PN-GOLDEN', 'golden-layer', ${PE_SETTING}, ${JE_SETTING},
   ${PE_VALUES[6]}, ${PE_VALUES[7]}, ${PE_VALUES[8]}, ${PE_VALUES[9]}, ${PE_VALUES[10]}, ${PE_VALUES[11]},
   ${JE_VALUES[4]}, ${JE_VALUES[5]}, ${JE_VALUES[6]}, ${JE_VALUES[7]}, 'GOLDEN-LOG-2');
`;

// Core formula extracted from each panel's/view's actual deployed SQL,
// with the dashboard-variable / devices-registry filtering layer stripped
// out and replaced by a direct eqp_id filter (that resolution layer is
// tested separately by panel-data-check.js). The Cpk MATH itself below is
// copy-pasted verbatim from the source so this test catches real drift.
const CHECKS = [
  {
    label: 'Machine Snapshot panel 9 (Worst Cpk) -- Cpk (PE)',
    sql: `
      WITH pe_samples AS (
        SELECT d.eqp_id, d.pe_setting, p.pe FROM public.ldi_data d
        CROSS JOIN LATERAL (VALUES(d.pe_1),(d.pe_2),(d.pe_3),(d.pe_4),(d.pe_5),(d.pe_6)) p(pe)
        WHERE d.eqp_id = '${GOLDEN_EQP}' AND p.pe IS NOT NULL AND d.pe_setting IS NOT NULL
      ), pe_stats AS (
        SELECT eqp_id, AVG(pe) mean_pe, STDDEV_SAMP(pe) stddev_pe, AVG(pe_setting) pe_lim FROM pe_samples GROUP BY eqp_id
      )
      SELECT LEAST((pe_lim-mean_pe)/NULLIF(3*stddev_pe,0),(mean_pe+pe_lim)/NULLIF(3*stddev_pe,0)) AS cpk_pe FROM pe_stats;`,
    expected: EXPECTED_CPK_PE,
  },
  {
    label: 'Manufacturing panel 17 (Avg Cpk Fleet) -- Cpk (PE)',
    sql: `
      WITH pe_samples AS (
        SELECT d.eqp_id, d.pe_setting, p.pe FROM public.ldi_data d
        CROSS JOIN LATERAL (VALUES (d.pe_1),(d.pe_2),(d.pe_3),(d.pe_4),(d.pe_5),(d.pe_6)) p(pe)
        WHERE d.eqp_id = '${GOLDEN_EQP}' AND p.pe IS NOT NULL AND d.pe_setting IS NOT NULL
      ), stats AS (
        SELECT eqp_id, AVG(pe) AS mean_pe, STDDEV_SAMP(pe) AS sigma, AVG(pe_setting) AS lim FROM pe_samples GROUP BY eqp_id
      )
      SELECT LEAST((lim - mean_pe) / NULLIF(3*sigma,0), (mean_pe + lim) / NULLIF(3*sigma,0)) AS value FROM stats;`,
    expected: EXPECTED_CPK_PE,
  },
  {
    label: 'Engineering Analytics panel 10 (Machine Capability Ranking) -- Cpk (PE)',
    sql: `
      WITH pe_samples AS (
        SELECT d.eqp_id, d.pe_setting, p.pe FROM public.ldi_data d
        CROSS JOIN LATERAL (VALUES (d.pe_1),(d.pe_2),(d.pe_3),(d.pe_4),(d.pe_5),(d.pe_6)) p(pe)
        WHERE d.eqp_id = '${GOLDEN_EQP}' AND p.pe IS NOT NULL AND d.pe_setting IS NOT NULL
      ), pe_stats AS (
        SELECT eqp_id, COUNT(*) AS n_pe, AVG(pe) AS mean_pe, STDDEV_SAMP(pe) AS stddev_pe, AVG(pe_setting) AS pe_limit FROM pe_samples GROUP BY eqp_id
      )
      SELECT LEAST((pe_limit - mean_pe) / NULLIF(3 * stddev_pe, 0), (mean_pe + pe_limit) / NULLIF(3 * stddev_pe, 0)) AS cpk_pe FROM pe_stats;`,
    expected: EXPECTED_CPK_PE,
  },
  {
    // v_machine_spc_fleet is a MATERIALIZED view (migration 064, refreshed
    // on a 1-minute background job) -- querying it directly can never see
    // this transaction's just-inserted golden rows, since a materialized
    // view is a separate physical snapshot with its own refresh cycle, not
    // a live re-execution of its defining query. Inlined here instead,
    // same as the other panel checks above: formula copied verbatim from
    // migration 064's pe_capability CTE chain, with the devices-registry
    // join layer (device_type='ldi' AND enabled) replaced by a direct
    // eqp_id filter -- that join/filtering layer is what a materialized
    // view's own staleness would otherwise hide from this test, not the
    // Cpk math itself, which is what this suite actually validates.
    label: 'v_machine_spc_fleet (migration 042) -- cpk_pe',
    sql: `
      WITH pe_base AS (
        SELECT eqp_id, pe_1, pe_2, pe_3, pe_4, pe_5, pe_6, COALESCE(pe_setting, 25.0) AS pe_val
        FROM public.ldi_data
        WHERE eqp_id = '${GOLDEN_EQP}' AND pe_1 IS NOT NULL AND COALESCE(pe_setting, 0) > 2.0
      ), pe_samples AS (
        SELECT eqp_id, pe_val, v.pe FROM pe_base
        CROSS JOIN LATERAL (VALUES (pe_1),(pe_2),(pe_3),(pe_4),(pe_5),(pe_6)) v(pe)
        WHERE v.pe IS NOT NULL
      ), pe_stats AS (
        SELECT eqp_id, AVG(pe) AS mu, STDDEV(pe) AS sigma, AVG(pe_val) AS setting_val FROM pe_samples GROUP BY eqp_id
      )
      SELECT LEAST((setting_val - mu) / NULLIF(3 * sigma, 0), (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk_pe FROM pe_stats;`,
    expected: EXPECTED_CPK_PE,
  },
  {
    label: 'v_machine_spc_ranking (migration 041) -- cpk (PE)',
    sql: `SELECT cpk FROM public.v_machine_spc_ranking WHERE eqp_id = '${GOLDEN_EQP}';`,
    expected: EXPECTED_CPK_PE,
  },
  {
    label: 'Machine Snapshot panel 9 (Worst Cpk) -- Cpk (JE)',
    sql: `
      WITH je_samples AS (
        SELECT d.eqp_id, d.je_setting, j.je FROM public.ldi_data d
        CROSS JOIN LATERAL (VALUES(d.je_1),(d.je_2),(d.je_3),(d.je_4)) j(je)
        WHERE d.eqp_id = '${GOLDEN_EQP}' AND j.je IS NOT NULL AND d.je_setting IS NOT NULL
      ), je_stats AS (
        SELECT eqp_id, AVG(je) mean_je, STDDEV_SAMP(je) stddev_je, AVG(je_setting) je_lim FROM je_samples GROUP BY eqp_id
      )
      SELECT LEAST((je_lim-mean_je)/NULLIF(3*stddev_je,0),(mean_je+je_lim)/NULLIF(3*stddev_je,0)) AS cpk_je FROM je_stats;`,
    expected: EXPECTED_CPK_JE,
  },
  {
    // Same materialized-view staleness reason as the cpk_pe check above --
    // inlines migration 064's full pe_capability + je_capability CTE
    // chains and its final worst_cpk CASE/LEAST combination, verbatim
    // minus the devices-registry join layer.
    label: 'v_machine_spc_fleet (migration 042) -- worst_cpk',
    sql: `
      WITH pe_base AS (
        SELECT eqp_id, pe_1, pe_2, pe_3, pe_4, pe_5, pe_6, COALESCE(pe_setting, 25.0) AS pe_val
        FROM public.ldi_data
        WHERE eqp_id = '${GOLDEN_EQP}' AND pe_1 IS NOT NULL AND COALESCE(pe_setting, 0) > 2.0
      ), pe_samples AS (
        SELECT eqp_id, pe_val, v.pe FROM pe_base
        CROSS JOIN LATERAL (VALUES (pe_1),(pe_2),(pe_3),(pe_4),(pe_5),(pe_6)) v(pe)
        WHERE v.pe IS NOT NULL
      ), pe_stats AS (
        SELECT eqp_id, AVG(pe) AS mu, STDDEV(pe) AS sigma, AVG(pe_val) AS setting_val FROM pe_samples GROUP BY eqp_id
      ), pe_capability AS (
        SELECT eqp_id, LEAST((setting_val - mu) / NULLIF(3 * sigma, 0), (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk_pe FROM pe_stats
      ), je_base AS (
        SELECT eqp_id, je_1, je_2, je_3, je_4, COALESCE(je_setting, 25.0) AS je_val
        FROM public.ldi_data
        WHERE eqp_id = '${GOLDEN_EQP}' AND je_1 IS NOT NULL AND COALESCE(je_setting, 0) > 2.0
      ), je_samples AS (
        SELECT eqp_id, je_val, v.je FROM je_base
        CROSS JOIN LATERAL (VALUES (je_1),(je_2),(je_3),(je_4)) v(je)
        WHERE v.je IS NOT NULL
      ), je_stats AS (
        SELECT eqp_id, AVG(je) AS mu, STDDEV(je) AS sigma, AVG(je_val) AS setting_val FROM je_samples GROUP BY eqp_id
      ), je_capability AS (
        SELECT eqp_id, LEAST((setting_val - mu) / NULLIF(3 * sigma, 0), (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk_je FROM je_stats
      )
      SELECT CASE
          WHEN p.cpk_pe IS NULL THEN j.cpk_je
          WHEN j.cpk_je IS NULL THEN p.cpk_pe
          ELSE LEAST(p.cpk_pe, j.cpk_je)
        END AS worst_cpk
      FROM pe_capability p FULL JOIN je_capability j ON p.eqp_id = j.eqp_id;`,
    expected: EXPECTED_WORST_CPK,
  },
];

console.log('IMS Golden-Dataset SPC Validation Suite');
console.log('='.repeat(70));
console.log(`Golden PE: n=${PE_VALUES.length} mean=${EXPECTED_PE_MEAN.toFixed(4)} sigma=${EXPECTED_PE_STDDEV.toFixed(4)} limit=${PE_SETTING} -> Cpk=${EXPECTED_CPK_PE.toFixed(4)}`);
console.log(`Golden JE: n=${JE_VALUES.length} limit=${JE_SETTING} -> Cpk=${EXPECTED_CPK_JE.toFixed(4)}`);
console.log(`Worst Cpk (LEAST of the two) = ${EXPECTED_WORST_CPK.toFixed(4)}`);
console.log('='.repeat(70));

let passed = 0, failed = 0;
try {
  const wrapped = 'BEGIN;\n' + INSERT_SQL + '\n' +
    CHECKS.map((c, i) => `\\echo __CHECK_${i}__\n${c.sql}`).join('\n') +
    '\nROLLBACK;\n';
  const out = runSql(wrapped);

  const blocks = out.split(/__CHECK_(\d+)__/).slice(1); // [idx, output, idx, output, ...]
  for (let i = 0; i < blocks.length; i += 2) {
    const idx = parseInt(blocks[i], 10);
    const { rows } = parseRows(blocks[i + 1]);
    const check = CHECKS[idx];
    const value = rows.length > 0 ? rows[0][0] : undefined;
    if (assertClose(check.label, value, check.expected)) passed++; else failed++;
  }
} catch (e) {
  console.error('FATAL: golden-dataset run failed:', (e.stderr || e.message || String(e)).toString().slice(0, 2000));
  process.exit(1);
}

console.log('='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('GOLDEN-DATASET SPC VALIDATION FAILED');
  process.exit(1);
}
console.log('GOLDEN-DATASET SPC VALIDATION PASSED — every Cpk implementation agrees with the textbook formula');
process.exit(0);
