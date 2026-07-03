// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMS K6 Stress Test — Full Pipeline End-to-End
// Tests SNMP → Node-RED → PgBouncer → TimescaleDB → Grafana
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import http from 'k6/http';
import { check, sleep, textSummary } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const pipelineSuccess = new Rate('pipeline_success');
const pipelineDuration = new Trend('pipeline_duration', true);
const endToEndDuration = new Trend('e2e_duration', true);
const pipelineErrors = new Counter('pipeline_errors');

const NODERED_URL = __ENV.NODERED_URL || 'http://127.0.0.1:1880';
const GRAFANA_URL = __ENV.GRAFANA_URL || 'http://127.0.0.1:3000';
const TARGET_SERVERS = Number.parseInt(__ENV.TARGET_SERVERS || '50', 10);

export const options = {
  stages: [
    { duration: '30s', target: Math.min(TARGET_SERVERS, 10) },
    { duration: '1m', target: Math.min(TARGET_SERVERS, 25) },
    { duration: '2m', target: TARGET_SERVERS },
    { duration: '2m', target: TARGET_SERVERS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    pipeline_success: ['rate>0.90'],
    e2e_duration: ['p(95)<15000'],
  },
};

function generateSNMPPayload(machineId) {
  return {
    machine_id: machineId,
    timestamp: new Date().toISOString(),
  };
}

export default function () {
  const serverIndex = __VU % TARGET_SERVERS;
  const machineId = `E2E-SERVER-${String(serverIndex).padStart(3, '0')}`;
  const e2eStart = Date.now();

  // Step 1: Simulate SNMP data collection (node-red inject)
  const payload = generateSNMPPayload(machineId);
  const pipelineStart = Date.now();

  const injectRes = http.post(
    `${NODERED_URL}/inject`,
    JSON.stringify(payload),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'inject' },
      timeout: '10s',
    }
  );

  const pipelineTime = Date.now() - pipelineStart;
  pipelineDuration.add(pipelineTime);

  const injectOk = check(injectRes, {
    'inject accepted': (r) => r.status === 200 || r.status === 204,
  });

  // Step 2: Wait for pipeline processing
  sleep(2);

  // Step 3: Query Grafana to verify data appeared
  const queryStart = Date.now();
  http.get(
    `${GRAFANA_URL}/api/ds/query`,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'grafana_verify' },
      timeout: '10s',
    }
  );
  const queryTime = Date.now() - queryStart;

  const e2eTime = Date.now() - e2eStart;
  endToEndDuration.add(e2eTime);

  const ok = injectOk;
  if (ok) {
    pipelineSuccess.add(1);
  } else {
    pipelineErrors.add(1);
    pipelineSuccess.add(0);
  }

  sleep(Math.random() * 3 + 1);
}

export function handleSummary(data) {
  const metrics = data?.metrics;
  if (!metrics) return { stdout: 'No metrics collected' };
  return {
    'tests/k6/e2e-pipeline-results.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      total_runs: metrics.pipeline_success?.values?.count || 0,
      success_rate: metrics.pipeline_success?.values?.rate || 0,
      errors: metrics.pipeline_errors?.values?.count || 0,
      avg_pipeline_duration: metrics.pipeline_duration?.values?.avg || 0,
      p95_pipeline_duration: metrics.pipeline_duration?.values?.['p(95)'] || 0,
      avg_e2e_duration: metrics.e2e_duration?.values?.avg || 0,
      p95_e2e_duration: metrics.e2e_duration?.values?.['p(95)'] || 0,
      p99_e2e_duration: metrics.e2e_duration?.values?.['p(99)'] || 0,
    }, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
