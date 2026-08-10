# Manufacturing Domain Architecture

> **Purpose:** document the generic pattern behind IMS's one existing manufacturing process (LDI) so the *next* process type (AOI, plating, etching, or drilling) is additive — a new migration, a new alarm master, a new dashboard trio — rather than a rewrite of the schema or dashboards that already exist.
>
> **Provenance:** every pattern described below is the real, currently-working LDI implementation, checked against the live schema and dashboard JSON on 2026-08-10 — not a hypothetical target architecture. See `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §2 for the plan this doc fulfills.
>
> **Non-goal:** this doc does not build AOI, plating, etching, or drilling support. No requirements exist for those yet; building them now would be speculative. It only makes the schema ready to *add* one without disturbing LDI.

---

## The pattern, using LDI as the worked example

| Layer | LDI's implementation | Generic pattern for the next process type |
|---|---|---|
| **Device identity** | `public.devices.device_type = 'ldi'` (migration 013) identifies which rows are manufacturing equipment at all. `public.devices.process_type = 'ldi'` (migration 067/068) identifies *which* manufacturing process, distinct from `device_type` — `process_type` is `NULL` for every non-manufacturing device (servers, network gear) and only ever `'ldi'` today. | New process types register with `device_type='ldi'`-equivalent (a new value if the equipment isn't LDI-family, e.g. `device_type='aoi'`) and their own `process_type` value (`'aoi'`, `'plating'`, etc.). `device_type` and `process_type` are independent columns on purpose — a future process might reuse the `network`-polled device path (SNMP) while having a distinct `process_type`. |
| **Telemetry storage** | `public.ldi_data` — one hypertable, LDI-specific columns (`pe_1..pe_6`, `je_1..je_4`, `thickness`, `scan_speed`, ...), keyed by `(eqp_id, time)`, FK to `devices.device_id`. | One hypertable per process type, keyed by `(device_id, time)`, FK to `devices`. Column names are process-specific by design (an AOI table would carry defect-count/inspection-score columns, not PE/JE) — there is no attempt to force a shared telemetry schema across processes, because the measured quantities genuinely differ. |
| **Alarm master** | `public.ldi_alarm_ms_code` (code, severity, description) — the authoritative alarm catalog; `public.ldi_alarm_log` is the event stream, FK'd to it. `tests/lint/alarm-sync-linter.js` enforces every simulator-generatable code resolves against this table. | One alarm-code master table per process, same `(code, severity, description)` shape, same event-log FK pattern, same linter registration (`alarm-sync-linter.js` already reads from the live DB rather than a hardcoded LDI-only list — extending it to a second process is a config addition, not a rewrite). |
| **SPC / RCA views** | `public.v_machine_spc_fleet`, `public.v_ldi_rca_recent_window` (materialized, migration 064) both filter `WHERE d.device_type = 'ldi' AND d.enabled` before aggregating. | Both views are one `WHERE` clause away from covering a second process: either parameterize the filter, or (simpler, matching this repo's existing "one view per concern" style) create process-specific sibling views (`v_aoi_spc_fleet`) that share the same Cpk/RCA computation logic, refreshed by the same `add_job` background-job pattern. |
| **Dashboard trio** | Andon (`ims-ldi-operator-andon.json`, glanceable floor-status board), Engineering Analytics (`ims-ldi-engineering-analytics.json`, SPC/RCA deep-dive), Manufacturing Overview (`ims-ldi-manufacturing.json`, KPI + production command center) — plus `ims-easy-overview.json` (zero-config fleet glance) and `ldi-data-readiness.json` (data-quality audit) as LDI-specific extras. | Every new process type gets at minimum the Andon + Engineering Analytics + Manufacturing Overview trio, provisioned into `monitoring/grafana/dashboards/manufacturing/` (§1 of the platform plan) with `tags: [..., "manufacturing"]` so `dashboard-linter.js`'s domain check (Check 18) passes. The "easy overview" and "data readiness" dashboards are optional extras, not part of the required trio. |

---

## Onboarding checklist for a new process type

1. **Migration:** register the device(s) in `public.devices` with the appropriate `device_type` and a new `process_type` value. If the process needs its own telemetry columns, create the hypertable in the same migration (next sequential number — never edit a merged migration, see `IMS_MANUFACTURING_PLATFORM_V2.md` §7 Versioning Policy).
2. **Alarm master:** seed a `<process>_alarm_ms_code` table (code, severity, description) and an `<process>_alarm_log` event table, FK'd to it.
3. **SPC/RCA views:** add process-specific views following the `v_machine_spc_fleet` / `v_ldi_rca_recent_window` pattern (materialized, `add_job`-refreshed if the aggregation is non-trivial — see migration 064's rationale for when materialization is worth it vs. a plain view).
4. **Dashboard trio:** build Andon / Engineering Analytics / Manufacturing Overview dashboards, placed in `monitoring/grafana/dashboards/manufacturing/`, tagged `manufacturing` (and the process name, e.g. `aoi`).
5. **Linter registration:** extend `tests/lint/alarm-sync-linter.js` and `tests/lint/rca-mapping-coverage.js` to include the new alarm master / category mapping (both already read live DB/flow state rather than hardcoded LDI-only lists, per this session's earlier fix — extending them is additive).
6. **Inventory regeneration:** run `node scripts/generate-dashboard-inventory.js` and `node scripts/generate-schema-inventory.js` so the generated docs pick up the new dashboards/tables automatically — no hand-editing either file.

Nothing above requires touching LDI's tables, views, dashboards, or linters — that's the point of the pattern.
