# FT-17.5 — Regression Evidence

All numbers below are from this session, run after the audit's fixes
(P1-1, P1-2, P2-1) were applied and deployed.

## Unit / lint suite (local)

| Suite | Result |
|---|---|
| `factory-twin-mapping.test.js` | 36/36 |
| `factory-twin-telemetry.test.js` | 29/29 (was 27; +2 for the drill-down fix) |
| `factory-twin-alarm.test.js` | 21/21 |
| `factory-twin-analytics.test.js` | 25/25 |
| `factory-twin-wire.test.js` | 96/96 |
| `floor1-geometry-validator.js` | PASS, 0 errors/warnings |
| `floor1-orientation.js` | 13/13 |
| `floor1-cad-reconciliation.js` | PASS |
| `private-data-leak-scanner.js` | PASS, 0 matches |
| `repo-hygiene-linter.js` | PASS, 0 violations |
| `query-budget-linter.js` | PASS with 1 pre-existing warning (unrelated dashboard panel, not this subsystem) |
| `scripts/pre-commit.js` (full) | All checks passed |

## Disposable-container validation (real Postgres credentials)

- Built `ims-factory-twin-3d:ft175`, confirmed 433 equipment unchanged.
- `eap-canonical-route-regression.js`, `eap-map-regression.js`: PASS.
- `factory-twin-regression.js` (direct mode): 72+ PASS before the same
  pre-existing mode-switch-latency flake (see below).
- Drill-down fix verified against real data with a test-only confirmed
  mapping (never touching real `private/floor1-asset-mapping.json`):
  `drill_down_url` for both LDI-01 and LDI-03 now contains
  `var-clicked_series=<device>`.

## Production regression (real, authenticated, post-deploy)

| Suite | Result |
|---|---|
| `factory-twin-inspector-e2e.js` | 22/22 |
| `factory-twin-regression.js` (proxied) | 475 PASS, 0 FAIL |
| Known limitation | Display-mode-contract section: fresh unauthenticated browser context times out behind the proxy's auth gate — the same class already disclosed and isolated as a harness limitation (not a code defect) in FT-13, FT-14, FT-15, FT-16, and now FT-17.5 (5 consecutive confirmations) |

## Data quality (real DB, last 7 days)

| Check | Result |
|---|---|
| Duplicate `(eqp_id, time)` rows | 0 |
| Impossible temperature (< 0 or > 100) | 0 |
| Impossible humidity (< 0 or > 100) | 0 |
| Negative scan_speed | 0 |
| Sampling gaps > 5 min (LDI-01, 24h) | 1 real gap (~15h) — correctly surfaces as `INSUFFICIENT_DATA`, not fabricated |

## Performance (real production, authenticated, post-deploy)

| Endpoint | p50 | p95 | max |
|---|---:|---:|---:|
| `/api/state` | 57ms | 165ms | 165ms |
| `/api/physical-overlay` | 91ms | 123ms | 123ms |
| `/api/alarm-rca` | 37ms | 42ms | 42ms |
| `/api/telemetry-history` (1h, 1m tier + extended stats) | 28ms | 41ms | 41ms |
| `/api/telemetry-history` (30d, 1h tier, max range) | 37ms | 153ms | 153ms |

All within budget; no endpoint approaches the ~2s cost FT-16's original
unoptimized `/api/alarm-rca` measured before its own architectural fix.

## Security (fresh, this session)

Trivy re-scan of `ims-factory-twin-3d:latest`: identical to the FT-13.5
baseline. 2 HIGH (openssl QUIC DoS, unreachable — this app never runs
QUIC), 11 npm-CLI-bundled findings (10 HIGH, 1 CRITICAL, unreachable — the
CLI is never invoked at runtime). No new findings introduced by FT-14–17.5.

## Deployment identity

- Image rebuilt, `factory-twin-3d` restarted only (`--no-deps`), no
  `docker compose down`, no other service touched.
- `docker inspect`: `healthy`, `RestartCount: 0`.
- Source == container hash match confirmed for the two files this audit
  changed (`app.js`, `lib/telemetry.js`) via `sha256sum` on both sides.
- Real authenticated API check: 433 equipment / 14 TRUE_POLYGON / 9 KLJLAY
  children / 0 physical-overlay entries — all unchanged.
- Backup of `private/floor1-*` taken before rebuild:
  `scratchpad/production-backup-ft175-20260909-102113/`.

## Rollback point

`git revert` the FT-17.5 commit (see final report for hash), rebuild,
restart `factory-twin-3d` only. Private state backup listed above is
unaffected either way (this phase changed no geometry/mapping data).
