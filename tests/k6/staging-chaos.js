/**
 * K6 Staging Chaos Engineering — Continuous Fault Injection
 *
 * Runs against staging environment with automated fault injection:
 * - PgBouncer kill/restart cycles
 * - Network delay injection
 * - Alertmanager outage simulation
 *
 * Usage:
 *   k6 run tests/k6/staging-chaos.js
 *   k6 run --env TARGET_VUS=200 --env CHAOS_MODE=all tests/k6/staging-chaos.js
 *
 * Environment variables:
 *   WEBHOOK_URL  — Node-RED alert webhook endpoint
 *   TARGET_VUS   — Virtual users (default 500)
 *   CHAOS_MODE   — pgbouncer | alertmanager | network | all (default pgbouncer)
 *   CHAOS_INTERVAL — Seconds between chaos events (default 60)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { exec } from 'k6/exec';

const webhookSuccess = new Rate('webhook_success');
const webhookDuration = new Trend('webhook_duration', true);
const webhookErrors = new Counter('webhook_errors');
const chaosEvents = new Counter('chaos_events');
const dataLoss = new Counter('data_loss_events');

const WEBHOOK_URL = __ENV.WEBHOOK_URL || 'http://localhost:1880/alert-webhook';
const TARGET_VUS = Number.parseInt(__ENV.TARGET_VUS || '500', 10);
const CHAOS_MODE = __ENV.CHAOS_MODE || 'pgbouncer';
const CHAOS_INTERVAL = Number.parseInt(__ENV.CHAOS_INTERVAL || '60', 10);

export const options = {
  stages: [
    { duration: '15s', target: Math.floor(TARGET_VUS * 0.3) },
    { duration: '30s', target: TARGET_VUS },
    { duration: '2m', target: TARGET_VUS },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    webhook_success: ['rate>0.85'],
    webhook_duration: ['p(95)<3000'],
  },
};

let lastChaosTime = 0;

function injectFault() {
  const now = Date.now() / 1000;
  if (now - lastChaosTime < CHAOS_INTERVAL) return;
  lastChaosTime = now;

  try {
    if (CHAOS_MODE === 'pgbouncer' || CHAOS_MODE === 'all') {
      exec.run('docker compose kill pgbouncer');
      chaosEvents.add(1);
      console.log('[CHAOS] PgBouncer killed');
      sleep(15);
      exec.run('docker compose up -d pgbouncer');
      console.log('[CHAOS] PgBouncer restored');
    }
    if (CHAOS_MODE === 'alertmanager' || CHAOS_MODE === 'all') {
      exec.run('docker compose kill alertmanager');
      chaosEvents.add(1);
      console.log('[CHAOS] Alertmanager killed');
      sleep(10);
      exec.run('docker compose up -d alertmanager');
      console.log('[CHAOS] Alertmanager restored');
    }
    if (CHAOS_MODE === 'network') {
      exec.run('docker compose exec node-red tc qdisc add dev eth0 root netem delay 500ms');
      chaosEvents.add(1);
      console.log('[CHAOS] 500ms network delay injected');
      sleep(20);
      exec.run('docker compose exec node-red tc qdisc del dev eth0 root');
      console.log('[CHAOS] Network delay removed');
    }
  } catch (e) {
    console.log('[CHAOS] Fault injection error:', e.message);
  }
}

export default function () {
  injectFault();

  const payload = JSON.stringify({
    status: 'firing',
    alerts: [{
      labels: { severity: 'warning', alertname: 'ChaosTest', machine_id: 'CHAOS-' + __VU },
      annotations: { description: `Staging chaos VU=${__VU} mode=${CHAOS_MODE}` }
    }]
  });

  const res = http.post(WEBHOOK_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  });

  webhookDuration.add(res.timings.duration);
  const ok = check(res, { 'status 200': (r) => r.status === 200 });
  if (ok) webhookSuccess.add(1); else { webhookErrors.add(1); webhookSuccess.add(0); }
  sleep(0.5);
}

export function handleSummary(data) {
  const m = data.metrics;
  const result = {
    timestamp: new Date().toISOString(),
    config: { vus: TARGET_VUS, chaos: CHAOS_MODE, interval: CHAOS_INTERVAL },
    total_requests: m.webhook_success?.values?.count || 0,
    success_rate: ((m.webhook_success?.values?.rate || 0) * 100).toFixed(1) + '%',
    errors: m.webhook_errors?.values?.count || 0,
    chaos_events: m.chaos_events?.values?.count || 0,
    p95_latency: (m.webhook_duration?.values?.['p(95)'] || 0).toFixed(1) + 'ms',
    verdict: (m.webhook_success?.values?.rate || 0) > 0.85 ? 'PASS' : 'FAIL',
  };
  return {
    'tests/k6/staging-chaos-results.json': JSON.stringify(result, null, 2),
    stdout: JSON.stringify(result, null, 2) + '\n',
  };
}
