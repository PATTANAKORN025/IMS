# Factory Twin Next.js — Production Readiness Audit (Step 10)

Audit only, per hard rule — **no code changed this pass** (`git status --short services/
tests/ docs/` shows only the pre-existing, framework-auto-generated
`services/factory-twin-3d-next/CLAUDE.md`, unrelated to this audit). Measured against
commit `228c3c79` (Step 9, already committed/pushed, not reimplemented). CAD, Floor 1 identity
mapping, `private/floor1-geometry.json`, legacy Factory Twin runtime, database, Grafana,
Node-RED, and production nginx were not touched or written to at any point in this audit.

## Route Matrix

| Route | SSR | Hydration | Error Handling | Status |
|---|---|---|---|---|
| `/factory-twin-3d/geometry-candidate` | Dynamic (`force-dynamic`), fetches real backend data server-side | 10/10 on the shared hydration-guard suite for the sibling spike route; live smoke against this exact route: SSR `reactRenders: 0` both fetches, 0 console/page errors, client → live count post-mount | Backend killed live: `error.tsx` renders "Factory Twin data unavailable" + digest `2629373443` only (no URL/stack/message), Retry button present, HTTP status still 200 (correct Next streaming-SSR behavior — status line sent before the async fetch resolves) | PASS |
| `/factory-twin-3d/r3f-spike` | Static (`○`), no backend dependency | 45/45 full regression + 10/10 hydration suite, both green live this pass | No backend to fail (self-contained synthetic scene); WebGL context-loss simulate/restore buttons tested, deterministic PASS across 4 cycles | PASS |
| `/factory-twin-3d/health` | N/A (route handler, not a page) | N/A | Returns `{"status":"ok","application":"factory-twin-3d-next","version":"0.0.0","buildId":"...","environment":"production"}` — no secrets, no backend URL | PASS |
| `/` (bare, no basePath) | — | — | 404 — **intentional and documented**: `next.config.ts` sets `basePath: '/factory-twin-3d'` with its own comment citing the proxy-spike design (`FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`) so nginx's `location /factory-twin-3d/` prefix lines up without a rewrite | PASS (by design) |
| `/factory-twin-3d/` (trailing slash) | — | — | 308 → `/factory-twin-3d` (standard Next trailing-slash normalization, then 200, renders Step 3's shell page) | PASS |

## Performance

All figures measured live this pass (`factory-twin-r3f-layers.js`, `-scene-orchestration.js`),
not invented. Compared against the exact baselines already recorded in
`docs/evidence/FACTORY_TWIN_R3F_LAYER_ARCHITECTURE.md` / `_SCENE_ORCHESTRATION.md`.

| Metric | Current | Baseline (Step 5E/5F docs) | Result |
|---|---:|---:|---|
| Draw calls, all layers on | 11 | 11 | MATCH |
| Triangles, all layers on | 15,282 | 15,282 | MATCH |
| Geometries, all layers on | 11 | 11 | MATCH |
| Geometries, reference layer on (first activation) | 24 | 24 ("11→24 once") | MATCH |
| Textures | 1 | 1 | MATCH |
| Programs (materials proxy) | 6, flat across 3 stress-loop iterations `[6,6,6]` | flat, no growth | MATCH |
| JS heap after full layer-combination sweep | 23.1MB → 23.1MB (no growth) | no unbounded growth (< 2x baseline) | MATCH |
| `controllerMounts` after 3 context-loss/restore + layer-toggle cycles | 1 (never duplicates) | 1 | MATCH |
| `contextLost`/`contextRestored` after 3 cycles | 3 / 3 (exact lockstep) | exact lockstep | MATCH |
| Console errors, normal load (both routes) | 0 | 0 | MATCH |
| Console errors, backend-down path | 1 (React error #441 — Next's own "switched to client rendering because server rendering errored" signal, fires whenever any error boundary catches an SSR throw) | not previously measured under this specific condition | EXPECTED, not a regression — see Findings |

FCP/LCP for `geometry-candidate` specifically was not freshly measured this pass (only Step
3's shell-page 164ms figure exists, a different, emptier route) — not fabricated here rather
than reused out of context.

## WebGL lifecycle audit

- One lifecycle controller/renderer owner per route, both via the Step 9 shared
  `hooks/useWebglLifecycle.ts` (`GeometryViewport.tsx` for `/geometry-candidate`,
  `TwinViewport.tsx` for `/r3f-spike`) — confirmed by grep, zero duplicate `LifecycleState`/
  `rendererRef`/`invalidateRef`/`baselineRef`/handler declarations outside the hook (Step 9's
  own re-audit, same session).
- No manual `ResizeObserver` or `window.addEventListener('resize', ...)` anywhere in
  `components/`/`hooks/` (grep, zero hits) — resize is R3F's own internal `<Canvas>` handling,
  one instance per mounted canvas, never duplicated.
- Exactly one `useFrame` call in the entire candidate tree (`TwinViewport.tsx`'s `StatsProbe`,
  by its own design, measurement-only, writes no per-frame React state) — no duplicate
  animation loop.
- Context loss/recovery: `LOST → RESTORING → REBUILDING → VERIFYING → RECOVERED` unchanged,
  deterministic across repeated cycles (scene-orchestration's 9-scenario matrix + 3-iteration
  stress loop, all PASS this pass).
- No progressive resource growth measured across the full layer-combination sweep, 3
  context-loss cycles, and repeated stress iterations (table above).
- Route-to-route navigation / mount-unmount cycling beyond what the above suites exercise was
  not additionally stress-tested this pass — R3F's own documented unmount disposal is relied
  on, not independently re-verified; flagged in Findings as a coverage note, not a proven
  defect.

## Accessibility

Drawn from the same live suite runs (axe-core, already wired into every existing candidate
Playwright file): 0 serious/critical violations at every tested viewport across both routes,
keyboard focus reaches real `<button>` elements (not swallowed by the canvas), focused
controls show a visible outline, `prefers-reduced-motion` and `forced-colors` both render
without error, 200% zoom produces no unbounded horizontal overflow. No keyboard trap found —
tab order was exercised by the existing suites' own focus assertions, not independently
re-walked this pass.

## Responsive audit

Tested widths across the candidate's own suites: 1024, 1366, 1440, 1600, 1920, 2560, 3840 —
no horizontal overflow, canvas/toolbar remain usable, diagnostic text (`reactRenders:`/
`lifecycle:`/`controllerMounts:` etc.) does not break layout at any of them (Step 5F's own
`flex-nowrap`+`overflow-x-auto` toolbar fix, still holding).

**No viewport below 1024px width is tested anywhere in the candidate's suites** — verified
this is not a regression: legacy's own `ui-visual-regression.js` (the production Factory
Twin's baseline) tests exactly the same four widths (1366/1920/2560/3840) and also has no
mobile/tablet coverage. This is a desktop-kiosk factory-floor product in both the legacy and
candidate implementations, not a responsive-to-phone one — matching scope, not a gap
introduced by this migration.

## Security audit

- `dangerouslySetInnerHTML`/`eval`/`new Function`: zero hits anywhere in `components/`,
  `app/`, `lib/`, `hooks/` (grep).
- `window.location`/`redirect()`: zero hits — no custom redirect logic exists; the only
  redirect observed is Next's own standard trailing-slash 308.
- `process.env` usage: exactly two reads (`FACTORY_TWIN_API_BASE` in `page.tsx`,
  `NODE_ENV` in `health/route.ts`), both in server-only code (a Server Component and a Route
  Handler), neither `NEXT_PUBLIC_`-prefixed — confirmed absent from the built client bundle
  (`grep -rl "localhost:4196" .next/static` — zero matches).
- Built client bundle (`.next/static/chunks/*.js`) grepped for `password|api_key|secret|BEGIN
  (RSA|PRIVATE)|ims_admin` — 2 files matched, both confirmed false positives on inspection:
  the WHATWG URL polyfill's own `.password` URL-component field name, and React DOM's
  standard HTML `input[type=password]` enumeration. No real secret.
- No client-trusted identity of any kind exists in this candidate (no auth/session concept
  implemented yet at all) — nothing to spoof.
- Error responses (backend-down live test): digest only, never the backend URL, HTTP status
  text, message, or stack — confirmed live, not just by reading the source.
- No repo-wide security scanner exists specifically for `factory-twin-3d-next`; the repo's
  general `Repo Hygiene Linter` and `Doc Over-Claim Linter` (part of `scripts/pre-commit.js`)
  ran clean against it as part of Step 9's own pre-commit pass this session.

## Production boundary audit

- `grep -n "factory-twin-3d-next" proxy/nginx.conf docker-compose.yaml` — zero matches in
  either file. Production nginx and the Docker production stack have no reference to this
  candidate at all; it cannot be accidentally started or routed to by anything in production.
- `/factory-twin-3d/health` is a real, independent health endpoint, live-confirmed 200 this
  pass.
- Independent deployability already proven in Step 8 (`FACTORY_TWIN_NEXTJS_SERVICE_BOUNDARY.md`
  — disposable containerized run, full regression parity, isolation verified live both
  directions), not re-proven from scratch this pass.
- Cannot silently become authoritative over `/factory-twin-3d/` — that path is still served
  exclusively by the legacy Express app per the real, unmodified `proxy/nginx.conf`.

## Findings

| Severity | File/Area | Finding | Evidence | Action |
|---|---|---|---|---|
| P3 | `app/geometry-candidate/error.tsx` (behavior, not code) | React error #441 appears in console when a backend-down SSR throw is caught by the error boundary | Live backend-down test this pass: exactly 1 console error, the standard Next/React "switched to client rendering because server rendering errored" signal, no other content | None — this is React's own expected mechanism for the boundary this route was deliberately built with (Phase 12D); not a defect |
| P3 | `lib/backend-fetch.ts` | No retry on TIMEOUT/NETWORK failure, single attempt then throw | Source read; deliberate per the file's own comment ("fail fast rather than hang a server-rendered page indefinitely") | None — correct for a read-only geometry fetch behind a user-facing Retry button; retrying server-side would only delay the same outcome |
| P2 | `tests/unit/lib/require-ts.js` / `factory-twin-r3f-geometry.js`, `-machines.js`, `-selection.js` | Pre-existing single-file-transpile gap (found and disclosed in Step 9, unrelated to this audit) still blocks these three suites from running, reducing automated re-verification coverage for machine-parity (431/433) and selection-determinism specifically during this audit | Re-confirmed same failure this pass; not re-fixed, out of scope for both Step 9 and this audit | Carry forward as backlog — a future, separate, narrowly-scoped harness fix, not blocking this gate |
| Info | Responsive scope | No viewport below 1024px tested | Grep across all candidate suites; legacy's own `ui-visual-regression.js` has the identical scope | None — matches the real target environment (desktop kiosk), not a gap this migration introduced |
| Info | WebGL lifecycle | Route-to-route navigation/unmount-remount cycling not independently stress-tested beyond what existing suites exercise | Read of test coverage; R3F's own documented disposal relied on, not re-verified | Candidate for a future step if navigation between the two candidate routes becomes a real product flow; not applicable today (each route is accessed independently, no shared layout mounts both canvases) |

No P0 or P1 finding. Nothing here required or received a code fix this pass, per the mission's
own "only fix P0/P1" rule.

## Gate

**`READY_FOR_DISPOSABLE_PRODUCTION_SPIKE`**

Grounds: every route audited PASS with live evidence (not assumption); backend-failure path
proven to leak nothing (no URL, no stack, no credential, digest only); WebGL lifecycle proven
single-owner, non-duplicating, non-growing across repeated stress; performance matches
established baselines exactly, zero drift; accessibility/responsive scope matches the
legacy product's own established scope; production boundary confirmed zero-reference in real
nginx/Docker; only P2/P3 findings, none blocking, none requiring a fix under this mission's own
rule.

Not a decision to merge PR #24, change production routing, or touch Floor 1 identity evidence
— none of those are in scope for a disposable spike and none were done.
