# Factory Twin — Step 6B: Authoritative Operational Data Source Audit

Identifies and validates whether an authoritative source of real machine operational state
exists for the new R3F Factory Twin's 431 physical assets (`services/factory-twin-3d-next`),
separate from and not to be confused with the EAP-cell audit already on record
(`docs/eap/EAP_OPERATIONAL_SOURCE_AUDIT.md`, FT-EAP-STATE-03/04 — that audit answers the
question for EAP's 210 schematic cells; this one answers it for the physical CAD-based twin's
431 machines). No live telemetry connected. No application code, database schema, or
production behavior changed by this step — audit and documentation only, verified by
`git diff --stat` at the end.

## Method

Repository-wide search (word-bounded, case-insensitive) for every candidate this step named:
operational/machine/asset-state APIs, MES, PLC, OPC UA, SCADA, historian, telemetry ingestion,
machine-state tables, machine/asset mapping tables, `/api/*` routes, `lib/wire.js`,
`operational-state-adapters.js`, `operational-status.js`, Node-RED flows, MQTT flows. Every real
hit read in full, not keyword-counted. Live measurements taken against the actual running
production container (`docker exec ims-factory-twin-3d`, behind the real nginx auth gate) and
the real TimescaleDB (`docker exec ims-timescaledb psql`), not assumed from source reading
alone.

## 1. Candidate source inventory

| Candidate | Location | Data | Authority | Real/Mock | Freshness | Identity mapping |
|---|---|---|---|---|---|---|
| `/api/state` + `queryDeviceState()`/`STATE_SQL` | `services/factory-twin-3d/server.js:435-560` | Real, live query over `v_ldi_machine_latest_full` (LDI telemetry) + `ldi_alarm_log`, for whichever `device_id`s `discoverDevices()` finds in `public.devices` (`device_type='ldi', enabled=true`) | **DERIVED** (real mechanism, see §2/§10) | Real query, real table — but the rows it currently reads are simulator-generated (see §4) | Known: `has_data`/`is_stale` from a documented 5-min threshold (migration 052) | None to the Twin's own CAD assets — this route returns raw `device_id`s, not `asset_id`s |
| `/api/physical-overlay` (FT-15) | `server.js:590-650`, `lib/telemetry.js` | The identity-gated join: CAD `asset_id` → confirmed `ims_device_id` → `queryDeviceState()` | **DERIVED**, identity-gated, currently empty | Same underlying data as `/api/state` | Same as above | **Real mechanism, 0 CONFIRMED mappings today** (§3) |
| `private/floor1-asset-mapping.json` (FT-14) | `services/factory-twin-3d/private/` | Evidence-gated `PhysicalIdentityMapping[]` — the ONLY place a CAD asset may be linked to a device id | n/a (identity, not state) | Real mechanism, **0 records** | n/a | 0 of 431 |
| `lib/mes-import.js` | `services/factory-twin-3d/lib/` | Identity/mapping import boundary for a "future structured export from the external manufacturing system" | **UNAVAILABLE** — no upstream exists | Real code, never wired to a live route, never called | n/a | n/a — produces identity candidates, never state |
| `operational-status.js` / `operational-state-adapters.js` | `services/factory-twin-3d/public/` | EAP's own real/simulated adapter pair | Real=**UNAVAILABLE always**, Simulated=**MOCK/DEMO** | Mock (simulated branch only) | n/a | EAP-cell scoped, not applicable to the physical Twin's `Asset[]` |
| `lib/operational-state-adapter.ts` (Step 6A) | `services/factory-twin-3d-next/lib/` | This migration's own structural port of the above, for `Asset[]` | Real=**UNAVAILABLE always**, Simulated=**MOCK/DEMO** | Mock (simulated branch only) | n/a | Gated by `isMachine()` — 0 of 431 eligible today |
| `ldi_data` / `ldi_alarm_log` (raw tables) | `postgres/init/001-init-timescaledb.sql` | Real, live, continuously-ingesting LDI telemetry/alarm history | **AUTHORITATIVE for LDI's own 10-device monitoring domain** — not yet for the Twin (see §3) | **Currently simulator-generated** (`LDI_SIMULATOR_ENABLED=true`, verified live) | Real timestamps, actively updating | 0 rows reference any Twin `asset_id` — LDI has no concept of CAD assets |
| PLC / SCADA / OPC UA / Modbus / historian integration | (searched, not found) | — | **UNAVAILABLE** | n/a | n/a | n/a |
| Node-RED flows | `nodered_data/flows/*.json` | `ldi_ingestion.json`, `ldi_simulator.json`, `ldi_alarm_simulator.json`, generic `ingestion.json`/`alerting.json` | All LDI-scoped; `ldi_simulator.json`'s own name discloses synthetic generation | Mix — ingestion flow is real transport, simulator flow is synthetic | n/a | No Twin-asset concept in any flow |
| `mo`/`board_no`/`total_board` fields on `v_ldi_machine_latest_full` | via `/api/state` | Real production/lot-tracking fields carried through `STATE_SQL` | DERIVED, same source as state | Same as state row | Same | Same — device-scoped, not asset-scoped |

