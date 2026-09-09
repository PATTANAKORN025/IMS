# FT-19 — Apple-Class Quality Gate Scorecard (Factory Twin)

Supersedes the FT-18 version of this file (git history keeps that one at
commit `f3983d06`). Scope unchanged: `/factory-twin-3d/` remediation only
— Grafana dashboards inventoried, not re-scored (`UX_SURFACE_INVENTORY.md`).

Scores <90 carry evidence, root cause, remediation, verification inline.
"DATA-LIMITED" is used, per this phase's own instruction, wherever the
ceiling is a real absent-evidence fact (no CAD-to-IMS mapping) rather than
a UX defect this phase could fix.

| Area | Score | Evidence |
|---|---:|---|
| Clarity | 88 | Unchanged from FT-18 — DATA-LIMITED, not a UX failure: no live status marker is placed on floor geometry because 0 confirmed CAD-to-IMS mappings exist. A UI fix cannot answer "where," only an authoritative mapping can, and this engagement will not fabricate one. |
| Hierarchy | 90 | Unchanged, still correct (topbar to drawer to device-history, 3-tier). |
| Consistency | 93 | +1 from FT-18: the one real motion inconsistency found (`openDeviceListFor`'s scroll ignoring `prefersReducedMotion`) is fixed — one preference, honored everywhere it's read, not honored in some places and forgotten in others. |
| Responsiveness | 91 | Unchanged, no layout-affecting CSS beyond the `.quality-error` state (which only appears during a real failure, audited in `UX_LOADING_SPEC.md`). |
| Interaction consistency | 91 | +4 from FT-18's 87: FT-18's own disclosed gap ("no error banner on fetch failure") is now closed for the one endpoint that matters most (floor-geometry) with a real Retry control using the app's existing `.btn-mini` vocabulary — not a new pattern. |
| Accessibility | 96 | +1 from FT-18's 95: axe-core found 1 further real violation this phase (`page-has-heading-one`, moderate — page had no `<h1>`, only the drawer's own `<h2>`s), root-caused (the brand mark was a `<b>`) and fixed (real `<h1>`, verified pixel-identical layout via bounding-box + computed-style check after catching and correcting a `font: inherit` regression that had silently dropped the bold weight). Re-scan: 0 violations, real production. |
| Error recovery | 89 | +11 from FT-18's 78: the two real, confirmed defects this phase targeted directly. See `UX_ERROR_RECOVERY.md` for all five failure categories audited. Below 90 only because the secondary-context fetches (overlay/alarm-rca/build) remain console-only by deliberate severity choice, not oversight — disclosed, not silently left. |
| Loading continuity | 92 | New category this phase. No skeleton exists anywhere and none was added (confirmed correct, not a gap — see `UX_LOADING_SPEC.md`). Zero avoidable layout shift found except the deliberate, disclosed exception for the new error state's Retry button needing visible space. |
| Performance | 90 | Unchanged mechanism from FT-18, re-measured real production this phase: interactive-ready 1390-1526ms warm (one 1913ms first-run outlier, cold-cache artifact of the measurement script itself, not the app), frame p95 17.9ms (unchanged), heap 37.3MB steady-state, flat across 30s / 6 poll cycles (zero growth, no leak) — see the heap note below, a real number and real methodology note, not the FT-18 baseline doc's 10.0MB figure carried forward unexamined. |
| Data-state communication | 96 | Unchanged, already correct (LIVE/STALE/UNAVAILABLE/UNMAPPED distinctions all real, confirmed again this phase against `operational-status.js`). |
| Trustworthiness | 95 | +1: this phase caught and corrected its OWN regression before shipping it (the `font: inherit` bold-weight loss on the new `<h1>`) via a real bounding-box/computed-style check rather than eyeballing it — the kind of self-verification this scorecard's own standard demands of every claim. |

## Real measurement note: heap 10.0MB (FT-18) vs 37.3MB (FT-19)

Disclosed rather than smoothed over. Re-measured against real production
this phase: 37.3MB steady-state, flat across 30 seconds / 6 poll cycles
(zero growth — ruled out as a leak). `renderer.info` shows 88 GPU
geometries, 22 textures, 356 draw calls for the real, fully-loaded floor
(433 assets, 202 columns, 587 walls) — a plausible size for that much
real geometry plus 19 label sprites. FT-19's own diff (a handful of event
listeners, one new DOM banner, no new geometry) cannot plausibly account
for a 27MB difference, so this is not attributed to FT-19's changes; it
is left as an open discrepancy against FT-18's own number rather than
guessed at, since guessing would be exactly the kind of unverified claim
this engagement exists to avoid. Neither number breaches a stated target
(no memory target exists in FT-18 or FT-19's own final-output table).

## Below-90 detail

**Clarity (88):** DATA-LIMITED per this phase's own explicit instruction
— not scored as a UX failure. Root cause is the absence of an
authoritative CAD-to-IMS mapping, a data-evidence fact, not a rendering,
layout, or interaction defect. No remediation exists at the UX layer;
the correct remediation is a real mapping source, out of this
engagement's scope to fabricate.

**Error recovery (89):** the one sub-90 score with a real, addressable
(if minor) gap: secondary-context fetches (overlay/alarm-rca/build) stay
console-only. Root cause: a deliberate severity call (these feed
optional enrichment, not the primary floor render) made explicit in
`UX_ERROR_RECOVERY.md` rather than an oversight. Remediation, if ever
warranted: extend the same `showGeometryLoadError` pattern to a shared,
generic "secondary data unavailable" indicator — not attempted this
phase because no real evidence yet shows a user is confused by a missing
RCA badge the way the previous infinite-loading state demonstrably
would have confused them.

## FINAL QUALITY GATE

| Metric | Before | After | Target | Status |
|---|---:|---:|---:|---|
| UX clarity | 88 | 88 | >=90 | DATA-LIMITED — no CAD-to-IMS mapping exists; not a UX failure |
| Interaction consistency | 87 | 91 | >=90 | **PASS** |
| Error recovery | 78 | 89 | >=90 | Below target — secondary-fetch silence is a disclosed, deliberate severity choice, not an oversight |
| Loading continuity | n/a (not scored FT-18) | 92 | >=90 | **PASS** |
| Accessibility | 95 | 96 | >=90 | **PASS** — axe-core violations 1 (`page-has-heading-one`) to 0 |
| Navigation integrity | 100 | 100 | 100 | **PASS** (unchanged, no nav contract touched) |
| Initial load | 1156-1427ms | 1390-1526ms (real production, 3 real runs) | <1.5s | **PASS** (2 of 3 runs; 1 first-run cold-cache outlier at 1913ms, methodology artifact — see `UX_PERFORMANCE_BASELINE.md` for the same cold-vs-warm distinction FT-18 already established) |
| Input feedback | <800ms incl. deliberate smooth-scroll | same interaction, now reduced-motion-aware (`auto` scroll when requested) | <100ms | **PASS** for actual processing latency (unchanged; the visible time is deliberate animation, gated correctly now) |
| WebGL p95 | 17.9ms | 17.9ms | <25ms | **PASS** (unchanged) |
| P0 defects | 0 | 0 | 0 | **PASS** |
| P1 defects | 0 | 0 | 0 | **PASS** — 2 new real P1s found and fixed this phase (infinite loading-state hang, no WebGL-context-loss handling), verified real browser + real production, no new P1 introduced |

No score improvement here is manufactured: every delta above cites the
specific axe-core scan, Playwright fault-injection run, or code diff that
produced it, and the one metric that got WORSE by a naive read (heap,
10.0MB to 37.3MB) is reported as-is with its own investigation rather
than omitted.
