'use strict';

const { MACHINE_STATUS } = require('./status-model');

// Zero means "latest known state": keep displaying the newest source record
// regardless of age. The timestamp remains visible so operators can judge age.
// Deployments that require freshness expiry can set a positive number.
const DEFAULT_STALE_SECONDS = 0;

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
latest_program AS (
  SELECT DISTINCT ON (equipment_id)
    equipment_id,
    id,
    event_message,
    event_time
  FROM public.machine_event
  WHERE equipment_id = ANY($1::text[])
    AND message_type = 'event'
    AND event_type = 'PROGRAM_LOAD'
  ORDER BY equipment_id, event_time DESC, id DESC
),
latest_tool_measurement AS (
  SELECT DISTINCT ON (equipment_id)
    equipment_id,
    id,
    event_message,
    event_time
  FROM public.machine_event
  WHERE equipment_id = ANY($1::text[])
    AND message_type = 'event'
    AND event_message ~* 'tool diameter:'
  ORDER BY equipment_id, event_time DESC, id DESC
),
latest_hits AS (
  SELECT DISTINCT ON (equipment_id)
    equipment_id,
    id,
    event_message,
    event_time
  FROM public.machine_event
  WHERE equipment_id = ANY($1::text[])
    AND message_type = 'status'
    AND event_message ~* '^Run Hits:[[:space:]]*[0-9]+'
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
),
latest_error_with_context AS (
  SELECT
    latest_error_reference.*,
    context.error_context
  FROM latest_error_reference
  LEFT JOIN LATERAL (
    SELECT STRING_AGG(
      CONCAT_WS(' ', recent.event_type, recent.event_code, recent.event_message),
      ' | ' ORDER BY recent.event_time, recent.id
    ) AS error_context
    FROM (
      SELECT id, event_time, event_type, event_code, event_message
      FROM public.machine_event
      WHERE equipment_id = latest_error_reference.equipment_id
        AND (
          event_time < latest_error_reference.event_time
          OR (
            event_time = latest_error_reference.event_time
            AND id < latest_error_reference.id
          )
        )
        AND event_time >= latest_error_reference.event_time - INTERVAL '10 minutes'
        AND message_type IN ('event', 'status')
      ORDER BY event_time DESC, id DESC
      LIMIT 8
    ) AS recent
  ) AS context ON TRUE
)
SELECT
  requested.equipment_id,
  latest_status.id AS status_id,
  latest_status.event_type AS status_event_type,
  latest_status.event_code AS status_event_code,
  latest_status.event_message AS status_event_message,
  latest_status.event_time AS status_event_time,
  latest_status.received_at AS status_received_at,
  latest_program.event_message AS program_message,
  latest_program.event_time AS program_event_time,
  latest_tool_measurement.event_message AS tool_measurement_message,
  latest_tool_measurement.event_time AS tool_measurement_event_time,
  latest_hits.event_message AS hits_message,
  latest_hits.event_time AS hits_event_time,
  latest_error_with_context.id AS error_id,
  latest_error_with_context.event_code AS error_code,
  latest_error_with_context.event_message AS error_message,
  latest_error_with_context.event_time AS error_event_time,
  latest_error_with_context.level AS error_level,
  latest_error_with_context.error_description,
  latest_error_with_context.troubleshooting_method,
  latest_error_with_context.error_master_source,
  latest_error_with_context.error_context
