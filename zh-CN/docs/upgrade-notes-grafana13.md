> [!NOTE]
> **自动翻译 / 深度技术数据**
> 本文档为深度技术审计/证据报告。为了保持专业术语的准确性，目前主要以英文原文为准。

# Grafana 13 — Upgrade & Modernization Notes

**Current production version:** `grafana/grafana:13.1.2` (pinned in `docker-compose.yaml`).

This document records what was actually done during the Grafana 13 modernization work, what was evaluated and rejected, and what to check before any future version change. It complements `docs/architecture/GRAFANA_DESIGN_SYSTEM.md` (the design token source) and `docs/architecture/DASHBOARD_INVENTORY.md` (the live dashboard/panel inventory) rather than duplicating them.

## Upgrade rationale

The move to the Grafana 13.x line brought the platform onto the currently-maintained major version, giving access to the panel types, variable chaining, and library-panel improvements the dashboards below already use. This was a version-line adoption, not a single-release chase — see "Rejected 13.2 upgrade" below for why staying on 13.1.2 specifically was the right call at evaluation time.

## Architecture changes

No architecture change was required to move onto 13.x — the existing PostgreSQL datasource, provisioning structure (`monitoring/grafana/provisioning/`), and bind-mounted dashboard directories (`monitoring/grafana/dashboards/{infrastructure,manufacturing,mentor-ldi}/`) all carried forward unchanged.

## Dashboard modernization already implemented

All of the following is real, shipped work on `main` — not aspirational:

- **Design system:** `docs/architecture/GRAFANA_DESIGN_SYSTEM.md` — single merged token source (color, typography, spacing), translated to Thai and Chinese.
- **Library panels:** `monitoring/grafana/library-panels/ims-fleet-health-score.json`, used to eliminate duplicate KPI definitions across dashboards.
- **Accessibility:** WCAG AA contrast audited across all dashboards; kiosk no-scroll guarantee enforced by an active lint check (`dashboard-linter.js` Check 14) for TV-wall/Andon-board displays.
- **CI/linting:** `tests/lint/dashboard-linter.js` runs 18+ checks (duplicate UID, duplicate panel ID, datasource placeholder violations, 2D bounding-box panel overlap, mixed-height rows, kiosk scroll ceiling, domain tagging) and is wired into `.github/workflows/ci.yml`.
- **Navigation/drill-down:** the Fleet → Engineering → Machine Snapshot → Alarm Context chain preserves machine ID, factory, process, and timestamp across every link; verified end-to-end.
- **Performance work:** P95 query latency measured across LDI dashboards; dashboard load times measured; query-budget-linter enforces a real latency budget in CI, with individually-justified, dated exemptions (`QUERY_BUDGET_EXEMPT`) for deep-dive analytical panels whose cost scales with sample count by design, not by an unoptimized query.

## Rejected Grafana 13.2 upgrade

Evaluated during the P12 system-wide security remediation cycle with a real, direct Trivy comparison of the two container images:

| | 13.1.2 | 13.2.0 |
|---|---|---|
| HIGH findings | 39 | **162** |

The 13.2.0 image showed a real regression, not an improvement — over 4× the unfixed HIGH-severity findings of the currently-deployed 13.1.2. The upgrade was rejected on this evidence alone; no dashboard compatibility issue was even reached in evaluation because the security regression was disqualifying on its own. Full detail: `docs/evidence/FINAL_SECURITY_GATE_P12.md`.

**Do not upgrade to 13.2.0 on this evidence.** Re-evaluate only if a newer 13.2.x patch release changes the picture (see "Future upgrade procedure" below) — do not upgrade merely because a version is newer.

## Compatibility considerations

- Provisioning format, PostgreSQL datasource plugin, and the dashboard JSON schema version in use are all stable within the 13.x line — the rejected 13.2.0 evaluation found no dashboard-level compatibility break, only the security regression above.
- The kiosk no-scroll and bounding-box-overlap lint checks are 13.x-schema-aware; any future major-version jump (14.x) should re-verify these checks still parse the dashboard JSON correctly before trusting a clean lint result.

## Data source considerations

Single datasource in production use: PostgreSQL (against TimescaleDB via pgbouncer). No datasource-plugin version pinning issue was found moving onto 13.x.

## Plugin considerations

Installed via `GF_INSTALL_PLUGINS` in `docker-compose.yaml`: `grafana-clock-panel`, `grafana-piechart-panel`, `volkovlabs-echarts-panel`, `marcusolsson-dynamictext-panel`, `benjaminfourmaux-status-panel`. One additional unsigned plugin is explicitly allow-listed: `ims-3d-panel` (via `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`), used by the Factory Digital Twin dashboard.

Before any future Grafana version bump, re-verify each of these plugins publishes a compatible release for the target version — a plugin incompatibility would surface as a blank/broken panel specifically on dashboards using that plugin type, not a global failure.

## Rollback considerations

Grafana itself is stateless from a dashboard-JSON perspective (dashboards are bind-mounted from the repo, not stored only in Grafana's internal DB) — reverting the image tag in `docker-compose.yaml` and recreating just the `ims-grafana` container is sufficient to roll back a version change. See `docs/operations-runbook.md` section 4 for the container-recreate command and the known stale-nginx-upstream-IP symptom to check for afterward.

## Future upgrade procedure

1. Pull the candidate tag and run a direct Trivy comparison against the currently-deployed tag (`trivy image --severity CRITICAL,HIGH -f json -q <image>` for both) — do not upgrade on a Trivy regression, following the same standard that rejected 13.2.0.
2. Check each installed plugin (see "Plugin considerations") for a compatible release on the candidate version.
3. Recreate only `ims-grafana` (`--no-deps`), never a compose-wide restart.
4. Verify: `HTTP 200` via nginx, dashboards render, the PostgreSQL datasource connects, the `ims-3d-panel` unsigned plugin still loads (Factory Digital Twin dashboard specifically), and `tests/lint/dashboard-linter.js` still passes clean.
5. Record the outcome in this file (append, don't overwrite the 13.2.0 rejection above — that evidence stays valid until re-tested).

## Known limitations

- Deep-dive analytical panels (`ims-ldi-engineering-analytics.json`, others) are deliberately exempt from the standard query-budget target because their cost scales with raw sample count by design — this is documented per-panel, not a gap to close.
- Grafana-native alerting is unused by design; all alerting is centralized in Prometheus/Alertmanager (`monitoring/prometheus/rules/ims-alerts.yml`) to avoid duplicated alert logic between two systems.

## Remaining risks

- 39 HIGH Trivy findings remain on the currently-deployed 13.1.2 image, not individually reachability-assessed per-CVE this cycle (see `docs/evidence/FINAL_SECURITY_GATE_P12.md` for the honest scope disclosure) — deferred pending either a future 13.1.x patch release or a dedicated per-CVE review, not silently ignored.
- No newer 13.1.x patch tag has been evaluated as of this writing; a patch release (13.1.5+) could resolve some of those 39 findings without the 13.2.0 regression — worth checking before the next security cycle.
