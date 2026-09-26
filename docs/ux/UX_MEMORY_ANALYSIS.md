# FT-20 — Runtime Memory Deep Dive (Factory Twin)

Resolves the FT-18 (10.0MB) vs FT-19 (37.3MB) heap discrepancy left open in
`UX_PERFORMANCE_BASELINE.md`. Every claim below is a real measurement from
this phase — controlled A/B build, real production data, real fault
injection, a real CDP heap snapshot, and a full 15-minute soak. No number
here was estimated.

## Method: why a controlled A/B, not a guess

Guessing at "probably GC noise" or "probably fine" was explicitly
disallowed by this phase's own instructions, and rightly — the FT-19
number was real and reproducible at the time it was taken. The only way
to tell a code regression from a measurement artifact is to run the
EXACT same measurement against two different commits with everything
else held constant. So:

1. `git worktree add` checked out FT-18 (`f3983d06`) verbatim into a
   separate directory — the actual commit, not a description of it.
2. Built a disposable image from that exact source tree
   (`ims-factory-twin-3d:ft18-ab`) alongside a fresh build of current
   HEAD (`ims-factory-twin-3d:ft20-ab`).
3. Ran both against the SAME real production database (`grafana_reader`,
   read-only) and, critically, the SAME real private geometry files —
   `-v "$(pwd)/services/factory-twin-3d/private:/app/private:ro"`, the
   identical bind mount production itself uses. The first A/B attempt
   without this mount showed both commits at a trivial 10.0MB with only
   1 GPU geometry each — a red herring that turned out to mean neither
   container had the real floor data loaded at all, not that the code
   was cheap.
4. Measured both with one script, one viewport (1920x1080), one settle
   time (3s after `window.__twin` exists), no axe-core injected (axe
   itself adds real heap and must never share a measurement with the
   number being reported).

## Result: zero code regression

| | FT-18 (`f3983d06`) | FT-20 (current HEAD) |
|---|---:|---:|
| Heap used | 10.00MB | 10.00MB |
| Heap total | 19.30MB | 20.50MB |
| DOM nodes | 506 | 509 |
| GPU geometries | 88 | 88 |
| GPU textures | 22 | 22 |
| Draw calls | 356 | 356 |
| Triangles | 16,996 | 16,996 |
| Lines | 773 | 773 |

Heap used is identical to the reported precision. The only difference —
3 DOM nodes — is exactly accounted for by FT-19's own `#webgl-lost`
banner (`<div>` + `<p>` + `<button>`, hidden by default, still present
in the DOM tree). **No retaining path exists between FT-18 and current
HEAD**: every byte of GPU state and JS heap this measurement can see is
identical.

## Then why did FT-19 report 37.3MB, and just now 72.2MB?

Root-caused, not guessed. The FT-19 (and this phase's own first
re-check) measurements were taken by authenticating against Grafana's
`/login` page and then navigating the **same browser tab** to
`/factory-twin-3d/`. Chromium does not necessarily give a same-origin
navigation a fresh V8 isolate/heap — proven here, not asserted:

1. **Fresh-tab control:** logged in on one tab, closed it, opened a
   **second, brand-new tab in the same authenticated context**, and
   navigated directly to `/factory-twin-3d/` without that tab ever
   having loaded Grafana's own React SPA. Result: **10.00MB, 509 DOM
   nodes, 88/22 geometries/textures** — byte-identical to the disposable
   A/B and to FT-18's own historical number.
2. **Contaminated-tab reproduction:** logged in and navigated to
   `/factory-twin-3d/` in the SAME tab (the FT-19 methodology). Result:
   72.2MB — with DOM node count and every GPU resource count IDENTICAL
   to the clean 10.0MB case. Since the visible page state is provably
   identical, the extra ~62MB cannot be Factory Twin's own objects.
