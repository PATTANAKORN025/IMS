<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS LDI — Factory Digital Twin (2D Canvas): Design

> Status: approved by user 2026-08-17, not yet implemented.
> Roadmap position (user-specified ranking, not to be reordered):
> Real DB → Machine State Model → 2D Canvas → Drill-down → Production/Compliance →
> Performance Validation → 3D Digital Twin. This spec covers everything through
> Performance Validation. 3D is explicitly out of scope.

## Purpose

"See what the factory is producing, what each machine is doing, where it is
located, what problems are occurring, and how those problems affect
Production/Compliance." Not a graph-heavy dashboard — a visual, at-a-glance
representation of the factory in motion, with drill-down into the existing
detail dashboards.

## Hard requirements (user-specified, verbatim intent preserved)

- Do not modify `ims-ldi-manufacturing.json` (Manufacturing Command Center).
- Do not modify `ims-ldi-operator-andon.json` (Andon Board).
- No mock/simulated data anywhere in this dashboard.
- Real datasource only (`timescaledb`).
- Machine status, alarms, and production state must all be traceable back to
  real rows in the database — every query shape reused from an existing,
  already-proven dashboard, not invented fresh.
- `machine_id` must be unique.
- `board_id` must be unique.
- `board_no` must pass validation.
- Every node has drill-down.
- Every color has documented semantic meaning (no raw undocumented hex).
- No undocumented Grafana CSS.
- No external Grafana plugins beyond what's already installed
  (`GF_INSTALL_PLUGINS` in `docker-compose.yaml`).
- Performance budget defined before building, not after.

## Real findings that shape this design (verified against the live DB/Grafana this session, not assumed)

1. **Canvas panel is core/internal to Grafana 13.1.1** — confirmed via
   `GET /api/plugins`, `signature: internal`. No new plugin install needed;
   satisfies the "no external plugins" constraint by construction.

2. **No real floor-plan coordinates exist.** `public.devices.location` holds
   5 coarse zone labels only: `Site A - Zone 1`, `Site A - Zone 2`,
   `Site A - Zone 3`, `Site B - Zone 1`, `Site B - Zone 2`. There is no
   x/y or lat/long column anywhere in the schema. Chosen layout: 5 labeled
   zone blocks on the canvas, machines placed in a grid inside their real
   zone (user-approved option). Node _position_ is manual canvas config
   (like Andon's repeat-panel tile order); node _status_ is a live query.
   These are different things and must not be conflated in the panel JSON
   or its description.

3. **23 registered `device_type='ldi'` rows, only 10 actually report.**
   `SELECT eqp_id, COUNT(*) FROM ldi_data WHERE time > NOW() - INTERVAL
'24 hours' GROUP BY eqp_id` returns exactly `LDI-01`..`LDI-10`. The other
   13 (`LDI-B07` legacy, `LDI-B05/LD2`, `LDI-B01/LD2`, `LDI-A01`,
   `LDI-A02`, `LDI-A03/02`, `LDI-A05/02`, `LDI-B03/2`) are
   `enabled=true` in the registry but never write to `ldi_data` — dead/alias
   entries. Canvas shows the 10 real reporting machines only. The 13 ghost
   registry rows are a pre-existing data-quality gap, out of scope for this
   dashboard, noted here so it isn't silently rediscovered later.

4. **`board_id` is empty on 100% of real rows.**
   `SELECT COUNT(DISTINCT board_id) FROM ldi_data WHERE time > NOW() -
INTERVAL '24 hours'` → 1 distinct value across 19,043 rows (empty
   string). The "board_id must be unique" requirement cannot be honestly
   satisfied — the column isn't populated by the real ingestion pipeline.
   **Decision (user-approved): use `log_id` instead** — verified 100%
   non-null and 100% unique (19,119/19,119) over the same window. The
   dashboard will label this field "Event ID (log_id)", not "Board ID", to
   avoid implying a board-tracking capability that doesn't exist.

5. **`board_no`/`total_board` are real and clean.**
   0 of 19,053 rows violate `board_no <= total_board`; 0 negative; 0
   non-positive `total_board`; 233 distinct `board_no` values; 74 distinct
   `total_board` values. This is genuinely usable as a per-machine
   production-progress indicator (`board_no/total_board`). "board_no must
   pass validation" is satisfied by this check, run at build time and
   re-checked in Performance Validation.

6. **Existing query-tiering contract applies unchanged.**
   `GRAFANA_DESIGN_SYSTEM.md` §10 / `tests/lint/query-budget-linter.js`:
   raw `ldi_data` is for latest-value lookups only (`LIMIT 1` /
   `DISTINCT ON`); range scans must go through `ldi_data_1m` (≤6h),
   `_15m` (6h–2d), or `_1h` (>2d). Every canvas node query is a
   latest-value lookup against raw `ldi_data` (same shape as
   `v_ldi_machine_latest_full`, already used by Andon) — no new tiering
   rules needed, existing contract already covers this.

7. **Real performance budget already exists.**
   `tests/smoke/query-budget-check.sh`: real target 300ms per query,
   CI hard-fail at 2000ms. This dashboard adopts the same numbers — not
   inventing a new budget, reusing the one the repo already enforces.

8. **The existing CSS-injection convention is itself undocumented.**
   Andon's panel 9999 (`<style>[class*="-panel-container"]{...}</style>`
   text panel) has no entry in `GRAFANA_DESIGN_SYSTEM.md`. Given the "no
   undocumented Grafana CSS" requirement, this new dashboard uses **zero**
   CSS injection — all styling via the Canvas panel's native JSON config
   (fill, stroke, corner radius, text), which is inspectable dashboard
   config, not injected raw CSS. The pre-existing Andon gap is not fixed
   here (out of scope — flagged, not silently absorbed into this task).

