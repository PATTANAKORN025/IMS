# IMS Grafana Design System

> [!IMPORTANT]
> This ensures that all IMS dashboards (NOC Overview, Engineering Drill-Down, Capacity Planning, and from Phase 2 onwards — LDI Manufacturing, LDI Engineering Analytics & SPC, LDI Machine Snapshot, LDI Operator Andon Board, LDI Data Readiness) adhere to the same standard. Edit here in one place to prevent cross-file drift, ensuring the system appears as a unified suite immediately upon switching pages.
>
> This document is a **contract**, not merely a guideline — every new panel must comply with these rules prior to merging.

---

## 1. Design Principles

1. **Function first, beauty follows** — Aesthetics that do not accelerate data comprehension are decorative elements that must be eliminated.
2. **Color always has a single meaning** (Semantic, not Decorative) — See rule 3 below.
3. **3-Second Rule** — Anyone walking past a NOC display must determine within 3 seconds whether "everything is currently normal" without reading labels.
4. **Consistency > Novelty** — Panels of the same type must share an identical appearance wherever they appear (via Library Panels).
5. **Progressive disclosure** — NOC answers "do we need to call someone?", Engineering answers "why?", Capacity answers "what will happen next?". Do not mix levels of detail on the same page.

---

## 2. Color System

### 2.1 Semantic Palette — ONE table, every dashboard (merged 2026-08-08)

Until now this repo ran **two** separate palettes: §2.1 for NOC/Engineering/Capacity
and a distinct "LDI Kiosk" palette for the 5 LDI dashboards. In practice both had
already drifted onto the _same_ hex values almost everywhere (verified by counting
every `#RRGGBB` literal across all 10 dashboard files before writing this section) —
the two-table split had become a documentation fiction, not a real design boundary.
Merged into one table, applied to **all 12 dashboards** including the LDI kiosk set.
No dashboard is exempt.

| Token            | Hex Code  | Meaning                           | Used For                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ok`             | `#22C55E` | Healthy / Normal                  | Healthy, running, PASS, Capable+ thresholds — any "this is fine" verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `warning`        | `#F59E0B` | Monitor / Non-urgent              | IDLE, Marginal, warning thresholds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `critical`       | `#EF4444` | Danger / Immediate action required| OUT OF SPEC, critical thresholds, error states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `info`           | `#00F2FE` | General data / Non-verdict        | Plain KPI numbers, machine-name labels, non-alerting stats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `accent`         | `#3B82F6` | Highlight / Active UI elements    | Navigation highlights, interactive elements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `no_data`        | `#64748B` | Specifically NO_DATA              | A genuine gap in reporting — a _different claim_ than `critical` ("confirmed bad"). "We don't know" ≠ "something is wrong." Every stat/gauge/bargauge panel must carry an explicit `type: "special", options.match: "null+nan"` mapping to this color (or, for panels that convert no-rows into a sentinel value in SQL, a matching value-mapping to the text `NO_DATA`) — Grafana does not fall back to a neutral color on its own. `noValue` text must be the literal string `NO_DATA` everywhere (not `N/A`/`-`/Grafana's raw "No data"), except where a panel's fallback is a legitimate zero-count business value or already carries a more specific semantic label (e.g. NOC's `AWAITING TELEMETRY`). |
| `forecast`       | `#4A5568` | Forecast / Regression (dashed line)| Forecast, regression, trend projection — dashed line only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `severity-minor` | `#EAB308` | 4th alarm-severity tier           | ISA-18.2 "Minor" severity specifically, distinct from `warning`/Major — the two are deliberately different shades so a 4-level severity scale (Critical/Major/Minor/Warning) stays visually distinguishable. Not part of the core 6; only used in alarm-severity value mappings.                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Strict Rules:**

- **Do not** use the Grafana default palette — exclusively use the tokens in this table to communicate status.
- **Do not** bind fixed colors to specific machine/series names, except in one case: permanent physical machines in the factory that must be distinguished by a static color — mapping must be declared in §8.
- Red (`#EF4444`) must **always** signify critical — do not use red simply as a series color, as it conflicts with the alert semantics.
- Forecast/regression/threshold reference lines must always use a `#4A5568` dashed line, not bright colors that compete with actual data.
- Decorative colors (graph-series differentiation for lines with no status meaning, backgrounds, borders) are exempt from this table — a dashboard can't be built from 6 saturated colors alone. A color is "decorative" only if it never communicates OK/warning/critical/no-data for anything; if in doubt, it's semantic.
- **Enforcement:** `tests/lint/dashboard-linter.js` (Check 15) validates every `thresholds.steps[].color` and `mappings[].options.color` in `monitoring/grafana/dashboards/*.json` against this table's hex values — scoped to those two structural locations specifically because that's where a color is _always_ semantic, unlike a bare `fixedColor` which can legitimately be decorative (series differentiation). This is the actual "central" mechanism — `APPROVED_TOKENS` in that file is generated from this table; if you add a token here, add it there too.

