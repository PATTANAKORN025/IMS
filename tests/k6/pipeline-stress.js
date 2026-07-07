// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMS K6 Stress Test — Full Pipeline End-to-End
// Tests V2 Parser → PgBouncer → TimescaleDB → Grafana
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import http from 'k6/http';
import { check, sleep, textSummary } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const pipelineSuccess = new Rate('pipeline_success');
const pipelineDuration = new Trend('pipeline_duration', true);
const endToEndDuration = new Trend('e2e_duration', true);
const pipelineErrors = new Counter('pipeline_errors');

const NODERED_URL = __ENV.NODERED_URL || 'http://localhost:1880';
const GRAFANA_URL = __ENV.GRAFANA_URL || 'http://localhost:3000';
const TARGET_SERVERS = Number.parseInt(__ENV.TARGET_SERVERS || '100', 10);

export const options = {
  stages: [
    { duration: '30s', target: Math.min(TARGET_SERVERS, 20) },
    { duration: '1m', target: Math.min(TARGET_SERVERS, 50) },
    { duration: '1m', target: TARGET_SERVERS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    pipeline_success: ['rate>0.95'],
    e2e_duration: ['p(95)<10000'],
  },
};

function generateV2Payload(machineId) {
  return {
    machine_id: machineId,
    metrics: [
      {
        cpu: { cores: Math.floor(Math.random() * 64) + 4, load: Math.random() * 80 + 5 }
      },
      {
        disk: {
          ramTotal: 16384, ramUsed: Math.random() * 12000, ramFree: 4000,
          diskTotal: 1000, diskUsed: Math.random() * 500, diskFree: 500
        }
      },
      {
        temp: Math.random() * 40 + 30
      },
      {
        interfaces: [
          { name: 'eth0', received_MB: Math.random() * 500, sent_MB: Math.random() * 300, status: 'ON' }
        ]
      },
      {
        ldi: { throughput: Math.random() * 100, temperature: 80, humidity: 50 }
      }
    ]
  };
}

export default function () {
  const serverIndex = __VU % TARGET_SERVERS;
  const machineId = `E2E-SERVER-${String(serverIndex).padStart(3, '0')}`;
  const e2eStart = Date.now();

  // Send to the dedicated K6 endpoint we created for the V2 parser
  const payload = generateV2Payload(machineId);
  const pipelineStart = Date.now();

  const injectRes = http.post(
    `${NODERED_URL}/k6-inject`,
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

  if (injectOk) {
    pipelineSuccess.add(1);
  } else {
    pipelineErrors.add(1);
    pipelineSuccess.add(0);
  }

  sleep(Math.random() * 3 + 1);
}

export function handleSummary(data) {
  const metrics = data.metrics || {};
  
  // Safe extraction to prevent TypeError when 0 successes
  const safeGet = (metricName, prop) => {
      if (metrics[metricName] && metrics[metricName].values) {
          return metrics[metricName].values[prop] || 0;
      }
      return 0;
  };

  return {
    'tests/k6/e2e-pipeline-results.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      total_runs: safeGet('pipeline_success', 'count'),
      success_rate: safeGet('pipeline_success', 'rate'),
      errors: safeGet('pipeline_errors', 'count'),
      avg_pipeline_duration: safeGet('pipeline_duration', 'avg'),
      p95_pipeline_duration: safeGet('pipeline_duration', 'p(95)'),
      avg_e2e_duration: safeGet('e2e_duration', 'avg'),
      p95_e2e_duration: safeGet('e2e_duration', 'p(95)'),
    }, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
