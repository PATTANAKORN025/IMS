'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStatusApiClient, normalizeStatusApiRow, validateStatusApiUrl } = require('../status-api');

test('normalizes the six-state API contract and common identity fields', () => {
  assert.deepEqual(normalizeStatusApiRow({ machine_id: 'DRL-001', status: 'Initial, PM, Stop' }), {
    source_id: 'DRL-001',
    status: 'INITIAL_PM_STOP',
    basis: 'status_api_six_state',
    confidence: 'AUTHORITATIVE_SOURCE',
    updated_at: null,
    board_no: null,
    total_board: null,
    mo: null,
    factory: null,
  });
  assert.equal(normalizeStatusApiRow({ status: 'Run' }), null);
});

test('rejects unsupported protocols and accepts internal HTTP service URLs', () => {
  assert.throws(() => validateStatusApiUrl('file:///secret'), /http or https/);
  assert.equal(validateStatusApiUrl('http://cfm-status-api:8080/state'), 'http://cfm-status-api:8080/state');
});

test('fetches and caches one fleet response instead of one request per machine', async () => {
  let calls = 0;
  const client = createStatusApiClient({
    url: 'http://status-api.local/state',
    cacheMs: 5000,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({ machines: [
          { machine_id: 'DRL-001', status: 'Run' },
          { machine_id: 'DRL-002', status: 'Down' },
        ] }),
      };
    },
  });

  const first = await client.getRows();
  const second = await client.getRows();
  assert.equal(first.rows.get('DRL-001').status, 'RUN');
  assert.equal(first.rows.get('DRL-002').status, 'DOWN');
  assert.equal(second.available, true);
  assert.equal(calls, 1);
});

test('fails closed to unavailable without manufacturing a state', async () => {
  const client = createStatusApiClient({
    url: 'http://status-api.local/state',
    fetchImpl: async () => { throw new Error('offline'); },
  });
  const result = await client.getRows();
  assert.equal(result.available, false);
  assert.equal(result.rows.size, 0);
  assert.equal(result.error, 'offline');
});
