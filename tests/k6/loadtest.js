// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMS K6 Load Test — PgBouncer & TimescaleDB Bottleneck Stress
// Sends full SNMP payload mock via POST /inject
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ── Metrics ──────────────────────────────────────────────────
const injectSuccess = new Rate('inject_success');
const injectDuration = new Trend('inject_duration', true);
const injectErrors = new Counter('inject_errors');
const activeVUs = new Gauge('active_vus');

// ── Config ───────────────────────────────────────────────────
const NODERED_URL = __ENV.NODERED_URL || 'http://localhost:1880';
const INGEST_API_KEY = __ENV.INGEST_API_KEY || 'ims-secret-key';
const TARGET_SERVERS = Number.parseInt(__ENV.TARGET_SERVERS || '50', 10);

export const options = {
  stages: [
    // Warm-up: ramp to 50 VUs over 30s
    { duration: '30s', target: Math.min(TARGET_SERVERS, 50) },
    // Sustained: hold at 50 VUs for 1 minute
    { duration: '1m', target: Math.min(TARGET_SERVERS, 50) },
    // Stress: ramp to 200 VUs over 30s
    { duration: '30s', target: Math.min(TARGET_SERVERS * 4, 200) },
    // Peak: hold at 200 VUs for 1 minute
    { duration: '1m', target: Math.min(TARGET_SERVERS * 4, 200) },
    // Cool-down: ramp to 0 over 30s
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    inject_success: ['rate>0.95'],
    inject_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

// ── Full SNMP Payload Generator ──────────────────────────────
function generateFullSNMPayload(machineId, vuId) {
  const portCount = 24; // Juniper EX4000-style 24-port switch
  const baseTime = Date.now();

  return {
    machine_id: machineId,
    _walker: 'net', // Triggers full parser path
    payload: [
      // ── CPU OIDs ──
      { oid: '1.3.6.1.2.1.25.3.3.1.2.1', value: 25 + (vuId % 30), type: 2 },
      { oid: '1.3.6.1.2.1.25.3.3.1.2.2', value: 45 + (vuId % 20), type: 2 },
      { oid: '1.3.6.1.2.1.25.3.3.1.2.3', value: 15 + (vuId % 40), type: 2 },
      { oid: '1.3.6.1.2.1.25.3.3.1.2.4', value: 60 + (vuId % 15), type: 2 },

      // ── Storage OIDs (RAM + Disk) ──
      { oid: '1.3.6.1.2.1.25.2.3.1.2.1', value: Buffer.from('1.3.6.1.2.1.25.2.1.2'), type: 4 },
      { oid: '1.3.6.1.2.1.25.2.3.1.3.1', value: Buffer.from('Physical Memory'), type: 4 },
      { oid: '1.3.6.1.2.1.25.2.3.1.4.1', value: 4096, type: 2 },
      { oid: '1.3.6.1.2.1.25.2.3.1.5.1', value: 16777216, type: 2 },
      { oid: '1.3.6.1.2.1.25.2.3.1.6.1', value: 8388608 + (vuId * 100000), type: 2 },
      { oid: '1.3.6.1.2.1.25.2.3.1.2.2', value: Buffer.from('1.3.6.1.2.1.25.2.1.4'), type: 4 },
      { oid: '1.3.6.1.2.1.25.2.3.1.3.2', value: Buffer.from('Local Fixed Disk'), type: 4 },
      { oid: '1.3.6.1.2.1.25.2.3.1.4.2', value: 512, type: 2 },
      { oid: '1.3.6.1.2.1.25.2.3.1.5.2', value: 524288000, type: 2 },
      { oid: '1.3.6.1.2.1.25.2.3.1.6.2', value: 314572800 + (vuId * 1000000), type: 2 },

      // ── Temperature OIDs ──
      { oid: '1.3.6.1.4.1.2021.13.16.2.1.7.0', value: 35 + (vuId % 15), type: 2 },
      { oid: '1.3.6.1.4.1.2021.13.16.2.1.7.1', value: 42 + (vuId % 10), type: 2 },

      // ── Network OIDs (24 ports) ──
      ...generateNetworkOIDs(portCount, vuId, baseTime),
    ],
  };
}

function generateNetworkOIDs(portCount, vuId, baseTime) {
  const oids = [];
  const counters = {
    rx32: baseTime * 1000 + (vuId * 1000000),
    tx32: baseTime * 500 + (vuId * 500000),
    rx64: BigInt(baseTime) * 1000000n + BigInt(vuId) * 1000000000n,
    tx64: BigInt(baseTime) * 500000n + BigInt(vuId) * 500000000n,
  };

  for (let i = 1; i <= portCount; i++) {
    // ifDescr (name)
    oids.push({ oid: `1.3.6.1.2.1.2.2.1.2.${i}`, value: `ge-0/0/${i}`, type: 4 });
    // ifAdminStatus (1=up)
    oids.push({ oid: `1.3.6.1.2.1.2.2.1.7.${i}`, value: 1, type: 2 });
    // ifOperStatus (1=up for first 3 ports, 2=down for rest)
    oids.push({ oid: `1.3.6.1.2.1.2.2.1.8.${i}`, value: i <= 3 ? 1 : 2, type: 2 });
    // ifInOctets (32-bit)
    oids.push({ oid: `1.3.6.1.2.1.2.2.1.10.${i}`, value: Number(counters.rx32) + (i * 1000), type: 65 });
    // ifInErrors
    oids.push({ oid: `1.3.6.1.2.1.2.2.1.14.${i}`, value: 0, type: 2 });
    // ifInDiscards
    oids.push({ oid: `1.3.6.1.2.1.2.2.1.13.${i}`, value: 0, type: 2 });
    // ifOutOctets (32-bit)
    oids.push({ oid: `1.3.6.1.2.1.2.2.1.16.${i}`, value: Number(counters.tx32) + (i * 500), type: 65 });
    // ifHighCapInOctets (64-bit) — only for first 12 ports (simulates HC availability)
    if (i <= 12) {
      oids.push({ oid: `1.3.6.1.2.1.31.1.1.1.6.${i}`, value: Number(counters.rx64) + BigInt(i) * 1000000n, type: 70 });
      oids.push({ oid: `1.3.6.1.2.1.31.1.1.1.10.${i}`, value: Number(counters.tx64) + BigInt(i) * 500000n, type: 70 });
    }
  }
  return oids;
}

// ── Main Function ────────────────────────────────────────────
export default function () {
  const serverIndex = __VU % TARGET_SERVERS;
  const machineId = `E2E-SERVER-${String(serverIndex).padStart(3, '0')}`;

  activeVUs.add(1);

  const payload = generateFullSNMPayload(machineId, __VU);

  const startTime = Date.now();
  const res = http.post(
    `${NODERED_URL}/inject`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': INGEST_API_KEY,
      },
      tags: { name: 'inject_full', machine_id: machineId },
      timeout: '10s',
    }
  );

  const duration = Date.now() - startTime;
  injectDuration.add(duration);

  const success = check(res, {
    'inject accepted': (r) => r.status === 200 || r.status === 204,
    'response time OK': (r) => r.timings.duration < 500,
  });

  if (success) {
    injectSuccess.add(1);
  } else {
    injectErrors.add(1);
    injectSuccess.add(0);
  }

  // Variable sleep to simulate real polling intervals (1-4s)
  sleep(Math.random() * 3 + 1);
}

// ── Summary Output ───────────────────────────────────────────
export function handleSummary(data) {
  const metrics = data.metrics || {};

  const safeGet = (name, prop) => {
    if (metrics[name] && metrics[name].values) {
      return metrics[name].values[prop] || 0;
    }
    return 0;
  };

  return {
    'tests/k6/loadtest-results.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      total_runs: safeGet('inject_success', 'count'),
      success_rate: safeGet('inject_success', 'rate'),
      errors: safeGet('inject_errors', 'count'),
      avg_duration_ms: safeGet('inject_duration', 'avg'),
      p95_duration_ms: safeGet('inject_duration', 'p(95)'),
      p99_duration_ms: safeGet('inject_duration', 'p(99)'),
      max_vus: safeGet('active_vus', 'value'),
    }, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