### 2.1a (retired) — see history

The former "LDI Kiosk" 5-token table (`#22c55e`/`#FF9100`/`#FF003C`/`#00F2FE`/`#6B7280`)
is retired as of the merge above. Every one of its concepts now maps 1:1 onto §2.1's
table via the _already-dominant_ hex values found in the live LDI dashboard files —
nothing about the LDI dashboards' visual identity (dark `#030407` background, Roboto
Mono) changed, only the status-color literals. See git history for the harmonization
changelog predating this merge (Phase 2/3 stray-instance cleanup).

### 2.1b Accessibility — WCAG AA contrast (audited 2026-08-08)

Grafana's Stat/Gauge `colorMode: "background"` always renders **white** value
text regardless of the background's actual brightness — verified empirically,
not assumed from the Grafana docs (there is no auto-contrast switch to black
text for light backgrounds in 13.1.1). Computed white-text contrast ratio for
every §2.1 token against a solid fill:

| Token            | Hex       | White-text ratio | AA large (≥3:1) | AA normal (≥4.5:1) |
| ---------------- | --------- | ---------------- | --------------- | ------------------ |
| `ok`             | `#22C55E` | 2.28             |                 |                    |
| `warning`        | `#F59E0B` | 2.15             |                 |                    |
| `critical`       | `#EF4444` | 3.76             |                 |                    |
| `info`           | `#00F2FE` | 1.39             |                 |                    |
| `accent`         | `#3B82F6` | 3.68             |                 |                    |
| `no_data`        | `#64748B` | 4.76             |                 |                    |
| `severity-minor` | `#EAB308` | 1.92             |                 |                    |

**Fix applied, not just documented:** every stat/gauge/bargauge panel using
`colorMode: "background"` (31 panels) was switched to `colorMode: "value"` —
same token color, now as large bold text on the dark panel background instead
of a solid fill behind white text. As _text_ against the dark panel background
(effectively the same ratio, inverted), every token passes AA-large and all
but `no_data` pass full AA-normal too (`no_data` is only ever used at the
large stat-value sizes this system uses, so AA-large is the applicable bar).
This also has a side benefit: it now visually reinforces §2.1's `ok`/`warning`/
`critical` ("this is a verdict") vs `info` ("neutral readout, not a verdict")
distinction — verdicts are solid-fill tiles, neutral readouts are colored text
on a dark tile — rather than being identical-looking and only distinguishable
by which specific color of solid tile it is.

**One deliberate exception:** the Andon board's per-machine traffic-light
tiles (`monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json`, panel
`1000`) keep `colorMode: "background"`. Their job is color _perception_ from
3-5 meters, not text _reading_ — a solid color block is more reliably
distinguishable at a glance from across a factory floor than colored text at
any panel size that still fits ten tiles across a kiosk screen, matching how
real industrial andon lights work. WCAG's text-contrast metric doesn't model
this "is the block red or green" task, so applying it here would trade away
the actual accessibility need (glanceability) for a metric that doesn't fit
the use case.

**Enforcement:** `tests/lint/dashboard-linter.js` (Check 17) warns on any
stat/gauge/bargauge panel using `colorMode: "background"` outside the
per-file exception list, so this doesn't silently regress as new panels are
added.

### 2.2 Threshold Contract (Must be identical across all panels measuring the same metric)

| Metric             | Warning | Critical | Notes                               |
| ------------------ | ------- | -------- | ----------------------------------- |
| CPU Load %         | 80      | 90       |                                     |
| RAM Used %         | 85      | 95       |                                     |
| Disk Used %        | 80      | 90       |                                     |
| Temperature °C     | 45      | 55       | Adjust to actual machine specs when known |
| LDI PE (µm, abs)   | 10      | 15       | According to tolerances agreed with QA |
| Fleet Health Score | < 70    | < 50     | Continuous scale 0–100 (no step functions) |

These figures must be **written once** and reused via the field config template, rather than typing thresholds repeatedly across every panel — if a value needs to change, change it in one place and save it as a Library Panel field config.

---

## 3. Typography & Number Formatting