FROM requested
LEFT JOIN latest_status USING (equipment_id)
LEFT JOIN latest_program USING (equipment_id)
LEFT JOIN latest_tool_measurement USING (equipment_id)
LEFT JOIN latest_hits USING (equipment_id)
LEFT JOIN latest_error_with_context USING (equipment_id)
ORDER BY requested.equipment_id`;

const ERROR_CATEGORY = Object.freeze({
  SAFETY: 'SAFETY',
  SPINDLE_TOOL: 'SPINDLE_TOOL',
  AXIS: 'AXIS',
  PROGRAM_TOOL_TABLE: 'PROGRAM_TOOL_TABLE',
  UNKNOWN: 'UNKNOWN',
});

const ERROR_PHASE = Object.freeze({
  STARTUP: 'STARTUP',
  HOME_RESET: 'HOME_RESET',
  PROGRAM_SELECTION: 'PROGRAM_SELECTION',
  TOOL_CHANGE_MEASUREMENT: 'TOOL_CHANGE_MEASUREMENT',
  DRILLING: 'DRILLING',
  UNKNOWN: 'UNKNOWN',
});

const ERROR_RISK = Object.freeze({
  STOP_AND_SECURE: 'STOP_AND_SECURE',
  STOP_AND_INSPECT: 'STOP_AND_INSPECT',
  VALIDATE_BEFORE_RESTART: 'VALIDATE_BEFORE_RESTART',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
});

function numericErrorCode(value) {
  const match = String(value || '').trim().toUpperCase().match(/^E?(\d{4})$/);
  return match ? Number(match[1]) : null;
}

function classifyErrorCategory(row) {
  const code = numericErrorCode(row?.error_code);
  const codeText = String(row?.error_code || '').trim();
  const text = [
    row?.error_message,
    row?.error_description,
  ].filter(Boolean).join(' ').toLowerCase();
  const codeTrusted = /^E\d{4}$/i.test(codeText)
    || String(row?.error_level || '').trim().toUpperCase() === 'E'
    || Boolean(row?.error_description)
    || Boolean(row?.troubleshooting_method)
    || Boolean(row?.error_master_source);
  const trustedCode = codeTrusted && !/^alarm time\s*:/i.test(String(row?.error_message || ''))
    ? code
    : null;

  if ((trustedCode >= 101 && trustedCode <= 121) || trustedCode === 701
      || /safety|emergency|interlock|door|warning device|air pressure/.test(text)) {
    return ERROR_CATEGORY.SAFETY;
  }
  if ((trustedCode >= 403 && trustedCode <= 419)
      || /spindle|tool|diameter|run[ -]?out|magazine|broken drill/.test(text)) {
    return ERROR_CATEGORY.SPINDLE_TOOL;
  }
  if ((trustedCode >= 202 && trustedCode <= 324)
      || (trustedCode >= 601 && trustedCode <= 605)
      || /\baxis\b|servo|encoder|over.?travel|limit switch|position error/.test(text)) {
    return ERROR_CATEGORY.AXIS;
  }
  if ((trustedCode >= 501 && trustedCode <= 519)
      || /program|excellon|sieb.?meyer|tool table|safe area|pin data|file format/.test(text)) {
    return ERROR_CATEGORY.PROGRAM_TOOL_TABLE;
  }
  return ERROR_CATEGORY.UNKNOWN;
}

function classifyErrorPhase(row) {
  const text = [
    row?.error_context,
    row?.error_message,
    row?.error_description,
  ].filter(Boolean).join(' ').toLowerCase();

  // Context wins over the code family. Error numbers identify the subsystem,
  // not necessarily the operation the machine was performing at the time.
  if (/\batc\b|tool change|tool diameter|tool length|run[ -]?out|diameter error|\bt\d+m\d+/.test(text)) {
    return ERROR_PHASE.TOOL_CHANGE_MEASUREMENT;
  }
  if (/home|homing|origin|zero return|reference return|reset/.test(text)) {
    return ERROR_PHASE.HOME_RESET;
  }
  if (/program|file|excellon|sieb.?meyer|tool table|safe area|pin data|load/.test(text)) {
    return ERROR_PHASE.PROGRAM_SELECTION;
  }
  if (/hole\s*[1-9]\d*|drilling|production cycle|machining/.test(text)) {
    return ERROR_PHASE.DRILLING;
  }
  if (/power.?on|startup|start.?up|initiali[sz]/.test(text)) {
    return ERROR_PHASE.STARTUP;
  }
  return ERROR_PHASE.UNKNOWN;
}

function riskForCategory(category) {
  if (category === ERROR_CATEGORY.SAFETY) return ERROR_RISK.STOP_AND_SECURE;
  if ([ERROR_CATEGORY.SPINDLE_TOOL, ERROR_CATEGORY.AXIS].includes(category)) {
    return ERROR_RISK.STOP_AND_INSPECT;
  }
  if (category === ERROR_CATEGORY.PROGRAM_TOOL_TABLE) {
    return ERROR_RISK.VALIDATE_BEFORE_RESTART;
  }
  return ERROR_RISK.REVIEW_REQUIRED;
}

function classifyError(row) {
  const category = classifyErrorCategory(row);
  return {
    category,
    phase: classifyErrorPhase(row),
    risk: riskForCategory(category),
  };
}

function normalizeStaleSeconds(value = DEFAULT_STALE_SECONDS) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('MACHINE_EVENT_STALE_SECONDS must be zero or a positive number');
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

  if (maxAgeSeconds > 0 && Math.max(0, nowMs - eventMs) > maxAgeSeconds * 1000) {
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
  const classification = classifyError(row);
  return {
    id: row.error_id,
    code: row.error_code || null,
    message: row.error_message || null,
    event_time: row.error_event_time || null,
    level: row.error_level || null,
    description: row.error_description || null,
    troubleshooting: row.troubleshooting_method || null,
    master_source: row.error_master_source || null,
    context: row.error_context || null,
    category: classification.category,
    phase: classification.phase,
    risk: classification.risk,
    lifecycle_status: 'HISTORICAL_REFERENCE_ONLY',
    active: false,
  };
}

function parseRunHits(value) {
  const match = String(value || '').match(/^Run Hits:\s*(\d+)\s*$/i);
  return match ? Number(match[1]) : null;
}

function parseToolMeasurement(value) {
  const match = String(value || '').trim().match(/^(T\d+)\s+tool diameter:\s*(.+)$/i);
  if (!match) return null;
  const values = match[2].trim().split(/\s+/).filter(Boolean);
  return {
    tool: match[1].toUpperCase(),
    values,
    observed_spindle_count: values.length,
    raw_message: String(value).trim(),
  };
}

function machineEventDetail(row) {
  if (!row?.status_id) return null;
  const toolMeasurement = parseToolMeasurement(row.tool_measurement_message);
  return {
    operation: {
      event_code: row.status_event_code || null,
      event_type: row.status_event_type || null,
      event_message: row.status_event_message || null,
      event_time: row.status_event_time || null,
    },
    production: {
      program_message: row.program_message || null,
      program_event_time: row.program_event_time || null,
      run_hits: parseRunHits(row.hits_message),
      hits_event_time: row.hits_event_time || null,
    },
    tool_measurement: toolMeasurement
      ? { ...toolMeasurement, event_time: row.tool_measurement_event_time || null }
      : null,
    reference_spec: {
      classification: 'REFERENCE_SPEC',
      family: 'DG Series',
      machine_type: 'PCB Drilling Machine',
      spindle_count: toolMeasurement?.observed_spindle_count || null,
      spindle_count_basis: toolMeasurement
        ? 'OBSERVED_IN_LATEST_TOOL_MEASUREMENT'
        : 'NOT_CONFIRMED',
      max_rpm: null,
      max_rpm_basis: 'NOT_CONFIRMED',
    },
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
  ERROR_CATEGORY,
  ERROR_PHASE,
  ERROR_RISK,
  MACHINE_EVENT_SQL,
  classifyError,
  classifyErrorCategory,
  classifyErrorPhase,
  latestErrorReference,
  machineEventDetail,
  mapMachineEventStatus,
  normalizeStaleSeconds,
  parseRunHits,
  parseToolMeasurement,
  readMachineEventRows,
};
