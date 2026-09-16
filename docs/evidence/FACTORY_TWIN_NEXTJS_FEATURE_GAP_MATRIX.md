# Factory Twin Next.js — Feature Gap & Migration Scope Gate (Phase 13B)

Architecture/documentation only. No runtime, nginx, docker-compose, database, Grafana,
Node-RED, CAD, Floor 1, or identity file touched. Builds on
`docs/evidence/FACTORY_TWIN_NEXTJS_MIGRATION_REVIEW.md` (`be992a2e`) and
`FACTORY_TWIN_NEXTJS_CUTOVER_PLAN.md` (`f682f725`) — no feature-parity claim here contradicts
or loosens either. Every legacy source cited below was traced to the actual file/route this
phase, not inferred from a filename.

## Sources traced this phase

- `services/factory-twin-3d/server.js`: `app.get('/api/state', ...)` (line 577, device
  telemetry, joined from `lib/telemetry.js`), `app.get('/api/alarm-rca', ...)` (line 865,
  `lib/alarm.js`'s `queryAlarmRCA`). Both are **factory-twin-3d's own** read-only routes over
  the same `ldi_*` TimescaleDB tables — not a call to a separate service.
- `services/factory-twin-3d/server.js:23`: explicit comment contrasting itself with
  `alarm-api` ("Read-only service — unlike alarm-api, dedicated alarm_api_writer role...").
  **`alarm-api` is a genuinely separate write-path microservice** (`services/alarm-api/
  server.js`), never called by `app.js`/`eap.js` for rendering — confirmed by grep, zero
  references.
- `services/factory-twin-3d/public/app.js:2387`: `showEquipmentInspector(item)` — the
  inspector is a client-side function reading `/api/state` + `/api/alarm-rca` responses
  already fetched at boot/poll time, not a separate backend of its own.
- `services/factory-twin-3d/public/eap.js` is a **separate HTML entry point** (`/eap.html`),
  sharing `server.js`/`lib/*.js` as its backend but an entirely distinct frontend route from
  `/factory-twin-3d/` (`app.js`/`index.html`). Migrating `/factory-twin-3d/` does not require
  touching or replacing `/eap.html` at all.
- "LDI" is not a service — it is the data domain name for the `ldi_*` TimescaleDB tables
  Node-RED's simulator/ingestion writes into. Both `/api/state` and Grafana's own LDI
  dashboards read the same tables independently; Factory Twin has never rendered a Grafana
  dashboard inside itself.

## 1. Feature-gap matrix

| Capability | Legacy source | Candidate source | Behavioral difference | Operational importance | Classification | Blocker status | Test required | Evidence/owner |
|---|---|---|---|---|---|---|---|---|
| Factory geometry | `app.js` scene-build (`buildFloor` etc.), `/api/floor-geometry` | `lib/geometry-adapter.ts`, `GeometryScene.tsx` | None — `===` exact vertex parity | High (structural context for every other view) | MIGRATED | REQUIRED_FOR_CUTOVER (satisfied) | existing: re-run at cutover time | Step 5A, this session |
| Machines | `app.js` `buildEquipmentLayer` | `lib/machine-adapter.ts`, `Machines.tsx` | None — 431/433 exact, same `duplicate_of` rule | High | MIGRATED | REQUIRED_FOR_CUTOVER (satisfied) | existing | Step 5B |
| Selection | `app.js` `pickEquipment`/`pickColumn` | `Machines.tsx` instance picking, Step 5C | None — 431/431 deterministic | High | MIGRATED | REQUIRED_FOR_CUTOVER (satisfied) | existing | Step 5C |
| Camera (orbit/pan/zoom/reset/fit) | `app.js` `OrbitControls`, `resetView`, `refitViews`/`frameBounds` | `GeometryCameraController.tsx`, Step 5D | None functionally; candidate adds evidence-derived min/max distance limits legacy lacks | Medium-High | MIGRATED | REQUIRED_FOR_CUTOVER (satisfied) | existing | Step 5D |
| Layers (geometry/grid/machines) | `app.js` `setLayerVisible` | `layer.ts`, `<group visible>`, Step 5E | None | Medium | MIGRATED | REQUIRED_FOR_CUTOVER (satisfied) | existing | Step 5E |
| Reference geometry (raw CAD overlay) | `app.js` `buildRawCad`/`ensureRawCad()`, lazy on first toggle, off by default | `lib/reference-adapter.ts`, `Reference.tsx`, eager fetch, off by default | Fetch timing only (eager vs lazy); rendered output and default visibility identical | Low (diagnostic-only overlay) | PARTIALLY_MIGRATED | NOT_REQUIRED_FOR_CUTOVER (already functionally equivalent; lazy-fetch is a disclosed future optimization, Step 5E) | none new | — |
| Operational-state presentation | `operational-status.js`/`operational-state-adapters.js`, real source is `/api/state` | `lib/operational-state-adapter.ts` (Step 6A/6C), demo-toggle default off, real adapter path built but not wired to any UI | Legacy's production route is wired to real `/api/state` today; candidate's real-data adapter exists (Step 6C, 27/27 tests) but nothing in the UI calls it — only the demo/simulated path is reachable | High | PARTIALLY_MIGRATED | **REQUIRED_FOR_CUTOVER** | new parity test (see §5) | new — needs a UI wiring task, not a redesign |
| Telemetry (`/api/state`) | Polled every `POLL_MS`, drives status strip + inspector | Adapter exists (Step 6C), unwired to any page | Candidate shows only simulated/`UNAVAILABLE`, never real telemetry, in any currently-built route | High | NOT_MIGRATED (adapter exists; consumer does not) | **REQUIRED_FOR_CUTOVER** | new parity test (see §5) | new |
| Alarms / RCA | `/api/alarm-rca`, rendered in inspector | No consumer exists in the candidate at all | Complete absence — no candidate page fetches this endpoint | High | NOT_MIGRATED | **REQUIRED_FOR_CUTOVER** | new parity test (see §5) | new |
| Inspector (click-to-diagnose panel) | `app.js` `showEquipmentInspector` — identity + live state + alarm/RCA + SPC | `SelectedMachinePanel.tsx` — identity only (selected id, Clear button) | Candidate's panel is identity-only; legacy's is a full diagnostic surface | High | NOT_MIGRATED | **REQUIRED_FOR_CUTOVER** | new component + new e2e test (see §5) | new |
| EAP (`/eap.html`) | Separate frontend, same backend | No candidate equivalent exists or is planned | N/A — different route entirely, not part of `/factory-twin-3d/` | N/A to this cutover | NOT_IN_SCOPE | NOT_REQUIRED_FOR_CUTOVER — this is a separate route's own future migration decision, not a `/factory-twin-3d/` blocker | none | — |
| LDI (data domain) | Consumed via `/api/state`, also independently in Grafana | Same as "Telemetry" row above — not a separate item | N/A | — | see "Telemetry" row | see "Telemetry" row | — | — |
| TRUE_POLYGON outlines | `app.js` renders true per-machine outline for `TRUE_POLYGON` display machines | Bounding-rectangle fallback for the same 14 machines, disclosed | Visual fidelity only on 14/431 machines; fallback is honest, not fabricated | Low | NOT_MIGRATED | NOT_REQUIRED_FOR_CUTOVER | future visual-parity test if built | deferred |
| Additional camera modes (overview/inspection/machine-focus) | Does not exist in legacy either — only view presets + fit | Does not exist | None — nothing legacy has is lost | N/A | NOT_MIGRATED (candidate-side future capability, not a legacy feature) | NOT_REQUIRED_FOR_CUTOVER | n/a | — |
| Zone/functional layer toggle | `app.js` `buildFunctionalZones` toggle | No rendered component exists | Candidate cannot show/hide the zone overlay at all | Low-Medium (a secondary overlay control, not the core geometry/machine/selection loop) | NOT_MIGRATED | NOT_REQUIRED_FOR_CUTOVER — DEFERRED, revisit if operator feedback post-cutover says otherwise | future test if built | deferred |
| Loading/error handling | Plain DOM fallback on failure, no typed boundary | `loading.tsx`/`error.tsx`, Step 11-fixed Retry | Candidate's is a real improvement over legacy, not a reproduction | Medium | MIGRATED (exceeds legacy) | REQUIRED_FOR_CUTOVER (satisfied) | existing | Step 11 |
| WebGL lifecycle (context loss/restore) | `app.js`/`eap.js` duplicated state machine | `hooks/useWebglLifecycle.ts` (Step 9, shared) | None — same state sequence, deterministic | High (silent failure here is invisible to users until it breaks) | MIGRATED | REQUIRED_FOR_CUTOVER (satisfied) | existing | Step 9/10/12 |
| Accessibility | `ui-visual-regression.js` (legacy), axe 0 violations, PR #21/#23 | axe wired into every candidate Playwright suite, 0 serious/critical at every tested viewport | None found | Medium-High (compliance requirement, not optional) | MIGRATED | REQUIRED_FOR_CUTOVER (satisfied) | existing, re-run at cutover time | Step 10 |
| Responsive behavior | `ui-visual-regression.js`: 1366/1920/2560/3840 (no mobile — desktop-kiosk product) | Same 4 widths tested, identical scope, no mobile (same product category) | None — matching scope, not a gap | Medium | MIGRATED | REQUIRED_FOR_CUTOVER (satisfied) | existing | Step 10 |

## 2. Core vs. supporting vs. external

### Core Factory Twin (required to replace the legacy operational experience)

Geometry, machines, selection, camera, layers, WebGL lifecycle, loading/error handling,
accessibility, responsive behavior — **already MIGRATED and satisfied**. Plus three items
**not yet satisfied**: real telemetry wiring, alarm/RCA consumption, and a real inspector
panel — these three together are what "replacing the legacy operational experience" actually
requires, because without them an operator loses the ability to diagnose a machine at all,
which is the single most load-bearing daily use of `/factory-twin-3d/` today.

### Supporting / secondary (may remain deferred)

Reference-geometry fetch timing (already functionally equivalent), TRUE_POLYGON true
outlines (visual-only, 14/431 machines), additional camera modes (net-new capability, not a
legacy feature), zone-layer toggle (a secondary overlay control).

### External systems (not owned by Factory Twin, must not be duplicated into it)

- **alarm-api**: a separate write-path service. Factory Twin (legacy or candidate) must
  never call it directly for rendering — it reads the same underlying tables through its own
  `server.js` routes, exactly as legacy already does.
- **Grafana / LDI dashboards**: a wholly separate product surface. Factory Twin has never
  embedded a Grafana panel and should not start doing so as part of this migration.
- **EAP (`/eap.html`)**: a sibling route sharing the same backend as `/factory-twin-3d/`, but
  a distinct frontend with its own migration decision, independent of this one.

**Recommendation for the three REQUIRED_FOR_CUTOVER gaps**: consume `/api/state` and
`/api/alarm-rca` through the existing factory-twin-3d backend contracts — exactly as legacy
does — never reimplement the underlying SQL/business logic (`lib/telemetry.js`, `lib/alarm.js`)
inside `services/factory-twin-3d-next`. Step 6C's `lib/operational-source-adapter.ts` already
does this correctly for `/api/state` (typed, validated, identity-gated) — it needs a UI
consumer wired to it, not a new backend.

## 3. Architecture decision

```
Next.js Factory Twin (presentation only)
        |  HTTP, existing unmodified contracts
        v
factory-twin-3d server.js: /api/floor-geometry, /api/state, /api/alarm-rca,
                            /api/physical-overlay, /api/floor-raw-cad
        |
        v
lib/*.js (wire.js, telemetry.js, alarm.js, mapping.js, analytics.js, ...)
  -- existing query/business logic, UNTOUCHED by this migration
        |
        v
TimescaleDB (ldi_* tables) + private/ CAD files -- authoritative sources, UNTOUCHED
```

Explicit prohibitions, all already true of the current candidate and required to stay true:

- **No database logic in the frontend.** Every `lib/*-adapter.ts` in
  `services/factory-twin-3d-next` only validates and reshapes JSON already returned by an
  existing `server.js` route — zero SQL, zero DB client, anywhere in the candidate (grep-
  confirmed this session, unchanged).
- **No alarm/RCA logic duplicated.** The recommendation above is to consume
  `/api/alarm-rca` as-is; building the required inspector must not re-derive RCA/lift/
  correlation logic client-side.
- **No Floor 1 identity coupling into visualization code.** `GeometryScene.tsx`/
  `Machines.tsx` already take a pre-resolved `Asset[]` — they never read
  `private/floor1-asset-mapping.json` or any identity file directly, and must not start.

## 4. Migration gate — REQUIRED_FOR_CUTOVER set

Every item below currently has FAIL as its live status; each MUST turn PASS, with the stated
evidence, before a cutover authorization.

| Item | Acceptance criterion | Test | Evidence | Failure condition |
|---|---|---|---|---|
| Real telemetry | Candidate's operational-state presentation is driven by `lib/operational-source-adapter.ts` (Step 6C) reading real `/api/state`, not the demo toggle, for at least one wired route | New script: for ≥50 sampled (device, timestamp) pairs, assert candidate's rendered state code (`RUN`/`IDLE`/`DOWN`/`NO_DATA`/`UNAVAILABLE`) equals legacy's rendered state code for the identical device at the identical poll | New test file under `tests/playwright/` or `tests/unit/`, committed and passing | Any state-code mismatch for the same device/timestamp; any candidate-rendered state legacy did not independently show (fabrication) |
| Alarm/RCA consumption | A candidate component fetches `/api/alarm-rca` and renders the same fields legacy's inspector shows (alarm code, severity, RCA lift/correlation, timestamp) for a given equipment id | Fetch `/api/alarm-rca` directly once, render both legacy and candidate for the same equipment id, diff every field | New parity test file | Any field-value mismatch; any field legacy renders that candidate omits when real data exists for it |
| Inspector panel | Selecting a machine opens a panel exposing, at minimum, identity + live state + alarm/RCA — the same information categories `showEquipmentInspector` exposes, sourced only from `/api/state`+`/api/alarm-rca` (no new backend) | New Playwright suite modeled on legacy's own `factory-twin-inspector-e2e.js`, asserting each category renders for a known test asset with real data | New component + new test file | Any information category present in legacy's inspector for an asset with real data, absent from candidate's panel for the same asset |
| Regression (already-migrated items stay green) | Full existing suite passes unchanged at cutover time | `node scripts/pre-commit.js`, unit 81/81, R3F 296/296, hydration 10/10, backend-recovery 7/7, all re-run fresh (not reused from this session's numbers) | Fresh CI/local run at cutover time | Any new failure not already disclosed as the known pre-existing flake |
| Accessibility/responsive stays green | 0 serious/critical axe violations at legacy's own 4 tested viewports, re-confirmed at cutover time | Existing candidate Playwright suites' own axe assertions | Fresh run at cutover time | Any new violation |

No item above uses "looks equivalent" or an unmeasured judgment call — every row is a
concrete diff/count/pass-fail check against a named source of truth.

## 5. Proxy verification — future gate, not a passed result

**Not re-run this phase or the prior one.** Step 11's disposable-nginx attempt hit a
Windows/Git-Bash Docker volume-mount path-translation issue and was abandoned rather than
falsely reported as passing (`FACTORY_TWIN_NEXTJS_CUTOVER_PLAN.md` §5 already discloses this
in full). This section defines what the future production-migration rehearsal must verify,
against a real, working bind-mount or an alternative (e.g. baking the disposable nginx config
into an image layer instead of a bind mount, to sidestep the path-translation issue
specifically):

| Item | What "verified" means |
|---|---|
| `/factory-twin-3d` base path | The exact `location /factory-twin-3d/` + `location = /factory-twin-3d` two-line shape (Step 2's proven fix) resolves through the real, current `proxy/nginx.conf` content at rehearsal time — not assumed unchanged since Step 2/Step 8 |
| Static assets | A real `/factory-twin-3d/_next/static/chunks/*.js` request through the proxy returns 200 with correct content, not just the page shell |
| RSC requests | The `?_rsc=...` request the Retry button issues (Step 11/12's own fix) succeeds through the proxy, not only against the bare container port |
| Refresh | A hard browser refresh of `/factory-twin-3d/geometry-candidate` (or whatever route is live at cutover) through the proxy produces the same deterministic SSR markup this session already proved at the bare port |
| Direct navigation | Navigating straight to a deep route (not via in-app click) through the proxy 200s, matching bare-port behavior |
| Auth behavior | The real `auth_request` block (not the stubbed-200/stubbed-401 pair Step 8 used) is exercised — a real Grafana session cookie present vs. absent, through the proxy, to the candidate |
| Backend failure | With the real backend down, the proxy still returns the error boundary (digest only, no leak) through the full proxy path, not just the bare container |
| Retry recovery | The Step 11/12 fix (`retry`, not `reset`) still issues its real RSC re-fetch through the proxy once the backend recovers |

This table is a checklist for a future rehearsal. None of its rows are marked done by this
phase.

## 6. No implementation changes this phase

`git status --short` confirms this document is the only file this phase touched. No file
under `services/factory-twin-3d-next`, no legacy Factory Twin file, no nginx, docker-compose,
database, Grafana, Node-RED, CAD, Floor 1 registry, or identity-mapping file was read for
write purposes or modified.

## 7. Floor 1 — unchanged

Grid correction remains `WAITING_FOR_ENGINEERING_GRID_DECISION`. Identity mapping remains
`0/431 — NOT_READY`. Neither is touched, reinterpreted, or referenced as a gate item above.

## Files changed this phase

- `docs/evidence/FACTORY_TWIN_NEXTJS_FEATURE_GAP_MATRIX.md` (this file, new)

**No implementation of any REQUIRED_FOR_CUTOVER item begins automatically from this
document.** The next action is a human decision on whether/when to authorize building the
three real gaps identified in §4, not an automatic continuation.
