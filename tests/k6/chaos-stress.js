import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const webhookSuccess = new Rate('webhook_success');
const webhookDuration = new Trend('webhook_duration', true);
const webhookErrors = new Counter('webhook_errors');

const WEBHOOK_URL = __ENV.WEBHOOK_URL || 'http://localhost:1880/alert-webhook';
const TARGET_VUS = Number.parseInt(__ENV.TARGET_VUS || '1000', 10);

export const options = {
  stages: [
    { duration: '30s', target: 500 },
    { duration: '1m', target: TARGET_VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    webhook_success: ['rate>0.95'],
    webhook_duration: ['p(95)<500'],
  },
};

export default function () {
  const payload = JSON.stringify({
    status: 'firing',
    alerts: [{
      labels: { severity: 'critical', alertname: 'LDI_PE_Drift', machine_id: 'LDIA-' + __VU },
      annotations: { description: 'Simulated chaos load testing for PgBouncer' }
    }]
  });

  const params = { headers: { 'Content-Type': 'application/json' } };
  const res = http.post(WEBHOOK_URL, payload, params);
  webhookDuration.add(res.timings.duration);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'transaction time OK': (r) => r.timings.duration < 500,
  });

  if (ok) { webhookSuccess.add(1); } else { webhookErrors.add(1); webhookSuccess.add(0); }
  sleep(1);
}

export function handleSummary(data) {
  const m = data.metrics;
  const result = {
    timestamp: new Date().toISOString(),
    total_runs: m.webhook_success?.values?.count || 0,
    success_rate: ((m.webhook_success?.values?.rate || 0) * 100).toFixed(2) + '%',
    errors: m.webhook_errors?.values?.count || 0,
    avg_duration: (m.webhook_duration?.values?.avg || 0).toFixed(1) + 'ms',
    p95_duration: (m.webhook_duration?.values?.['p(95)'] || 0).toFixed(1) + 'ms',
  };
  return {
    'tests/k6/chaos-results.json': JSON.stringify(result, null, 2),
    stdout: JSON.stringify(result, null, 2) + '\n',
  };
}
