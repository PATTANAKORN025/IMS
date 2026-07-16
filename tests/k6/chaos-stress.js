// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMS K6 Chaos Stress Test — 1000 VUs + Network Outage Simulation
// Tests parser defensive logic under extreme chaos conditions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ── Custom Metrics ──
const pipelineSuccess   = new Rate('pipeline_success');
const pipelineDuration  = new Trend('pipeline_duration', true);
const httpErrors        = new Counter('http_errors');
const malformedSent     = new Counter('malformed_payloads_sent');
const emptySent         = new Counter('empty_payloads_sent');
const chaosLatencyTotal = new Counter('chaos_latency_ms');

// ── Configuration ──
const NODERED_URL    = __ENV.NODERED_URL    || 'http://127.0.0.1:1880';
const INGEST_API_KEY = __ENV.INGEST_API_KEY || 'ims-secret-key';
const TARGET_VUS     = Number.parseInt(__ENV.TARGET_VUS || '1000', 10);
const FAULT_RATE     = 0.05;   // 5% of requests deliberately fail
const MALFORM_RATE   = 0.10;   // 10% send empty or malformed payload
const FLEET_SIZE     = 1024;   // Simulated 1000+ device fleet

// ── Scenario Definition ──
export const options = {
  scenarios: {
    chaos_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s',  target: Math.min(TARGET_VUS, 100) },  // warm up
        { duration: '1m',   target: Math.min(TARGET_VUS, 500) },  // ramp to 500
        { duration: '2m',   target: TARGET_VUS },                   // sustain 1000
        { duration: '1m',   target: Math.min(TARGET_VUS, 500) },  // cooldown
        { duration: '30s',  target: 0 },                            // drain
      ],
    },
  },
  thresholds: {
    pipeline_success:     ['rate>0.90'],     // 90%+ success under chaos
    pipeline_duration:    ['p(95)<200'],     // 95% of requests < 200ms
    http_errors:          ['count<500'],     // < 500 total HTTP errors
    malformed_payloads_sent: ['count>0'],    // ensure chaos is actually firing
    empty_payloads_sent:     ['count>0'],    // ensure chaos is actually firing
  },
};

// ── Payload Generators ──

function generateValidPayload(deviceIndex) {
  const cores = 1 + (deviceIndex % 16);
  const baseCpu = 10 + (deviceIndex % 80);
  return JSON.stringify({
    machine_id: `E2E-SERVER-${String(deviceIndex % FLEET_SIZE).padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    cpu: { cores: cores, load: baseCpu + Math.random() * 10 },
    temp: { maxC: 35 + Math.random() * 30 },
    ram: { totalMb: 8192 + deviceIndex * 1024, usedMb: 2048 + deviceIndex * 512 },
    disk: { totalGb: 500, usedGb: 100 + deviceIndex * 5 },
    interfaces: [
      { name: `eth${deviceIndex % 4}`, status: 'ON', rx_mbps: Math.random() * 100, tx_mbps: Math.random() * 50 },
    ],
  });
}

function generateEmptyPayload() {
  return JSON.stringify({ machine_id: '', payload: [] });
}

function generateMalformedPayload(deviceIndex) {
  const variants = [
    '{}',                                                   // empty object
    '{"machine_id": null}',                                 // null machine_id
    '{"machine_id": "X", "cpu": "not-a-number"}',           // wrong type
    'THIS IS NOT JSON',                                     // garbage string
    '{"machine_id": "X"}{"machine_id": "Y"}',               // double JSON
    JSON.stringify({ machine_id: `E2E-SERVER-${deviceIndex}`, cpu: { load: -99999 } }),
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

// ── Main Test Function ──
export default function () {
  const vuId = __VU;
  const iterId = __ITER;
  const deviceIndex = (vuId + iterId) % FLEET_SIZE;

  // ── Chaos Decision Tree ──
  const roll = Math.random();
  let payload;
  let headers;
  let expectSuccess = true;

  if (roll < MALFORM_RATE) {
    // 10%: Send empty or malformed payload (parser defensive test)
    if (Math.random() < 0.5) {
      payload = generateEmptyPayload();
      emptySent.add(1);
    } else {
      payload = generateMalformedPayload(deviceIndex);
      malformedSent.add(1);
    }
    headers = { 'Content-Type': 'application/json', 'x-api-key': INGEST_API_KEY };
    expectSuccess = true;  // Parser should handle gracefully, return 200

  } else if (roll < MALFORM_RATE + FAULT_RATE) {
    // 5%: Simulate network failure (wrong key, wrong URL)
    payload = generateValidPayload(deviceIndex);
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': 'WRONG-KEY-CHAOStest',  // Will fail auth
    };
    expectSuccess = false;

  } else {
    // 85%: Normal valid request with simulated latency
    payload = generateValidPayload(deviceIndex);
    headers = { 'Content-Type': 'application/json', 'x-api-key': INGEST_API_KEY };

    // Inject random 500-3000ms latency via sleep before sending
    const latencyMs = 500 + Math.random() * 2500;
    chaosLatencyTotal.add(Math.floor(latencyMs));
    sleep(latencyMs / 1000);
  }

  // ── Send Request ──
  const start = Date.now();
  const res = http.post(`${NODERED_URL}/inject`, payload, {
    headers: headers,
    tags: { name: 'chaos_inject' },
    timeout: '10s',
  });
  const duration = Date.now() - start;
  pipelineDuration.add(duration);

  // ── Assertions ──
  if (expectSuccess) {
    const ok = check(res, {
      'accepted (200/204)': (r) => r.status === 200 || r.status === 204,
      'response < 200ms':   (r) => r.timings.duration < 200,
    });
    pipelineSuccess.add(ok ? 1 : 0);
    if (!ok) httpErrors.add(1);
  } else {
    // Auth failure is expected — track it but don't count as pipeline success
    const authFail = check(res, {
      'auth rejected (401/403)': (r) => r.status === 401 || r.status === 403,
    });
    pipelineSuccess.add(0);
    if (!authFail) httpErrors.add(1);
  }

  // Realistic think time between requests
  sleep(Math.random() * 2 + 0.5);
}

// ── Summary Handler ──
export function handleSummary(data) {
  const m = data?.metrics;
  if (!m) return { stdout: 'No metrics collected' };

  const result = {
    timestamp: new Date().toISOString(),
    config: {
      target_vus: TARGET_VUS,
      fleet_size: FLEET_SIZE,
      fault_rate: FAULT_RATE,
      malformed_rate: MALFORM_RATE,
    },
    results: {
      total_iterations:    m.pipeline_success?.values?.count || 0,
      success_rate:        ((m.pipeline_success?.values?.rate || 0) * 100).toFixed(2) + '%',
      http_errors:         m.http_errors?.values?.count || 0,
      malformed_sent:      m.malformed_payloads_sent?.values?.count || 0,
      empty_sent:          m.empty_payloads_sent?.values?.count || 0,
      avg_duration_ms:     Math.round(m.pipeline_duration?.values?.avg || 0),
      p95_duration_ms:     Math.round(m.pipeline_duration?.values?.['p(95)'] || 0),
      p99_duration_ms:     Math.round(m.pipeline_duration?.values?.['p(99)'] || 0),
      chaos_latency_ms:    m.chaos_latency_ms?.values?.count || 0,
    },
    verdict: 'PASS',
  };

  const rate = m.pipeline_success?.values?.rate || 0;
  if (rate < 0.90) result.verdict = 'FAIL — success rate below 90% under chaos';

  return {
    'tests/k6/chaos-results.json': JSON.stringify(result, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
