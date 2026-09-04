'use strict';

const { MACHINE_STATUS, normalizeSourceStatus } = require('./status-model');

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CACHE_MS = 2000;

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function validateStatusApiUrl(value) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('MACHINE_STATUS_API_URL must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('MACHINE_STATUS_API_URL must use http or https');
  }
  return parsed.toString();
}

function normalizeStatusApiRow(row) {
  if (!row || typeof row !== 'object') return null;
  const sourceId = optionalText(row.machine_id ?? row.source_id ?? row.device_id ?? row.asset_id);
  if (!sourceId) return null;
  const rawStatus = row.operational_state ?? row.status ?? row.state;
  const status = normalizeSourceStatus(rawStatus);
  return {
    source_id: sourceId,
    status,
    basis: optionalText(row.state_basis ?? row.basis) || (
      status === MACHINE_STATUS.UNDEFINED ? 'status_api_value_unmapped' : 'status_api_six_state'
    ),
    confidence: optionalText(row.state_confidence ?? row.confidence) || 'AUTHORITATIVE_SOURCE',
    updated_at: optionalText(row.updated_at ?? row.timestamp ?? row.time),
    board_no: row.board_no ?? null,
    total_board: row.total_board ?? null,
    mo: row.mo ?? null,
    factory: row.factory ?? null,
  };
}

function createStatusApiClient({
  url,
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheMs = DEFAULT_CACHE_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoint = validateStatusApiUrl(url);
  const timeout = Number(timeoutMs);
  const cacheDuration = Number(cacheMs);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('MACHINE_STATUS_API_TIMEOUT_MS must be positive');
  if (!Number.isFinite(cacheDuration) || cacheDuration < 0) throw new Error('MACHINE_STATUS_API_CACHE_MS must be non-negative');
  if (endpoint && typeof fetchImpl !== 'function') throw new Error('status API requires fetch support');

  let cachedAt = 0;
  let cachedRows = new Map();
  let inFlight = null;

  async function requestRows() {
    if (!endpoint) return new Map();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const headers = { accept: 'application/json' };
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetchImpl(endpoint, { headers, signal: controller.signal });
      if (!response.ok) throw new Error(`status API returned HTTP ${response.status}`);
      const body = await response.json();
      const sourceRows = Array.isArray(body) ? body : body?.machines;
      if (!Array.isArray(sourceRows)) throw new Error('status API response must be an array or { machines: [] }');
      return new Map(
        sourceRows
          .map(normalizeStatusApiRow)
          .filter(Boolean)
          .map((row) => [row.source_id, row]),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function getRows() {
    if (!endpoint) return { rows: new Map(), available: false, error: 'status_api_not_configured' };
    if (Date.now() - cachedAt <= cacheDuration) return { rows: cachedRows, available: true, error: null };
    if (!inFlight) {
      inFlight = requestRows()
        .then((rows) => {
          cachedRows = rows;
          cachedAt = Date.now();
          return { rows, available: true, error: null };
        })
        .catch((error) => ({ rows: new Map(), available: false, error: error.message }))
        .finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  return { endpoint, getRows };
}

module.exports = {
  createStatusApiClient,
  normalizeStatusApiRow,
  validateStatusApiUrl,
};
