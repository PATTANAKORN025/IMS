<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Spec: PG Pool Error-Handling Resilience

> Status: **deployed 2026-08-15.** See Results section at the bottom. Found during the 2026-08-14
> Evidence Review pass, read-only (log/config reads only, no runtime
> touched). This is the highest-priority item to come out of that
> review -- a real bug that just contaminated Soak Attempt 6.

## What happened, with evidence

`scripts/soak-test-reports/soak-log.tsv` (Attempt 6) shows an
unexpected restart at `2026-08-14T05:51:52Z`, about 1 hour into the
run -- nothing this session did caused it:

```text
2026-08-14T05:05:14Z 1324 0 0 no  1 27
2026-08-14T05:51:52Z NaN  0 0 yes 0 28
2026-08-14T06:05:14Z 604  0 0 no  1 28
```

`public.container_restart_audit` (built earlier this session for
exactly this kind of investigation) confirms which containers:

```text
ims-alarm-api | die  | 2026-08-14 05:51:37+00
ims-alarm-api | start | 2026-08-14 05:51:38+00
ims-node-red | die  | 2026-08-14 05:51:38+00
ims-node-red | start | 2026-08-14 05:51:39+00
```

`docker logs ims-node-red` for that window shows the actual crash:

```text
14 Aug 05:51:35 - [error] [function:Auth & Validate] LDI staging INSERT failed: client_idle_timeout
14 Aug 05:51:35 - [red] Uncaught Exception:
14 Aug 05:51:35 - [error] error: client_idle_timeout
  at parseErrorMessage (/data/node_modules/pg-protocol/dist/parser.js:305:11)
  ...
```

