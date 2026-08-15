'use strict';

const express = require('express');
const { Pool } = require('pg');

const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGIN = process.env.ALARM_API_ALLOWED_ORIGIN || '*';

const pool = new Pool({
  host: process.env.PGHOST || 'ims-pgbouncer',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10,
});

pool.on('error', (err) => {
  console.error('pg pool idle-client error (non-fatal, pool recovers):', err.message);
});

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

async function transitionAlarm(req, res, { fromStatuses, toStatus, actorField, extraSet, extraParams }) {
  const { logdate_ms: logdateMs, logid } = req.body;
  const actor = req.body[actorField];

  // logdate_ms (epoch milliseconds, e.g. Grafana's own When_ms field) instead
  // of a date string -- string formats are ambiguous across client-side
  // stringification (Handlebars/JS Date.toString() is not ISO 8601), and a
  // mismatch there fails the whole request. A number has no such ambiguity.
  if (!Number.isFinite(logdateMs) || !isNonEmptyString(logid) || !isNonEmptyString(actor)) {
    return res.status(400).json({ error: `logdate_ms (number), logid, and ${actorField} are required` });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE public.ldi_alarm_lifecycle
       SET status = $1, ${extraSet}
       WHERE logdate = to_timestamp($2::double precision / 1000.0) AND logid = $3 AND status = ANY($4::text[])
       RETURNING logid, logdate, status, acknowledged_at, acknowledged_by, resolved_at, resolved_by, resolution_note`,
      [toStatus, logdateMs, logid, fromStatuses, ...extraParams]
    );

    if (result.rowCount === 1) {
      return res.status(200).json(result.rows[0]);
    }

    const existing = await client.query(
      `SELECT status FROM public.ldi_alarm_lifecycle WHERE logdate = to_timestamp($1::double precision / 1000.0) AND logid = $2`,
      [logdateMs, logid]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'no lifecycle row for this alarm (predates lifecycle tracking, or logdate/logid is wrong)' });
    }

    return res.status(409).json({
      error: `cannot transition to ${toStatus} from current status ${existing.rows[0].status}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
}

app.post('/alarms/ack', (req, res) =>
  transitionAlarm(req, res, {
    fromStatuses: ['OPEN'],
    toStatus: 'ACKNOWLEDGED',
    actorField: 'acknowledged_by',
    extraSet: 'acknowledged_by = $5',
    extraParams: [req.body.acknowledged_by],
  })
);

app.post('/alarms/resolve', (req, res) =>
  transitionAlarm(req, res, {
    fromStatuses: ['OPEN', 'ACKNOWLEDGED'],
    toStatus: 'RESOLVED',
    actorField: 'resolved_by',
    extraSet: 'resolved_by = $5, resolution_note = $6',
    extraParams: [req.body.resolved_by, req.body.resolution_note || null],
  })
);

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'db unreachable' });
  }
});

app.listen(PORT, () => {
  console.log(`alarm-api listening on :${PORT}`);
});
