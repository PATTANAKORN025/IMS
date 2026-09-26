# FT-17.5 — System-Wide Deep Audit

Audit of the Factory Twin subsystem (`services/factory-twin-3d/`) after FT-14
(identity) through FT-17 (historical analytics), grounded in the current
repository, current runtime, current database schema, and actual test runs —
not in prior reports.

## 1. System architecture map

```
DXF/CAD source (private, gitignored)
        │  scripts/extract-floor1-equipment.js, scripts/lib/cad-blocks.js
        ▼
private/floor1-geometry.json, floor1-equipment-reference.json  (private, gitignored)
private/floor1-asset-mapping.json                               (FT-14, private, gitignored)
        │
        ▼
server.js  (loadPrivateGeometry, loadPrivateAssetMapping, queryDeviceState,
            queryAlarmHistory, /api/telemetry-history)
        │
        ├── lib/mapping.js      — canonical identity engine (FT-14)
        ├── lib/wire.js         — geometry/identity wire projection (allowlist)
        ├── lib/telemetry.js    — freshness, physical-overlay join, drill-down URL (FT-15)
        ├── lib/alarm.js        — alarm/RCA event model, identity gate (FT-16)
        ├── lib/analytics.js    — CAGG tier selection, data-sufficiency (FT-17)
        └── lib/contracts.js, diagnostics.js, floors.js, evidence.js, mes-import.js,
            eap-map.js, schematic.js — pre-FT-14 layers, unaffected by this audit
        │
        ▼  Docker image (services/factory-twin-3d/Dockerfile, single-stage,
        │  node:22-alpine)
        ▼
container ims-factory-twin-3d  (only /app/private bind-mounted; server.js/
        │                        public/*/lib/* baked into the image)
        ▼
nginx (proxy/nginx.conf, auth_request against Grafana session)
        ▼
browser  (public/app.js, public/index.html — device-history panel, FT-14-17
          inspector rows, all gated on server-resolved eligibility)
```

Real production database objects this subsystem reads (never writes):
`public.devices`, `public.ldi_data` (hypertable), `public.ldi_data_1m/_15m/_1h`
(continuous aggregates, migrations 043/044), `public.v_ldi_machine_latest_full`
(migration 052), `public.ldi_alarm_log` (hypertable), `public.ldi_alarm_ms_code`,
`public.v_ldi_alarm_category`, `public.ldi_alarm_lifecycle` (migration 077),
`public.v_ldi_alarm_context` (053/057/058/062/063, referenced not FROM'd —
see §3). No table is written to by this service (read-only role, `server.js`'s
own top-of-file comment).

## 2. Canonical source-of-truth map

