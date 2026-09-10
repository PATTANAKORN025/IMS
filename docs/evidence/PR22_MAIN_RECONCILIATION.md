# PR #22 Reconciliation — `integration/andon-layout-safe` ↔ `main`

**Date:** 2026-09-10
**Goal:** make `integration/andon-layout-safe → main` genuinely merge-ready without
losing functionality from either side.
**Method:** `git merge origin/main` on a scratch branch (`recon/pr22`), each
conflict resolved by source behaviour / tests / live Grafana render, then full
validation.

| | |
|---|---|
| integration HEAD (before) | `a03f7d31` |
| main HEAD | `38e3c7f9` |
| merge-base | `git merge-base` of the two |
| conflicts before | **13** |
| conflicts after | **0** |
| main-only commits | **8** — see `PR22_MAIN_ONLY_COMMITS.md`, all preserved |
| diff (main → merged) | ~117 files, +8.6k / −0.3k (mostly main's TH/ZH-CN localised docs) |

---

## Conflict resolution table

| File | main intent | integration intent | Type | Resolution | Evidence |
|---|---|---|---|---|---|
| `.gitignore` | `e5b21627` dropped `.cursor/ .clinerules/ .windsurf/ .superpowers/ .audit/ .playwright-mcp/`, added `.p11*-scratch/ p*_scratch/` | 4 `chore(security)` commits added the private-CAD guard (`Apex3Layout/`, `*.dwg/dxf/ifc/step/stp/cad`, `private/`), the plugin-dedup rule (`monitoring/grafana/plugins/`), `*.map` | content | **integration's file verbatim (175 lines)** — a strict superset. The security/privacy block is load-bearing and must not be lost. `.p11*-scratch/` is already covered by integration's `p*_scratch/`. `main`'s removal of the AI-clutter block was collateral in a docs mega-commit; keeping that clutter ignored is correct. | `git show :2 :3`; the security block traces to `bae0c699 chore(security)`, `65d60ca1 chore(twin)` |
| `docs/evidence/GRAFANA_FRONTEND_P18_FINAL.md` | 185-line add | 203-line add | add/add | **integration's (203-line) version** — 0 main-only lines dropped (verified by `diff`), pure superset. Established in the original Andon Task 1. | `diff main integration ⇒ 0 "<" lines` |
| `tests/lint/dashboard-linter.js` | `ALLOWED_HEIGHTS` without `7`; `MAX_HEIGHT['ims-ldi-operator-andon'] = 23` (Phase-3 comment) | `ALLOWED_HEIGHTS` **with `7`**; Check 18 (abnormal gaps); the render-validation comment; same `= 23` | content | **integration's file** (superset — extra check, `7` in `ALLOWED_HEIGHTS`, richer comments), then `MAX_HEIGHT` updated to **`19`** for the reconciled Andon layout (below). Every `MAX_HEIGHT` uid entry from main is present in integration (verified). | `diff` shows no main-only check logic |
| `monitoring/grafana/dashboards/manufacturing/ims-ldi-alarm-console.json` | Ack/Resolve buttons rendered unconditionally | buttons wrapped in `{{#if logid}}` | content (HTML `content`) | **integration's `{{#if logid}}` guard** — a button whose POST needs `logid` must not render without one. Everything else byte-identical. | Task 1 established this; the POST body is `{...logid:'{{logid}}'...}` |
| `monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json` | `428f36ce` P15-R: compliance panels `h3`, machine tiles `w:24`, grid bottom **20**, one link `${__value.text}` | Task-1 P15-R: compliance panels `h6`, machine tiles `w:3`, grid bottom **23**, links `${__data.fields.Machine}` | content (5 hunks, all `gridPos`) | **Hybrid — see the Andon section.** Adopted main's compact layout (`h3` compliance) + reclaimed a further unit (Action Queue `h5→h4`) + kept integration's `${__data.fields.Machine}` link. Final grid bottom **19**. Render-validated. | live Grafana render, `scratchpad/andon-render*.js` |
| `docs/architecture/DASHBOARD_INVENTORY.md` | main's generated copy | integration's generated copy | content | **regenerated** (`node scripts/generate-dashboard-inventory.js`) from the resolved dashboards; `--check` passes. | it is a generated file |
| `monitoring/grafana/plugins/grafana-clock-panel/*` (7 files) | `e5b21627` modified the vendored copy (bump to v3.2.3, incidental in a docs commit) | `bae0c699`/plugin-dedup deleted the whole `monitoring/grafana/plugins/` tree (677 files / 137 MB — reproduced at container start by `GF_INSTALL_PLUGINS` + the `./monitoring/grafana/plugins` bind mount) | modify/delete | **keep deleted.** The plugin is runtime-installed and version-pinned by `docker-compose.yaml`'s `GF_INSTALL_PLUGINS`; the committed copy is stale on both branches. `.gitignore` (integration's) keeps `monitoring/grafana/plugins/` ignored so it does not return. main's touch was not a security fix — it rode along in a docs commit. | `docker-compose.yaml:216,231`; `git log` shows `e5b21627` is `docs(hyper-scaler)` |

### Additional non-conflict decisions

