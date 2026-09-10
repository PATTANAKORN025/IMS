> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# Grafana 13 World-Class Modernization — Gap Analysis

**Date:** 2026-08-24
**Method:** Direct inspection of the current `main` branch — file existence, real panel/dashboard counts, real linter output, real CI wiring, real SQL content. No metric below is invented; each is either measured directly or cited from an already-completed, dated piece of work found in the repo.

---

## Finding: this modernization already happened

The requesting prompt's premise — that "Grafana 13 World-Class Modernization" is the next unstarted objective — does not match the repository's actual state. Every phase of that plan maps to work that is already shipped on `main`, tracked under different names across roughly 140 completed items in this session's own task history. There is no `perf/grafana13-worldclass` branch (checked local, `origin`, and the second `tanadon-c-source` remote — none exist).

## Phase-by-phase reality check

| Phase | Asked for | Actual state |
|---|---|---|
| 0 — Baseline audit | Inspect dashboards, provisioning, SQL, CI | This document. Real numbers below. |
| 1 — Dashboard architecture / dedup | Canonical Cpk view, no independent SQL | **Already correctly resolved** — see "Cpk SQL" section below. Not a gap. |
| 2 — Grafana 13 UX (variables, links, panel types) | Chained variables, data links, library panels, state timeline etc. | Present: `${machine_id}`/`${factory}`/`${process}` chained variables, `ims-fleet-health-score.json` library panel, drill-down links wired (task #197), status/stat/trend panel types in use throughout |
| 3 — Executive industrial UX | Dark theme, WCAG AA, typography hierarchy, 3-second rule | `docs/architecture/GRAFANA_DESIGN_SYSTEM.md` exists (single merged token source, translated to Thai/Chinese); WCAG AA contrast audited (task #130, #144); typography hierarchy audited (task #127, #147); "3-second glance test" explicitly run (task #145) |
| 4 — Performance engineering | Measure before/after, <2s load, query budget | P95 query latency measured (task #142), dashboard load time measured (task #143), query-budget-linter exists and runs in CI, `QUERY_BUDGET_EXEMPT` panels individually justified with dated investigation notes (2026-08-06) |
| 5 — Data quality / observability | Stale telemetry, ingestion lag, duplicate/out-of-order detection | `ldi-data-readiness.json` dashboard (17 panels) exists specifically for this; migration/simulator work addressed duplicate detection, out-of-order handling, alarm debounce (tasks #94-98, #182-186) |
| 6 — Navigation mesh | Fleet → Engineering → Snapshot → Alarm → Record, preserving context | MO drill-down variable wired (task #197); drill-down link continuity explicitly verified (task #152) |
| 7 — Accessibility / multi-display | 4 resolutions, contrast, no color-only status | WCAG AA verified (task #144); kiosk no-scroll ceiling is an active lint check (dashboard-linter.js Check 14); screenshot variations at multiple resolutions already captured (task #146) |
| 8 — CI/CD hardening | Dashboard schema, dup UID/panel ID, datasource checks in CI | `dashboard-linter.js` already has 18+ checks (dup UID, dup panel ID, datasource placeholders, bounding-box overlap, mixed-height rows, kiosk scroll, domain tagging) and is **already wired into `.github/workflows/ci.yml`** |
| 9 — Documentation | 6 named files | See below — content exists, 5 of 6 specific filenames don't |
| 10 — Validation gate | Pre-commit checks, regression, HEAD verification | `scripts/pre-commit.js` already runs dashboard-linter + JSON validation on every commit; this session used it successfully throughout P11/P12 |

## Cpk SQL — real inspection, not assumed

5 dashboards reference Cpk. Checked each `rawSql` block directly:

| Dashboard | Uses canonical view? | Reason if not |
|---|---|---|
| `ims-easy-overview.json` | Yes — `public.v_machine_spc_fleet` | — |
| `ims-ldi-manufacturing.json` (worst-Cpk panel) | Yes — `public.v_machine_spc_fleet` | — |
| `ims-ldi-manufacturing.json` (delta panel) | No | Needs a now-vs-previous-period comparison the static view can't express |
| `mentor-ldi-machine-snapshot.json` | Yes — `public.v_machine_spc_ranking` | — |
| `ims-ldi-engineering-analytics.json` | No | Deep-dive per-machine PE+JE breakdown with N/StdDev/Cp/Cpk, explicitly `QUERY_BUDGET_EXEMPT` with a dated (2026-08-06) note explaining indexes/rewrites were investigated and rejected |
| `ims-ldi-machine-snapshot.json` | No | Single-clicked-machine drill-down parameterized by `clicked_series`/`machine_id`, structurally incompatible with a static fleet-wide view |

**Conclusion: not a gap.** Every non-canonical instance carries a dated, specific, technical justification already in the SQL comment. This is disciplined engineering, not oversight.

## Real baseline numbers

- **Dashboard files:** 19 (`git ls-files monitoring/grafana/dashboards | grep -c '\.json$'`)
- **Total panels:** 259 across all 19 dashboards (largest: `ims-ldi-manufacturing.json` at 33; smallest: `ims-ldi-factory-digital-twin.json` at 1)
- **Unique dashboard UIDs:** 19/19 — zero collisions
- **Dashboard-linter result:** 0 errors, 60 warnings, all 60 in a single unrelated file (`mentor-mis-incident-command.json`) — none in the 5 Cpk-referencing dashboards
- **CI wiring:** `dashboard-linter.js` runs in `.github/workflows/ci.yml` line 42
- **Grafana-native alerting:** 0 dashboards use `"alert":` — intentional, not a gap. Alerting is centralized in Prometheus/Alertmanager (`monitoring/prometheus/rules/ims-alerts.yml`, 13 rules), the standard modern pattern, avoiding duplicated alert logic between Grafana panels and the metrics pipeline.

## Documentation — the one real, concrete gap

Phase 9 names 6 specific files. Checked each:

| File | Status |
|---|---|
| `docs/grafana13-audit-report.md` | This file — created now |
| `docs/performance-benchmark.md` | **Missing** — content exists but scattered (inline SQL comments, tasks #132/#142/#143), never consolidated |
| `docs/dashboard-style-guide.md` | **Missing** — superseded by `docs/architecture/GRAFANA_DESIGN_SYSTEM.md`, which already covers this ground |
| `docs/executive-demo-script.md` | **Missing** — no equivalent found |
| `docs/operations-runbook.md` | **Missing** — `docs/INCIDENT_RESPONSE.md` and `docs/BACKUP_RESTORE.md` cover adjacent ground but not a unified ops runbook |
| `docs/upgrade-notes-grafana13.md` | **Missing** — no dedicated upgrade log exists (P12's `docs/evidence/FINAL_SECURITY_GATE_P12.md` covers the *image* upgrade to 13.1.2 from a security angle, not a UX/compat angle) |

## Recommendation

There is no dashboard redesign, re-theming, performance-tuning, or CI-hardening work left to do that would constitute genuine improvement — repeating those phases now would mean editing 19 already-tuned, already-validated production dashboards for no measurable gain, with real risk of regressing careful prior work (WCAG contrast, kiosk no-scroll, query-budget exemptions all have documented rationale that a fresh "modernization" pass could accidentally undo).

The only concrete, low-risk, genuinely additive work remaining is **documentation consolidation**: writing the 3-4 missing files whose content doesn't already exist elsewhere (`executive-demo-script.md`, `operations-runbook.md`, `upgrade-notes-grafana13.md`, and optionally a slim `performance-benchmark.md` that consolidates the already-measured numbers). `dashboard-style-guide.md` should likely be skipped entirely — writing it would just duplicate `GRAFANA_DESIGN_SYSTEM.md`.