| Element                                | Rule                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel title                            | Short ≤ 4 words, Title Case, do not include units in the name (units belong in axis/legend).                                                               |
| Panel description                      | Always include for every panel, explaining "what this is + how it is calculated", displayed via hover (ⓘ icon).                                            |
| Stat value font size (NOC / kiosk row) | ≥ 56px for the top row KPIs of NOC Overview and Andon Board (increased from the original 32px — read from further away on large NOC/kiosk screens), paired with `titleSize` ≥ 16px. |
| Stat value font size (Others)          | ≥ 32px for general KPIs.                                                                                                                                   |
| Table `cellHeight` (NOC / kiosk)       | Always `lg` for main tables on NOC Overview and Andon Board — the default `sm` is too small to read from a distance.                                       |
| Unit                                   | Always configure for every field, do not leave raw numbers (`%`, `°C`, `GB`, `Mbps`).                                                                      |
| Decimal                                | 1 decimal place is sufficient for % and temperature, 0 decimal places for counts.                                                                          |
| Time                                   | `dateTimeFromNow` for "last seen" (e.g., "12s ago"), absolute time reserved only for tooltips.                                                             |
| Sentinel values                        | Special values (e.g., 9999 = no growth) must always have a text value mapping; never show raw numbers that look like bugs.                                 |

---

## 4. Panel Type Decision Table

Choose panel types based on the **nature of the data**, not out of habit:

| Data Type                               | Use Panel                           | Example in IMS                  |
| --------------------------------------- | ----------------------------------- | ------------------------------- |
| Single latest value + side-by-side trend| **Stat** (`graphMode: area`)        | Latest CPU, Latest RAM          |
| Capped values requiring "amount remaining"| **Bar Gauge** / **Gauge**           | RAM %, Disk %                   |
| Numerous statuses over time             | **State Timeline**                  | Fleet uptime 24h                |
| Continuous trends, multi-series comparison| **Time Series**                     | CPU/RAM/Network history         |
| Proportions of a whole at a point in time| **Pie / Donut**                     | Traffic breakdown per interface |
| Detailed table with multiple fields     | **Table** + gauge cell + color text | Server Fleet Status             |
| Correlation between 2 variables         | **XY Chart**                        | CPU vs Temperature              |
| Actively firing alerts                  | **Alert List**                      | Top row of NOC                  |
| Runbook descriptions/links              | **Text (Markdown)**                 | Notes beneath a row             |
| Spatial locations on the factory floor  | **Geomap (custom image)**           | Physical machine layout by production area |

**Prohibition:** Do not cram time series into small stat panels (6×6) because there will be no room to read the axes — if a trend is needed in a small space, use a stat + sparkline instead.

---

## 5. Layout Grid System

### 5.1 Grid Rules (Standard Grafana 24 columns)

```text
┌─────────────────────────────────────────────────────┐
│ Row 1: KPI Strip  [4][4][4][4][4][4] h=4  │ ← Single metric indicating overall status
├─────────────────────────────────────────────────────┤
│ Row 2: Alert + Status [Alert List: 8][Table: 16] h=8│ ← Must be viewed before anything else
├─────────────────────────────────────────────────────┤
│ Row 3: Trends (collapsible row by domain) h=8-10 │ ← 1-2 timeseries per row, width 12-24
├─────────────────────────────────────────────────────┤
│ Row N: Deep Debug (collapsed by default)  h=8  │ ← Raw table, non-critical
└─────────────────────────────────────────────────────┘
```

### 5.2 Width/Height Rules

| Panel type                 | Width (Columns) | Height |
| -------------------------- | --------------- | ------ |
| Stat (KPI)                 | 4–6             | 4      |
| Gauge / Bar Gauge          | 6–8             | 6      |
| Primary Time Series        | 12–24           | 8      |
| Secondary Time Series (comparison) | 12              | 8      |
| Table                      | 16–24           | 8–10   |
| Alert List                 | 8               | 8      |
| Pie/Donut                  | 6–8             | 8      |