Not assumed authoritative merely for having a field called `status`: `STATE_SQL`'s `state`
column, `ldi_data.state` (boolean), and `mapping_status`/`identity_status` on `Asset` were all
individually traced to their real producing code, not taken at face value.

## 2. Authority classification

```
/api/state (STATE_SQL)              DERIVED   -- real machine-state semantics, real freshness,
                                                   but zero connection to a Twin asset_id (returns
                                                   device_id, not asset_id) and (today) reads
                                                   simulator-generated rows, not real telemetry
/api/physical-overlay (FT-15)        DERIVED   -- the identity-gated bridge that WOULD make
                                                   /api/state authoritative for the Twin, if FT-14
                                                   had any CONFIRMED entries. It has none.
private/floor1-asset-mapping.json    UNKNOWN   -- the identity evidence layer itself: real
                                    (0 records)   mechanism, zero content, so nothing downstream
                                                   of it can be authoritative today
lib/mes-import.js                    UNAVAILABLE -- no upstream system exists to export from
PLC/SCADA/OPC UA/Modbus/historian     UNAVAILABLE -- none exist anywhere in this repository
operational-state-adapters.js REAL   UNAVAILABLE -- correctly reports this (§7)
operational-state-adapters.js SIM    MOCK/DEMO   -- correctly disclosed as such (§8)
lib/operational-state-adapter.ts REAL UNAVAILABLE -- correctly reports this (§7)
lib/operational-state-adapter.ts SIM  MOCK/DEMO   -- correctly disclosed as such (§8)
```

No candidate qualifies as **AUTHORITATIVE for the Factory Twin's 431 assets** under this step's
own test (real machine state + tied to real asset identity + known freshness + known semantics
+ known provenance) — the identity-tie fails for every state-bearing candidate, and the one
candidate that IS a real production state pipeline (`/api/state`) is currently reading
simulator output, not real telemetry, for the ten devices it does know about. See §10 for the
explicit decision.

## 3. Identity mapping — measured, not assumed

Measured directly against the running system, not estimated:

| Metric | Value | Source |
|---|---|---|
| Total CAD assets (non-duplicate) | 431 | `/api/floor-geometry` `equipment[]`, filtered `!duplicate_of` |
| Total raw equipment records | 433 | same, unfiltered |
| Duplicate-of records | 2 | same |
| Total `devices` rows (`device_type='ldi', enabled=true`) | 23 | `SELECT count(*) FROM devices WHERE device_type='ldi' AND enabled=true` |
| — of which currently have telemetry rows in `ldi_data` | 10 (`LDI-01`..`LDI-10`) | `SELECT DISTINCT eqp_id FROM ldi_data` |
| — of which have zero telemetry rows right now | 13 (`LDI-A01`/`A02`, `LDI-B07`, `ldi-a03`..`a06`, `ldi-b01`..`b06`) | same query, absence |
| Confirmed CAD-asset ↔ device mappings (FT-14) | **0** | `private/floor1-asset-mapping.json`: `{"mappings":[]}` |
| Unmapped source records | 431 of 431 | derived |
| Duplicate mappings | 0 (none exist to duplicate) | — |
| Missing/stale IDs | n/a — no mapping exists to go stale | — |
| **Mapping coverage** | **0.0%** | 0 / 431 |

`/api/physical-overlay`'s own live response confirms this independently, at runtime, not just
by reading the mapping file: `{"overlay":{},"counts":{"confirmed":0,"liveAttached":0,
"alarmEligible":0,"drillDownEligible":0}}` — measured against the real production container.

