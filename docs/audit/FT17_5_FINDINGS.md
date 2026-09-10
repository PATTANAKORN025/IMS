# FT-17.5 — Findings

Every finding below is grounded in a command or test actually run this
session (session-fresh evidence), not a prior report.

---

## P1-1 — `buildDrillDownUrl` missing `var-clicked_series`/`var-log_id`

**Severity:** P1 (currently inert — 0 confirmed mappings means no real
drill-down URL is generated in production today — but a real, provable
functional defect that would ship broken the moment a mapping is confirmed).

**Root cause:** `lib/telemetry.js`'s `buildDrillDownUrl()` (FT-15) sent only
`var-machine_id`/`var-factory`/`var-mo`/`var-event_time_ms`/`from`/`to`.
`ims-ldi-machine-snapshot.json`'s own queries (the Machine summary panel and
every metric panel — temperature/humidity/air_vacuum/scan_speed/thickness)
all resolve their target `log_id` as:

```sql
COALESCE(
  (SELECT ... WHERE event_time_ms > 0
     AND eqp_id = split_part(clicked_series, ' - ', 1) ...),
  NULLIF(log_id, '__auto__')
)
```

With neither `var-clicked_series` nor `var-log_id` set, `clicked_series`
defaults to `'__none__'`, `split_part('__none__', ' - ', 1)` matches no real
`eqp_id`, and the `COALESCE` falls through to `NULLIF('__auto__', '__auto__')
= NULL` — `WHERE log_id = NULL` matches nothing, on every panel.

This exact failure mode was already discovered and fixed once, in `app.js`'s
own dead `drillDownUrl()` (found and removed by this same audit, see
FT17_5_FIX_MATRIX.md) — its own comment documents the live-verified symptom:
"Process Capability / Alarm Context / Event Timeline all silently returned
0 rows (NO_DATA) until this was added." FT-15's server-side rewrite had not
inherited that fix.

**Evidence:** `ims-ldi-machine-snapshot.json` grep of `clicked_series`
(5+ panels, quoted in FT17_5_SYSTEM_DEEP_AUDIT.md §4). Verified live against
a disposable container with a test-only confirmed mapping (LDI-01 and
LDI-03): `drill_down_url` now contains `var-clicked_series=<device>` and,
when a `related_log_id` is available, `var-log_id=<id>`.

**Fix:** `buildDrillDownUrl` now always sends `var-clicked_series` (the
`machineId`) alongside `var-event_time_ms`, and sends `var-log_id` when a
`logId` is supplied. `resolvePhysicalOverlay`'s call site now passes
`telemetry.alarm.related_log_id` through as `logId`. 2 new unit tests, 1
existing test updated (real behavior change, not a weakening — the old
assertion checked for the OLD, broken URL shape).

**Validation:** `tests/unit/factory-twin-telemetry.test.js` 29/29 (was 27).
Verified against real production DB via a disposable container.

---

## P1-2 — FT-15/16/17 unit tests never wired into CI

**Severity:** P1 (a real regression in any of the three would have passed
GitHub Actions).

**Root cause:** each of `tests/unit/factory-twin-telemetry.test.js`,
`factory-twin-alarm.test.js`, `factory-twin-analytics.test.js` was added to
`scripts/pre-commit.js` (local hook) in its own phase, but never to
`.github/workflows/ci.yml`. Only `factory-twin-mapping.test.js` (FT-14) and
`factory-twin-inspector-e2e.js` (FT-15.1) were actually wired into CI.

**Evidence:** `grep` of `.github/workflows/ci.yml` for the three filenames
returned zero matches before this fix.

**Fix:** all three added to the `unit-tests` job, immediately after the
existing mapping-contract step.

**Validation:** file diff confirmed; the job step ordering/shape matches
the existing mapping-contract step exactly (same runner, same `node`
invocation convention).

---

## P2-1 — Dead code: `app.js`'s `drillDownUrl()` and `latestStateById`

**Severity:** P2 (no functional impact — confirmed zero call sites — but
real maintenance risk: this exact function's comments held the only record
of the `var-clicked_series` requirement, and had already silently diverged
from the server-side reimplementation before this audit found it).

**Fix:** removed. `latestStateById` was write-only once its only reader
(the deleted function) was gone; removed too. `raycaster`/`pointer`/
`aimRay`/`pickFrom` (still genuinely used by `pickEquipment`) were left
untouched.

**Validation:** `node --check` clean; inspector E2E 22/22 unaffected;
`grep` confirms zero remaining references to either identifier.

---

## P2-2 — `/api/alarm-rca` never builds a `drill_down_url`

**Severity:** P2, **deferred** (see FT17_5_FIX_MATRIX.md for the deferment
reason — this is a real scope gap from FT-16's own design, not a defect
introduced by drift).

`machine_drilldown_eligible: true` is a real, correct boolean, but no URL
is ever attached to an alarm event the way FT-15's physical-overlay entries
get one. A client consuming `/api/alarm-rca` today has no way to actually
reach the drill-down it is told exists.

---

## P3-1 — Documentation self-correction: raw `ldi_data` retention

**Severity:** P3 (no functional impact; a factual claim correction).

This session's own FT-16/FT-17 commit messages claimed raw `ldi_data` has
no retention policy, based on searching only `database/migrations/*.sql`.
`postgres/init/032-ldi-data-scaling-policies.sql` — a separate,
fresh-deployment init path — sets a real 180-day retention + 7-day
compression policy. `docs/architecture/DATA_RETENTION.md` already states
this correctly. Corrected in FT17_5_SYSTEM_DEEP_AUDIT.md §10; git history
is not rewritten (per standing rule), so the prior commit messages remain
as written, with this correction as the authoritative record going forward.

---

## Non-findings (checked, confirmed clean)

- **Hidden fallback identity logic** (proximity/zone/coordinates/numbering/
  naming/array order): none found. `grep` of `lib/mapping.js`, `lib/alarm.js`
  and `wire.js`'s identity-resolution paths shows every lookup keyed
  strictly by `asset_id`/`ims_device_id` string equality via
  `resolveMapping`/`reverseIdentityIndex`.
- **Device hardcoding**: none found. `DEVICE_IDS` is the only device list,
  sourced from `discoverDevices()` every refresh cycle.
- **Per-frame DB/API calls**: none found. `renderDeviceHistory` fires only
  on button click/range/metric change; the FT-15/16 overlay/alarm fetches
  fire once per geometry load.
- **Duplicate telemetry, impossible values, out-of-order timestamps** (last
  7 days, real DB): none found.
- **`INVALID_DATA` classification**: not implemented — `lib/analytics.js`'s
  `Quality` enum has no `INVALID_DATA` member. Not added this audit: no real
  invalid-value case was found in the data to justify it (Phase 7's own
  rule: classify real defects found, not speculative ones). Logged as a
  design note, not a defect.
- **Security**: no new HIGH/CRITICAL since FT-13.5's baseline scan; both
  existing classes remain unreachable via this app's own attack surface
  (see FT17_5_SYSTEM_DEEP_AUDIT.md §6).
