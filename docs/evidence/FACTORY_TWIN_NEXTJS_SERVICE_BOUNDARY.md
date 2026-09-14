# Factory Twin — Step 8: Standalone Next.js Service Boundary

A deployment-boundary spike: proves `services/factory-twin-3d-next` can run as a fully
independent, production-style service — real Docker image, real container, real disposable
nginx proxy, real measurements throughout. Nothing production was touched: legacy Factory Twin,
`proxy/nginx.conf`, Grafana, and the database are all unmodified (`git diff --stat` confirmed
empty for `services/factory-twin-3d/`, `database/`, `postgres/`, `proxy/`,
`monitoring/grafana/`). No live operational state connected, no identity mapping fabricated.

## 1. Standalone package boundary

`services/factory-twin-3d-next/package.json` already owns its full build/start lifecycle
(`next build`, `next start` — Step 8 adds nothing new here beyond what Steps 3-6E already
established). Runtime dependencies, documented exhaustively:

- **Node.js 22** (image base; the app itself declares no engine floor lower than what Next
  16.3.4 requires).
- **`next`, `react`, `react-dom`, `three`, `@react-three/fiber`, `@react-three/drei`** — the
  only 6 runtime `dependencies` in `package.json`. `output: 'standalone'` traces the actual
  runtime import graph and copies only what's reachable — verified this step: the built image's
  `node_modules` is not the full dev tree, only what `next build`'s own tracer selected.
- **`FACTORY_TWIN_API_BASE`** (env var, optional, defaults to `http://localhost:4196`) — the
  ONLY external network dependency at runtime: the legacy backend's own `/api/floor-geometry`
  and `/api/floor-raw-cad` routes, fetched from the server-rendered `geometry-candidate` page.
  No database driver, no direct DB connection, no dependency on the legacy server PROCESS
  itself (never spawns it, never shares a socket/volume with it) — only its already-served HTTP
  API, reached over the network like any other client.
- **Build-time only, disclosed separately (not a runtime dependency)**:
  `services/factory-twin-3d/domain/**` (the `@twin-domain/*` path alias, Step 1) — needed to
  produce the build, never read again once `next build` finishes; the compiled output has no
  reference back to that source tree.

## 2. Production build

```
$ cd services/factory-twin-3d-next && rm -rf .next && npm run build
✓ Compiled successfully in 16.8s
✓ Finished TypeScript in 4.7s
Route (app): / (○ static), /_not-found (○), /geometry-candidate (ƒ), /health (ƒ), /r3f-spike (○)
real 0m36.172s   (host build)
```