3. **Forced-GC test, to rule out "just uncollected garbage":** used
   `HeapProfiler.collectGarbage` via a real CDP session, six times over
   30 seconds, inside the contaminated tab. The reading did not move —
   72.2MB before and after every forced collection. This rules out the
   simplest explanation (stale garbage awaiting a GC pass); the memory
   is live and reachable from that tab's roots, tied to that specific
   tab's navigation history, not to Factory Twin's own runtime.

**Conclusion:** the 37.3MB/72.2MB readings are a real, reproducible
property of measuring `performance.memory` in a browser tab that
previously ran Grafana's own (much heavier) React application before
navigating to Factory Twin — not a Factory Twin memory issue, not
something `app.js`/`index.html` code can fix, and not present for a
user who opens Factory Twin in its own tab. It is disclosed here rather
than dismissed, because a real operator who middle-clicks a Factory
Twin link from an already-open Grafana dashboard tab, in the same tab,
would see the same elevated DevTools number — worth knowing, not
actionable from this codebase.

## 15-minute soak (real production data, disposable container, current HEAD)

Checkpoints at cold start, 10s, 30s, 1m, 5m, 10m, 15m — chosen because
this phase's own instruction correctly rejects "flat for 30 seconds" as
proof of anything: `renderStatusStrip` (FT-18) fully tears down and
rebuilds all 9 status cells, with 18 fresh event listeners, on every
5-second poll. Over 15 minutes that is 180 poll cycles and 3,240
listener/element churn events — the exact "repeated event listener
registration" and "accumulating DOM" pattern Phase 3 asks to rule out,
not assume away.

| Checkpoint | Heap used | Heap total | DOM nodes | GPU geometries | Textures | Draw calls |
|---|---:|---:|---:|---:|---:|---:|
| t+0s (cold) | 11.20MB | 20.50MB | 509 | 88 | 22 | 356 |
| t+10s | 11.20MB | 20.50MB | 509 | 88 | 22 | 356 |
| t+30s | 11.20MB | 20.50MB | 509 | 88 | 22 | 356 |
| t+60s | 11.20MB | 20.50MB | 509 | 88 | 22 | 356 |
| t+300s (5m) | 11.20MB | 20.50MB | 509 | 88 | 22 | 356 |
| t+600s (10m) | 11.20MB | 20.50MB | 509 | 88 | 22 | 356 |
| t+900s (15m) | 11.20MB | 20.50MB | 509 | 88 | 22 | 356 |

**Byte-identical at all 7 checkpoints.** Classification per this phase's
own three categories:

- (A) flat/reclaimable — **not applicable, nothing to reclaim: the
  number never moved in the first place.**
- (B) monotonic growth — **not observed.**
- (C) allocation churn with bounded steady state — the closest
  description of what actually happens (constant creation/destruction
  of 9 cells + 18 listeners every 5s), and the steady-state bound here
  is as tight as a bound can be: zero drift.

## Detached-node check (real CDP heap snapshot, not inferred from DOM count)

A flat `document.getElementsByTagName('*').length` proves live-tree node
count is stable, but says nothing about a detached node kept alive by a
stray closure — exactly the gap this phase's instructions call out.
Checked directly: after 4 real poll cycles (20s, enough for
`renderStatusStrip` to have replaced its 9 cells 4 times over),
took a real `HeapProfiler.takeHeapSnapshot` via CDP and scanned all
181,781 heap nodes for anything named `Detached*`. Found exactly 4 —
all four are V8's own internal `ArrayBuffer` detachment machinery
(`ArrayBufferPrototypeGetDetached`, `DetachedBindMode`, etc.), not a
single `Detached HTMLDivElement` or similar orphaned DOM node. The
teardown-and-rebuild pattern is being garbage collected correctly.

## Verdict

**Memory regression: NOT REPRODUCED.** FT-18 and current HEAD are
byte-identical under controlled measurement. The apparent FT-18-to-FT-19
"growth" was a measurement-methodology artifact (same-tab navigation
away from Grafana's own SPA), reproduced and explained with evidence,
not dismissed. The 15-minute soak and the CDP detached-node scan
together rule out both a slow leak and detached-node accumulation from
the one repeated-teardown pattern this codebase actually has.
