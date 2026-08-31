'use strict';

const { MACHINE_STATUS } = require('./status-model');

const DEFAULT_STALE_SECONDS = 900;

// event_time and id are both required for deterministic ordering. The source
// can emit STOP and RUN with the same event_time; the later id is the final
// observation in that timestamp group.
const MACHINE_EVENT_SQL = `
WITH requested AS (
  SELECT UNNEST($1::text[]) AS equipment_id
),
latest_status AS (
  SELECT DISTINCT ON (equipment_id)
    equipment_id,
    id,
    event_type,
    event_code,
    event_message,
    event_time,
    received_at
  FROM public.machine_event
  WHERE equipment_id = ANY($1::text[])
    AND message_type = 'status'
  ORDER BY equipment_id, event_time DESC, id DESC
),
latest_error_reference AS (
  SELECT DISTINCT ON (equipment_id)
    equipment_id,
    id,
    event_code,
    event_message,
    event_time,
    level,
    error_description,
    troubleshooting_method,
    error_master_source
  FROM public.machine_event
  WHERE equipment_id = ANY($1::text[])
    AND message_type = 'alarm'
    -- M-level 0204 rows in the supplied evidence are alarm-duration messages,
    -- not a new equipment error. Keep the latest decoded error reference.
    AND (
      UPPER(COALESCE(level, '')) = 'E'
      OR error_description IS NOT NULL
      OR troubleshooting_method IS NOT NULL
    )
  ORDER BY equipment_id, event_time DESC, id DESC
)
SELECT
  requested.equipment_id,
  latest_status.id AS status_id,
  latest_status.event_type AS status_event_type,
  latest_status.event_code AS status_event_code,
  latest_status.event_message AS status_event_message,
  latest_status.event_time AS status_event_time,
  latest_status.received_at AS status_received_at,
  latest_error_reference.id AS error_id,
  latest_error_reference.event_code AS error_code,
  latest_error_reference.event_message AS error_message,
  latest_error_reference.event_time AS error_event_time,
  latest_error_reference.level AS error_level,
  latest_error_reference.error_description,
  latest_error_reference.troubleshooting_method,
  latest_error_reference.error_master_source
FROM requested
LEFT JOIN latest_status USING (equipment_id)
LEFT JOIN latest_error_reference USING (equipment_id)
ORDER BY requested.equipment_id`;

function normalizeStaleSeconds(value = DEFAULT_STALE_SECONDS) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('MACHINE_EVENT_STALE_SECONDS must be a positive number');
  }
  return seconds;
}

function mapMachineEventStatus(row, {
  nowMs = Date.now(),
  staleSeconds = DEFAULT_STALE_SECONDS,
} = {}) {
  const maxAgeSeconds = normalizeStaleSeconds(staleSeconds);
  if (!row?.status_event_time) {
    return {
      status: MACHINE_STATUS.UNDEFINED,
      basis: 'machine_event_status_not_found',
      confidence: 'SOURCE',
      updated_at: null,
    };
  }

  const eventMs = new Date(row.status_event_time).getTime();
  if (!Number.isFinite(eventMs)) {
    return {
      status: MACHINE_STATUS.UNDEFINED,
      basis: 'machine_event_time_invalid',
      confidence: 'SOURCE',
      updated_at: null,
    };
  }

  if (Math.max(0, nowMs - eventMs) > maxAgeSeconds * 1000) {
    return {
      status: MACHINE_STATUS.UNDEFINED,
      basis: 'machine_event_status_stale',
      confidence: 'SOURCE',
      updated_at: new Date(eventMs).toISOString(),
    };
  }

  const eventType = String(row.status_event_type || '').trim().toUpperCase();
  if (eventType === 'RUN') {
    return {
      status: MACHINE_STATUS.RUN,
      basis: 'machine_event_status_run',
      confidence: 'SOURCE',
      updated_at: new Date(eventMs).toISOString(),
    };
  }
  if (eventType === 'STOP') {
    return {
      status: MACHINE_STATUS.INITIAL_PM_STOP,
      basis: 'machine_event_status_stop',
      confidence: 'SOURCE',
      updated_at: new Date(eventMs).toISOString(),
    };
  }

  return {
    status: MACHINE_STATUS.UNDEFINED,
    basis: 'machine_event_status_unmapped',
    confidence: 'SOURCE',
    updated_at: new Date(eventMs).toISOString(),
  };
}

function latestErrorReference(row) {
  if (!row?.error_id) return null;
  return {
    id: row.error_id,
    code: row.error_code || null,
    message: row.error_message || null,
    event_time: row.error_event_time || null,
    level: row.error_level || null,
    description: row.error_description || null,
    troubleshooting: row.troubleshooting_method || null,
    master_source: row.error_master_source || null,
    lifecycle_status: 'HISTORICAL_REFERENCE_ONLY',
    active: false,
  };
}

async function readMachineEventRows(pool, equipmentIds) {
  if (!Array.isArray(equipmentIds) || equipmentIds.length === 0) {
    return { rows: new Map(), available: true, error: null };
  }
  try {
    const result = await pool.query(MACHINE_EVENT_SQL, [equipmentIds]);
    return {
      rows: new Map(result.rows.map((row) => [row.equipment_id, row])),
      available: true,
      error: null,
    };
  } catch (error) {
    return { rows: new Map(), available: false, error: error.message };
  }
}

module.exports = {
  DEFAULT_STALE_SECONDS,
  MACHINE_EVENT_SQL,
  latestErrorReference,
  mapMachineEventStatus,
  normalizeStaleSeconds,
  readMachineEventRows,
};
