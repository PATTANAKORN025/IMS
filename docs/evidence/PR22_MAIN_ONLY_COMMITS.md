# PR #22 — the 8 `main`-only commits

Every commit `origin/integration/andon-layout-safe..origin/main`, its purpose,
and how it is preserved in the reconciled merge. **None dropped.**

| # | Commit | Files | Purpose | In merged tree | Reconciliation |
|---|---|---:|---|---|---|
| 1 | `e5b21627` `docs(hyper-scaler): inject SRE culture, SBOM, and data governance frameworks` | 90 | SRE/SBOM/data-governance docs across EN/TH/ZH; also (collateral) `.gitignore` edits, `.editorconfig`/`.prettierrc` deletion, a vendored `grafana-clock-panel` version bump | **Docs:** carried unchanged (`DATA_GOVERNANCE.md`, `th/`, `zh-CN/`, `.superpowers/sdd/`). | `.gitignore` — took integration's superset (kept the private-CAD guard; the clutter block main dropped stays ignored). `.editorconfig`/`.prettierrc` — **restored** (integration's; deletion looked collateral, documented in RECONCILIATION.md). clock-panel — **kept deleted** (runtime-installed via `GF_INSTALL_PLUGINS`, gitignored). |
| 2 | `e2b12b00` `docs(hyper-scaler): finalize 9 world-class pillars across EN, TH, ZH-CN` | 21 | The 9-pillar architecture narrative, trilingual | carried unchanged | pure docs, files integration never touched — auto-merged clean |
| 3 | `7ff4e0ad` `docs(drift): synchronize API and Ontology docs with actual Node-RED implementation` | 6 | `docs/api/API_REFERENCE.md`, `docs/data/TELEMETRY_ONTOLOGY.md` brought in line with the running Node-RED flows | carried unchanged (`TELEMETRY_ONTOLOGY.md` +40, `API_REFERENCE.md` updated) | docs only — auto-merged clean |
| 4 | `428f36ce` `feat(dashboard): apply P15-R zero-scroll layout to operator andon board on main` | 1 | Compact Andon layout (compliance panels `h3`, grid bottom 20) | **reconciled** — its compact layout is the base of the final Andon dashboard (see RECONCILIATION.md → Andon section) + one further compression + integration's link fix. Final grid bottom **19**, render-validated zero-scroll at 1920/3840. | this was the primary conflict; resolved by live Grafana render comparison of both variants |
| 5 | `6c3e39ff` `chore(dashboard): clean up experimental sandbox and redundant copies` | 10 | Adds `.audit/current-inventory.json` + `.superpowers/sdd/2026-08-19-ldi-system-audit/*` audit reports; trims `DASHBOARD_INVENTORY.md` | audit reports + `.audit/` carried unchanged; `DASHBOARD_INVENTORY.md` **regenerated** from the reconciled dashboards (`--check` passes) | additions auto-merged; the generated inventory is regenerated, not hand-merged |
| 6 | `93918139` `docs: replace NOC banner GIF with high-res MP4 video` | 4 | README/docs point at `apex-ldi-noc-banner.mp4` | **net zero** — reverted by #7 | see #7 |
| 7 | `23607aa1` `Revert "docs: replace NOC banner GIF with high-res MP4 video"` | 4 | Reverts #6; README/docs back to `apex-ldi-noc-banner.gif` | README references `banner.gif` in the merged tree ✅ | #6 + #7 cancel; both `.gif` and `.mp4` assets exist, `.gif` is the referenced one — final state matches `main` |
| 8 | `38e3c7f9` `docs: sync missing evidence and audit files to th and zh-CN with localized headers` | 68 | +7504 lines of TH / ZH-CN localised evidence + audit docs | carried unchanged (`th/` 150 files, `zh-CN/` 150 files in the merged tree) | pure doc additions — auto-merged clean |

## Preservation proof

After committing the merge, all 8 are ancestors of the merge commit:

```
git merge-base --is-ancestor <each> HEAD   # exit 0 for all 8
```

(run and recorded in the validation section of `PR22_MAIN_RECONCILIATION.md`.)

Spot-checked present in the merged working tree: `docs/data/DATA_GOVERNANCE.md`,
`docs/DOCUMENTATION_STYLE_GUIDE.md`, `th/` (150), `zh-CN/` (150),
`.superpowers/sdd/2026-08-19-ldi-system-audit/full-reaudit-report.md`,
`.audit/current-inventory.json`, README → `banner.gif`,
`docs/data/TELEMETRY_ONTOLOGY.md` (main's sync).
