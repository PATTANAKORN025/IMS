# Phase 2 — World-Class LDI Dashboard Hardening: Benchmark Report

> **ARCHIVED — historical snapshot, dated 2026-08-05.** Not living documentation; numbers below (dashboard counts, migration counts, panel counts, etc.) reflect the system as it existed on that date and are known to be stale relative to the current system. Kept for historical record per docs/archive/README.md. For current information, see docs/architecture/ARCHITECTURE.md and docs/architecture/DASHBOARD_INVENTORY.md.

Baseline captured 2026-08-04 before any Phase 2 change (see
`phase2-baseline-metrics.md`). This report compares that baseline against
the state after all 10 Phase 2 workstreams, each verified against live
data and committed separately (see git log `13b0317..1380e82` on `main`).

## 1. Query time

| Panel                                    | Before | After               | Notes                                                                                   |
| ---------------------------------------- | ------ | ------------------- | --------------------------------------------------------------------------------------- |
| Machine Capability Ranking (Cpk unpivot) | 39 ms  | — (unchanged query) | not touched in Phase 2                                                                  |
| RCA Truth Test (Engineering Analytics)   | 179 ms | 173 ms              | now JOINs `v_ldi_alarm_category`, 5 categories instead of 3 — no meaningful cost change |
| RCA Fleet Summary (Manufacturing, 24h)   | 108 ms | 102 ms              | same                                                                                    |
| Fleet Availability (Andon)               | —      | 103 ms              | rewritten to LEFT JOIN `public.devices` (bug fix); new query, no prior baseline         |
| Machine Run State (Andon)                | —      | 100 ms              | rewritten to a 5-min grid with NO_DATA detection; new query, no prior baseline          |
| Fleet Availability (Manufacturing)       | —      | 129 ms              | same fix as Andon's                                                                     |
| Worst Cpk (Fleet)                        | 53 ms  | — (unchanged)       | not touched                                                                             |
| Temp/Humidity trend (`ldi_data_1m`)      | 32 ms  | — (unchanged)       | CAGG already in place before Phase 2 (migration 043, prior session)                     |

All measured queries stay well under the 300 ms budget both before and
after — the state-model rewrites (which added a `devices` LEFT JOIN and a
`generate_series` grid) did not push anything close to the limit. Query
execution time was never actually the bottleneck this system had; see
§4 for what the P95 gate is really guarding against.

## 2. Viewport fit (1280×720 / 1920×1080 / 3840×2160)

| Dashboard                                                 | Before                                                                                                                                      | After                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operator Andon                                            | Did not fit at 720p (scrollHeight 1168 vs 720; overflowed by the Live Production table and PE-vs-Spec-Limit gauge)                          | Fits at 720p with real margin — verified via each panel's actual rendered bottom edge (`getBoundingClientRect`), not the unreliable `document.scrollHeight` (Grafana's kiosk page has `min-height:100vh`, so that number is always ≥ viewport regardless of content). Andon's real overflow at 1280×720: **-54px** (54px of headroom below the lowest panel). Total grid height 27u → 15u. |
| Manufacturing                                             | 75u total, with a real bug: the "PROCESS STATE" row header sat at the exact same y as its own content (visual overlap), plus an 18.5→20 gap | 71u total, verified zero gaps end-to-end (every row's y start == previous row's exact bottom), overlap bug fixed. Executive Summary (Production/Quality/Risk, 11 KPIs) fits in the first viewport at both 1080p and 720p with no scroll.                                                                                                                                                   |
| Engineering Analytics / Machine Snapshot / Data Readiness | Not in scope for redesign                                                                                                                   | Unchanged layout; verified still render with 0 panel errors at all 3 resolutions (see §5)                                                                                                                                                                                                                                                                                                  |

## 3. RCA correlation coverage

