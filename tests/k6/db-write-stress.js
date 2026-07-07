// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMS K6 Stress Test — Database Write Throughput
// Simulates N servers pushing telemetry via Node-RED /inject endpoint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import http from 'k6/http';
import { check, sleep, textSummary } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const dbWrites = new Counter('db_writes');
const dbErrors = new Counter('db_errors');
const writeDuration = new Trend('db_write_duration', true);
const successRate = new Rate('db_success_rate');

const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:1880/inject';
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

export default function () {
  const serverIndex = __VU % SERVER_COUNT;
  const machineId = `K6-STRESS-${String(serverIndex).padStart(3, '0')}`;

  const payload = JSON.stringify({ machine_id: machineId });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'db_write' },
  };

  const startTime = Date.now();
  const res = http.post(TARGET_URL, payload, params);
  const duration = Date.now() - startTime;

  writeDuration.add(duration);

  const ok = check(res, {
    'inject status 200': (r) => r.status === 200,
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
      http_avg_duration: metrics.http_req_duration?.values?.avg || 0,
      http_p95_duration: metrics.http_req_duration?.values?.['p(95)'] || 0,
    }, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