- Do not mix different heights within the same row (this makes the grid look misaligned) — if panels have unequal heights, separate them into different rows.
- Always use a **Row** to partition semantic zones. Give rows descriptive names (`Compute`, `Network`, `Environmental`) paired with a single emoji as a visual anchor.
- Non-critical rows → `collapsed: true` by default.
- **Panel density (2026-08-08):** dashboards with more than ~8 panels stacked vertically without rows (noticeable in `IMS LDI - Engineering Analytics & SPC` which used to be 126 grid units tall) must be grouped into rows based on semantic zones, collapsing all rows except the first/most important one — leaving a short header list to provide an immediate overview without massive scrolling. All content remains intact, simply hidden behind clickable headers.
- **Kiosk no-scroll ceiling (2026-08-08):** 3 dashboards are glance/kiosk boards per §1 principle 5 ("progressive disclosure" — NOC and Easy Overview answer "is everything OK," Andon is the factory-floor wall display) and carry a hard 20-grid-unit ceiling in `tests/lint/dashboard-linter.js`'s `MAX_HEIGHT`, enforced as an error, not a warning. All 3 use the same pattern: only the single most decision-relevant row stays expanded (Andon's KPI strip + machine tiles, NOC's alert list, Easy Overview's KPI strip) — everything else is a collapsed row, content still fully present, one click away. Engineering/Capacity/Machine-Snapshot/Manufacturing are deliberately deep-dive dashboards under the same principle and are NOT in `MAX_HEIGHT` — forcing them to 20u would fight their actual purpose, not serve it.

---

## 6. Interaction Standards

Configure **dashboard settings** identically across all files:

| Setting                                   | Value                                                       | Rationale                                                       |
| ----------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Graph tooltip                             | `Shared crosshair`                                          | Dragging the cursor syncs the time position across all panels — feels like a unified system. |
| Tooltip mode (for multi-series panels)    | `multi`                                                     | Displays values for all series simultaneously at that point.    |
| `spanNulls`                               | `60000` (1 minute), not `true`                              | Gaps in the graph represent actual events (outages) and must be visible, not masked by interpolated lines. |
| Default time range                        | NOC: `now-6h` / Engineering: `now-6h` / Capacity: `now-30d` | Aligns with the actual usage behavior of each page; not universally defaulted. |
| Refresh rate                              | NOC/Engineering: `10s` / Capacity: `5m`                     | Aligns with actual data mutation frequency; prevents unnecessary queries. |
| `allowUiUpdates` (provider)               | `false`                                                     | Enforces dashboard-as-code, preventing drift from git.          |

---

## 7. Graph-Specific Data Visualization Rules

- **Time-bounded `spanNulls`** (Rule 6), instead of always bridging every gap.
- **Display thresholds as area shading** (`thresholdsStyle: "area"` or `"line+area"`) instead of bare dashed lines — a faint red background is far easier to see from a distance than a thin line.
- **Accumulated counter values (SNMP errors/drops) must be converted to a rate before display** using `LAG() OVER (...)` in SQL — do not show perpetually climbing cumulative lines, as it is impossible to read if the situation is currently worsening.
- **Data requiring a mirrored axis (e.g., TX below RX)** must use the field override `custom.transform: "negative-Y"` at the visualization layer only — do not multiply by `-1` in SQL, as the legend/tooltip would inaccurately display negative values.
- **Forecast/regression series** must always be gray dashed lines (see §2.1), and the override matcher must use `byRegexp`, not a literal `byName`, when the series name contains an interpolated variable (e.g., `${machine_id}`) because `byName` does not interpolate templates.
- **Legend:** `displayMode: table` + `placement: bottom` + enable `calcs: [mean, max, last]` when there are more than 3 series — allowing the legend to function as a mini-table rather than merely a color key.

### 7.1 ECharts panels (`volkovlabs-echarts-panel`) — theming is not optional (added 2026-08-08)

The plugin's own defaults are built for a light-mode, many-category dashboard
and actively fight this system if left untouched: a **white tooltip popup**
against the dark theme, and — the moment you have more than 2-3 series — a
**bright rainbow categorical palette** (candy blue/purple/pink/orange/etc.)
that turns a precision instrument reading into a screensaver. Both were
shipped in an earlier pass and had to be rolled back after review flagged
the whole SPC section as "cluttered" despite the underlying engineering
being sound — the defect was pure theming, not the chart choice itself.

Every `getOption` function on this system MUST:

- Set `tooltip.backgroundColor`/`borderColor`/`textStyle.color` explicitly
  to the dark-panel palette (`rgba(18,22,26,0.95)` / `rgba(255,255,255,0.12)`
  / `#E8EDF2`) — never leave ECharts' light-mode tooltip default active.
- **Not** assign each series its own bright hue just because there are many
  of them. For "N similar things over time" charts (e.g. 10 machines' raw
  samples), render all N in one muted neutral tone (`#8B98A9`) and reserve
  color for what's actually a verdict — e.g. the one machine currently
  outside its control limits gets `critical` red, everything else stays
  gray. This is the same §2.1 principle ("color has one meaning") applied
  to a plugin that doesn't enforce it for you.
- When two categories genuinely need to stay visually distinct (e.g. PE vs
  JE box plot) but neither is a verdict, pick two tokens from the
  **neutral-readout family** (`info` `#00F2FE`, `accent` `#3B82F6`) — not a
  warning/critical token, and not an arbitrary non-token hex.
