# FT-24.6 Phase 0 — EAP Architecture Audit

Real file inspection this session (`services/factory-twin-3d/` plus every
`docs/eap*`/`docs/architecture/EAP_ARCHITECTURE.md` file), cross-checked
against the existing test suites (`tests/unit/eap-map-wire.test.js`,
`tests/lint/eap-node-model-contract.js`,
`tests/playwright/eap-map-regression.js`,
`tests/playwright/eap-canonical-route-regression.js`), all re-run this
session with 0 failures. **No production code was modified during this
phase** — Phase 0 is audit-only, per this phase's own instruction.

## Naming disambiguation, stated up front

Two unrelated things in this codebase are both called "EAP":

1. **Equipment Automation Program** (`docs/architecture/EAP_ARCHITECTURE.md`)
   — the SNMP/HTTP-JSON telemetry-ingestion adapter architecture
   (Node-RED flows into `public.devices`/telemetry tables). Backend
   ingestion, unrelated to any rendered map.
2. **The Floor 1 EAP Operational Map** (`eap.html`/`eap.js`/
   `lib/eap-map.js`, documented across the five `docs/eap-floor1-*.md`/
   `docs/eap-operational-*.md` files) — a client-side visualization of a
   reference SCADA/EAP layout image's 210 operational cells. This audit,
   and this phase's own objective, is about **this second one only**.
   The name collision is real and pre-existing, not introduced here;
   flagged so nobody conflates the two architectures.

## Prior work this audit builds on, not repeats

This exact audit (source of truth, canonical model, positioning, cleanup,
lineage) was already done, in five separate, real, evidence-heavy prior
phases, each with its own status line and its own numbers verified by a
dedicated test suite:

| Existing document | What it already establishes |
|---|---|
| `docs/eap-operational-node-reconciliation-floor1.md` | The reference layout's 210 cells vs. the CAD drawing's 331 raw candidates — why the two numbers differ, zone-by-zone, with every special case and duplicate named |
| `docs/eap-floor1-node-model.md` | The canonical 331→210→171 entity model (CAD candidates / EAP cells / machine units) as first-class, never-blended counts; the private JSON contract |
| `docs/eap-floor1-spatial-registration.md` | Exactly which cells can reach true CAD world coordinates (40), which reach only a world region (167), and which reach neither (3) — no transform accepted without a residual test |
| `docs/eap-floor1-operational-footprint.md` | The wire contract: which frame each cell draws in, what a renderer may and may not do at each evidence level, enforced by `tests/lint/eap-node-model-contract.js` |
| `docs/eap-operational-map-renderer.md` | Why the renderer reads the node model instead of the physical CAD equipment pipeline, and what it draws (210 cells, 2 instanced batches, 3 draw calls) |

**This audit's own job is narrower and different**: verify these five
phases' conclusions still hold today (they do — every cited test still
passes), classify every relevant file for this phase's own required
taxonomy, and find any real, currently-uncorrected defect (found: 3, all
fixed and disclosed in `EAP_VALIDATION.md`).

## File-by-file classification

