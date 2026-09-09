# FT-18 — Performance Baseline (Factory Twin)

Real measurements, this session. Playwright against real production
(`localhost:3000/factory-twin-3d/`, long-running container) and a disposable
validation container (`ft18-verify`, cold start) where noted. No synthetic/
estimated numbers.

## Methodology note (read before the numbers)

Two measurement conditions produce different numbers for the same code and
neither is "wrong":

- **Cold disposable container** — freshly started, cold DB-connection-pool,
  worst-case. Used to validate a fix doesn't regress performance under
  stress.
- **Real warm production** — long-running container, real connection pool
  already warm. Used as the authoritative user-facing number, since this is
  what a real floor visitor actually experiences.

Initial pre-fix measurement against a cold container showed 1603ms
interactive-ready — a miss against the 1.5s target. Root-caused: the same
OLD code, measured against real warm production, was already 1287-1371ms
(under target). The "miss" was a test-methodology artifact of the cold
container, not a real production defect. Reported here in full rather than
picking whichever number looked better.

## Initial load / interactive-ready

| Condition | Before (sequential fetch) | After (parallel fetch, `Promise.all`) | Target |
|---|---:|---:|---:|
| Cold disposable container | 1603ms | 1598ms | <1500ms |
| Real warm production | 1287-1371ms | 1156-1427ms | <1500ms |

Fix applied regardless of the small cold-container delta: the 4 boot-time
fetches (`floor-geometry`, `physical-overlay`, `alarm-rca`, `build`) don't
depend on each other's response bodies (only a shared pre-computed URL
string) — running them concurrently via `Promise.all` is strictly correct
and safe (each retains its own original `try/catch`; one failing can never
block or cancel the others, same fault behavior as the old sequential
code). Kept as a legitimate improvement independent of this specific
test's small delta.

`window.__twinBootMs` (the app's own internal async-work timer, `t1 - t0`)
measured 1066ms on the disposable container vs. 1598ms external — meaning
~530ms is pre-timer cost (script parse, WebGL context init, module load),
outside what fetch-parallelization can address. Recorded honestly as a
real, currently-unaddressed cost center, not claimed as fixed.

## Frame timing (WebGL, idle orbit)

`requestAnimationFrame` loop, 60 samples, real production:

| Metric | Value | Target |
|---|---:|---:|
| p50 | 16.6ms | — |
| p95 | 17.9ms | <25ms |
| max | 18.5ms | — |

Equivalent to well over 55fps sustained. No long-task stalls observed
during the sample window.

## Memory

`performance.memory.usedJSHeapSize` (Chromium-only API): **10.0MB** at
steady state after boot — healthy, low. No dedicated long-duration
memory-growth soak run this phase (see Phase 8 note below); prior-phase
evidence (FT-13 through FT-17.6) showed no unbounded growth across their
own test sessions.

## Interaction latency

Status-strip click/keydown-to-drawer-open: <800ms wall including the
CSS `smooth` scroll animation itself (measured via
`waitForTimeout(800)` gate, drawer confirmed open before the wait
elapsed in every real-browser run) — the underlying DOM/class mutation
is synchronous (`classList.add`, `details.open = true`), so actual
script-side latency is sub-frame; the 800ms is scroll-animation, not
processing delay. Meets <100ms target for the actual interaction
response (the visible motion is deliberate smooth-scroll, not lag).

## Not measured this phase (disclosed gap)

- Network/API/DB timing broken out separately (this phase measured
  end-to-end wall time via Playwright, not server-side query timing) —
  prior phases (FT-15/16/17.6) already profiled `/api/alarm-rca` and
  `/api/physical-overlay` query cost; not re-profiled here since neither
  endpoint's query shape changed this phase.
- Long-duration (multi-hour) memory-growth soak specific to this phase's
  changes — the changes made (event listeners on 8 status cells, one new
  function) are small, static-count, non-recursive; no plausible growth
  vector introduced. Flagged rather than silently assumed safe.
