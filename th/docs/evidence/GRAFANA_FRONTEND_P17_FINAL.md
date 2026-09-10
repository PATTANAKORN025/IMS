> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# Grafana Frontend Excellence — P17 Final Report

**Date:** 2026-08-25
**Scope:** P17's brief requested a full fleet-wide micro-pixel/UX excellence pass across 20 phases (P17-A through P17-N: redesign, micro-pixel sweep, tables, axes, color/typography normalization, performance, accessibility, 7-viewport responsive matrix, visual regression harness, fleet-wide consistency). This pass completed one real, user-directed redesign and re-verified one prior fix under a hostile environment; it does not claim the rest of the brief was executed.

## Executive Summary

One concrete defect — the Andon Compliance panel's proven illegibility (§8 of the brief, a defect this exact repository has already tried and reverted one fix for) — was redesigned with the user's explicit direction ("different redesign," not a re-application of the reverted per-machine-tile approach), implemented, and live-verified, including catching and fixing a real clipping regression the initial implementation introduced. The 2D Digital Twin click-to-drill fix from P16 was re-confirmed live under a more realistic click target after a serious environmental hazard (a concurrent, independent session repeatedly force-checking out this shared working directory to `main` mid-session) caused a false "the fix doesn't work" reading that was traced to its actual root cause and retracted. No other phase of the P17 brief was attempted this pass.

## Environmental hazard discovered and worked around (report per §25's "be skeptical, re-measure" rule)

A concurrent, independent session/process is actively working in this same shared repository working directory and **repeatedly force-checks out `main`** (observed twice this pass via `git reflog`), each time silently swapping the live-served Grafana dashboard files (provisioning reads off disk) back to `main`'s older, divergent line — which does NOT contain this branch's P16/P17 fixes. This caused a real false alarm: testing the 2D Twin's realistic click target appeared to show the P16 fix was incomplete (label clicks did nothing), which was traced to the browser having been silently served `main`'s pre-fix dashboard file after an unannounced branch switch, not a flaw in the actual fix. Verified by re-checking out this branch and re-testing: the fix works correctly, including on the realistic (not just body-margin) click target. **This means any "live verified" claim in this engagement should be read as true at time of verification, not as a permanent guarantee** — a later, uncoordinated branch switch by the other process can silently un-verify it again until this branch is checked out again. This is a repository/process hygiene issue, not a Grafana or dashboard defect, and is flagged here rather than silently worked around.

## What was done

### 1. Andon Compliance panel redesign (§8) — DONE, live-verified

**Before:** Temperature/Humidity Compliance were two `state-timeline` panels, h3 each, side-by-side. Proven in a prior audit pass to render at ~1.9px per machine row — below Grafana's own row-label rendering threshold, making every one of the 11 live machines unidentifiable (an unlabeled color strip, not a defect `axisWidth` can fix since it's a height problem, not a width one). A per-machine-tile redesign already fixed this once (commit `17f2bed`) but was reverted at the operator's explicit request (`ed16da8`), restoring the illegible-but-familiar view — a genuine, human-decided tradeoff, not an oversight.

