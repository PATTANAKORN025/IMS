# Operator Andon — Factory-Twin integration merge: real-render layout validation

**Date:** 2026-09-10
**Branch:** `integration/andon-layout-safe` (merge of local `perf/grafana-p15r-operator-andon` @ `42a1ce22` into `origin/perf/grafana-p15r-operator-andon`)
**Method:** disposable Grafana `13.1.2` (matches production image), anonymous-Admin, read-only
connection to the real TimescaleDB via `grafana_reader` — no production Grafana, volume, or
config touched. Rendered with the repo's own Playwright/Chromium, `deviceScaleFactor: 1`,
`?kiosk`. Real fleet at render time: **10 machines** (`SELECT DISTINCT eqp_id FROM ldi_data`).

## 1. Conflict matrix

| File | Conflict | Ours = `origin/perf` (HEAD) | Theirs = local `perf/…` | Resolution | Basis |
|---|---|---|---|---|---|
| `ims-ldi-operator-andon.json` | `description` | axis-width note, reverted-redesign note | `maxPerRow:8` wrap explanation | **combined** | both documentation, non-contradictory |
| " | panel 1000 `gridPos` | `y15 w3 h4` | `y19 w24 h4` | **ours (`w:3`)** | `w:24` is wrong grid math for `maxPerRow:8`; render confirms `w:3` tiles wrap 8-per-row correctly |
| " | panel 1001 `gridPos` | `y19 w3 h3` | `y27 w24 h3` | **ours (`w:3`)** | same |
| " | panel 10000 `gridPos` | `y22 w1 h1` | `y33 w1 h1` | **ours** | 1×1 hidden watchdog; render shows 0 overlap |
| " | compliance panels 12/13 block | *(relocated later in file, `y4 w12 h6`)* | inline here, `y4 w12 h8` | **ours** — deletes the duplicate | `origin/perf` already carries its own 12/13 at file-tail; keeping theirs = duplicate panel id. `h6` render-legible for 10 rows (screenshot) |
| " | Action Queue panel 8 `gridPos` | `y10 w24 h5` | `y12 w24 h7` | **ours (`h5`)** | render: 0 inner scrollbar at `h5` with live alarms — the P15-R concern is satisfied; `h7` only adds overflow |
| " | Machine-column link | title `${__value.text}` **+** url `/d/ims-ldi-machine-snapshot?…` | title `${__data.fields.Machine}` **+** url `…/set2-machine-snapshot?…` | **title = theirs, url = ours** | `${__value.text}` leaks the `NO_DATA` placeholder cell text (local fix `1e5cf92f`); the sibling *Alarm Msg* column already uses `${__data.fields.Machine}` + the slug-free url. Click-through verified: resolves to real machine ids (LDI-02/04/05/06), Grafana appends the slug itself |
| `dashboard-linter.js` | `MAX_HEIGHT['ims-ldi-operator-andon']` | `23` | `34` | **23** | matches the merged layout's declared grid bottom (10000 at `y22+h1`); `34` belonged to theirs' `h8`/`h7` layout, which was not taken |
| `ims-ldi-alarm-console.json` | Action-Queue panel HTML `content` | slug-free url, no `{{#if logid}}` guard | old slug, has `{{#if logid}}` button guard | **url = ours + guard = theirs** | slug-free url = same fix as the andon board; `{{#if logid}}` keeps Ack/Resolve off the synthetic "no alarms" row. Render: 2 live alarm cards, both with buttons + working links |
| `GRAFANA_FRONTEND_P18_FINAL.md` | add/add | shorter | superset (+ Pass 3 / Pass 4 sections) | **theirs (superset)** | diff shows **0** theirs-only lines the superset lacks — no contradictory content to reconcile |

## 2. Rendered layout (disposable Grafana, real data)

`px-per-grid-unit ≈ 38` (30 row + 8 margin). Every panel `y`/`h` in the merged JSON is
**byte-identical** to `origin/perf`'s pre-merge values.

| panel | grid `y` (declared) | rendered `y` px | effective grid `h` | note |
|---|---:|---:|---:|---|
| 9999 title | 0 | 0 | 1 | |
| 1 / 2 / 3 / 9 KPI row | 1 | 38 | 3 | full-width row, 4 panels |
| 12 / 13 compliance timelines | 4 | 152 | 6 | 10 machine rows, all labels legible |
| 8 Action Queue | 10 | 380 | 5 | 1+ live alarm rows, **no inner scrollbar** |
| 1000 machine status tiles | 15 | 570 | 8 (wraps ×2) | `repeat` 10 → 2 rows of `h4` at `maxPerRow:8` |
| 1001 job/MO tiles | 19 → reflows to 23 | 874 | 6 (wraps ×2) | Grafana pushes it below 1000's wrapped height |
| 10000 heartbeat | 22 → reflows to 29 | 1102 | 1 | hidden 1×1 watchdog |