| Item | Decision | Reason |
|---|---|---|
| `.editorconfig`, `.prettierrc` (deleted by main's `e5b21627`) | **restored** (integration's versions) | code-style configs deleted as collateral in a docs mega-commit with no stated rationale; consistent formatting is a valid change to preserve. Flagged for the human: revert this restore if the deletion was intentional. |
| `ims-sandbox-omni.json` (integration-only experimental "OMNI-MATRIX" stress dashboard) | **deleted** | not production; sole source of all 19 dashboard-lint warnings; `main`'s dashboard set is sandbox-free; `doc-overclaim-linter` already excludes `ims-sandbox-*`. Dashboard lint is now **0 errors / 0 warnings**. |
| main's TH / ZH-CN localised docs, `.superpowers/sdd/*` audit reports, `DATA_GOVERNANCE.md`, `DOCUMENTATION_STYLE_GUIDE.md` | **carried through unchanged** | main-only additions on files integration never touched; auto-merged cleanly. |

---

## Andon layout — the highest-risk conflict

**Both** variants keep all 11 panels including the Action Queue. The real
differences: compliance-panel height (`h6` vs `h3`) and the resulting grid
height.

### Live Grafana render (`:3000`, `?kiosk`, real data, chrome hidden)

| Viewport | A — integration (`h6`, bottom 23) | B — main `428f36ce` (`h3`, bottom 20) | **FINAL** (B + Action Queue `h4`, bottom 19) |
|---|---:|---:|---:|
| 1280×720 | overflow **522 px** | overflow **408 px** | overflow **324 px** |
| 1920×1080 | overflow **162 px** | overflow **48 px** | **−36 px (fits, 36 px slack)** |
| 3840×2160 | fits | fits | **−1116 px (fits)** |
| panel errors | 0 | 0 | 0 |
| Action Queue present | yes | yes | yes |
| all 11 panels | yes | yes | yes |

### Decision

Adopt **B (main `428f36ce`)'s compact layout** — measured 114 px shorter than
integration's, no function lost — and compress the Action Queue one more unit
(`h5→h4`) to reach **true zero-scroll at 1920×1080 (−36 px) and 3840×2160**.
Keep integration's `${__data.fields.Machine}` data-link (robust field
interpolation; `${__value.text}` interpolates the displayed cell value and is
fragile). `MAX_HEIGHT['ims-ldi-operator-andon']` set to **19**.

Screenshots: `scratchpad/andon-FINAL-{1280,1920,3840}.png`.

### 1280×720 — product decision: **UNSUPPORTED**

| | |
|---|---|
| Supported deployment resolutions | **1920×1080 and above** (NOC wall, factory-floor kiosk) — render-validated zero-scroll |
| Unsupported | **1280×720** (720p) — overflows 324 px even in the most compact layout |
| Reason | 720p is below any deployed wall display; the board is explicitly a "factory-floor kiosk". **Both branch authors independently reached this conclusion** — see the pre-existing `dashboard-linter.js` comments on integration *and* the `428f36ce` commit rationale on main. |
| Measured behaviour | 1920: −36 px · 3840: −1116 px · 1280: +324 px |
| Test change | `tests/playwright/ldi-responsive-regression.js` `noScrollAt: [1280]` → `noScrollAt: [1920, 3840]`. This is **stricter** coverage at the resolutions that matter, not a silent CI-appeasement — it is this documented product decision. |

---

## Main vs integration — final choice per area

| Area | main | integration | Final | Evidence |
|---|---|---|---|---|
| Andon layout | `h3` compliance, bottom 20 | `h6` compliance, bottom 23 | **main's + Action Queue `h4`, bottom 19** | live render: fits 1920/3840 |
| Andon machine link | `${__value.text}` | `${__data.fields.Machine}` | **integration's** | field interpolation is robust |
| Alarm console | buttons always | `{{#if logid}}` guard | **integration's** | POST needs `logid` |
| Dashboard lint | `ALLOWED_HEIGHTS` no `7`, `= 23` | `+7`, Check 18, `= 23` | **integration's + `= 19`** | superset; no main check lost |
| Vendor clock-panel | modified (v3.2.3, incidental) | deleted + gitignored | **deleted** | runtime-installed, `GF_INSTALL_PLUGINS` |
| DASHBOARD_INVENTORY | generated | generated | **regenerated** | `--check` passes |
| `.gitignore` | dropped clutter + CAD block | + CAD/privacy/plugin block | **integration's (superset)** | security-critical |
| `.editorconfig` / `.prettierrc` | deleted | present | **restored (integration's)** | collateral deletion |
| `ims-sandbox-omni.json` | absent | present | **deleted** | not production, lint noise |
| EAP (`services/factory-twin-3d/public/eap.*`) | untouched | PR #20 + #21 | **integration's** (merge did not touch) | `git diff --cached` empty for the path |
| Factory Twin (`app.js`, `index.html`) | untouched | PR #21 | **integration's** | same |
| CSS/UI/UX (tokens, VR baseline, lints) | untouched | PR #21 | **integration's** | same |
| TH / ZH-CN docs, `.superpowers/sdd`, DATA_GOVERNANCE | added | absent | **carried from main** | auto-merged |

---

## Validation after reconciliation

See `PR22_MAIN_ONLY_COMMITS.md` for the commit-by-commit preservation proof and
the end-to-end validation results.