`next start` was explicitly NOT used for acceptance testing (`next start` warned "does not work
with output: standalone" — the same finding this migration already made in Steps 5F-6E). The
approved path — `node .next/standalone/services/factory-twin-3d-next/server.js` — is what the
container below actually runs.

## 3. Health endpoint

New: `app/health/route.ts`, served at `/factory-twin-3d/health` (this app's own `basePath`,
matching legacy's served path — no separate `/factory-twin-3d-next` prefix exists anywhere in
this app's routing). Measured live, through the container:

```
$ curl http://localhost:4310/factory-twin-3d/health
{"status":"ok","application":"factory-twin-3d-next","version":"0.0.0",
 "buildId":"eNYpPUp9QLd_3Y6YFzw5j","environment":"production"}
HTTP 200
```

Application name, version, and a real build identifier (`.next/BUILD_ID`, written by `next
build`) — no secrets, no environment-variable dump, no request headers echoed back.

## 4. Container

New, disposable: `services/factory-twin-3d-next/Dockerfile.spike` — never referenced by
`docker-compose.yaml`, the real `services/factory-twin-3d/Dockerfile` untouched. Multi-stage
(`deps` → `build` → `runtime`): the runtime stage copies ONLY the `output: standalone` tree, no
build toolchain, no devDependencies, no source `.ts`/`.tsx` files. Built from the repo root
(disclosed and justified in the Dockerfile's own header — this app's build-time `@twin-domain`
import requires the sibling `services/factory-twin-3d/domain/` tree, and Next's own
workspace-root inference was empirically confirmed throughout this migration to key off the
repo-root lockfile, not a narrower context).

```
$ docker build -f services/factory-twin-3d-next/Dockerfile.spike -t factory-twin-3d-next-spike .
naming to docker.io/library/factory-twin-3d-next-spike:latest
real 1m1.588s   (warm cache; ~2m41s cold, first run including npm install)

$ docker images factory-twin-3d-next-spike
factory-twin-3d-next-spike:latest   330MB
```

Non-root: `USER node` (the pre-created uid-1000 user `node:22-alpine` already ships, same
convention the real `factory-twin-3d/Dockerfile` already uses — no new user created).
`EXPOSE 4310`, `PORT`/`HOSTNAME` env vars explicit. `HEALTHCHECK` hits the real
`/factory-twin-3d/health` route (not merely "is the process alive") every 15s.

```
$ docker run -d --name ft-next-spike -p 4310:4310 --memory=512m --cpus=1.0 \
    -e FACTORY_TWIN_API_BASE=http://host.docker.internal:4196 \
    factory-twin-3d-next-spike
$ docker ps --filter name=ft-next-spike
ft-next-spike   Up (healthy)   0.0.0.0:4310->4310/tcp
```

## 5. Resource limits — observed, not guessed

Container run under an explicit `--memory=512m --cpus=1.0` disposable limit throughout this
spike (never hit either ceiling):

| Metric | Observed |
|---|---|
| Memory, idle (post-startup) | 36.04 MiB / 512 MiB (7.0%) |
| Memory, after full 417-assertion Playwright regression | 65.18 MiB / 512 MiB (12.7%) |
| CPU, idle | 0.02% |
| Startup time (`docker start` → first `200` on `/health`) | 1,211 ms |
| Restart behavior | `docker stop` → `docker start`: clean re-`healthy` transition, no crash-loop, no stuck state, re-verified twice this step |

No production resource-limit recommendation is made — this step's own instruction is explicit
("do not guess limits for production deployment yet"); these are this spike's own disposable
observations only.

## 6. Reverse proxy spike

New, disposable: `spikes/factory-twin-nextjs-service-boundary/nginx-spike.conf` — reuses the
EXACT shape Step 2's own spike proved out (`docs/evidence/FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`'s
`:8083` variant: `proxy_pass` with no trailing slash, plus an exact-match
`location = /factory-twin-3d { }` catching Next's own canonical no-trailing-slash redirect
target) — this time against the REAL containerized service (not a bare host process), to prove
the finding still holds for the actual deployable artifact.

```
$ docker run -d --name ft-nginx-spike -p 8090:8090 -p 8091:8091 \
    --add-host=host.docker.internal:host-gateway \
    -v .../nginx-spike.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine
```

| Check | Result |
|---|---|
| `GET /factory-twin-3d/` (trailing slash) | `308` → `/factory-twin-3d` (Next's own canonical redirect, expected, same as Step 2's finding) |
| `GET /factory-twin-3d` (canonical form), follow redirects | `200`, **0 redirects needed** — no loop |
| `GET /factory-twin-3d/health` through proxy | `200`, same JSON as direct |
| A real `_next/static/*.css` chunk, extracted from the served HTML | `200` |
| Auth boundary: `/auth-check` stubbed `200` (port 8090) | proxied request reaches the app, `200` |
| Auth boundary: `/auth-check` stubbed `401` (port 8091, NEW this step — Step 2's own spike never tested the failing case) | proxied request correctly blocked, `401`, never reaches the app |

`auth_request` itself required zero special handling — confirms Step 2's own conclusion
("orthogonal to the basePath question") now against a real container, and additionally proves
the FAILING case actually blocks (a real gap in Step 2's own spike, closed here).

## 7. Service isolation — verified in both directions, live

```
$ docker stop ims-factory-twin-3d              # legacy service
$ curl http://localhost:4310/factory-twin-3d/health --> 200, ft-next-spike still "healthy"
$ docker start ims-factory-twin-3d             # restored immediately

$ docker exec ims-factory-twin-3d node -e "..." --> legacy alive, confirmed
$ docker stop ft-next-spike                    # Next candidate
$ docker exec ims-factory-twin-3d node -e "..." --> legacy STILL alive, unaffected
```

Different ports (legacy `4100` internal / proxied at `/factory-twin-3d/` in production; spike
`4310`, published only for this disposable test). Independent `docker logs`, independent
`docker inspect ... .State.Health`, independent restart — no shared process, no shared volume,
no shared socket between the two containers at any point in this spike.

## 8. Performance — measured through the container, compared to baseline

| Metric | This step (containerized) | Step 5B/6C-6E baseline (host process) |
|---|---|---|
| Page load | 560ms | 318ms (Step 6C, host process, same route) |
| First Contentful Paint | 424ms | 236ms (Step 6C, host process) |
| Draw calls / triangles / geometries (default scene) | 11 / 15,282 / 11 | Identical every prior step |
| Idle CPU | 0.02% | Not previously measured at the container level |
| Memory after full regression | 65 MiB | Not previously measured at the container level |

Load/FCP are measurably higher through the container than the bare host process — an honest,
disclosed finding, not smoothed over. Plausible cause (disclosed as a hypothesis, not confirmed
by further profiling this step): Docker Desktop's own network virtualization layer (WSL2
backend on this Windows host) adds a real, non-zero hop for both the
`host.docker.internal:4196` backend fetch and the published-port response path, on top of the
container's own cold caches at measurement time. Scene/render metrics (draw calls, triangles,
geometry counts) are byte-identical to every prior step — the CONTAINER changes network-path
latency, not application behavior.

## 9. Regression — full suite, against the containerized service

All Playwright suites re-run with `CANDIDATE_URL`/default port pointed at the container
(`http://localhost:4310/factory-twin-3d/geometry-candidate`), not the host process:

| Suite | Result |
|-------|--------|
| `factory-twin-next-shell.js` (Step 3) | 30 passed |
| `factory-twin-r3f-spike.js` (Step 4) | 45 passed (one pre-existing flake, documented since Step 4/5F, clean on retry) |
| `factory-twin-r3f-machines.js` (Step 5B) | 41 passed |
| `factory-twin-r3f-selection.js` (Step 5C) | 50 passed |
| `factory-twin-r3f-camera.js` (Step 5D) | 66 passed |
| `factory-twin-r3f-layers.js` (Step 5E) | 69 passed |
| `factory-twin-r3f-scene-orchestration.js` (Step 5F) | 76 passed |
| `factory-twin-r3f-operational-state.js` (Step 6A) | 40 passed |

**417/417**, full parity with every prior step's own host-process results. Unit suites
(container-independent, Node-side, re-run for completeness): `factory-twin-operational-source.
test.js` (Step 6C) 27/27, `factory-twin-identity-mapping.test.js` (Step 6D) 20/20,
`factory-twin-canonical-identity.test.js` (Step 6E) 24/24. No live operational state run at any
point — every suite's own established discipline (REAL adapter stays `UNAVAILABLE`, demo
toggle stays off by default) held through the container exactly as it did on the host.

