'use strict';

const express = require('express');
const { Pool } = require('pg');

const PORT = process.env.PORT || 4000;
// No default wildcard: this service is only ever called same-origin (through
// the proxy at the Grafana origin), which needs no CORS header at all --
// browsers only consult it for cross-origin requests. Falling back to '*'
// would have opened cross-origin reads to anyone unless an operator
// remembered to set ALARM_API_ALLOWED_ORIGIN explicitly; omitting the header
// when unset denies cross-origin by default instead.
const ALLOWED_ORIGIN = process.env.ALARM_API_ALLOWED_ORIGIN || null;

// idleTimeoutMillis must stay well below pgbouncer's CLIENT_IDLE_TIMEOUT
// (docker-compose.yaml, currently 300s): pgbouncer force-closes an idle
// backend connection with a FATAL client_idle_timeout error once it hits
// that ceiling, and that server-initiated kill has repeatedly crashed this
// process (see docs/architecture -- three occurrences, 2026-08-14/18/19,
// all during low-traffic overnight windows long enough for a pooled client
// to sit idle past 300s). Closing idle clients from the app side first, at
// a fraction of pgbouncer's timeout, means pg-pool retires them itself
// (a clean disconnect, not an error) before pgbouncer ever gets the chance.
const pool = new Pool({
  host: process.env.PGHOST || 'ims-pgbouncer',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 60_000,
});

pool.on('error', (err) => {
  console.error('pg pool idle-client error (non-fatal, pool recovers):', err.message);
});

// Defense in depth: pg-pool's idle-client error relay (Client.idleListener
// -> pool.emit('error')) has, in this environment, still reached Node's
// default "unhandled 'error' event" crash path despite pool.on('error')
// above being registered at module load -- root cause not fully pinned
// down, but idleTimeoutMillis should make it moot going forward. This
// process is in an undefined state after any uncaught exception (Node's
// own guidance): log it clearly, then exit -- don't keep serving requests
// on a possibly-corrupt event loop. `restart: unless-stopped` + the
// healthcheck already recover cleanly and quickly from a process exit
// (proven for the original crash, see SPEC_PG_POOL_RESILIENCE.md), so
// exiting loses nothing and avoids masking a recurring problem behind a
// silent log line.
process.on('uncaughtException', (err) => {
  console.error('uncaughtException (alarm-api exiting for restart):', err);
  process.exit(1);
});

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  if (ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
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
