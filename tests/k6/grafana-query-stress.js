// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMS K6 Stress Test — Grafana Query Performance
// Simulates NOC users viewing dashboards simultaneously
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import http from 'k6/http';
import { check, sleep, textSummary } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const querySuccess = new Rate('query_success');
const queryDuration = new Trend('query_duration', true);
const queryErrors = new Counter('query_errors');

const GRAFANA_URL = __ENV.GRAFANA_URL || 'http://localhost:3000';
const GRAFANA_USER = __ENV.GRAFANA_USER || 'admin';
const GRAFANA_PASS = __ENV.GRAFANA_PASS || 'admin';
const CONCURRENT_USERS = Number.parseInt(__ENV.CONCURRENT_USERS || '50', 10);

export const options = {
  stages: [
    { duration: '30s', target: Math.min(CONCURRENT_USERS, 10) },
    { duration: '1m', target: Math.min(CONCURRENT_USERS, 25) },
    { duration: '2m', target: CONCURRENT_USERS },
    { duration: '2m', target: CONCURRENT_USERS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    query_success: ['rate>0.90'],
  },
};

const QUERIES = [
  {
    name: 'NOC_Fleet_Uptime',
    sql: "SELECT CASE WHEN COUNT(*) FILTER (WHERE health_status = 'online') = COUNT(*) THEN 100.0 ELSE ROUND((COUNT(*) FILTER (WHERE health_status = 'online')::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) END AS value FROM public.v_uptime_summary",
  },
  {
    name: 'NOC_CPU_AllMachines',
    sql: "SELECT time_bucket('1 minute', \"time\") AS \"time\", machine_id, AVG(cpu_load_percent) AS \"CPU\" FROM public.machine_telemetry WHERE \"time\" > NOW() - INTERVAL '1 hour' GROUP BY 1, 2 ORDER BY 1",
  },
  {
    name: 'NOC_Temperature',
    sql: "SELECT time_bucket('1 minute', \"time\") AS \"time\", machine_id, AVG(temp_c) AS \"Temp\" FROM public.machine_telemetry WHERE \"time\" > NOW() - INTERVAL '1 hour' AND temp_c > 0 GROUP BY 1, 2 ORDER BY 1",
  },
  {
    name: 'Engineering_Detail',
    sql: "SELECT \"time\", cpu_load_percent, ram_used_mb, disk_used_gb, temp_c, rx_mbps FROM public.machine_telemetry WHERE machine_id = 'ERP-MASTER-UBUNTU' AND \"time\" > NOW() - INTERVAL '1 hour' ORDER BY \"time\" DESC LIMIT 100",
  },
  {
    name: 'Capacity_DiskTrend',
    sql: "SELECT time_bucket('1 day', \"time\") AS \"time\", machine_id, AVG(disk_used_gb) AS \"Used\" FROM public.machine_telemetry WHERE \"time\" > NOW() - INTERVAL '30 days' GROUP BY 1, 2 ORDER BY 1",
  },
];

function getAuthToken() {
  const loginRes = http.post(
    `${GRAFANA_URL}/login`,
    JSON.stringify({ user: GRAFANA_USER, password: GRAFANA_PASS }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status === 200) {
    return loginRes.json('token');
  }
  return null;
}

export function setup() {
  const token = getAuthToken();
  if (!token) {
    console.error('Failed to authenticate with Grafana');
  }
  return { token };
}

export default function (data) {
  if (!data.token) {
    queryErrors.add(1);
    querySuccess.add(0);
    return;
  }

  const query = QUERIES[__VU % QUERIES.length];

  const startTime = Date.now();
  const res = http.post(
    `${GRAFANA_URL}/api/ds/query`,
    JSON.stringify({
      queries: [{
        refId: 'A',
        datasource: { uid: 'timescaledb' },
        rawSql: query.sql,
        format: 'table',
      }],
      from: 'now-1h',
      to: 'now',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.token}`,
      },
      tags: { name: query.name },
    }
  );
  const duration = Date.now() - startTime;

  queryDuration.add(duration);

  const ok = check(res, {
    'query status 200': (r) => r.status === 200,
    'query has data': (r) => {
      try {
        const body = r.json();
        return body && body.results && body.results.A;
      } catch {
        return false;
      }
    },
  });

  if (ok) {
    querySuccess.add(1);
  } else {
    queryErrors.add(1);
    querySuccess.add(0);
  }

  sleep(Math.random() * 5 + 1);
}

export function handleSummary(data) {
  const metrics = data.metrics;
  return {
    'tests/k6/grafana-query-results.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      total_queries: (metrics.query_duration?.values?.count) || 0,
      success_rate: metrics.query_success?.values?.rate || 0,
      avg_query_duration: metrics.query_duration?.values?.avg || 0,
      p95_query_duration: metrics.query_duration?.values?.['p(95)'] || 0,
      p99_query_duration: metrics.query_duration?.values?.['p(99)'] || 0,
      errors: metrics.query_errors?.values?.count || 0,
    }, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