- Style `xAxis`/`yAxis`/`legend` text color to `rgba(224,224,224,0.85)` and
  grid/split lines to `rgba(255,255,255,0.06-0.15)`, matching the rest of
  the system's restrained-gridline convention (§9 visual-noise rule).

Reference implementations: `ims-ldi-engineering-analytics.json` panels 17
(Thickness Control Chart) and 12 (PE/JE Box Plot).

---

## 8. Machine Identity Palette (If static color bindings to physical machines are required)

> Populate this table once the list of physical machines slated for production deployment is known. Do not create fixed color overrides anywhere else except by referencing this table.

| Machine ID              | Color | Notes    |
| ----------------------- | ----- | -------- |
| _(Awaiting machine data)_ |     |          |

---

## 9. Reusability — Library Panels

Panels appearing across more than 1 dashboard **must** be implemented as Library Panels (edit once, update everywhere) — **but strictly only when the SQL/business logic is genuinely identical**, not merely when the panel names are similar:

- **Fleet Health Score** (stat) — true library panel, `ims-lib-fleet-health-score`. Confirmed byte-identical query (`SELECT value FROM public.v_fleet_score`) between `ims-capacity-planning.json` and `ims-noc-overview.json` before merging.
- **Availability / Critical Alarms / Running / Yield** — audited 2026-08-08, found NOT duplicates despite similar names: each dashboard's version has a genuinely different SQL scope (e.g. Manufacturing's Yield panel adds a `machine_id` template filter and a period-over-period "Delta %" calc that Easy Overview's simpler version doesn't have; Andon/Manufacturing/Easy-Overview's "Availability"/"Running" panels differ in whether they filter by `machine_id` and which compression-chunk workaround they carry). Forcing these into one shared panel would mean changing what each dashboard actually computes — out of scope here (business logic is explicitly off-limits for this pass). If a real business decision is made later to standardize these to one canonical query/filter scope, redo this audit then and promote the survivors to library panels using the same mechanism.

**How this actually works in this repo (Grafana 13.1.1 has no file-based provisioning for library panels — only datasources/dashboards/alerting/plugins get that; verified empirically, not by trusting the Grafana docs' provisioning section):**

1. Write the panel spec to `monitoring/grafana/library-panels/<uid>.json` — shape: `{uid, name, kind: 1, model: {...full panel content...}}`. `uid` is hand-chosen and stable (not Grafana's auto-generated one) so dashboard JSON can reference it before it exists.
2. Run `bash scripts/provision-library-panels.sh` — idempotent HTTP API script (creates via `POST /api/library-elements` if missing, `PATCH` if the uid already exists) against the live Grafana instance. Not wired into `docker-compose` as an automatic service (no existing image here has both curl and python3 without a fragile custom build) — run it manually after `docker compose up`, same pattern as `scripts/import-real-data.sh`.
3. In the referencing dashboard's JSON, replace the panel with a minimal stub: `{"id": <id>, "gridPos": {...}, "libraryPanel": {"uid": "<uid>", "name": "<name>"}}` — no inline `type`/`fieldConfig`/`options`/`targets`/`description`; all of that comes from the library element.
4. `tests/lint/dashboard-linter.js` validates `library-panels/*.json` directly (color tokens, description, noValue) since a referencing panel stub has nothing inline to check.

---

## 10. Pre-Merge Checklist for New Panels/Dashboards

- [ ] Colors used are exclusively from the §2.1 table; no fixed colors bound to specific series unless they represent permanent physical machines.
- [ ] Thresholds match the contract in §2.2 (if a new metric, add a row to this table first).
- [ ] `unit` and `description` are populated for every field.
- [ ] Panel type is selected according to the §4 table, not out of habit.
- [ ] Grid width/height complies with §5.2 rules; no mixing heights in the same row.
- [ ] `spanNulls` is set to a numeric value, not `true`.
- [ ] If the panel is duplicated elsewhere → convert to a Library Panel before merging.
- [ ] Query adheres to tiering rules (raw ≤ latest value, minute CAGG ≤ 6h, hourly CAGG > 2d).
- [ ] Tested with `make test-visual` and screenshots match expectations.
- [ ] `node tests/lint/dashboard-linter.js` passes with 0 errors — the linter automatically detects hex colors outside the §2.1 table. This is the actual "central token" mechanism, not just this document.

---

_This document is a living document — always update it via the same PR that modifies the relevant dashboard. Do not allow the dashboard and this document to drift from each other._