| Concern | Canonical source | Notes |
|---|---|---|
| Physical geometry | `private/floor1-geometry.json` via `loadPrivateGeometry` | Unaffected by this audit |
| CAD↔IMS identity | `lib/mapping.js` (`resolveMapping`, `eligibility`) | Single engine; `private/floor1-asset-mapping.json` is its only data source |
| Device discovery | `server.js`'s `discoverDevices()`/`DEVICE_IDS` | One list, reused by `/api/state`, `/api/physical-overlay`, `/api/alarm-rca`, `/api/telemetry-history` — confirmed, no duplicate |
| Device machine-state classification | `server.js`'s `STATE_CODE_TO_MACHINE_STATE` + `lib/contracts.js`'s `MachineState` | Single mapping, one place |
| Telemetry freshness | `lib/telemetry.js`'s `freshnessFor`/`Freshness` | LIVE/STALE/NO_DATA/UNKNOWN, from `v_ldi_machine_latest_full`'s own `has_data`/`is_stale` |
| Historical statistical quality | `lib/analytics.js`'s `classifyQuality`/`Quality` | VALID/INSUFFICIENT_DATA/UNAVAILABLE — a **different concept** from Freshness (see §3, not a duplicate) |
| Exact alarm-event correlation | the two-tier rule already encoded in `public.v_ldi_alarm_context` (053+), inlined (not `FROM`'d) in `server.js`'s `ALARM_RCA_CTE` | See §3 for why it is inlined rather than referenced |
| Alarm lifecycle | `public.ldi_alarm_lifecycle` (migration 077), read via `lib/alarm.js`'s `isActive`/`durationMs` | Real OPEN→ACKNOWLEDGED→RESOLVED; no ack/resolve write path exists yet |
| Drill-down URL | `lib/telemetry.js`'s `buildDrillDownUrl` | Was missing `var-clicked_series`/`var-log_id` — **fixed this audit**, see Findings |
| CAGG tier boundaries | `lib/analytics.js`'s `tierForRange` | Restates (never re-derives) `tests/lint/query-budget-linter.js`'s own documented boundaries |

## 3. Duplicate/legacy code inventory

| Item | Classification | Reasoning |
|---|---|---|
| `app.js`'s old `drillDownUrl()` (10-machine-box era) | **DELETE — done this audit** | Zero call sites (confirmed by grep across the whole `public/` tree). Its hard-won `var-clicked_series` knowledge was not inherited by `lib/telemetry.js`'s `buildDrillDownUrl` — fixed (Finding P1-1). |
| `app.js`'s `latestStateById` | **DELETE — done this audit** | Write-only after the above removal (its only reader was the deleted function). |
| `lib/telemetry.js`'s `Freshness` vs `lib/analytics.js`'s `Quality` | **KEEP, both** | Not duplicates: `Freshness` classifies one live device reading's recency (LIVE/STALE/NO_DATA/UNKNOWN); `Quality` classifies a historical aggregate's statistical trustworthiness (VALID/INSUFFICIENT_DATA/UNAVAILABLE). Different inputs, different questions, no overlap in call sites. |
| `server.js`'s `ALARM_RCA_CTE` (inlined exact/nearest correlation) vs `public.v_ldi_alarm_context` | **COMPATIBILITY PROJECTION, documented** | Cannot simply `FROM` the view: it does not expose `logid`, which the lifecycle join and the API's own `alarm_id` field need. The SQL is a verbatim restatement of the view's own two-tier rule (exact on `related_log_id`, nearest within 5 min only when null), not a new or looser one — see `lib/alarm.js`'s own header comment, already in place since FT-16. |
| `queryAlarmRCA()` | **COMPATIBILITY PROJECTION** | FT-17 turned it into a thin delegation to `queryAlarmHistory({deviceIds}, ...)` with FT-16's exact original defaults — confirmed byte-identical behavior with no filters, already tested. |
| Device discovery | **ONE canonical source** | `DEVICE_IDS` module-level list, `discoverDevices()` the only query. No hardcoded device list anywhere in `lib/*.js` (checked). |

## 4. API contract audit

Field names/enum values checked for drift across `lib/wire.js` → `lib/telemetry.js`
→ `lib/alarm.js` → `lib/analytics.js` → `server.js` routes → `app.js` consumers:

- `mapping_status` (wire-facing, `MAPPED_TO_IMS`/`UNMAPPED_TO_IMS`) vs
  `identity_status` (real lifecycle, `confirmed`/`conflicting`/`deprecated`/
  `unresolved`) — intentionally two fields, documented in `wire.js` as
  "derived projections, never independent truth." Confirmed still true:
  grep shows exactly one write site for each, both inside `projectEquipment`.
- `Quality` values (`VALID`/`INSUFFICIENT_DATA`/`UNAVAILABLE`) are consistent
  between `lib/analytics.js`'s definition and every consumer (`server.js`'s
  `/api/telemetry-history`, `app.js`'s `renderDeviceHistory`) — no third
  spelling anywhere.
- Timestamps: every timestamp this subsystem emits is an ISO-8601 string
  from Postgres's own `timestamptz` (never a bare `Date.now()` masquerading
  as a DB timestamp) except `logdate_ms`/`event_time_ms` (epoch milliseconds,
  used only where the Grafana template-variable convention requires it —
  `var-event_time_ms`). No timezone ambiguity found: Postgres serializes
  `timestamptz` with an explicit offset, and no code path re-parses one
  without a timezone.
- `drill_down_url`: confirmed present only when `drill_down_eligible: true`
  in FT-15's overlay (verified live, §"Findings"); **absent entirely** from
  FT-16's `/api/alarm-rca` response — `machine_drilldown_eligible` is
  returned as a boolean but no URL is ever built for it. Logged as a
  deferred finding (P2), not fixed this audit (see FT17_5_FIX_MATRIX.md).

No field was found that is consumed but never produced, or produced but
never consumed, in the FT-14–17 code paths.

## 5. DB/query audit

- `queryAlarmRCA`/`queryAlarmHistory`: single base query (no `LATERAL`),
  correlation (`ALARM_RCA_ONE_SQL`, the `LATERAL`-bearing one) run only for
  rows whose device is `CONFIRMED` — architecture already fixed in FT-16 for
  the exact N+1-style cost this phase's Phase 8 asks about. Re-measured this
  audit: unchanged, 12-94ms across all four `/api/telemetry-history` tiers,
  43-94ms for `/api/alarm-rca` (see FT17_5_REGRESSION.md).
