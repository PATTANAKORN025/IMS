# Factory Twin Next.js — Production Migration Review (Step 12)

Read-only migration-readiness review + one deployment-entrypoint fix (package.json script
only — no production file touched). Production `proxy/nginx.conf`, `docker-compose.yaml`,
legacy `/factory-twin-3d/` service, CAD source, and Floor 1 identity mapping were not
modified. Measured against commits `228c3c79` (Step 9), `c88a96d3` (Step 10 audit),
`659766cb` (Step 11 fix), plus this step's own entrypoint correction.

## 0. Deployment entrypoint mismatch — resolved

**Root cause**: `package.json`'s `start` script ran `next start -p 4310`, which does not
match `next.config.ts`'s `output: 'standalone'` — Next's own runtime warning, confirmed in
Step 11. `Dockerfile.spike` (Step 8) already used the correct entrypoint
(`.next/standalone/services/factory-twin-3d-next/server.js`); only the host-level script
disagreed with the container.

**Fix** (candidate service only, 4 files):
- `package.json`: `start` → `node scripts/start-standalone.js`; added `postbuild` →
  `node scripts/copy-standalone-static.js` (npm's own lifecycle hook, no extra wiring).
- New `scripts/copy-standalone-static.js`: copies `.next/static` into the standalone
  output tree — Next's own documented requirement, previously done only inside
  `Dockerfile.spike`'s `COPY`, now done identically for host-level runs.
- New `scripts/start-standalone.js`: sets `PORT`/`HOSTNAME` defaults (4310 / 0.0.0.0)
  without overriding an explicit caller value, then requires the generated `server.js` —
  cross-platform (no `VAR=x node …` shell syntax, which `cmd.exe` doesn't support), matching
  root `CLAUDE.md`'s stated cross-platform requirement.

**Verified**: clean rebuild → `next start` mismatch warning gone entirely; `Ready in 0ms`
(standalone's own startup path) on port 4310; all 3 routes 200; a real static JS chunk
(`/factory-twin-3d/_next/static/chunks/*.js`) serves 200 through the corrected entrypoint.
`Dockerfile.spike`'s own `COPY --from=build .../.next/static ...` line is now redundant with
the new `postbuild` step inside the same build (harmless — same source, same destination,
idempotent) — disclosed, not cleaned up (Dockerfile.spike is explicitly disposable/spike-only
per its own header, out of scope to edit further).

## 1. Functional parity

| Capability | Migrated? | Evidence |
|---|---|---|
| Factory geometry (walls/columns/openings/footprint/grid) | **Migrated** | Step 5A: exact vertex/coordinate parity, 587 walls/202 columns/52 openings/20 footprint vertices, `===` equality against the same `/api/floor-geometry` legacy consumes |
| Machine rendering | **Migrated** | Step 5B: 431/433 rendered (2 `duplicate_of`-excluded, matching legacy's own rule byte-for-byte) |
| Selection | **Migrated** | Step 5C: 431/431 uniquely addressable, deterministic |
| Camera controls (orbit/pan/zoom) | **Migrated** | Step 4/5D: `OrbitControls`, damped, matches legacy's own damping setting |
| Reset camera | **Migrated** | Step 5D: `resetToken` one-shot, live-verified this session (button present, wired) |
| Fit factory | **Migrated** | Step 5D: closed-form bounding-sphere fit, reuses legacy's own `frameBounds()` direction vector |
| Layer controls | **Migrated** | Step 5E: 4 layers (geometry/grid/machines/reference), each an independent `<group visible>` crossing point |
| Reference geometry (raw CAD overlay) | **Partially migrated** | Step 5E: renders correctly, but fetches eagerly rather than legacy's lazy-on-toggle `ensureRawCad()` — disclosed divergence, default visibility unchanged (off) |
| Operational-state presentation | **Partially migrated** | Step 6A/6C: presentation layer built and correct (4/8-state vocabulary, `NO_DATA`≠`DOWN` rule enforced), but the real adapter is honestly `UNAVAILABLE` for all 431 assets (0/431 identity mapping, same gap legacy's own `operational-state-adapters.js` already discloses) — a demo-only toggle substitutes simulated data, never claimed as live truth |
| WebGL lifecycle (context loss/restore) | **Migrated** | Step 4/5F/9: single shared owner (`hooks/useWebglLifecycle.ts`), deterministic across repeated cycles, this session's own re-verification (Steps 9-12) |
| Error/loading behavior | **Migrated** | Phase 12D built it; Step 11 found and fixed a real defect (Retry didn't retry); re-verified this step against both the corrected host entrypoint and a real container |
| Telemetry / live alarms / RCA / inspector / EAP / LDI | **Not migrated** | Explicitly deferred per the migration plan's own "Next phase" gate — no code exists for this in the candidate |
| TRUE_POLYGON true-outline rendering | **Not migrated** | 14 machines still use bounding-rectangle fallback (disclosed scope limit since Step 5B) |
| Multiple camera modes | **Not migrated** | Only the single preset set (view/reset/fit) exists; overview/inspection/machine-focus modes are a disclosed future candidate, not built |
| Functional/zone layer toggle | **Not migrated** | No rendered component exists for legacy's `functional` zone layer |

## 2. Data parity

Both legacy and candidate call the exact same live backend (`/api/floor-geometry`,
`http://localhost:4196` in this disposable measurement rig) — re-confirmed by direct API read
this step, not assumed:

| Field | Value | Matches prior baseline |
|---|---:|---|
| Envelope | 174.5m × 120.3m | Step 5A, exact |
| Walls | 587 | Step 5A, exact |
| Columns | 202 | Step 5A, exact |
| Openings | 52 | Step 5A, exact |
| Footprint vertices | 20 | Step 5A, exact |
| Functional zones | 32 | Step 5A/7, exact |
| Grid lines (X/Z) | 21 / 14 | Step 6D/7, exact |
| Equipment records | 433 (431 rendered, 2 `duplicate_of`) | Step 5B, exact |

Adapter-level `===` equality against the raw API response was already proven in Step 5A/5B
(re-derivation not repeated this step — no adapter file changed since). No source data
modified. Simulated operational data (demo toggle) is never treated as production truth —
it is off by default and the real adapter's own honesty (`UNAVAILABLE`) is unchanged.

## 3. Performance parity

All measured live this step or the prior two steps against the identical scene state
(all layers on, then reference on) — no invented targets, no new targets introduced:

| Metric | Measured | Baseline (Step 5E/5F) |
|---|---:|---:|
| Draw calls, all layers on | 11 | 11 |
| Triangles, all layers on | 15,282 | 15,282 |
| Geometries, all-on → reference-on | 11 → 24 | 11 → 24 |
| Textures / programs | 1 / 6 | 1 / 6 |
| JS heap after full layer sweep | flat, no growth (measured 20.5-24.5MB across runs, run-to-run variance, never trending up within a run) | no unbounded growth |
| `controllerMounts` after 3 recovery cycles | 1 | 1 |
| `contextLost`/`contextRestored` | exact lockstep | exact lockstep |
| Initial load (both routes) | 200 within the same request; standalone startup `Ready in 0ms` (vs `next start`'s own prior 236ms) | — |
| Interaction latency (selection) | p50 1.20ms / p95 8.80ms (Step 5C, not re-measured this step) | same |
| Idle rendering | 0 new React renders over 3s idle (r3f-spike suite, re-run this step) | same |
| Context recovery | deterministic PASS across repeated cycles this step | same |

## 4. Security

Re-checked this step, all still true:

- Authentication boundary: none exists in the candidate itself (matches legacy's own model —
  auth is enforced at the nginx `auth_request` layer in front of both, per `proxy/nginx.conf`,
  unmodified and never reached by the candidate).
- Backend endpoint (`FACTORY_TWIN_API_BASE`): server-only `process.env` read, confirmed
  absent from the built client bundle (`grep -rl` against `.next/static`, and this step's
  containerized build, zero matches).
- Client bundle: no secrets (Step 10's false-positive-confirmed grep re-verified, same
  result: only the WHATWG URL polyfill's own field name and React DOM's `input[type=password]`
  enum).
- Error responses: digest only, live-verified again this step through both the corrected host
  entrypoint and the real container — no URL, no stack, no message.
- Redirects: only Next's own standard trailing-slash 308, no custom redirect logic (zero
  `window.location`/`redirect()` hits, unchanged from Step 10).
- Unsafe HTML: zero `dangerouslySetInnerHTML`/`eval`/`new Function` (unchanged from Step 10).
- Direct API exposure: the candidate exposes no API of its own beyond `/health` (status/
  version/buildId/environment only) — `/geometry-candidate` and `/r3f-spike` are pages, not
  API routes; the real backend API stays server-side only.
- Isolation: `grep -n "factory-twin-3d-next" proxy/nginx.conf docker-compose.yaml` — zero
  matches, re-confirmed this step.

## 5. Operational readiness

| Item | Result |
|---|---|
| Health endpoint | `/factory-twin-3d/health` → 200, `{status,application,version,buildId,environment}`, no secrets |
| Startup | Standalone entrypoint: `Ready in 0ms` (host) / container healthy within its own `--start-period=10s` healthcheck window |
| Shutdown | Container `docker stop` — clean, no hang, re-verified this step |
| Restart | Container `docker start` after stop — health 200 again, re-verified this step |
| Graceful failure | Backend down → error boundary, generic message + digest, 200 status (Next's own streaming-SSR contract), no crash |
| Backend timeout | `BACKEND_FETCH_TIMEOUT_MS = 8_000`, grounded in a real measured 86-284ms worst case (28x headroom) — unchanged, Step 10 |
| Retry recovery | **Fixed this session (Step 11)** — was broken (`reset()` didn't re-fetch), now issues a real RSC re-fetch and recovers; re-verified this step against both host and container |
| Logging | `log()` writes one structured JSON line server-side per request/failure (route, operation, failure category, duration, detail) — never a passwords/cookie/secret field (regression-tested, `factory-twin-next-backend-fetch.test.js`) |
| Deterministic WebGL recovery | `LOST → RESTORING → REBUILDING → VERIFYING → RECOVERED`, unchanged sequence, re-verified this step (`factory-twin-r3f-scene-orchestration.js`, 76/76) |
| No resource growth | Geometries/textures/programs/heap flat across repeated cycles, re-verified this step |

## 6. Deployment reproducibility

Built the real disposable container from `Dockerfile.spike` (unmodified — already used the
correct standalone entrypoint) using the now-corrected `postbuild` step:

| # | Check | Result |
|---|---|---|
| 1 | Build | PASS — `docker build -f services/factory-twin-3d-next/Dockerfile.spike -t factory-twin-3d-next-spike .`, clean |
| 2 | Container start | PASS — `docker run`, `health: starting` → healthy |
| 3 | Health | PASS — 200, correct JSON |
| 4 | Geometry route | PASS — 200 (with `FACTORY_TWIN_API_BASE=http://host.docker.internal:4196` pointed at the disposable backend) |
| 5 | R3F route | PASS — 200 |
| 6 | Backend-down behavior | PASS — 200 (streaming SSR), digest-only, no leak |
| 7 | Backend-recovery + Retry | PASS — real RSC re-fetch fires (`?_rsc=...`), canvas renders, error clears |
| 8 | Shutdown | PASS — `docker stop`, clean |
| 9 | Restart | PASS — `docker start`, health 200 again |
| 10 | Repeatability | PASS — fresh container from the same image (`ft-spike12b`), health + geometry-candidate both 200 on first request, no drift |

**Windows/Git Bash environment limitation, disclosed separately (not claimed as a proxy
verification pass)**: Step 11's disposable-nginx-proxy attempt hit a Docker volume-mount
path-translation issue under Git Bash and was abandoned there; this step did not re-attempt
the proxy layer (out of this step's own scope — Phase 6 here targets the container's routes
directly, matching the mission's own item list, none of which name the proxy). The real
`proxy_pass`/`auth_request`/basePath compatibility fix remains proven only by Step 2's original
spike and Step 8's own containerized re-verification (both already documented, not
re-attempted here) — not re-claimed as newly verified by this step.

## 7. Legacy replacement decision

All required conditions checked:

- Production entrypoint correct — **yes**, fixed and re-verified (§0).
- Migrated feature parity proven — **yes, for what has actually been migrated** (§1); several
  real features are explicitly not migrated (telemetry/alarms/RCA/inspector/EAP/LDI,
  TRUE_POLYGON outlines, camera modes, zone-layer toggle) — those are gaps, not failures.
- Data parity proven — **yes** (§2), byte/count-exact against the same live backend.
- Security boundary proven — **yes** (§4), zero new exposure, isolation re-confirmed.
- Production container reproducible — **yes** (§6), 10/10.
- Regression suite passes — **yes**: unit 81/81, R3F 296/296 (one pre-existing, already-
  disclosed flake confirmed clean on retry — Step 9's own A/B-verified, unrelated to any
  change in this session), hydration 10/10, backend-recovery 7/7.
- No unresolved P0/P1 — **yes**, the one P1 found this session (Retry not retrying) is fixed
  and regression-tested.

**Result: `READY_WITH_GAPS`**

Not `READY_FOR_MIGRATION` outright: the candidate is production-quality for exactly the
subsystems it has migrated (geometry, machines, selection, camera, layers, reference,
lifecycle, error handling), but a real cutover of `/factory-twin-3d/` would drop live
telemetry/alarms/RCA/inspector/EAP/LDI, TRUE_POLYGON outlines, and the zone-layer toggle that
the current production route has — those are the "gaps." `NOT_READY`/`BLOCKED` would
overstate the problem: nothing found is broken or blocked, the migrated slice is solid and
reproducible.

## 8. Floor 1 — unchanged, not a blocker of this review

**Floor 1 identity mapping: 0/431 — NOT_READY.** Unchanged this step (not touched, not
re-derived, not reinterpreted). Grid correction remains
`WAITING_FOR_ENGINEERING_GRID_DECISION` (Phase 12I), also unchanged. Neither gates this
migration-readiness review, per this phase's own explicit instruction — they are separate
data-governance tracks, cited here for completeness only.

## Files changed this step

- `services/factory-twin-3d-next/package.json` (2-line script change)
- `services/factory-twin-3d-next/scripts/copy-standalone-static.js` (new)
- `services/factory-twin-3d-next/scripts/start-standalone.js` (new)
- `docs/evidence/FACTORY_TWIN_NEXTJS_MIGRATION_REVIEW.md` (this file)

No production nginx, docker-compose, legacy service, CAD, or Floor 1 identity file touched.

**Status: READY_WITH_GAPS.**
