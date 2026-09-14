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

// Same internal-network hostname proxy/nginx.conf's own /auth-check location
// already targets (http://grafana:3000) -- alarm-api sits on the same
// ims-internal network, so no docker-compose/network change is needed to
// reach it. Overridable for tests / a future topology change.
const GRAFANA_INTERNAL_URL = process.env.GRAFANA_INTERNAL_URL || 'http://grafana:3000';

// Phase 12A hardening: normal ack/resolve queries are a single indexed-row
// UPDATE (or, on conflict, one extra indexed SELECT) against
// ldi_alarm_lifecycle -- observed well under 100ms in practice. These
// ceilings are a generous multiple of that real latency, not an arbitrary
// huge value: enough headroom for a loaded DB, small enough to fail an
// individual request fast rather than hang it indefinitely against a
// genuinely wedged connection (the prior code had no timeout of any kind on
// pool.connect() or client.query()).
const DB_CONNECT_TIMEOUT_MS = 5_000;
const DB_STATEMENT_TIMEOUT_MS = 5_000;
const DB_QUERY_TIMEOUT_MS = DB_STATEMENT_TIMEOUT_MS + 2_000; // client-side backstop above the DB-side cutoff
const GRAFANA_IDENTITY_TIMEOUT_MS = 3_000;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * idleTimeoutMillis must stay well below pgbouncer's CLIENT_IDLE_TIMEOUT
 * (docker-compose.yaml, currently 300s): pgbouncer force-closes an idle
 * backend connection with a FATAL client_idle_timeout error once it hits
 * that ceiling, and that server-initiated kill has repeatedly crashed this
 * process (see docs/architecture -- three occurrences, 2026-08-14/18/19,
 * all during low-traffic overnight windows long enough for a pooled client
 * to sit idle past 300s). Closing idle clients from the app side first, at
 * a fraction of pgbouncer's timeout, means pg-pool retires them itself
 * (a clean disconnect, not an error) before pgbouncer ever gets the chance.
 */
function createPool(overrides = {}) {
  const pool = new Pool({
    host: process.env.PGHOST || 'ims-pgbouncer',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
    query_timeout: DB_QUERY_TIMEOUT_MS,
    ...overrides,
  });

  pool.on('error', (err) => {
    console.error('pg pool idle-client error (non-fatal, pool recovers):', err.message);
  });

  return pool;
}

/**
 * Resolves the authenticated Grafana identity for this request from its
 * session cookie. This is the SAME subrequest proxy/nginx.conf's own
 * /auth-check location already performs before this service is ever
 * reached -- repeated here because that nginx subrequest only proves
 * "authenticated: yes/no" to nginx and forwards no identity onward
 * (auth_request_set can only capture response HEADERS, and Grafana's
 * /api/user returns identity in its JSON body). Phase 12A audit finding:
 * previously acknowledged_by/resolved_by were trusted verbatim from the
 * request body -- any authenticated client could write an arbitrary actor
 * name into the alarm audit trail. This is now the only source of truth
 * for "who is making this request."
 *
 * Pure w.r.t. its inputs -- `fetchImpl` is injectable so tests never make a
 * real network call.
 */