| File | Classification | Ownership | Source of truth | Consumers | EAP map? | Separate domain? |
|---|---|---|---|---|---|---|
| `services/factory-twin-3d/lib/eap-map.js` | **EAP** (model/wire projection) | This audit's own domain | `private/floor1-eap-node-model.json` (private, gitignored) | `server.js`'s `/api/eap-map` route, `eap.js` | Yes — this IS the EAP map's data layer | No |
| `services/factory-twin-3d/public/eap.js` | **EAP** (renderer) | This audit's own domain | The wire payload `/api/eap-map` projects, plus `/api/floor-geometry` for the real floor shell it draws under the schematic | Browser only | Yes | No |
| `services/factory-twin-3d/public/eap.html` | **EAP** (UI shell) | This audit's own domain | n/a (markup/CSS) | Browser only | Yes | No |
| `services/factory-twin-3d/private/floor1-eap-node-model.json` | **EAP** (private data) | Gitignored, deployment-provided | The reference layout image + Floor 1 CAD drawing (see the reconciliation doc's own §B) | `lib/eap-map.js` only | Yes | No |
| `services/factory-twin-3d/lib/mapping.js` | **CAD / OPERATIONAL** | Shared | `private/floor1-mapping.json` (CAD-to-IMS identity) | `server.js`'s physical-twin routes, `lib/telemetry.js`, `lib/alarm.js` | **No** — a completely different mapping file, a different entity (physical CAD equipment ↔ IMS device), never read by `lib/eap-map.js` | Belongs to the physical Factory Twin domain |
| `services/factory-twin-3d/lib/telemetry.js` | **TELEMETRY** | Physical twin | `v_ldi_machine_latest_full` (DB view) | `server.js`'s `/api/state` route | No | Yes — LDI/IMS domain |
| `services/factory-twin-3d/lib/alarm.js` | **ALARM** | Physical twin | `ldi_alarm_log`/`ldi_alarm_lifecycle` (DB) | `server.js`'s `/api/alarm-rca` route | No | Yes |
| `services/factory-twin-3d/lib/spc.js` | **SPC** | Physical twin (FT-21) | Raw `ldi_data` | `server.js`'s `/api/spc`, `/api/predictive*` routes | No | Yes |
| `services/factory-twin-3d/lib/predictive.js` | **PREDICTIVE / EXECUTIVE** | Physical twin (FT-22/23/24) | `lib/spc.js`'s own outputs | `server.js`'s `/api/predictive*` routes | No | Yes |
| `services/factory-twin-3d/lib/analytics.js` | **TELEMETRY** (tiering/quality) | Physical twin | CAGG tiers (`ldi_data_1m/15m/1h`) | `lib/spc.js`, `server.js`'s history routes | No | Yes |
| `services/factory-twin-3d/lib/contracts.js` | **OPERATIONAL** (state vocabulary, server-side) | Shared concept, physical-twin-owned instance | The 8-state plant vocabulary (RUN/IDLE/DOWN/UNDEFINED backed; OFF/INITIAL/PM/STOP listed, unbacked) | `server.js`'s `/api/state` route | No (EAP renders its OWN simulated states via `operational-status.js` below, not this file) | Yes |
| `services/factory-twin-3d/public/operational-status.js` | **OPERATIONAL** (state vocabulary, client-side) | Shared module, imported by BOTH `app.js` (physical twin) and `eap.js` | The same 8-state vocabulary as `lib/contracts.js`, restated client-side | `app.js` (`STATUS_ORDER`/`statusForMachineState`), `eap.js` (`OPERATIONAL_STATUS`, `STATUS_ORDER`, for its SIMULATED states) | **Yes, imported directly** (`eap.js:29`) | Shared, not owned by either domain alone |
| `services/factory-twin-3d/lib/schematic.js` | Unrelated | Physical twin | n/a | `server.js` | No | Yes |
| `services/factory-twin-3d/lib/wire.js` | **RENDERER** (physical-twin wire shaping) | Physical twin | CAD equipment pipeline | `server.js`'s `/api/floor-geometry` route | Indirectly — `eap.js` also fetches `/api/floor-geometry` for the real floor shell, but reads it read-only, never through `lib/wire.js` directly | Yes |
| `services/factory-twin-3d/lib/diagnostics.js` | **API** (ops/runtime) | Physical twin | Runtime counters | `server.js`'s `/api/diagnostics` | No | Yes |
| `services/factory-twin-3d/lib/floors.js` | **CAD** (floor catalogue) | Shared | `private/<floor>-*.json` presence on disk | `server.js`, both `/api/floor-geometry` and (indirectly) `/api/eap-map` | Yes — same floor catalogue both pages use | Shared |
| `services/factory-twin-3d/public/app.js` | **RENDERER / UX / EXECUTIVE** | Physical twin | n/a (client renderer) | Browser | No | Yes |
| `services/factory-twin-3d/server.js` | **API** (routing) | Shared host | n/a | Both pages' fetches | Hosts `GET /api/eap-map` (line ~1785) alongside every physical-twin route | Shared, but the ROUTE HANDLERS are cleanly separable (see below) |

## The `/api/eap-map` route itself (server.js:1785)

```js
const eapMap = require('./lib/eap-map');          // server.js:18
app.get('/api/eap-map', (req, res) => {           // server.js:1785
```

Reads the private node-model JSON and the floor envelope, calls
`eapMap.project()`, returns the wire payload. **Zero references to
`lib/mapping.js`, `lib/telemetry.js`, `lib/alarm.js`, `lib/spc.js`, or
`lib/predictive.js` inside this route or inside `lib/eap-map.js` itself**
(confirmed by a real grep this session — see `EAP_VALIDATION.md`'s
coupling scan). The route is already, today, completely independent of
every LDI/telemetry/alarm/SPC/predictive module; it could be extracted to
a separate service with a copy of `floors.js`/`lib/eap-map.js` and
`floor1-geometry.json`/`floor1-eap-node-model.json` and nothing else.

## Phase 6 finding: no cleanup required

**Do NOT simply add more code to the existing mixed implementation** was
this phase's own instruction; the audit's job was first to check whether
there IS a mixed implementation to clean up. There is not: `lib/eap-map.js`
is the sole model/projection module for the EAP map, `eap.js`/`eap.html`
are its sole renderer/shell, and the physical twin's own
`lib/mapping.js`/`telemetry.js`/`alarm.js`/`spc.js`/`predictive.js` are
never imported by, or referenced from, any of them. The one shared file
(`operational-status.js`) is shared BY DESIGN — the same 8-state plant
vocabulary, not duplicated into a second enum — and is exactly the kind of
sharing this engagement's own standing discipline endorses ("do not merge
states," satisfied because there is only ever one definition to merge
into). **No file was removed, isolated, or restructured this phase**; none
of the proven-duplicated-logic conditions Phase 6 gates a removal on were
found.

## Real defects found and fixed this phase (Phase 0 found none in scope; found during Phases 8/9 verification)

See `EAP_VALIDATION.md` for full detail: 2 real accessibility defects
(`color-contrast`, missing `<main>` landmark / unfocusable scrollable
`aside`) and 1 real performance defect (labels redrawn unconditionally
every frame) — all in `eap.html`/`eap.js` only, none in `lib/eap-map.js`
or any shared/physical-twin file.
