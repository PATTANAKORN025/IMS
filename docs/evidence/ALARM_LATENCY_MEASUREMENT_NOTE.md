<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Alarm Latency Measurement Note

## Finding (2026-08-14)

Initial alarm-path latency evidence (`ldi_alarm_log`, all rows) showed
P50=4654ms, P95=7875ms, P99=8027ms -- far above the telemetry tables
(`ldi_data`, `sys_metrics`, `net_metrics`, `ldi_metrics`), all ~1ms.

This is **not a real latency problem**. It is a measurement artifact
caused by how the mock simulator assigns `logdate` to background
noise-code alarms.

## Root cause

`nodered_data/flows.json`, node `almsim_gen`, function `generate()`:

```js
rows.push(
  newRow(
    eq,
    code,
    new Date(now - Math.floor(Math.random() * 9000)),
    null,
    "nearest",
  ),
);
```

Background noise-code alarms (`link_basis = 'nearest'`) get `logdate`
backdated by a random 0-9000ms, to simulate "the alarm condition
happened slightly before it was logged." Condition-driven alarms
(`link_basis = 'causal'`) use `logdate = new Date()` at the moment the
correlated telemetry query resolves -- no backdating.

`ingest_ts - logdate` therefore measures two different things
depending on `link_basis`:

| link_basis | logdate meaning                   | (ingest_ts - logdate) measures          |
| ---------- | --------------------------------- | --------------------------------------- |
| `causal`   | real detection time               | real pipeline latency                   |
| `nearest`  | detection time minus random(0,9s) | simulated delay + real pipeline latency |

## Evidence, split correctly

```text
$ node tests/e2e/ingestion-latency-check.js
ldi_alarm_log (causal)   n=5  P50= 3.6ms P95= 9.0ms P99= 13.2ms <- real pipeline latency
ldi_alarm_log (nearest)  n=15 P50=5883ms  P95=7811ms P99=8065ms <- includes simulated delay, NOT pipeline latency
```

`causal` latency matches the telemetry tables (single-digit ms). The
alarm ingest pipeline is not slow; the noise-code simulator is
deliberately backdating timestamps for realism.

## What changed to fix the measurement (not the pipeline, not the simulator)

- `tests/e2e/ingestion-latency-check.js`: reports `ldi_alarm_log` as
  two lines (`causal` / `nearest`) instead of one blended number.
- `monitoring/grafana/dashboards/infrastructure/ims-ingestion-latency.json`:
  split the single "ldi_alarm_log" stat panel into "ldi_alarm_log
  (causal)" (real thresholds, green/yellow/red like telemetry) and
  "ldi_alarm_log (nearest)" (no pass/fail thresholds -- informational
  only, tooltip states it includes simulated delay).

No write path, no simulator code, no running container touched or
restarted by this fix -- dashboard JSON hot-reloads within 30s per
`monitoring/grafana/provisioning/dashboards/dashboards.yml`. Does not
affect Soak Attempt 6.

## Deferred, not done here

Removing the artificial backdating from `almsim_gen` itself (so
`nearest`-path alarms also carry a real, non-backdated `logdate`) is a
simulator-realism change, out of scope until after the soak/realism
pass this repo has already deferred those to.