**This pass asked the user directly** rather than autonomously re-applying the already-rejected fix (a case P0's own "genuine external blocker" rule covers — an irreconcilable prior human decision). User chose: don't repeat the reverted tile design; build something different that keeps more of the original timeline feel while fixing readability.

**Redesign:** merged the two panels into one exceptions-only table. Reuses `public.v_ldi_machine_latest_full` (the same latest-value view the machine-state tiles already read from — no new data-access pattern introduced) to compute current temperature/humidity compliance status per machine, and shows **only** machines currently outside tolerance, worst-first, with an explicit "ALL MACHINES COMPLIANT" row when there are none (same UNION-ALL-with-NOT-EXISTS empty-state pattern the dashboard's own Action Queue panel already uses). This answers the board's actual 3-second question ("which machines need attention, how many, which first") and is height-independent of fleet size — compliant machines cost zero rows, so it does not hit the same illegibility wall as the fleet grows, unlike the original fixed-height-per-machine approaches (both the timeline and the reverted tile design).

**Defect found and fixed during verification (not shipped blind):** the first implementation needed ~22px more than its h3 (90px) budget even for a single row, forcing an internal scrollbar — measured via `scrollHeight`/`clientHeight`, not assumed from a screenshot (a screenshot alone was initially ambiguous — looked like a rendering artifact until measured). Root cause: an over-long panel title wrapping to a second line. Fix: shortened the title (the spec numbers it dropped already live in `options.description`). This reclaimed the space without spending any of the dashboard's already-fully-committed 20-unit kiosk height ceiling (confirmed via a first, wrong attempt: growing the panel by 1 grid unit broke the lint's height-ceiling check, revealing the "1 spare unit" assumption from an earlier audit pass was itself wrong — the Action Queue's P15-R height bump already consumed it. Retracted and fixed via the title change instead, which needed zero grid budget). A residual ~2px scrollbar affordance remains, measured and disclosed rather than papered over — real, but no text is actually clipped at that size; distinct in kind from the original 22px genuine-clipping defect.

**Verified:**
- Direct `psql` execution of the exact query: correct real data (1 real WARN-severity exception observed live before conditions changed to 0 exceptions, both states screenshotted).
- `dashboard-linter.js`: 0 errors, 0 warnings (one warning — missing panel description — was found and fixed, not ignored).
- Live browser, 0 console errors, at 1920×1080 and the dashboard's literal 1280×720 kiosk target resolution.
- `scrollHeight`/`clientHeight` measurement before and after the title fix: 22px deficit → 2px deficit.

Committed: `3efbde3`.

### 2. 2D Digital Twin click-to-drill (P16's FINDING-04) — re-verified, false regression retracted

Re-tested this pass under a more realistic click target (the machine-name label text, not just the thin unlabeled body margin used in P16's original test). Initial re-test appeared to fail — traced to the environmental hazard above (branch silently swapped to `main`'s pre-fix file mid-session), not a real defect. After returning to the correct branch: confirmed working correctly on the realistic target, real URL, real navigation, correct context.

## Not attempted this pass (P17's own §23 rule: never silently omit)

The following phases of the 20-phase P17 brief were **not started**:

- P17-A full baseline (partial — git/runtime health checked, full Grafana/dashboard inventory not re-run this pass; P16's inventory work from the same day still stands)
- P17-C machine tile and machine-name architecture audit (long-name stress testing, tile redesign)
- P17-E Action Queue re-audit beyond what P15-R/P16 already covered same day
- P17-F fleet-wide micro-pixel layout sweep (gutters, baselines, padding measurement across all 15 dashboards)
- P17-G table optimization fleet-wide (only the one new table built this pass was tuned)
- P17-H axis/chart/legend micro-geometry sweep
- P17-I color + typography normalization fleet-wide
- P17-J performance optimization pass (query fan-out, payload, browser CPU/memory measurement)
- P17-K accessibility (WCAG 2.2 AA) audit
- P17-L fleet-wide consistency matrix
- P17-M formal visual regression harness (baseline/diff tooling) — only manual before/after screenshots exist for the one panel changed this pass
- Full 7-viewport × responsive matrix (only 1920×1080 and 1280×720 were rendered this pass, both for the one changed panel)

These are real, legitimate follow-up work, not silently dropped.

## Final table

| Area | Status |
|---|---|
| Live Grafana verification | Done for items touched this pass; environmental hazard documented above |
| Operator Andon | Compliance panel redesigned + verified; rest of board not re-audited this pass |
| Machine tiles | Not touched this pass |
| Machine-name support | Not audited this pass |
| Compliance | **Fixed** — exceptions-only redesign, live-verified, residual 2px scrollbar disclosed |
| Action Queue | Not re-touched this pass (already fixed in P15-R/P16) |
| Digital Twin | 2D fix re-verified live (with a documented false-alarm retraction); 3D not re-touched this pass |
| Navigation | Not audited beyond the Digital Twin re-test |
| Micro-pixel layout | Not audited fleet-wide this pass |
| Responsive matrix | 2 of 7+ required viewports rendered, for one panel only |
| Performance | Not measured this pass |
| Accessibility | Not audited this pass |
| Visual regression | Manual before/after screenshots only; no harness built |
| Fleet-wide consistency | Not audited this pass |
| Git cleanliness | Clean — 1 commit (`3efbde3`), scoped to the one file changed, pushed |
| Production readiness | Unchanged from P16's GO decision — this pass's change is additive/net-positive (fixes a real defect), introduces no new CRITICAL/HIGH risk |

## Commits

- `3efbde3` — fix(grafana): redesign Andon Compliance panel as exceptions-only table

## Remaining risks

- The concurrent-session branch-hijacking hazard (see above) can silently desync the live-served dashboard from this branch's committed state at any time until resolved at the process/environment level, not the dashboard level.
- The 2px residual scrollbar affordance on the new Compliance panel — disclosed, not blocking, but not a clean zero.
- The reverted per-machine-tile design (`17f2bed`) is now fully superseded by this pass's redesign; no residual code from it remains active, but its git history stays as a record of the earlier, different attempt.

## Deferred work

Everything listed under "Not attempted this pass" above.

## Evidence paths

- `docs/evidence/screenshots/p17/andon_compliance_redesign_1920x1080.png` (before title fix, 22px clipping visible)
- `docs/evidence/screenshots/p17/andon_compliance_redesign_1920x1080_v2.png` (after title fix)
- `docs/evidence/screenshots/p17/andon_compliance_redesign_1280x720_kiosk.png` (literal kiosk resolution)