## Two acceptance-criteria gaps (documented per user decision, not faked)

- **Data / board_id unique**: not achievable as literally stated — real
  column is unpopulated. Substituted with `log_id` (real, unique, 100%
  populated), labeled honestly in the UI as "Event ID", not "Board ID".
- **Operator / Know the SLA**: no SLA threshold or target exists anywhere
  in this system (confirmed earlier this session: the MTTA/MTTR dashboard
  found 0 of 782 alarm lifecycle rows ever acknowledged, and no SLA config
  table/value exists in the schema). The dashboard shows real
  Elapsed-time-since-fired (same field already computed in Andon's Action
  Queue), explicitly labeled "Elapsed", not "SLA" or "SLA compliance".

## Panel design

**File**: `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json` (new file only)

**Top strip — C-Level, single glance, <5s**:

| Stat                         | Query source                                                    | Reused from                                                                   |
| ---------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Fleet Availability %         | registered+enabled LDI fleet, reporting AND running             | Andon panel 1, verbatim                                                       |
| Active Critical/Major Alarms | `ldi_alarm_lifecycle`, status ≠ RESOLVED                        | Andon panel 2, verbatim                                                       |
| Not-Producing count          | machines currently ALARM+IDLE+NO_DATA (production-impact proxy) | new query, same state classification as Andon's per-machine tiles, aggregated |
| Environmental Compliance %   | temp 20-24°C AND humidity 50-60%RH, fleet-wide                  | Andon panel 3, verbatim                                                       |

**Canvas — 5 zone blocks, 10 machine nodes**:

- Fill color = machine state (`0/1/2/3` → NO_DATA/IDLE/OK/ALARM), same
  color tokens and query as Andon's per-machine repeat tiles (`v_ldi_machine_latest_full`
  - active-alarm override).
- Label = machine_id + current MO.
- Board progress = `board_no/total_board` from latest row.
- Alarm badge = active Critical/Major count for that specific machine
  (same shape as Andon panel 2, scoped to one `eqp_id`).
- Click target = `/d/ims-ldi-machine-snapshot/...` with the same URL
  parameter pattern already used by Andon's Action Queue table and
  Manufacturing's drill-down links (`var-machine_id`, `var-factory`,
  `var-mo`, `var-event_time_ms`, `from`, `to`).
- Tooltip = Owner (same category→team mapping already in Andon's Action
  Queue), Elapsed (real, labeled honestly, not "SLA"), Event ID (`log_id`,
  substituting for the unpopulated `board_id`).

**Color legend**: a static legend element on the canvas mapping each fill
color to its state name, matching `GRAFANA_DESIGN_SYSTEM.md` §2.1 tokens —
same tokens used everywhere else in this repo, not a new palette.

## Acceptance criteria — traceability

| Checkbox                                | Satisfied by                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| C-Level: Production status within 5s    | Top strip, 4 stats, single glance                                            |
| C-Level: machines with problems         | Canvas node color + alarm badge                                              |
| C-Level: production impact              | Not-Producing count stat                                                     |
| C-Level: compliance risk                | Environmental Compliance % stat                                              |
| Operator: what each machine needs to do | Node label = current MO                                                      |
| Operator: which alarms need managing    | Alarm badge, click-through                                                   |
| Operator: owner                         | Tooltip, reused Owner mapping                                                |
| Operator: SLA                           | **Gap** — shown as Elapsed, not SLA (see above)                              |
| Operator: drill-down                    | Every node clickable → Machine Snapshot                                      |
| Engineering: Machine snapshot enabled   | Drill-down target                                                            |
| Engineering: raw telemetry traceable    | Machine Snapshot → Process Timeline (existing)                               |
| Engineering: alarm traceable            | Machine Snapshot alarm context (existing)                                    |
| Engineering: RCA traceable              | `v_ldi_alarm_category`, same as Action Queue Owner logic                     |
| Data: no mock                           | All queries against real `ldi_data`/`ldi_alarm_log`/`ldi_alarm_lifecycle`    |
| Data: timestamp traceable               | Same `time`/`ingest_ts` columns already audited this session                 |
| Data: board_id unique                   | **Gap** — substituted with `log_id` (see above)                              |
| Data: machine_id unique                 | `devices.device_id` is the primary key                                       |
| Data: budget query passed               | `query-budget-linter.js` + `tests/smoke/query-budget-check.sh`, 300ms target |

## Performance Validation (before calling this done)

1. `node tests/lint/dashboard-linter.js` — 0 new errors.
2. `node tests/lint/query-budget-linter.js` — every canvas-node query is a
   latest-value shape (`LIMIT 1`/`DISTINCT ON`), no range-scan warnings.
3. `bash tests/smoke/query-budget-check.sh` — every query under 300ms in
   practice (2000ms hard fail).
4. Real render via Grafana's render API at production kiosk params
   (`kiosk=tv&autofitpanels`, 1280x720) — same evidence method used to
   verify the Andon Board changes this session — confirm zero scroll,
   all 10 nodes + top strip visible and legible.
5. `node scripts/generate-dashboard-inventory.js` — inventory stays in
   sync (new dashboard, +1 count).

## Explicitly out of scope

- 3D Digital Twin (next roadmap phase, not this spec).
- Fixing the 13 ghost device registry rows.
- Populating real `board_id` in the ingestion pipeline.
- Defining real SLA thresholds/config.
- Any change to `ims-ldi-manufacturing.json` or `ims-ldi-operator-andon.json`.
- Documenting/fixing Andon's pre-existing undocumented CSS-injection panel
  (noted as a gap, not fixed here).