`ims-alarm-api`'s logs show the same shape: an unhandled `pg` client
error crashing the whole Node.js process (visible as a raw exception
dump ending in the process restarting and re-printing "alarm-api
listening on :4000").

## Root cause

`ims-pgbouncer`'s live config (`docker exec ims-pgbouncer cat
/etc/pgbouncer/pgbouncer.ini`) has:

```ini
# Connection sanity checks, timeouts
server_idle_timeout = 300
# Dangerous timeouts
client_idle_timeout = 300
```

`client_idle_timeout = 300` is labeled "Dangerous timeouts" in the
config file's own comment -- whoever wrote it already knew this was
risky. PgBouncer forcibly closes any client connection idle for 300
seconds. Neither `node-red`'s `pg.Pool` (constructed inline per
function node, e.g. via `global.get('pgPool')`) nor
`services/alarm-api/server.js`'s `pool = new Pool({...})` registers a
`pool.on('error', ...)` handler. When PgBouncer kills an idle
connection, the resulting error surfaces as an **unhandled
`error` event on the pool**, which Node.js treats as an uncaught
exception -- killing the entire process, not just that one query.

Docker's `restart: unless-stopped` policy brings the container back
within 1-2 seconds. No evidence of data loss (both containers show
normal operation immediately after restart in the logs). But this is
exactly the kind of "unexpected restart" Soak Attempt 6 exists to
catch, and it just did.

**This is very likely the same root cause behind at least some of the
instability in earlier soak attempts and possibly the original 16-hour
event this session's whole observability effort was built to
investigate** -- not confirmed (Docker log retention didn't preserve
that far back, per `SOAK_TEST_LOG.md` Attempt 1), but the failure
signature matches: a Node.js service crashing and silently restarting,
with no application-level cause.

## Design

Add a `pool.on('error', ...)` handler everywhere a `pg.Pool` is
constructed, so idle-connection drops (from PgBouncer, from network
blips, from Postgres restarts) are logged and the pool recovers its
next client instead of crashing the process:

```js
// services/alarm-api/server.js
const pool = new Pool({/* ... existing config ... */});
pool.on("error", (err) => {
  console.error(
    "pg pool idle-client error (non-fatal, pool recovers):",
    err.message,
  );
});
```

```js
// node-red: wherever global.set('pgPool', ...) constructs the shared
// pool (likely a startup/global-config function node) -- same pattern:
pgPool.on("error", (err) => {
  node.warn(
    "pg pool idle-client error (non-fatal, pool recovers): " + err.message,
  );
});
```

This is the standard, documented fix for this exact `node-postgres`
failure mode (`pool.on('error')` exists precisely so idle-client
errors don't crash the process) -- not a novel design, a missing
standard safeguard.

**Secondary consideration, not this spec's primary fix**: whether
`client_idle_timeout = 300` is the right value at all, versus disabling
it (`0`) or raising it, given both `node-red` and `alarm-api` hold
long-lived pooled connections that may legitimately sit idle past 5
minutes between LDI batches. The `on('error')` handler makes the
_crash_ stop; it doesn't address _why_ connections sit idle long
enough to hit the timeout in the first place. Worth measuring actual
idle gaps (real evidence, not a guess) before deciding whether to also
touch the PgBouncer config -- and touching PgBouncer config requires a
restart, so that half is explicitly out of scope until the freeze
lifts regardless.

## Rollout plan

1. Add the `pool.on('error', ...)` handler to both `server.js` and the
   node-red global pool setup -- two small, isolated changes.
2. Redeploy (`docker compose restart node-red alarm-api`) -- **not
   before the soak freeze lifts**, since this itself is a restart.
3. Re-run `tests/e2e/ingestion-latency-check.js` to confirm nothing
   regressed.
4. Start a fresh soak attempt with this fix in place -- if the fix is
   correct, `client_idle_timeout` drops should stop appearing as
   `any_container_restarted=yes` events entirely (the pool logs a
   warning and keeps running instead).

## Testing plan

- Unit/manual: force a `client_idle_timeout` by holding a pooled
  connection open past 300s in a throwaway test, confirm the process
  does NOT crash and the next query still succeeds.
- Regression: full existing test suite (`Unit Tests`, `Parser v2
 Tests` per the pre-commit hook) -- this change touches shared pool
  setup, low risk but should not be assumed risk-free.
- Soak: the real test is time -- a subsequent soak attempt running
  past 5 minutes of any idle gap without a restart event is the actual
  proof this fix works, more convincing than any unit test could be.

## Priority

**Highest** in the whole backlog -- higher than the 3 items in
`SPEC_ALARM_ACTOR_IDENTITY.md`/`SPEC_SIMULATOR_REALISM.md`/
`SPEC_ALERT_HYGIENE.md`. Those are hardening and polish. This is an
active bug actively invalidating the one criterion
(`SYSTEM_TRUST_REPORT.md` #5, 72h soak) that cannot be satisfied by
engineering effort alone -- every day this isn't fixed is a day the
soak clock can get reset by something that isn't even this session's
own activity.

## Results

Deployed exactly per the rollout plan: `pool.on('error', ...)` added to both `services/alarm-api/server.js` (inline after `new Pool({...})`) and `nodered_data/settings.js` (the pool construction was extracted from an inline object-literal property into a named `sharedPgPool` const specifically so `.on('error', ...)` could be attached before it's referenced in `functionGlobalContext.pgPool` -- a small structural change, same pool config/behavior, not a functional change beyond adding the handler). Isolated diff: 2 files, 18 insertions / 9 deletions total (mostly the settings.js restructure).

Deployed via `docker compose restart node-red alarm-api` at 2026-08-15T05:59:41Z (both services, since both needed the fix -- not splittable into a narrower single-service restart this time). Both came back clean: `docker logs` shows normal startup (`Started flows`, `alarm-api listening on :4000`), no errors. Regression check per the rollout plan's step 3 (`tests/e2e/ingestion-latency-check.js`) re-run post-deploy: `ldi_data` P95 8ms (previously 22ms in an earlier-session measurement, well within normal variation, not a regression), `sys_metrics`/`net_metrics`/`ldi_metrics` still ~0-1ms, `ldi_alarm_log (nearest)`'s known simulated-delay artifact unchanged (unrelated to this fix). Unit tests: `parser.test.js` and `v2-parser.test.js` both pass, 0 regressions.

**What this deployment does NOT yet prove, stated plainly per the testing plan's own honesty bar**: the actual `client_idle_timeout` crash scenario (PgBouncer forcibly closing an idle pooled connection after 300s) was not directly forced and observed surviving in this pass -- that requires either a dedicated 5+-minute forced-idle test or waiting for the fix to encounter a real idle gap during normal operation. The endurance run started immediately after this deploy (`SOAK_TEST_LOG.md` Attempt 10) is exactly that real-world proof accumulating over time: if the fix is correct, `client_idle_timeout` drops during the multi-hour run will show up as a harmless log line, not an `any_container_restarted=yes` event. This is also `FAULT_INJECTION_PLAN.md` scenario 3's job once explicitly approved to run.