No asset was ever called "mapped" based on name similarity — `resolveMapping()` only ever
consults `private/floor1-asset-mapping.json`'s own `asset_id` key, never position, id-number
proximity, or label text (same rule `wire.js`'s own header comment states, unchanged).

## 4. Operational state semantics — what `/api/state` actually represents

`STATE_SQL` (`server.js:435-517`) derives exactly 4 of the 8 `MachineStateCode` values, the
same 4 Step 1's `machine-state.ts` already discloses as `backed: true`:

| Plant state | Source rule | Backed? |
|---|---|---|
| `RUN` | `v.state = true`, no active Critical/Major alarm in the last 5 min | Yes |
| `IDLE` | `v.state = false`, has fresh data | Yes |
| `DOWN` | Active Critical/Major `ldi_alarm_log` entry in the last 5 min | Yes |
| `UNDEFINED` | `NOT v.has_data OR v.is_stale` | Yes — this is the "no data"/"stale" case, and it resolves to `UNDEFINED`, never `DOWN` |
| `OFF`, `INITIAL`, `PM`, `STOP` | No column exists | No — never produced |

**The "do not silently translate unknown/null/stale → DOWN" rule is already correctly
enforced in SQL**, not merely in application code: `WHEN NOT v.has_data OR v.is_stale THEN 0`
(→ `UNDEFINED`) is evaluated BEFORE the alarm/run/idle branches, so a stale or missing row can
never fall through to a `DOWN` classification. Verified by reading the `CASE` order directly,
not inferred.

`NO_DATA`/`UNAVAILABLE` (the `StateSourceQuality` axis, Step 1's `data-quality.ts`) are not
values `STATE_SQL` itself emits — it emits `MachineStateCode` only, collapsing "no telemetry"
into `UNDEFINED` at the SQL layer. The `NO_DATA`/`UNAVAILABLE` distinction lives one level up,
in Step 6A's own adapter (`resolveOperationalState`), which is the correct layer for it: a
Twin asset with no confirmed device mapping never reaches `STATE_SQL` at all (there is no
`device_id` to query), so it is `NO_DATA` at the identity layer, not `UNDEFINED` at the state
layer — these are deliberately different facts, not merged.

## 5. Freshness

| Question | Answer |
|---|---|
| Event/measurement timestamp available? | **Yes** — `ldi_data.time`, real, monotonically updating |
| Ingestion timestamp available? | Same column serves both; no separate ingestion-lag field |
| Freshness semantics known? | **Yes, documented** — migration `052-ldi-machine-latest-full-view.sql`: a row is `is_stale` if `latest.time < NOW() - INTERVAL '5 minutes'`, `has_data` if a row exists at all for that `eqp_id`. This is the SAME 5-minute cutoff already used elsewhere in the dashboard set (not a new threshold invented for this audit). |
| Currently fresh? | Yes for the 10 simulator-fed devices (`max(time)` measured within ~2 minutes of the audit's own wall-clock at time of measurement) — but see §4/§6, "fresh" here describes simulator cadence, not real machine polling. |

`timestamp available = yes`. `freshness semantics = known`. No new threshold was invented —
the existing 5-minute cutoff is reused as read, per this step's own instruction not to invent
one where semantics are unknown (they are known here).

## 6. Source failure behavior

Traced directly in `STATE_SQL`/`queryDeviceState()`, not assumed:

| Failure mode | Actual behavior |
|---|---|
| Query times out / DB unreachable | `server.js`'s `try/catch` around `queryDeviceState()` in the `/api/state` handler returns `500 {"error":"internal error"}` — the route fails closed, it does not silently return a fabricated all-`DOWN` state. |
| Empty result (0 devices discovered) | `queryDeviceState([])` returns `[]` early (guarded at the top of the function) — `machines: []`, never an error, never a guessed state. Verified live against the disposable perf instance, which currently has 0 discovered devices. |
| No fresh row for a device | `has_data=false` → `st=0` → `UNDEFINED` — never `DOWN` (§4). |
| Stale row (>5 min old) | `is_stale=true` → `st=0` → `UNDEFINED` — same, never `DOWN`. |
| Malformed/missing `eqp_id` filter input | `Array.isArray` guard on `deviceIds`; a non-array or empty input short-circuits to `[]`, never reaches the SQL layer. |
| `/api/physical-overlay` with 0 confirmed mappings | Returns `200 {"overlay":{},"counts":{"confirmed":0,...}}` — an honest empty answer, not an error, not a fabricated one. Confirmed live. |

Conceptual rule the spec asks to verify ("source unavailable → UNAVAILABLE, not DOWN") is
correctly upheld at every layer already read: SQL-level (`UNDEFINED`, never `DOWN`), route-level
(`500`/`[]`, never a guessed state), and Step 6A's own adapter layer (`UNAVAILABLE`, explicit).

## 7. Existing REAL adapter (Step 6A) — verified correct

`resolveReal(asset)` in `lib/operational-state-adapter.ts` unconditionally returns
`quality: 'UNAVAILABLE'`. This is **verified correct** by this audit, not merely re-asserted:
no candidate found in §1-§6 is both (a) tied to a confirmed Twin `asset_id` and (b) reading
real (non-simulator) telemetry, at the same time, today. Per this step's own hard rule, no
candidate is connected merely to change the on-screen answer away from `UNAVAILABLE` —
`/api/physical-overlay` exists and IS the correct future integration point (§10), but wiring it
in now would mean either (a) it returns nothing (0 confirmed mappings — a pointless connection)
or (b) fabricating mapping evidence to make it return something, which is explicitly forbidden.

## 8. Demo adapter (Step 6A) — verified intact

`resolveSimulated(asset)` + `resolveOperationalState(asset, demoModeOn)`:

- [x] Explicit opt-in — `demoModeOn` defaults to `false`, a viewer must check the toolbar box.
- [x] Production default OFF — confirmed unchanged (no code touched this step).
- [x] Never confused with real telemetry — every simulated result carries
      `source_type: 'SIMULATED'`, `quality: 'SIMULATION'`, and a `reason` string
      ("deterministic per-asset simulation, not live telemetry").
- [x] Deterministic — `hashString(asset.id)`, same input always produces the same output, no
      `Math.random()`, no `setInterval`.
- [x] No production API calls — pure function over the `Asset[]` already in memory; grep-
      confirmed no `fetch`/`http` call anywhere in the file.

Not removed, not modified. Still useful for visual validation, per this step's own instruction.

## 9. Latency — measured against the real running system

Measured with `docker exec ims-factory-twin-3d node -e ...` (the actual production-image
container, reached the same way nginx's `auth_request`-gated `/factory-twin-3d/` location
proxies to it — `proxy/nginx.conf:103-107`), 5 sequential requests, not a single sample:

| Endpoint | Status | Latency (5 runs) | Response size | Devices returned |
|---|---|---|---|---|
| `GET /api/state` | 200 | 72ms, 59ms, 53ms, 52ms, 55ms | 6,183 bytes | 10 (`LDI-01`..`LDI-10`) |
| `GET /api/physical-overlay` | 200 | 65ms | 153 bytes | 0 (0 confirmed mappings) |

No concurrency test run — a single kiosk-poll-shaped sequence matches this route's actual
production usage pattern (`server.js`'s own comment: "polled frequently by every open kiosk
tab"); server/DB-internal duration breakdown was not separately measurable without adding
instrumentation, which this step's "no application code changes" rule forbids. This step is
discovery only — no optimization attempted or needed.

## 10. Decision gate

**OPTION B — A source mechanism exists but is not currently trustworthy for the Factory
Twin's 431 assets.**

What exists and is real, not hypothetical:

- `/api/state` (`STATE_SQL`) is a real, live, correctly-failing-closed query over real
  TimescaleDB tables, with documented freshness semantics and correct `NO_DATA`/stale
  handling (never collapsed into `DOWN`).
- `/api/physical-overlay` (FT-15) is a real, already-built, identity-gated bridge that would
  make `/api/state` authoritative for the Twin's CAD assets **the moment** two independent,
  non-code conditions are both met: (a) `private/floor1-asset-mapping.json` gains real,
  evidence-backed `CONFIRMED` entries, and (b) the deployment's data mode is `REAL`, not mock.

Why it is not trustworthy today, specifically (not a vague "insufficient"):

1. **0.0% identity coverage** (§3) — no CAD asset in this deployment is linked to any device.
   `/api/physical-overlay` itself proves this live, not just the mapping file at rest.
2. **Currently simulator-fed, not real telemetry** (§4/§9) — `LDI_SIMULATOR_ENABLED=true`,
   and the only 10 devices with any data at all (`LDI-01`..`LDI-10`) are the mock device set,
   confirmed by `docker exec ims-timescaledb psql` returning only those `eqp_id`s from
   `ldi_data`. Even a hypothetically-confirmed mapping today would surface synthetic state,
   not a real machine reading — this is a live, current-environment fact, not a permanent
   architectural limitation, but it is true right now and this audit reports what is true now.
3. **No device in the `devices` table has ever been evidenced as physically corresponding to
   any of the 431 CAD assets** — `mes-import.js` (the one module designed to carry that
   evidence in) has never been invoked, and no other document in this repository asserts such
   a correspondence.

This is a materially different finding from the EAP audit's Option-C-shaped conclusion ("no
authoritative source exists" — full stop, nothing real anywhere). Here, real infrastructure
exists and is well-built; it is simply not, today, tied to this Twin's asset identity or fed by
real telemetry. Calling this Option C would understate what already exists; calling it Option A
would overstate what is actually trustworthy right now. Per this step's own rule 10's
instruction not to integrate a source found untrustworthy, `/api/physical-overlay` is
documented here as the concrete future integration point (§9's endpoint, §3's mapping
mechanism, §4's semantics, §5's freshness rule, §6's failure behavior, and §9's real security
boundary — `auth_request` behind Grafana's session cookie, `proxy/nginx.conf:103-107`, verified
live) — but it is **not connected**, and no adapter contract is designed against it this step,
per rule 10's own "do NOT connect it yet" applying equally to Option A/B when a design would
otherwise follow.

**Kept unchanged, verified correct (§7/§8):**

```
REAL adapter  → UNAVAILABLE (Step 6A, unmodified)
DEMO adapter  → explicit opt-in, default OFF (Step 6A, unmodified)
```

## 11. Security / access boundary

`/factory-twin-3d/` (covering `/api/state`, `/api/physical-overlay`) is proxied by
`proxy/nginx.conf:103-107` behind `auth_request /auth-check`, which forwards the caller's
session cookie to Grafana's `/api/user` and only proceeds on a `200` — the same login an
operator already performed to view a dashboard, no separate auth system. Neither route accepts
an API key or bypasses this gate (grep-confirmed: no auth middleware inside `server.js` itself
— the gate is entirely at the proxy layer). The isolated Next.js `/geometry-candidate` route
used by Steps 5A-6A fetches directly from a disposable, unauthenticated instance of this same
image for development/test purposes only — never through the production auth-gated path, and
never itself exposed to end users.

## 12. Runtime change verification

```
$ git diff --stat -- services/ database/ postgres/ nodered_data/ proxy/
(empty)
```

Zero application code changes. Zero database changes. Zero live integration changes. Only
`docs/evidence/FACTORY_TWIN_OPERATIONAL_SOURCE_AUDIT.md` (this file, new) and
`docs/evidence/FACTORY_TWIN_ARCHITECTURE_GAP_AUDIT.md` (updated) changed.

## Acceptance criteria

- [x] All candidate sources inventoried (§1)
- [x] Authoritative status explicitly determined (§2, §10 — Option B)
- [x] Machine/asset identity mapping quantified (§3 — 0.0% coverage, measured)
- [x] Operational-state semantics documented (§4)
- [x] NO_DATA vs UNAVAILABLE preserved (§4, §6, §7)
- [x] Freshness understood, not invented (§5)
- [x] Failure behavior documented (§6)
- [x] Real/demo boundary preserved, verified unmodified (§7, §8)
- [x] No fake live data introduced
- [x] No production source connected
- [x] Evidence document created

## Decision

**LIVE FACTORY TWIN OPERATIONAL DATA — BLOCKED BY MISSING IDENTITY EVIDENCE AND MOCK DATA
MODE, NOT BY MISSING INFRASTRUCTURE.**

A real, well-built mechanism (`/api/state` + `/api/physical-overlay`) exists and is the correct
future integration point once (a) `private/floor1-asset-mapping.json` gains real, evidence-
backed CONFIRMED entries for at least some of the 431 assets, and (b) the deployment's data
mode is switched to REAL for those devices. Neither condition is something this migration
(a rendering/frontend effort) can create — both are data/evidence tasks outside this step's and
this migration's own scope. Step 6C, if and when undertaken, should design the typed adapter
contract against `/api/physical-overlay`'s existing shape rather than inventing a new interface.

---

## Addendum (Step 6D — Identity Mapping / Data Readiness Gate)

Step 6C built the typed adapter this doc anticipated
(`services/factory-twin-3d-next/lib/operational-source-adapter.ts`), unwired to production, per
its own step's own rule. Step 6D then formally re-audited condition (a) above — a
repository-wide search specifically for identity RELATIONSHIPS (not operational-state sources
generally) — and confirmed the same finding from an independent angle: 0 repository sources
assert any CAD-asset-to-device relationship. Full detail, including a per-candidate table and
the exact bidirectional-validation/readiness-decision logic, in
`docs/evidence/FACTORY_TWIN_IDENTITY_MAPPING_READINESS.md`. Verdict: **IDENTITY MAPPING — NOT
READY, coverage 0.0% (0/431)** — unchanged from this doc's own condition (a), now measured
through a dedicated, tested readiness gate rather than cited alone.
