import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 200 },
    { duration: '30s', target: 1000 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const payload = JSON.stringify({
    status: 'firing',
    alerts: [{
      labels: { severity: 'critical', alertname: 'LDI_Chaos_Test', machine_id: `LDIA-${__VU}` },
      annotations: { description: 'Agent AI Automated Load Test' }
    }]
  });
  const res = http.post('http://localhost:1880/alert-webhook', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'status 200 OK': (r) => r.status === 200 });
  sleep(1);
}