## 10. Rollback

Trivial and total: `docker rm -f ft-next-spike ft-nginx-spike`, `docker rmi
factory-twin-3d-next-spike` — no production file was ever touched, so there is nothing to
revert. The two new artifacts this step adds (`Dockerfile.spike`,
`spikes/factory-twin-nextjs-service-boundary/nginx-spike.conf`) are themselves disposable
by design and can be deleted with zero effect on any running system.

## Remaining deployment risks (disclosed, not resolved this step)

- **`next/image`'s own `/_next/image` optimizer proxy path** — untested here too (this app
  uses plain `<img>`/CSS, same as Step 2's own spike; still an open item if a future page adds
  `next/image`).
- **The performance gap in §8** — not root-caused beyond a disclosed hypothesis; a real
  cutover would need this profiled properly (container network path vs. host process), not
  assumed acceptable.
- **The build-time `@twin-domain` dependency on the legacy service's domain tree (§1)** — a
  real coupling a future genuinely-independent deployment pipeline needs a real answer for
  (vendoring, a published package, or a monorepo build step) — not a runtime risk, but a real
  CI/build-pipeline design question this spike does not answer.
- **No production resource-limit recommendation** — §5's own numbers are this spike's disposable
  observations only, explicitly not a recommendation, per this step's own rule.
- **Auth boundary tested only with a stubbed `auth_request` upstream** (both the passing and,
  new this step, the failing case) — never against a live Grafana session cookie, same
  disclosed limitation Step 2's own spike already carried forward.

## Acceptance

- [x] Standalone build succeeds
- [x] Standalone server works
- [x] Health endpoint works (200, no secrets)
- [x] Container works (built, ran, healthy, resource-limited)
- [x] Disposable nginx works (HTML, `_next/*`, health, both auth outcomes, no redirect loop)
- [x] `/factory-twin-3d/` works
- [x] `/_next/*` works
- [x] Auth boundary preserved (both pass and fail cases proven, fail case new this step)
- [x] Legacy service independent (both directions, live-verified)
- [x] No production files modified (`git diff --stat` empty for legacy/DB/nginx/Grafana)
- [x] All migration regressions pass (417/417 Playwright + 71/71 unit)
- [x] 0/431 identity mapping unchanged (re-verified live this step)

## Verdict

**NEXTJS SERVICE BOUNDARY — READY** (as a deployment-boundary spike; §"Remaining deployment
risks" above are real, disclosed open items for an actual cutover, not blocking this spike's
own PASS).
