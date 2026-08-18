# Fault Injection Plan

> **Plan only. Nothing in this document has been executed.** Per the explicit instruction: complete and review this plan before any destructive test runs. Requires a separate, explicit go-ahead per scenario before execution -- this plan does not constitute approval to run any of it.

## Why these 7 scenarios, in this order

Ordered by blast radius and recoverability, cheapest/safest first. Each scenario builds on evidence already gathered this session (e.g., the PostgreSQL scenario directly targets the pg-pool crash bug found and spec'd but never deployed -- `SPEC_PG_POOL_RESILIENCE.md`).

---

## 1. Node-RED restart (mid-operation, not at an idle moment)

- **Exact failure**: `docker compose restart node-red` while the fleet is actively polling (not a quiet moment) -- this is the _same_ action already performed safely 3 times this session (Phase A1, P0.1, and implicitly during earlier work), but always between polling cycles. This scenario deliberately restarts _during_ an in-flight batch-buffer window.
- **Target service**: `ims-node-red`
- **Duration**: restart is near-instantaneous (~10-15s to `Started flows`, per this session's own measured restarts); the "failure" is the interruption itself, not a sustained outage.
- **Expected behavior**: any `buffer.sys`/`buffer.net`/`buffer.ldi` rows accumulated in `flow` context (memory-only, not persisted) at the moment of restart are lost -- this is a **known, real gap**, not something to be surprised by. Should self-recover: flows restart clean, polling resumes on the next `inject_fleet` tick (≤30s), no crash loop.
- **Rollback**: none needed -- `docker compose restart` is itself the recovery action; no state to roll back.
- **Success criteria**: container reaches `healthy` within 60s. `docker logs` shows `Started flows` with no error-level lines. Polling resumes within one `inject_fleet` cycle (≤30s) of restart completing.
- **Data-loss criteria**: rows in-flight in the batch buffer at restart time (bounded: at most `BATCH_INTERVAL_SEC` = 10s worth of buffered-not-yet-flushed rows per device) are expected losses, not a failure -- this is the acceptable, already-known cost of the in-memory buffering design. A _failure_ would be: polling not resuming after restart, or losses exceeding that ~10s bound (e.g., an hour of missing data), or the restart itself corrupting `flow`/`global` context in a way that causes wrong values on resume (e.g., stale `dev_state_*` producing garbage until a full walker cycle refreshes it -- worth explicitly checking for in the run).
- **Safety boundary**: single-service restart, `restart: unless-stopped` policy already governs recovery, no manual intervention required if it fails to come back (compose will keep retrying). Reversible in the sense that nothing is changed except normal container lifecycle.

## 2. alarm-api restart

- **Exact failure**: `docker compose restart alarm-api` while an operator interaction (Acknowledge/Resolve click) might be in-flight.
- **Target service**: `ims-alarm-api`
- **Duration**: near-instantaneous restart.
- **Expected behavior**: in-flight HTTP requests to alarm-api at the moment of restart fail (connection reset); the Alarm Console UI should surface this as a failed action (not a silent no-op), and a retried click after the service is back should succeed normally with correct state (no double-write, no lost acknowledgment if the retry happens).
- **Rollback**: none -- restart is the recovery.
- **Success criteria**: service back to responding within ~15s (matches this session's other single-service restart timings). No orphaned `ldi_alarm_lifecycle` rows left in an inconsistent state (e.g., `ACKNOWLEDGED` with a null `acknowledged_by`) from an interrupted write.
- **Data-loss criteria**: an in-flight Ack/Resolve click that was interrupted mid-request and never retried is an expected, acceptable loss (the operator sees a failure and can retry) -- not silent data loss, since the UI would show the failure. A _failure_ would be the write partially committing (inconsistent lifecycle row) or the UI reporting success for a request that didn't actually persist.
- **Safety boundary**: single-service, no data-layer risk -- alarm-api has no in-memory buffer of its own (unlike Node-RED's batch buffer), so there's no equivalent "lost buffered rows" risk here.

## 3. PgBouncer restart

- **Exact failure**: `docker compose restart pgbouncer` while Node-RED/alarm-api hold active pooled connections.
- **Target service**: `ims-pgbouncer`
- **Duration**: near-instantaneous.
- **Expected behavior**: this is the scenario most directly relevant to `SPEC_PG_POOL_RESILIENCE.md` -- **the pg-pool crash bug that invalidated Soak Attempt 6 is still live and undeployed**. Without that fix, this scenario is _expected_ to crash both `ims-node-red` and `ims-alarm-api` (the exact failure mode already observed once organically). This scenario should therefore not be run until that fix ships, or should be run deliberately _to confirm_ the bug still reproduces before fixing it -- worth deciding explicitly which purpose this run serves before executing.
- **Rollback**: none -- restarts are the recovery, `restart: unless-stopped` already handles it (confirmed: Attempt 6 self-recovered within ~2 seconds via this policy).
- **Success criteria** (post-fix): Node-RED and alarm-api's connection pools reconnect gracefully, logged as a handled error (`pool.on('error', ...)`) rather than an uncaught exception, no container crash.
- **Data-loss criteria**: same buffered-rows caveat as scenario 1 if Node-RED does crash (pre-fix) or briefly errors (post-fix). A _failure_ is the crash-loop itself, or any insert silently failing without incrementing `pipelineMetrics.inserts_failed`.
- **Safety boundary**: **run only after `SPEC_PG_POOL_RESILIENCE.md`'s fix is deployed**, unless the explicit goal of a specific run is to re-confirm the pre-fix crash signature for the record.

## 4. SNMP simulator (`snmpsim`) restart

- **Exact failure**: `docker compose restart snmpsim` during active polling.
- **Target service**: `ims-snmpsim`
- **Duration**: near-instantaneous (already performed once this session for the P0.2 disk fix -- real precedent exists).
- **Expected behavior**: already partially observed during P0.2's deployment -- a brief window where polled devices return empty/unreachable, correctly handled by the existing `isEmpty`/`isOffline` branches in `sre_parser` (zeroed values logged, not fabricated). No container crash expected on either side.
- **Rollback**: none needed.
- **Success criteria**: SNMP responses resume within one poll cycle after `snmpsim` reports healthy. No error-level Node-RED log lines beyond the expected empty-response handling.
- **Data-loss criteria**: brief zero/empty readings during the restart window are expected and already proven acceptable (observed directly during P0.2: one `0/0` row, correctly logged, not a failure). A _failure_ would be Node-RED itself crashing on the empty response, or fabricating a non-zero value instead of honestly logging the gap.
- **Safety boundary**: lowest-risk scenario in this plan -- already has a real, successful precedent this session.

## 5. Temporary network interruption (Node-RED ↔ TimescaleDB)

- **Exact failure**: not yet defined precisely -- candidate mechanism is a `docker network disconnect`/`reconnect` on the `ims-internal` network for `ims-node-red`, or an iptables-based drop between the two containers. **This mechanism needs to be confirmed as safe and reversible before the plan is considered complete** -- flagging this scenario as the least-specified of the 7.
- **Target service**: the `ims-node-red` ↔ `ims-timescaledb` link (not a container itself).
- **Duration**: proposed 30-60s, short enough to stay within PgBouncer's `client_idle_timeout` window in reverse (test the connection _drop_ case, not the idle-timeout case scenario 3 already covers).
- **Expected behavior**: `pg.Pool` should surface connection errors on affected queries; buffered rows should accumulate (bounded by `BUFFER_MAX = 200` per the existing overflow-protection code) rather than being dropped or crashing the process, and should flush successfully once connectivity returns.
- **Rollback**: reconnect the network / remove the iptables rule.
- **Success criteria**: no data loss beyond the interruption window's naturally-unbuffered portion, `pipelineMetrics.buffer_overflows` stays at 0 (confirms the 200-row safety net wasn't needed for a 30-60s gap), clean resumption with no manual intervention.
- **Data-loss criteria**: rows generated during the outage that exceed `BUFFER_MAX` (200) per device would be a real, measurable loss (the code's own `enforceBufferLimit` already logs this via a `node.warn` and increments `buffer_overflows` -- so this scenario also validates that counter is trustworthy). A _failure_ is silent loss (rows missing with no corresponding overflow-counter increment).
- **Safety boundary**: **not fully specified yet** -- the exact command/mechanism needs confirming against this Windows/Docker Desktop environment before this scenario can move from plan to execution. Flagging explicitly per the instruction not to execute an incomplete plan.

## 6. Slow DB response (synthetic latency injection)

- **Exact failure**: not yet defined precisely -- candidate mechanism is a `pg_sleep()`-wrapped trigger or a connection-throttling proxy; **no safe, reversible mechanism for this has been identified in the current toolset** (no `tc`/traffic-control equivalent readily available in this Windows/Docker Desktop environment, and a DB-side artificial delay risks affecting real traffic sharing the same connection pool, not just the test's own queries).
- **Target service**: `ims-timescaledb` query path.
- **Duration**: proposed 10-30s of injected latency per query.
- **Expected behavior**: Node-RED's batch-insert path should either queue (bounded by `BUFFER_MAX`) or surface a clear timeout/error, not hang indefinitely.
- **Rollback**: remove the injected delay.
- **Success criteria / data-loss criteria**: same shape as scenario 5.
- **Safety boundary**: **this scenario is the least ready of the 7 -- no safe mechanism identified yet.** Recommend deferring until a reversible, isolated way to inject DB-side latency is found (e.g., a dedicated test-only query path, not a global slowdown that would also degrade real traffic during the test). Do not attempt with an untested mechanism.

## 7. PostgreSQL temporary unavailability

- **Exact failure**: `docker compose stop timescaledb` (not restart -- a sustained stop) for a defined window, then `docker compose start timescaledb`.
- **Target service**: `ims-timescaledb`
- **Duration**: proposed 60-120s -- long enough to exceed a single `BATCH_INTERVAL_SEC` flush cycle many times over and meaningfully test buffering/backpressure, short enough to stay well under `BUFFER_MAX` (200 rows) at the fleet's current ~1 row/30s/device rate.
- **Expected behavior**: this is the highest-blast-radius scenario in the plan -- **every** write path (Node-RED batch inserts, alarm-api lifecycle writes, Grafana's own datasource queries) loses its target simultaneously. Node-RED should buffer and retry (per the existing `circuitBreaker`/`retry_timer` mechanisms already present in the flow, per `pipelineMetrics.inserts_failed` and the `Retry Drain (30s)` inject node found during this session's earlier investigation) rather than crash. Grafana dashboards should show a clear "datasource unreachable" state, not stale data silently presented as current.
- **Rollback**: `docker compose start timescaledb` -- TimescaleDB's own WAL/durability guarantees mean no data corruption is expected from a clean stop/start (this is not a kill -9 / crash simulation, deliberately -- that's a different, higher-risk scenario not included in this plan).
- **Success criteria**: all 3 dependent services (node-red, alarm-api, grafana) recover automatically once the DB returns, with no manual restart needed for any of them. `pipelineMetrics.inserts_failed` increments during the outage and `inserts_ok` resumes climbing after. No container of the 3 dependents itself crashes (this is the direct test of whether `SPEC_PG_POOL_RESILIENCE.md`'s underlying problem class -- unhandled pool errors crashing the process -- has a broader footprint than just PgBouncer-initiated disconnects).
- **Data-loss criteria**: buffered rows within `BUFFER_MAX` bounds recovering cleanly after reconnection = success. Rows lost beyond that bound, or `pipelineMetrics.buffer_overflows` climbing = a real, measurable loss to report honestly, not hide. A _failure_ (distinct from acceptable bounded loss) is any dependent service crashing and requiring manual restart, or Grafana/alarm-api presenting stale data as if it were live during the outage.
- **Safety boundary**: **run this last, after scenarios 1-4 have been executed successfully** (each of those exercises a piece of the same recovery machinery in isolation first). **Should not be run until `SPEC_PG_POOL_RESILIENCE.md`'s fix is deployed** -- running it against the current, known-crash-prone pool-error handling would very likely just reproduce the Attempt 6 crash rather than test anything new, and risks losing more than the bounded/expected amount if both dependent services crash simultaneously mid-buffer.

## Sequencing recommendation

1. Scenario 4 (snmpsim) -- lowest risk, real precedent already exists.
2. Scenario 1 (Node-RED) -- known, bounded blast radius.
3. Scenario 2 (alarm-api) -- known, bounded, no buffer-loss risk at all.
4. **Deploy `SPEC_PG_POOL_RESILIENCE.md`'s fix** before proceeding further -- scenarios 3 and 7 are only meaningful (testing the _fixed_ behavior, not just re-confirming a known bug) once that ships.
5. Scenario 3 (PgBouncer) -- now tests the real fix.
6. Scenario 5 (network interruption) -- only after its mechanism is confirmed safe in this environment (currently underspecified).
7. Scenario 7 (PostgreSQL stop) -- highest blast radius, run last, only after 1-3 and 5 have built confidence in the individual recovery paths it depends on.
8. Scenario 6 (slow DB) -- deferred indefinitely until a safe injection mechanism is identified; not scheduled in this sequence.

**None of the above is authorized to execute by this document.** Each scenario needs its own explicit go-ahead when it's time to run it.
