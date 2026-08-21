<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Documentation Quality Report

> IMS Enterprise Documentation Program — final report, 2026-08-10.
>
> Scope: `docs/**`, `README.md`, `CONTRIBUTING.md`, `.github/**` (excluding `.github/skills/impeccable/`, a vendored third-party tool package, not IMS documentation), cross-verified against `database/migrations/**`, `monitoring/grafana/dashboards/**`, and `nodered_data/flows/**`. No runtime code, database, Docker, or Node-RED logic was modified in this pass — findings that required a code/schema update are documented as System Constraints & Technical Boundaries.

---

## Files audited

**43 markdown files** under `docs/` (9 now in `docs/archive/`), plus `README.md`, `CONTRIBUTING.md`, `.github/CODEOWNERS`, 2 issue templates, 1 PR template, and 4 GitHub Actions workflows — **51 files total**. Every technical claim checked against one of: the live database (`docker exec ims-timescaledb psql`), the real migration files, the real dashboard JSON, the real Node-RED flow JSON, or a real test/lint run — not assumed from prior documentation.

## Files rewritten (9)

| File                                                             | What was wrong                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONTRIBUTING.md`                                                | Backwards Node-RED source-of-truth guidance (wrong path, told contributors never to edit the actual source files); a nonexistent `safeStr()` function (real name: `sanitize()`); stale dashboard paths.                                                            |
| `docs/operations/ALARM_PLAYBOOK.md`                              | Entirely fictional alarm codes (`SYS-001`, `NET-002`, `LDI-001`) that never existed in this system. Replaced with the real 19 simulator-active codes and real alert rule names.                                                                                    |
| `docs/architecture/ARCHITECTURE.md`                              | Self-contradiction (prose said "9 dashboards", its own diagram said "10"); two stale hardcoded RCA Lift figures; a stray "Slack" mention where only LINE/Teams credentials were ever listed.                                                                       |
| `docs/architecture/ARCHITECTURE_DIAGRAM.md`                      | "LINE Notify" (discontinued API) instead of LINE Messaging API; a 10s timer claim vs. the real 30s.                                                                                                                                                                |
| `docs/business/BUSINESS_VALUE_ROI.md`                            | Dashboard count (4→10), container count (8→10), alert rule count, a false "0% failure" load-test claim vs. the real k6 scripts' defined failure budgets. Financial/ROI figures left as original business inputs — outside what this pass can independently verify. |
| `docs/product/PRODUCT.md`                                        | Omitted the entire LDI manufacturing/SPC/RCA capability; wrong dashboard count; wrong alert channel (Slack, never actually wired in); stale color tokens.                                                                                                          |
| `docs/product/CONTEXT.md`                                        | Referenced 5 files that don't exist in this repo; wrong Node-RED path; wrong alert channel. (Note: this file is gitignored — the fix is local-only, not part of the tracked repo.)                                                                                 |
| `README.md`                                                      | Doc table missing the platform book and 8 new guides; 3 stale "LINE Notify"/"Slack" mentions; stale dashboard count and retention figures matching an outdated migration value rather than the live database.                                                      |
| `docs/user/USER_MANUAL.md`, `docs/operations/TROUBLESHOOTING.md` | "LINE Notify" terminology; a Node-RED recovery command that referenced a nonexistent path and would have actively corrupted `flows.json` further if followed.                                                                                                      |

## Files added (10)

`docs/architecture/LDI_SPC_GUIDE.md`, `LDI_RCA_GUIDE.md`, `ALARM_SEVERITY_GUIDE.md`, `DATA_FLOW.md`, `DATA_RETENTION.md`, `SECURITY_MODEL.md`, `IMS_PLATFORM_BOOK.md`; `docs/operations/INCIDENT_RESPONSE.md`, `BACKUP_RESTORE.md`; `docs/archive/README.md`. Every formula, figure, and diagram grounded in a live query, real migration, or real test run — not derived from the earlier (partly fictional) documentation.

## Files archived (8)

Moved to a new, git-tracked `docs/archive/` (not the repo's existing `ARCHIVES/`, which is gitignored and would have effectively deleted them from the shared repo): 4 dated audit reports, 2 phase-2 benchmark reports, 1 development-plan snapshot, and the internship retrospective. Each carries a banner stating its date and that its figures are historical, not current.

## Broken links & references fixed

- 0 broken relative markdown links found across all 36 non-archived documentation files (131 links checked programmatically).
- 1 functionally-broken recovery command (`TROUBLESHOOTING.md`, referenced a nonexistent path and the wrong recovery operation entirely).
- 5 references to nonexistent files in `CONTEXT.md` (`CLAUDE.md`, `GLOBAL-INSTRUCTIONS.md`, `TASKS.md`, `MEMORY.md`, `checkpoint.md`).

## Terminology corrections

| Wrong                                                                          | Correct                                           | Occurrences fixed    |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------- |
| `node-red/flows/`                                                              | `nodered_data/flows/`                             | 3 files              |
| `safeStr()`                                                                    | `sanitize()`                                      | 1 file (2 mentions)  |
| LINE Notify (discontinued 2025)                                                | LINE Messaging API                                | 4 files              |
| Slack (never actually integrated)                                              | LINE Messaging API + MS Teams                     | 4 files              |
| "12 Grafana dashboards" / "4 dashboards" / "4 infrastructure, 8 manufacturing" | 14 dashboards, 6 infrastructure + 8 manufacturing | 6 files              |
| Fictional alarm codes (`SYS-001` etc.)                                         | Real numeric codes from `ldi_alarm_ms_code`       | 1 file, full rewrite |

A canonical glossary (IMS, LDI, EAP, SPC, RCA, Andon, CAGG, Cpk, Lift) now lives in `docs/architecture/IMS_PLATFORM_BOOK.md`.

## System Constraints & Technical Boundaries discovered (docs-only scope)

Verifying claims for the new guides surfaced 2 technical constraints, both filed in `ARCHITECTURE.md`'s System Constraints & Technical Boundaries:

1. **SPC test-coverage constraint:** the golden-dataset regression suite (`tests/e2e/golden-dataset-spc.js`) has been unable to actually verify `v_machine_spc_fleet`'s Cpk formula since migration 064 converted it to a materialized view — the test's transaction-scoped synthetic insert is invisible to a materialized view. 5 of 7 assertions still pass (the non-materialized implementations); 2 return parse garbage, not a confirmed formula bug.
2. **Retention-policy drift:** `postgres/init/` (fresh-deploy bootstrap) and `database/migrations/016` (incremental path) set different retention values for the same tables (30d vs. 14d). The live database matches `postgres/init/`, meaning migration 016 was likely never applied to this specific deployment.

## Remaining items

- `docs/operations/SCALING_PLAN.md`, `docs/product/ONBOARDING_SCRIPT.md` — spot-checked, no confirmed errors, but not deeply re-verified line-by-line. Recommend a follow-up pass.
- `.github/workflows/ci.yml` and `ci-flows.yml` both use the display name `CI` — confusing but not truly redundant (they check different things). Not fixed; would require a workflow-file edit outside documentation scope.
- The DR-testing-discovered container restart-policy gap and the Node-RED watchdog's unreliable trigger for that failure mode remain open engineering issues (documented in `ARCHITECTURE.md`, `INCIDENT_RESPONSE.md`, `BACKUP_RESTORE.md`) — real fixes require code changes outside this pass's scope.
- The Soak Test phase of `IMS_MANUFACTURING_PLATFORM_V2.md` is still collecting real samples via a scheduled task; it cannot be closed with a verdict until real wall-clock hours elapse.
- DR Drill 3 (full destructive stack recreate) has not been run, pending explicit confirmation given what Drill 2 found about recovery reliability.

## Quality bar assessment

Every document created or substantially rewritten in this pass carries a provenance statement (what was verified, against what, on what date) — the same evidentiary standard this session established for `LDI_VALIDATION_PROTOCOL.md` and the DR/Soak test evidence. Numbers that will predictably drift over time (RCA Lift figures, live retention policy) are explicitly marked as point-in-time snapshots with the query needed to re-verify them, rather than presented as permanent facts. This is the standard recommended going forward for any new operational documentation in this repo.
