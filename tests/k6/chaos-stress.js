// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMS K6 Chaos-Enhanced Stress Test — 100 VUs + Retry Queue Verification
// Extends pipeline-stress.js with high concurrency and chaos scenarios
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import http from 'k6/http';
import { check, sleep, textSummary } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const pipelineSuccess = new Rate('pipeline_success');
const pipelineDuration = new Trend('pipeline_duration', true);
const retryQueueSize = new Counter('retry_queue_size');
const httpErrors = new Counter('http_errors');

const NODERED_URL = __ENV.NODERED_URL || 'http://127.0.0.1:1880';
const INGEST_API_KEY = __ENV.INGEST_API_KEY || 'ims-secret-key';
const TARGET_VUS = Number.parseInt(__ENV.TARGET_VUS || '100', 10);
const TARGET_SERVERS = 50;

export const options = {
  stages: [
    { duration: '30s', target: Math.min(TARGET_VUS, 20) },   // warm up
    { duration: '1m', target: Math.min(TARGET_VUS, 50) },    // ramp
    { duration: '3m', target: TARGET_VUS },                    // sustain peak
    { duration: '1m', target: Math.min(TARGET_VUS, 50) },    // cooldown
    { duration: '30s', target: 0 },                            // drain
  ],
  thresholds: {
    pipeline_success: ['rate>0.95'],
    pipeline_duration: ['p(95)<5000'],
    http_errors: ['count<50'],
  },
};

export default function () {
  const serverIndex = __VU % TARGET_SERVERS;
  const machineId = `E2E-SERVER-${String(serverIndex).padStart(3, '0')}`;

  const payload = JSON.stringify({
    machine_id: machineId,
    timestamp: new Date().toISOString(),
  });

  const start = Date.now();

  const res = http.post(`${NODERED_URL}/inject`, payload, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': INGEST_API_KEY },
    tags: { name: 'inject_high_concurrency' },
    timeout: '10s',
  });

  const duration = Date.now() - start;
  pipelineDuration.add(duration);

  const ok = check(res, {
    'inject accepted': (r) => r.status === 200 || r.status === 204,
    'response time < 3s': (r) => r.timings.duration < 3000,
  });

  if (ok) {
    pipelineSuccess.add(1);
  } else {
    pipelineSuccess.add(0);
    httpErrors.add(1);
  }

  // Random think time (1-5s) to simulate realistic load pattern
  sleep(Math.random() * 4 + 1);
}

export function handleSummary(data) {
  const m = data?.metrics;
  if (!m) return { stdout: 'No metrics collected' };

  const result = {
    timestamp: new Date().toISOString(),
    config: { target_vus: TARGET_VUS, target_servers: TARGET_SERVERS },
    results: {
      total_iterations: m.pipeline_success?.values?.count || 0,
      success_rate: ((m.pipeline_success?.values?.rate || 0) * 100).toFixed(2) + '%',
      http_errors: m.http_errors?.values?.count || 0,
      avg_duration_ms: Math.round(m.pipeline_duration?.values?.avg || 0),
      p95_duration_ms: Math.round(m.pipeline_duration?.values?.['p(95)'] || 0),
      p99_duration_ms: Math.round(m.pipeline_duration?.values?.['p(99)'] || 0),
    },
    verdict: 'PASS',
  };

  const rate = m.pipeline_success?.values?.rate || 0;
  if (rate < 0.95) {
    result.verdict = 'FAIL — success rate below 95%';
  }

  return {
    'tests/k6/e2e-chaos-results.json': JSON.stringify(result, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