**Effective rendered content: ~30 grid units ≈ 1132–1196 px.**

## 3. Measurements

| Metric | 1280×720 | 1366×768 | 1920×1080 |
|---|---:|---:|---:|
| Panel overlap (rendered) | **0** | 0 | 0 |
| Panel overlap (linter, declared gridPos) | **0** | — | — |
| Inner-panel scrollbars | **0** | 0 | 0 |
| Content height (px) | 1132 (`react-grid-item`) / 1196 (`panel-container`) | 1132 | 1132 |
| Overflow vs viewport (`panel-container`, = CI metric) | **476 px** | 428 px | 116 px |
| Console errors | 0 | 0 | 0 |
| Failed requests (dashboard) | 0 | 0 | 0 |
| `panel error` indicators / `No data` panels | 0 / 0 | 0 / 0 | 0 / 0 |

*(One benign `404 /apis/userstorage.grafana.app/…/grafana-help-flags` appears on any fresh
Grafana 13 instance — its dismissed-help-hint store, unprovisioned here. Not dashboard-related.)*

### Merge did not regress the overflow

Same disposable, same data, three pristine dashboards side by side:

| dashboard JSON | 1280×720 overflow (`panel-container`) |
|---|---:|
| `origin/perf` tip (pre-merge) | **476 px** |
| local `perf/…` tip (pre-merge) | 628 px |
| **merged** | **476 px** — identical to `origin/perf`, 152 px better than local |

## 4. Zero-scroll at 1280×720 — pre-existing, out of merge scope

`tests/playwright/ldi-responsive-regression.js` asserts the Andon board fits 1280×720
(`noScrollAt: [1280]`). It does not, by **476 px**. This:

- is **identical on `origin/perf`** and **worse on the local branch** — not introduced by this merge;
- is measured independently in `GRAFANA_FRONTEND_P18_FINAL.md` (Pass 3/4: "overflows by 476px");
- is explained by the two `repeat` panels (1000/1001) wrapping the 10-machine fleet past
  `maxPerRow: 8`, adding ~7 grid units the linter's Check 14 (declared `y+h`, not wrap-aware)
  cannot see — the linter's own `MAX_HEIGHT` comment has documented this since 2026-08-25;
- has a fix path the codebase's own comments already propose and that requires operator
  sign-off (the same dashboard's history records two reverted redesigns): re-scope the
  zero-scroll contract from a literal 1280 px laptop window to the NOC/TV resolution the
  kiosk is actually deployed at, and update `noScrollAt` with it.

That decision is **not** part of a safe branch reconciliation and is left as a tracked
follow-up. The merge itself is layout-clean: zero overlap, zero clipped panel content,
zero inner scrollbars, all semantics preserved.

## 5. Regression checks (merged vs pre-integration `origin/perf`)

| Check | Result |
|---|---|
| Machine-column `NO_DATA`-leak fix (`${__data.fields.Machine}` title) | preserved |
| Alarm-Msg column link | unchanged, still correct |
| Machine-Snapshot url (slug-free) | preserved; click-through lands on the board, 0 errors |
| SQL-injection hardening (panel 1000 `displayName` override + `END AS status` + `:sqlstring`) | preserved (auto-merged region) |
| WCAG OK-tile contrast `#15803D` | preserved (auto-merged region) |
| panels 1000/1001 grid width `w:3` | correct — tiles wrap 8-per-row as designed |
| panels 12/13 duplicate | removed — exactly 2 in merged file |
| all 11 panels visible, 0 overlap, 0 panel errors | confirmed |
| datasource compatibility (`timescaledb` postgres) | confirmed against real DB |
| dashboard linter | 0 errors, 0 new warnings (19 warnings, all pre-existing in `ims-sandbox-omni.json`) |

## 6. Artifacts

- `docs/evidence/screenshots/andon-ft-integration/andon_1280x720.png` — full board, 10-machine fleet
- `…/andon_1280x720_viewport.png` — the 720 px cut (shows the overflow)
- `…/andon_1920x1080.png`
- `…/alarm_console_1280.png` — merged Action-Queue panel, live alarms, Ack/Resolve buttons
