// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMS K6 Stress Test — Database Write Throughput
// Simulates N servers pushing telemetry every 10s
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import http from 'k6/http';
import { check, sleep, textSummary } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const dbWrites = new Counter('db_writes');
const dbErrors = new Counter('db_errors');
const writeDuration = new Trend('db_write_duration', true);
const successRate = new Rate('db_success_rate');

const PGHOST = __ENV.PGHOST || 'localhost';
const PGPORT = __ENV.PGPORT || '6432';
const SERVER_COUNT = Number.parseInt(__ENV.SERVER_COUNT || '100', 10);
const WRITE_INTERVAL = Number.parseInt(__ENV.WRITE_INTERVAL || '10', 10);

export const options = {
  stages: [
    { duration: '30s', target: Math.min(SERVER_COUNT, 20) },
    { duration: '1m', target: Math.min(SERVER_COUNT, 50) },
    { duration: '2m', target: SERVER_COUNT },
    { duration: '2m', target: SERVER_COUNT },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    db_success_rate: ['rate>0.95'],
  },
};

function generateTelemetry(machineId) {
  const now = new Date().toISOString();
  return {
    time: now,
    machine_id: machineId,
    cpu_cores: Math.floor(Math.random() * 64) + 4,
    cpu_load_percent: Math.random() * 80 + 5,
    ram_total_mb: 16384 + Math.floor(Math.random() * 48000),
    ram_used_mb: Math.random() * 12000 + 2000,
    ram_free_mb: Math.random() * 4000 + 500,
    disk_total_gb: 500 + Math.floor(Math.random() * 2000),
    disk_used_gb: Math.random() * 800 + 100,
    disk_free_gb: Math.random() * 400 + 50,
    net_rx_bytes: Math.floor(Math.random() * 100000000000),
    net_tx_bytes: Math.floor(Math.random() * 50000000000),
    net_rx_errors: Math.floor(Math.random() * 10),
    net_rx_drops: Math.floor(Math.random() * 5),
    net_if_status: 1,
    temp_c: Math.random() * 40 + 30,
    rx_mbps: Math.random() * 500,
    tx_mbps: Math.random() * 300,
  };
}

function buildInsertSQL(telemetry) {
  const cols = Object.keys(telemetry);
  const vals = cols.map(c => {
    const v = telemetry[c];
    if (typeof v === 'string') return `'${v}'`;
    return v;
  });
  return `INSERT INTO public.machine_telemetry (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')})`;
}

export default function () {
  const serverIndex = __VU % SERVER_COUNT;
  const machineId = `STRESS-SERVER-${String(serverIndex).padStart(3, '0')}`;

  const telemetry = generateTelemetry(machineId);
  const sql = buildInsertSQL(telemetry);

  const url = `http://${PGHOST}:${PGPORT}/ims`;
  const params = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    tags: { name: 'db_write' },
  };

  const startTime = Date.now();
  const res = http.post(url, sql, params);
  const duration = Date.now() - startTime;

  writeDuration.add(duration);

  const ok = check(res, {
    'write status 200': (r) => r.status === 200 || r.status === 201,
  });

  if (ok) {
    dbWrites.add(1);
    successRate.add(1);
  } else {
    dbErrors.add(1);
    successRate.add(0);
  }

  sleep(WRITE_INTERVAL);
}

export function handleSummary(data) {
  const metrics = data.metrics;
  return {
    'tests/k6/db-write-results.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      total_writes: metrics.db_writes?.values?.count || 0,
      total_errors: metrics.db_errors?.values?.count || 0,
      success_rate: metrics.db_success_rate?.values?.rate || 0,
      avg_write_duration: metrics.db_write_duration?.values?.avg || 0,
      p95_write_duration: metrics.db_write_duration?.values?.['p(95)'] || 0,
      p99_write_duration: metrics.db_write_duration?.values?.['p(99)'] || 0,
      http_avg_duration: metrics.http_req_duration?.values?.avg || 0,
      http_p95_duration: metrics.http_req_duration?.values?.['p(95)'] || 0,
    }, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
