import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const webhookSuccess = new Rate('webhook_success');
const webhookDuration = new Trend('webhook_duration', true);
const webhookErrors = new Counter('webhook_errors');
const totalVUs = new Counter('total_vus');

const WEBHOOK_URL = __ENV.WEBHOOK_URL || 'http://localhost:1880/alert-webhook';
const GRAFANA_URL = __ENV.GRAFANA_URL || 'http://localhost:3000';
const PROMETHEUS_URL = __ENV.PROMETHEUS_URL || 'http://localhost:9090';

const MACHINES = [
  'ERP-MASTER-UBUNTU', 'ERP-MASTER-WINDOWS', 'LDIA-FACTORY',
  'LDIB-FACTORY', 'PLC-LINE-01', 'SCADA-SERVER', 'HMI-STATION-A',
  'MES-GATEWAY', 'OPC-UA-BRIDGE', 'IOT-EDGE-01'
];

const SEVERITY_POOL = ['critical', 'warning', 'info'];
const ALERT_NAMES = [
  'HighCpuLoad', 'ThermalRunaway', 'DiskAlmostFull',
  'NetworkInterfaceDown', 'LDIPE_Drift', 'LDI_VibrationCritical',
  'WifiPacketLoss', 'ServiceDown', 'InterfaceFlapping',
  'BandwidthZScoreAnomaly'
];

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 100,
      duration: '2m',
    },
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 500 },
        { duration: '10s', target: 1000 },
        { duration: '20s', target: 1000 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    webhook_success: ['rate>0.95'],
    webhook_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAlertPayload(vuId) {
  const machineId = MACHINES[vuId % MACHINES.length];
  const alertName = randomItem(ALERT_NAMES);
  const severity = randomItem(SEVERITY_POOL);
  const now = new Date().toISOString();

  return JSON.stringify({
    status: 'firing',
    receiver: 'ims-webhook',
    groupLabels: { alertname: alertName },
    alerts: [{
      status: 'firing',
      labels: {
        severity: severity,
        alertname: alertName,
        instance: `${machineId}:9100`,
        machine_id: machineId,
        job: 'node-exporter',
      },
      annotations: {
        summary: `[${severity.toUpperCase()}] ${alertName} on ${machineId}`,
        description: `Automated chaos load test — VU ${vuId} at ${now}`,
        runbook_url: 'https://wiki.internal/ims/runbooks/' + alertName,
      },
      startsAt: now,
      endsAt: '0001-01-01T00:00:00Z',
      generatorURL: `http://prometheus:9090/graph?g0.expr=${alertName}`,
    }],
  });
}

export default function () {
  const vuId = __VU;
  totalVUs.add(1);

  group('Alert Webhook — Spike Chaos', () => {
    const payload = generateAlertPayload(vuId);
    const params = {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    };

    const res = http.post(WEBHOOK_URL, payload, params);
    webhookDuration.add(res.timings.duration);

    const ok = check(res, {
      'webhook status 200': (r) => r.status === 200,
      'response time < 1s': (r) => r.timings.duration < 1000,
      'no server error': (r) => r.status < 500,
    });

    if (ok) {
      webhookSuccess.add(1);
    } else {
      webhookErrors.add(1);
      webhookSuccess.add(0);
    }
  });

  group('Grafana Health Check', () => {
    if (vuId % 50 === 0) {
      const res = http.get(`${GRAFANA_URL}/api/health`, { timeout: '5s' });
      check(res, { 'grafana healthy': (r) => r.status === 200 });
    }
  });

  group('Prometheus Health Check', () => {
    if (vuId % 50 === 0) {
      const res = http.get(`${PROMETHEUS_URL}/-/healthy`, { timeout: '5s' });
      check(res, { 'prometheus healthy': (r) => r.status === 200 });
    }
  });

  sleep(Math.random() * 2 + 0.5);
}

export function handleSummary(data) {
  const m = data.metrics;
  const result = {
    timestamp: new Date().toISOString(),
    scenario: 'k6-worldclass-chaos',
    total_requests: m.webhook_success?.values?.count || 0,
    success_rate: ((m.webhook_success?.values?.rate || 0) * 100).toFixed(2) + '%',
    errors: m.webhook_errors?.values?.count || 0,
    avg_duration_ms: (m.webhook_duration?.values?.avg || 0).toFixed(1),
    p95_duration_ms: (m.webhook_duration?.values?.['p(95)'] || 0).toFixed(1),
    p99_duration_ms: (m.webhook_duration?.values?.['p(99)'] || 0).toFixed(1),
    max_duration_ms: (m.webhook_duration?.values?.max || 0).toFixed(1),
    verdict: (m.webhook_success?.values?.rate || 0) >= 0.95 ? 'PASS — World-Class Grade' : 'FAIL — Needs Optimization',
  };

  return {
    'tests/k6/worldclass-results.json': JSON.stringify(result, null, 2),
    stdout: JSON.stringify(result, null, 2) + '\n',
  };
}
