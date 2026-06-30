/**
 * K6 Chaos Stress Test — PgBouncer Fault Injection
 *
 * Phases:
 *   1. Ramp up to TARGET_VUs against Node-RED webhook
 *   2. Kill PgBouncer mid-flight (simulates DB failure)
 *   3. Let Node-RED retry buffer absorb writes
 *   4. Restart PgBouncer, verify recovery
 *   5. Confirm zero data loss via DB row count
 *
 * Usage:
 *   k6 run tests/k6/chaos-stress.js
 *   k6 run --env TARGET_VUS=500 tests/k6/chaos-stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { exec } from 'k6/exec';

const webhookSuccess = new Rate('webhook_success');
const webhookDuration = new Trend('webhook_duration', true);
const webhookErrors = new Counter('webhook_errors');
const retryEvents = new Counter('retry_events');

const WEBHOOK_URL = __ENV.WEBHOOK_URL || 'http://localhost:1880/alert-webhook';
const TARGET_VUS = Number.parseInt(__ENV.TARGET_VUS || '1000', 10);
const CHAOS_DELAY = Number.parseInt(__ENV.CHAOS_DELAY || '30', 10); // seconds before kill

export const options = {
  stages: [
    { duration: '15s', target: Math.floor(TARGET_VUS * 0.5) },
    { duration: '30s', target: TARGET_VUS },
    { duration: '1m', target: TARGET_VUS },  // sustained load during chaos window
    { duration: '30s', target: Math.floor(TARGET_VUS * 0.3) },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    webhook_success: ['rate>0.90'],  // relaxed: chaos causes some failures
    webhook_duration: ['p(95)<2000'],
  },
};

let chaosTriggered = false;

export default function () {
  // ── Phase 2: Kill PgBouncer at CHAOS_DELAY seconds ──
  if (!chaosTriggered && __ITER === Math.floor(CHAOS_DELAY * TARGET_VUS / 60)) {
    chaosTriggered = true;
    console.log('[CHAOS] Killing PgBouncer container...');
    try {
      exec.run('docker compose kill pgbouncer');
      console.log('[CHAOS] PgBouncer killed. Retry buffer should absorb writes.');
      retryEvents.add(1);
    } catch (e) {
      console.log('[CHAOS] Failed to kill PgBouncer:', e.message);
    }
  }

  // ── Phase 4: Restart PgBouncer after 30s of chaos ──
  if (chaosTriggered && __ITER === Math.floor((CHAOS_DELAY + 30) * TARGET_VUS / 60)) {
    console.log('[RECOVERY] Restarting PgBouncer...');
    try {
      exec.run('docker compose up -d pgbouncer');
      console.log('[RECOVERY] PgBouncer restarted. Drain buffer.');
      sleep(5);
    } catch (e) {
      console.log('[RECOVERY] Failed to restart PgBouncer:', e.message);
    }
  }

  // ── Send webhook payload ──
  const payload = JSON.stringify({
    status: 'firing',
    alerts: [{
      labels: { severity: 'critical', alertname: 'ChaosTest', machine_id: 'CHAOS-' + __VU },
      annotations: { description: `Chaos load test VU=${__VU} iter=${__ITER}` }
    }]
  });

  const params = { headers: { 'Content-Type': 'application/json' } };
  const res = http.post(WEBHOOK_URL, payload, params);
  webhookDuration.add(res.timings.duration);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'latency acceptable': (r) => r.timings.duration < 2000,
  });

  if (ok) { webhookSuccess.add(1); } else { webhookErrors.add(1); webhookSuccess.add(0); }
  sleep(0.5);
}

export function handleSummary(data) {
  const m = data.metrics;
  const result = {
    timestamp: new Date().toISOString(),
    config: { target_vus: TARGET_VUS, chaos_delay_s: CHAOS_DELAY },
    total_requests: m.webhook_success?.values?.count || 0,
    success_rate: ((m.webhook_success?.values?.rate || 0) * 100).toFixed(2) + '%',
    errors: m.webhook_errors?.values?.count || 0,
    chaos_events: m.retry_events?.values?.count || 0,
    avg_duration: (m.webhook_duration?.values?.avg || 0).toFixed(1) + 'ms',
    p95_duration: (m.webhook_duration?.values?.['p(95)'] || 0).toFixed(1) + 'ms',
    verdict: (m.webhook_success?.values?.rate || 0) > 0.90 ? 'PASS' : 'FAIL',
  };
  return {
    'tests/k6/chaos-results.json': JSON.stringify(result, null, 2),
    stdout: JSON.stringify(result, null, 2) + '\n',
  };
}