- `/api/telemetry-history`: routes to `ldi_data_1m`/`_15m`/`_1h` by
  `tierForRange`, never raw `ldi_data` for a range scan — confirmed by
  `tierForRange`'s own unit test asserting it never returns `Tier.RAW`.
  Extended stats (`min`/`max`/`median`/`p95`/`stddev`) query raw `ldi_data`
  directly, but only when the tier resolves to the 1-minute one (span ≤ 6h)
  — the same bounded-raw-scan shape this codebase's Cpk/StdDev panels
  already use.
- Tier boundaries tested at the exact edges (6h, 6h+1ms, 2 days, 2 days+1ms,
  30 days): all four transitions land exactly where
  `tests/lint/query-budget-linter.js`'s own header documents them.
- No duplicate telemetry rows found in the last 7 days of real `ldi_data`
  (`GROUP BY eqp_id, time HAVING count(*) > 1` → 0 rows). No impossible
  values found (`temperature`/`humidity` out of [0,100], negative
  `scan_speed` → 0 rows in the last 7 days). One real sampling gap found on
  LDI-01 (~15h in the last 24h) — correctly surfaces as `INSUFFICIENT_DATA`
  for the affected buckets, not silently interpolated; not a code defect.

## 6. Security audit

Fresh Trivy scan of `ims-factory-twin-3d:latest` (this session, post-fix):
identical to the FT-13.5 baseline — 2 HIGH (`libcrypto3`/`libssl3`,
CVE-2026-14456, openssl QUIC DoS) and 11 npm-CLI-bundled findings (10 HIGH,
1 CRITICAL). See FT17_5_FINDINGS.md for reachability classification
(unchanged from FT-13.5: both classes unreachable via this app's own attack
surface). `private-data-leak-scanner`, `repo-hygiene-linter`: both PASS,
0 findings. No `.env`/`.git`/`node_modules`/raw CAD tracked. Auth boundary
re-confirmed: every new FT-17 route (`/api/telemetry-history`, extended
`/api/alarm-rca`) returns 401 unauthenticated, same as every existing route.

## 7. Frontend/browser audit

Real authenticated production, re-verified this audit: 433 assets, 0
confirmed mappings, 0 physical overlay/alarm-overlay entries, geometry
rendering unchanged, 0 console errors across the inspector E2E (22/22) and
a fresh device-history interaction. Visual check at 2560x1440 confirms
unchanged whole-floor rendering (zone labels, no floating/duplicate
objects). Confirmed the FT-17 device-history panel is genuinely
device-level, not attached to any CAD mesh, per its own scope decision.

## 8. Performance audit

See FT17_5_REGRESSION.md for full numbers. No N+1 pattern found in current
code (the one that existed, FT-16's original `/api/alarm-rca`, was already
found and fixed in FT-16 itself — re-verified still fixed).

## 9. Test-quality audit

- `tests/unit/factory-twin-telemetry.test.js`'s drill-down URL test used
  `assert.strictEqual` against a literal string — correctly caught by this
  audit's fix (a real behavior change), updated rather than weakened; two
  new tests added for the `logId`/`var-log_id` path specifically.
- No skipped tests, no assertions that can never fail, and no host-specific
  timing assertions found in the FT-14–17 test files (`factory-twin-mapping/
  telemetry/alarm/analytics.test.js`) — all pure-function tests with
  synthetic fixtures, no wall-clock dependency except `durationMs`'s own
  explicit `now` parameter (always caller-supplied in tests, never
  `Date.now()` implicitly).
- Real CI gap found and fixed: `factory-twin-telemetry/alarm/analytics.
  test.js` were wired into `scripts/pre-commit.js` (local hook only) but
  **not** into `.github/workflows/ci.yml` — a regression in any of them
  would have passed CI. Fixed this audit.

## 10. Documentation-truth audit

Real, verified self-correction: FT-16/FT-17's own commit messages and this
session's own prior chat responses claimed "raw `ldi_data` has no retention
policy" (based on searching `database/migrations/*.sql` only). This was
wrong — `postgres/init/032-ldi-data-scaling-policies.sql` (a separate,
fresh-deployment-only init path this session had not previously checked)
sets a real 180-day retention + 7-day compression policy on raw `ldi_data`.
`docs/architecture/DATA_RETENTION.md` already states this correctly and
already flags that these two policies aren't mirrored in
`database/migrations/` — the gap was in this session's own prior claim, not
in the doc. No live code comment repeated the wrong claim (checked,
`lib/analytics.js` never mentions retention), and no functional behavior
depended on it (the 30-day `MAX_RANGE_MS` is well inside either figure).
Corrected here rather than silently.
