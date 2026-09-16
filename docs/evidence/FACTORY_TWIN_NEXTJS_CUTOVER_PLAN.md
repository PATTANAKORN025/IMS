# Factory Twin Next.js — Migration & Cutover Plan (Phase 13A)

Read-only planning document. No code, config, nginx, docker-compose, database, Grafana,
Node-RED, CAD, or Floor 1 file touched by this phase. Built directly from
`docs/evidence/FACTORY_TWIN_NEXTJS_MIGRATION_REVIEW.md`'s own findings (commit `be992a2e`) —
no new feature-parity claim invented here beyond what that document already established.

## 1. Feature matrix

| Capability | Classification | Legacy implementation | Blocks full replacement? |
|---|---|---|---|
| Factory geometry (walls/columns/openings/footprint/grid) | **MIGRATED** | `app.js` scene-build functions, served via `/api/floor-geometry` | No |
| Machine rendering | **MIGRATED** | `app.js` `buildEquipmentLayer`, `InstancedMesh` | No |
| Selection | **MIGRATED** | `app.js` `pickEquipment`/`pickColumn` raycasting | No |
| Camera controls (orbit/pan/zoom) | **MIGRATED** | `app.js` `OrbitControls` instance | No |
| Reset camera | **MIGRATED** | `app.js` `resetView` | No |
| Fit factory | **MIGRATED** | `app.js` `refitViews`/`frameBounds` | No |
| Layer controls (geometry/grid/machines) | **MIGRATED** | `app.js` `setLayerVisible` | No |
| WebGL lifecycle (context loss/restore) | **MIGRATED** | `app.js`/`eap.js` duplicated `handleContextLost`/`attemptContextRecovery`/etc. | No |
| Error/loading behavior | **MIGRATED** | Legacy has no equivalent typed error boundary (plain DOM fallback) — candidate's is a real improvement, not a reproduction | No |
| Reference geometry (raw CAD overlay) | **PARTIALLY_MIGRATED** | `app.js` `buildRawCad`/`ensureRawCad()` (lazy, fetched only on first toggle) | No — candidate fetches eagerly instead of lazily; renders correctly, default visibility (off) matches; a timing-only divergence, disclosed in the migration review §1, not a functional gap |
| Layer toggle: functional/zone | **NOT_MIGRATED** | `app.js` `buildFunctionalZones` zone overlay toggle | **Yes** — legacy production route has this control today; candidate has no rendered component for it at all |
| TRUE_POLYGON true-outline rendering | **NOT_MIGRATED** | `app.js` renders true per-machine outline geometry for machines with `TRUE_POLYGON` display; candidate falls back to bounding-rectangle for the same 14 machines | **Yes, for visual fidelity on those 14 machines specifically** — not a correctness defect (rectangle is a disclosed, honest fallback), but not equivalent to legacy's own rendering either |
| Multiple camera modes (overview/inspection/machine-focus) | **NOT_MIGRATED** | Legacy `app.js` does not have named camera *modes* either (only view presets + fit) — this is a disclosed *future candidate capability*, not a legacy feature being dropped | No — nothing legacy has today is lost here |
| Operational-state presentation | **PARTIALLY_MIGRATED** | `operational-status.js`/`operational-state-adapters.js`, shared module, real adapter honestly `UNAVAILABLE` (0/431 identity mapping — same gap on both sides) | No — the real-data gap is identical on both sides (Step 6B/6C already established this is a data-governance gap, not a candidate-specific regression); candidate's presentation layer is built and correct for whatever data exists |
| Telemetry / live alarms / RCA / inspector / EAP / LDI | **NOT_MIGRATED** | `app.js` inspector (`showEquipmentInspector`), alarm/RCA endpoints, full EAP (`eap.js`) and LDI dashboards — all live, all real production functionality today | **Yes, unambiguously** — this is the single largest gap; a cutover today would remove live alarm/RCA/inspector/EAP/LDI visibility entirely |
| CSS/Tailwind design-token parity | **NOT_IN_SCOPE** | Migration-plan Step 7, not started (`docs/evidence/FACTORY_TWIN_ARCHITECTURE_GAP_AUDIT.md` Step 4's migration table) — no candidate work exists to classify yet | Not applicable — no claim either way |
| Legacy WebGL-lifecycle dedup (`app.js`/`eap.js`) | **NOT_IN_SCOPE** | Migration-plan Step 2/Step 10 (this session's own plan), independent of this candidate's cutover readiness — legacy code, not touched by the Next.js candidate at all | Not applicable — this is legacy-internal cleanup, orthogonal to cutover |

No feature above is marked MIGRATED without the exact evidence line already recorded in
the migration review (§1 there); nothing here upgrades a PARTIALLY_MIGRATED or NOT_MIGRATED
item to MIGRATED.

## 2. Cutover gate

A future cutover phase may proceed **only when every one of these is independently true at
that time** — this list is prerequisites, not a status report; none are claimed satisfied
by this phase:

| Prerequisite | Last known status (from Step 12) | Source |
|---|---|---|
| Production build PASS | PASS | migration review §0/§6 |
| Standalone container PASS | PASS | migration review §0/§6 |
| Health PASS | PASS | migration review §5/§6 |
| Geometry route PASS | PASS | migration review §6 |
| Backend failure PASS | PASS | migration review §5/§6 |
| Retry recovery PASS | PASS (fixed Step 11, re-verified Step 12) | migration review §5/§6 |
| Hydration PASS | PASS | Step 9/10/11/12, 10/10 each re-run |
| WebGL recovery PASS | PASS | migration review §5, `scene-orchestration.js` 76/76 |
| Regression PASS | PASS as of `be992a2e` | migration review §7 |
| Security PASS | PASS | migration review §4 |
| **Production proxy verification PASS** | **NOT re-verified this session** | see §6 below — historical only (Step 2/Step 8) |
| Feature parity requirements satisfied | **Not satisfied** — telemetry/alarms/RCA/inspector/EAP/LDI, zone-layer toggle, TRUE_POLYGON outlines remain gaps (§1 above) | this document §1 |
| Rollback path verified | Defined here (§3), **not yet exercised live** | this document §3 |

Because "feature parity requirements satisfied" and "production proxy verification PASS"
are both currently false, **the cutover gate is not met today.** This matches
`READY_WITH_GAPS`, not `READY_FOR_MIGRATION` — consistent with the migration review's own
conclusion, not a stricter or looser standard invented here.

## 3. Rollback

Rollback target: `/factory-twin-3d/` continues to be served by the legacy
`services/factory-twin-3d/` Express app, exactly as it is today.

**Rollback is reversible at the routing/service layer only.** Explicitly does NOT require:

- Database rollback — neither service owns schema; both read the same live backend/DB state
  through existing, unmodified query paths. No migration, no data write, from either service.
- CAD rollback — the candidate never re-parses or duplicates CAD; it calls the exact same
  `/api/floor-geometry` the legacy app itself serves from `private/floor1-geometry.json`.
  Nothing about the CAD source depends on which frontend is live.
- Identity rollback — 0/431 identity mapping is a data-governance fact independent of which
  frontend serves `/factory-twin-3d/`; switching frontends changes nothing about
  `private/floor1-asset-mapping.json`.
- Grafana rollback — Grafana dashboards do not embed or depend on the Factory Twin frontend
  choice.
- Node-RED rollback — Node-RED's simulator/ingestion pipeline is upstream of both frontends
  equally; neither frontend is a Node-RED consumer or producer.

**Mechanism** (once an actual cutover is authorized and executed, not now): a real cutover
would need `proxy/nginx.conf`'s `location /factory-twin-3d/` block repointed from the legacy
Express container to the candidate container (the two-line fix already documented and
spike-proven in `FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`, not re-derived here). Rollback is the
same edit run in reverse: repoint `location /factory-twin-3d/` back to the legacy container.
Both containers can run side-by-side throughout (Step 8 already proved the candidate needs no
shared port/volume/process with the legacy service), so rollback requires no rebuild, no data
migration, and no downtime beyond a single nginx reload.

## 4. Production change plan (future sequence — not executed by this phase)

1. Build candidate (standalone entrypoint, now fixed and verified — Step 12).
2. Validate candidate container (the 10-item deployment-reproducibility check, Step 12 §6,
   re-run fresh at cutover time rather than reused from this session).
3. Deploy candidate beside legacy — both running, candidate not yet reachable through
   `proxy/nginx.conf`, matching Step 8's already-proven isolation.
4. Health check — candidate's own `/health` route, plus a fresh full route/backend-failure/
   Retry/WebGL-recovery pass against the just-deployed instance.
5. Controlled route switch — the documented two-line nginx change (§3), applied only after
   an explicit human go-ahead, never automatically by any phase in this plan.
6. Smoke test — the exact route matrix from the migration review (§0/§1 there), re-run
   against the now-live candidate through the real proxy, not a bare port.
7. Monitor — a bounded observation window (duration to be decided by whoever authorizes the
   cutover, not fixed by this document) watching for hydration errors, WebGL resource growth,
   backend-failure/Retry behavior, and the feature gaps in §1 above (are they tolerable in
   practice, or does an operator immediately need the missing telemetry/alarm/RCA/inspector/
   EAP/LDI functionality?).
8. Rollback immediately if any gate in step 4 or 6 fails, or if monitoring in step 7 surfaces
   a regression — using the mechanism in §3, no code change required.

**None of steps 1-8 above are executed by this phase.** This is a description of a future
sequence, written for whoever authorizes the actual cutover.

## 5. Proxy limitation — explicit disclosure

**The most recent spike (Step 11, this session) did not independently re-run the disposable
nginx reverse-proxy check.** A disposable `nginx:alpine` container with a config reproducing
the real `proxy_pass`/`auth_request`/basePath shape was attempted; the config bind-mount
(`-v /tmp/....:/etc/nginx/conf.d/default.conf`) hit a Windows/Git-Bash path-translation issue
and the container served its own stock default config instead of the intended one — confirmed
via `nginx -T` inside the container showing the wrong `listen 80` block, not the intended
`listen 8090`/`8091`. The attempt was abandoned rather than reported as a false pass; Step 11
and Step 12 both fell back to verifying routes directly against the candidate's own port
instead, which is a real but narrower proof (confirms the Next.js app itself is correct, not
that today's exact nginx config change is still compatible).

**The only currently valid evidence for the real proxy/basePath compatibility fix is
historical**, from earlier in this migration, not refreshed this session:

- Step 2's original spike (`FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`): a disposable nginx copy of
  today's exact config shape, found the real incompatibility (basePath'd Next 404s against
  today's `proxy_pass` without the two-line fix), then confirmed the fix end-to-end
  (`:8083` variant, page + a real `_next/static` chunk + a static asset all 200).
- Step 8's own re-verification (`FACTORY_TWIN_NEXTJS_SERVICE_BOUNDARY.md`): the same proven
  shape re-run against the real containerized service (not a bare host process) on a
  disposable port, confirmed still working.

**A cutover must not proceed on the assumption that this remains true today without a fresh
re-run** — `proxy/nginx.conf` may have changed since either of those two prior spikes (this
plan did not diff it against either spike date). Re-running the proxy check with a
successful bind mount (or an alternative that avoids the Windows/Git-Bash path-translation
issue — e.g. building the config into a disposable image layer instead of a bind mount) is
listed as an open item, not assumed solved.

## 6. Floor 1 — explicitly unchanged

- **Grid correction**: remains `WAITING_FOR_ENGINEERING_GRID_DECISION` (Phase 12I). Not
  touched, not reinterpreted, not silently advanced by this plan.
- **Identity mapping**: remains `0/431 — NOT_READY`. Not touched, not reinterpreted, not
  silently advanced by this plan.

Neither is a prerequisite in §2's cutover gate, and neither is resolved or affected by
anything in this document — they are separate data-governance tracks, exactly as the prior
phase's own instruction required.

## Files changed this phase

- `docs/evidence/FACTORY_TWIN_NEXTJS_CUTOVER_PLAN.md` (this file, new)

No other file read, written, or touched. No nginx, docker-compose, legacy service, CAD,
Floor 1 registry, identity mapping, database, Grafana, or Node-RED file modified.

**This is a plan, not an execution record.** No step in §4 has been performed. The cutover
gate in §2 is not met today (feature parity gaps in §1, proxy verification not refreshed in
§5).
