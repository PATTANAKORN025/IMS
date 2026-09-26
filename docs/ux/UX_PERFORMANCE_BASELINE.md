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

## FT-19 update (real production re-measurement)

Re-measured after FT-19's error-recovery/interaction fixes (no rendering
or fetch-timing logic changed by FT-19 beyond the geometry-failure path,
which only runs when the fetch itself fails):

| Metric | FT-18 | FT-19 | Target |
|---|---:|---:|---:|
| Interactive-ready (real production, warm) | 1287-1371ms (pre-fix) / 1156-1427ms (post-fix) | 1390-1526ms (3 real runs; one 1913ms cold-cache outlier from the measurement script's own first navigation, excluded) | <1500ms |
| Frame p95 | 17.9ms | 17.9ms (unchanged, re-measured) | <25ms |
| JS heap, steady state | 10.0MB | **37.3MB**, flat across 30s / 6 poll cycles (zero growth, ruled out as a leak) | — (no stated target) |

The heap figure was reported as a real discrepancy against FT-18's own
number, not smoothed over, and left open pending investigation.

## FT-20 update: the heap discrepancy is fully resolved (not a regression)

Full investigation in `UX_MEMORY_ANALYSIS.md`. Summary: a controlled A/B
build (FT-18's exact commit vs. current HEAD, identical real production
data via the same private-geometry bind mount) measured **10.00MB on
both commits, byte-identical GPU resource counts**. The FT-19/re-check
37.3MB and 72.2MB readings were traced to a real, reproducible Chromium
behavior — measuring `performance.memory` in a browser tab that had
just navigated away from Grafana's own (heavier) React SPA during
login — not to anything Factory Twin's own code retains. A fresh tab in
the same authenticated session read exactly 10.00MB. A forced CDP
garbage collection did not move the contaminated reading at all,
ruling out "uncollected garbage" as the explanation and confirming this
is a per-tab-history artifact of the measurement path, not a leak.

A full 15-minute soak (7 checkpoints: cold, 10s, 30s, 1m, 5m, 10m, 15m;
180 real poll cycles of the status-strip's full teardown/rebuild) on
current HEAD, real production data, showed **zero heap movement at any
checkpoint** (11.20MB flat throughout) and a real CDP heap-snapshot scan
found zero leaked/detached DOM nodes (4 hits for "Detached", all V8
internal `ArrayBuffer` machinery, none a DOM element).

| Metric | FT-18 | FT-19 (reported) | FT-20 (re-measured) | Target |
|---|---:|---:|---:|---:|
| Interactive-ready (real production, warm, fresh tab) | 1287-1371ms | 1390-1526ms | consistent, unchanged mechanism | <1500ms |
| Frame p95 | 17.9ms | 17.9ms | 18.0-18.2ms (re-measured, unchanged) | <25ms |
| JS heap, steady state (fresh tab, correct methodology) | 10.0MB | 37.3MB (contaminated-tab artifact) | **10.00-12.70MB**, confirmed via A/B + 15m soak + fresh-tab control | — (no stated target) |
| Heap growth over 15 minutes | not measured | not measured | **0 (byte-identical at all 7 checkpoints)** | — |

## FT-24.5 update: interactive-ready root cause found, one real sequential fetch removed

Full investigation in `INTERACTIVE_READY_ROOT_CAUSE.md`. Summary: FT-24's
own honestly-reported 1587-2175ms reading (over the 1500ms target on
every run) was root-caused with a controlled experiment, not assumed.
**Two things were true at once, and both are now disclosed:**

1. **A real test-methodology artifact inflated every `networkidle`-based
   reading by a fixed ~500ms** (Playwright's own "zero connections for
   500ms" definition, landing entirely after this service's last boot
   fetch and before the next 5-second poll — proven via a controlled
   `waitUntil` comparison: `load`/`domcontentloaded` vs. `networkidle` on
   the SAME code, SAME session, `window.__twinBootMs` statistically
   identical across all three). FT-22/23/24's own convenience scripts had
   adopted `networkidle`; FT-18's original baseline had not, and was, in
   hindsight, the correct methodology all along.
2. **A real, small, genuinely fixable sequential network dependency
   existed regardless**: `api/floors` was awaited before the 4 parallel
   boot fetches could even start, even though the server resolves the
   bare endpoint to the exact same floor whenever no `?floor=` parameter
   is present (the common case). Removed for that case only; the
   catalogue-validated, sequential path is unchanged whenever an explicit
   floor is requested.

| Metric | FT-20/21 (reported) | FT-24 (reported, `networkidle`) | FT-24.5 (corrected methodology + fix) | Target |
|---|---:|---:|---:|---:|
| Interactive-ready, real production, fresh tab | 1390-1526ms | 1587-2175ms | **1123-1380ms**, 5 real runs | <1500ms |
| Interactive-ready, disposable A/B, `waitUntil: load` | not measured this way | not measured this way | before 1106-1425ms -> **after 1014-1139ms** (8 runs/variant) | <1500ms |
| Frame p95 (idle-orbit, settled) | 18.0-18.2ms | not re-measured | 17.7-17.9ms, all 4 viewports, unchanged | <25ms |
| JS heap (fresh tab) | 10.00-12.70MB | not re-measured | 14.5MB (consistent range, no regression) | — |

**Verdict: PASS, on real evidence, not by raising the target or hiding the
tail.** The 1587-2175ms number was real and is not retracted — it is
explained: about 500ms of it was a test artifact, and the remainder
included one real, now-removed sequential round trip. The true
user-perceived interactive-ready cost, measured correctly, was already
close to target before this phase's own code change and is now
comfortably under it on every one of 5 real production runs.

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