|                                                      | Before                                                                                                                                                                   | After                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alarm codes in master list with _any_ category       | 14/20 (70%)                                                                                                                                                              | 14/20 (70%) — unchanged, no new codes added to the master list                                                                                                                                                                                                                                                                                                         |
| Categories surfaced on RCA dashboard panels          | 3 (THERMAL+HUMIDITY blended as one, VACUUM, ALIGNMENT/PE-JE)                                                                                                             | 5 (THERMAL, HUMIDITY split apart, VACUUM, ALIGNMENT/PE-JE, MOTION)                                                                                                                                                                                                                                                                                                     |
| Real alarm codes the RCA panels actually queried for | **0** — both panels filtered on `errorcode IN ('81501','81101',...)`, none of which exist anywhere in `ldi_alarm_log` or `ldi_alarm_ms_code`. Always returned zero rows. | Real 5-digit codes via `v_ldi_alarm_category` (91008, 91009, 90001/90004/90005/90012/90013, 70004). Verified live: ALIGNMENT/PE-JE lift 1.13-1.16 (118/67 events), VACUUM lift 0.96-0.98, THERMAL lift 0.33-0.46, HUMIDITY lift 0.00 (real signal: 91008 alarms correlate with temperature, essentially never with humidity — the old blended flag couldn't show this) |
| Coverage regression tripwire                         | none                                                                                                                                                                     | `tests/lint/rca-mapping-coverage.js`, wired into CI, fails below 70%                                                                                                                                                                                                                                                                                                   |

The RCA panels went from **always returning zero rows** (a bug that predates this session, only found by building the coverage linter this session and checking what alarm codes actually exist) to producing real, differentiated correlation numbers.

## 4. New CI/lint gates

| Gate                                            | What it catches                                                                        | Result on this codebase                                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/lint/rca-mapping-coverage.js`            | Alarm code added to master list without a matching RCA category → silent zero coverage | 70% coverage, 0 dashboard reference errors                                                                                                                                  |
| `tests/lint/query-budget-linter.js`             | Panel range-scanning raw `ldi_data` instead of a CAGG tier                             | Found and fixed 1 real violation (`ldi-data-readiness.json` "Telemetry Ingestion Rows by Machine" — now reads `ldi_data_1m.sample_count`); 0 remaining                      |
| `tests/smoke/query-budget-check.sh`             | Pathological query regression (cartesian join, missing index, N+1)                     | Runs in CI's integration-chaos stage, budget 2000ms (deliberately generous — see script header for why a tight number doesn't transfer to CI's low-data-volume environment) |
| `tests/playwright/ldi-responsive-regression.js` | Panel render errors, "No data" panels, Andon overflow                                  | 15/15 pass across 5 dashboards × 3 viewports                                                                                                                                |

**Honest scope note on "P95 render < 300ms":** this is enforced as a query-time budget (server-side SQL execution), not full browser paint time (network + Grafana panel mount + React render). No full end-to-end render-time harness exists in this repo; building one would need browser-side timing instrumentation (e.g. Playwright + CDP network timing) that wasn't built in this pass. All sampled queries measure well under 300ms; actual on-screen panel-ready time will be somewhat higher due to Grafana/network overhead not captured here.

## 5. Design system

- `docs/GRAFANA_DESIGN_SYSTEM.md` scope extended from 3 dashboards (NOC/Engineering/Capacity) to all 9, formally documenting the LDI dashboards' existing cyberpunk palette (§2.1a) as a recognized sibling to the original NOC palette, rather than forcing a ~230-instance mass recolor of already-verified panels.
- Harmonized 33 pre-existing stray color instances (`#00E5FF`, `#EF4444`, `#FACC15`, `#22C55E` casing) to the dominant LDI convention — real drift, some self-introduced this session, now consistent.
- `ALLOWED_HEIGHTS` in `dashboard-linter.js` extended (`1,4,5,6,8,10,16`) to match §5.2's canonical KPI-stat height (h=4) and Gauge height (h=6), both now in active use.

## 6. What's NOT covered by this report

- True end-to-end render-time P95 (browser paint, not just query time) — not measured.
- Pixel-diff visual regression — no image-diff library in this repo; the new Playwright suite does structural checks (errors, no-data, overflow) instead, documented as a deliberate scope decision in the test file itself.
- The 15m/1h CAGG tiers exist and are verified accurate but have no consumer yet — no current LDI panel has an effective range beyond 6h.