async function resolveGrafanaIdentity(cookieHeader, { grafanaUrl = GRAFANA_INTERNAL_URL, fetchImpl = fetch } = {}) {
  if (!isNonEmptyString(cookieHeader)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAFANA_IDENTITY_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${grafanaUrl}/api/user`, {
      headers: { Cookie: cookieHeader },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const body = await res.json();
    const actor = isNonEmptyString(body.login) ? body.login : (isNonEmptyString(body.email) ? body.email : null);
    if (!actor) return null;

    return { actor, orgRole: typeof body.orgRole === 'string' ? body.orgRole : null };
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimum permission for alarm ack/resolve: any Grafana role except Viewer.
 * Viewer is read-only by Grafana's OWN role definition -- reusing that
 * existing line rather than inventing a second, parallel permission system
 * for this one write path. Phase 12A requirement: never silently grant
 * Viewer write access.
 */
function hasWritePermission(orgRole) {
  return orgRole === 'Editor' || orgRole === 'Admin';
}

/**
 * Express middleware factory: resolves the caller's identity and role
 * before an ack/resolve handler ever runs, and attaches the derived actor
 * to `req.actor`. 401 when no valid session is found (defense in depth --
 * nginx's own auth_request should already have blocked this, but this
 * service must not assume it is only ever reached through that proxy).
 * 403 when the session is valid but the role is Viewer.
 */
function requireActor({ resolveIdentity = resolveGrafanaIdentity } = {}) {
  return async function actorGate(req, res, next) {
    const identity = await resolveIdentity(req.headers.cookie);
    if (!identity) {
      return res.status(401).json({ error: 'authentication required' });
    }
    if (!hasWritePermission(identity.orgRole)) {
      return res.status(403).json({ error: 'insufficient permission (Viewer role cannot acknowledge/resolve alarms)' });
    }
    req.actor = identity.actor;
    next();
  };
}

function corsMiddleware(req, res, next) {
  if (ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

/**
 * `req.actor` is set by the `requireActor` middleware, which always runs
 * before this handler -- never re-derived from `req.body` here, and any
 * client-supplied acknowledged_by/resolved_by field in the request body is
 * ignored entirely (Phase 12A: actor identity is never client-controlled).
 * `pool.connect()` is now inside the try/catch: previously a connection
 * failure (increasingly reachable now that connectionTimeoutMillis is set)
 * was unhandled -- an unhandled promise rejection instead of a clean 500.
 */
async function transitionAlarm(pool, req, res, { fromStatuses, toStatus, extraSet, buildExtraParams }) {
  const { logdate_ms: logdateMs, logid } = req.body;

  // logdate_ms (epoch milliseconds, e.g. Grafana's own When_ms field) instead
  // of a date string -- string formats are ambiguous across client-side
  // stringification (Handlebars/JS Date.toString() is not ISO 8601), and a
  // mismatch there fails the whole request. A number has no such ambiguity.
  if (!Number.isFinite(logdateMs) || !isNonEmptyString(logid)) {
    return res.status(400).json({ error: 'logdate_ms (number) and logid are required' });
  }

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('db connect failed:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }

  try {
    const extraParams = buildExtraParams(req);
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

/**
 * Builds the express app. `pool`/`resolveIdentity` are injectable so tests
 * exercise the real route/middleware logic against fakes -- no real DB, no
 * real Grafana, no real network call, fully deterministic.
 */
function createApp({ pool = createPool(), resolveIdentity = resolveGrafanaIdentity } = {}) {
  const app = express();
  app.use(express.json());
  app.use(corsMiddleware);

  const actorGate = requireActor({ resolveIdentity });

  app.post('/alarms/ack', actorGate, (req, res) =>
    transitionAlarm(pool, req, res, {
      fromStatuses: ['OPEN'],
      toStatus: 'ACKNOWLEDGED',
      extraSet: 'acknowledged_by = $5',
      buildExtraParams: (r) => [r.actor],
    })
  );

  app.post('/alarms/resolve', actorGate, (req, res) =>
    transitionAlarm(pool, req, res, {
      fromStatuses: ['OPEN', 'ACKNOWLEDGED'],
      toStatus: 'RESOLVED',
      extraSet: 'resolved_by = $5, resolution_note = $6',
      buildExtraParams: (r) => [r.actor, r.body.resolution_note || null],
    })
  );

  // Unauthenticated on purpose, unchanged from before Phase 12A: Docker's
  // own healthcheck (docker-compose.yaml) hits this directly on the
  // container's internal port, bypassing nginx/auth_request entirely, and
  // it reports process/DB liveness only -- no alarm data, no identity.
  app.get('/healthz', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      res.status(503).json({ status: 'db unreachable' });
    }
  });

  return { app, pool };
}

/**
 * SIGTERM/SIGINT: stop accepting new connections, let in-flight requests
 * finish, close the pg pool, then exit. `timeoutMs` bounds the wait so a
 * stuck in-flight request can never hang shutdown indefinitely -- past
 * that ceiling this forces exit(1) rather than waiting forever. Exported
 * for direct invocation in tests (never by sending a real OS signal to the
 * test process itself).
 */
function attachGracefulShutdown(server, pool, { timeoutMs = 10_000 } = {}) {
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, alarm-api draining...`);

    const forceExit = setTimeout(() => {
      console.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    server.close(async (closeErr) => {
      if (closeErr) console.error('error closing http server:', closeErr.message);
      try {
        await pool.end();
      } catch (poolErr) {
        console.error('error closing pg pool:', poolErr.message);
      }
      clearTimeout(forceExit);
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return shutdown;
}

if (require.main === module) {
  // Defense in depth: pg-pool's idle-client error relay (Client.idleListener
  // -> pool.emit('error')) has, in this environment, still reached Node's
  // default "unhandled 'error' event" crash path despite pool.on('error')
  // being registered at pool-creation time -- root cause not fully pinned
  // down, but idleTimeoutMillis should make it moot going forward. This
  // process is in an undefined state after any uncaught exception (Node's
  // own guidance): log it clearly, then exit -- don't keep serving requests
  // on a possibly-corrupt event loop. `restart: unless-stopped` + the
  // healthcheck already recover cleanly and quickly from a process exit
  // (proven for the original crash, see SPEC_PG_POOL_RESILIENCE.md), so
  // exiting loses nothing and avoids masking a recurring problem behind a
  // silent log line. Registered only for the real running process, not
  // when this module is `require()`d by tests.
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException (alarm-api exiting for restart):', err);
    process.exit(1);
  });

  const { app, pool } = createApp();
  const server = app.listen(PORT, () => {
    console.log(`alarm-api listening on :${PORT}`);
  });
  attachGracefulShutdown(server, pool);
}

module.exports = {
  createApp,
  createPool,
  resolveGrafanaIdentity,
  hasWritePermission,
  requireActor,
  attachGracefulShutdown,
};
