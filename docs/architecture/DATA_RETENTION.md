# Data Retention Policy

> **Audience:** SRE/operations, QA/audit, compliance.
>
> **Provenance:** the table below is a **live query result** against the running database (`timescaledb_information.jobs`), not derived from migration file history — see the Governance Gap section for why that distinction matters here specifically. Queried 2026-08-10.

---

## Current live retention & compression policy

```text
SELECT j.hypertable_name, j.config->>'drop_after' AS drop_after
FROM timescaledb_information.jobs j WHERE j.proc_name = 'policy_retention';
```

| Hypertable | Retention (`drop_after`) | Compression (`compress_after`) |
|---|---|---|
| `ldi_data` (raw LDI telemetry) | 180 days | 7 days |
| `ldi_data_1m` | 30 days | — |
| `ldi_data_15m` | 90 days | — |
| `ldi_data_1h` | 2 years | — |
| `ldi_data_hourly` | 2 years | — |
| `ldi_alarm_log` | 365 days | 7 days |
| `sys_metrics` | 30 days | 7 days |
| `net_metrics` | 30 days | 7 days |
| `ldi_metrics` (legacy) | 30 days | 7 days |

Raw `ldi_data` is compressed after 7 days (still queryable, just column-compressed for storage efficiency) and physically dropped after 180 days. Its rollup chain (`ldi_data_1m` → `15m` → `1h`) and the separate `ldi_data_hourly` view retain much longer (30 days / 90 days / 2 years / 2 years respectively), so historical trend analysis remains possible well past the point raw samples are gone — see `docs/architecture/DATA_FLOW.md` for how the rollup chain fits together.

## ⚠️ Governance gap: `postgres/init/` and `database/migrations/` disagree

**Found during this documentation pass, not fixed (docs-only scope).** Two different code paths set retention policy for the *same* tables to *different* values:

- `postgres/init/001-init-timescaledb.sql` (the fresh-deployment bootstrap path) sets `sys_metrics`/`net_metrics`/`ldi_metrics` retention to **30 days**.
- `database/migrations/016-aggressive-retention.sql` (the incremental migration path, applied to an already-running deployment) sets the *same three tables* to **14 days**.
- `postgres/init/032-ldi-data-scaling-policies.sql` sets `ldi_data` to 180 days and `ldi_alarm_log` to 365 days — **these two policies don't appear in `database/migrations/` at all.**

The live values above (30 days for sys/net/ldi_metrics) match `postgres/init/`, not migration 016 — meaning **this specific running database was bootstrapped fresh rather than built by applying every migration in sequence**, and migration 016's "aggressive" 14-day policy was likely never actually applied here. This is a real, unresolved drift between the two initialization paths: a team member who only reads `database/migrations/` (the documented, sequential history) would not learn about the `ldi_data`/`ldi_alarm_log` policies at all, and would believe sys/net/ldi_metrics retention is 14 days when it's actually 30. **Always verify retention policy against the live database, not migration history** — the query at the top of this document is the authoritative check.

This gap is not fixed here (would require either reconciling `postgres/init/` and `database/migrations/` with a new migration, or adding a CI check that diffs the two paths' policy-setting SQL — both real engineering changes outside a documentation-only pass). Filed in `ARCHITECTURE.md`'s Known Gaps.

## Compliance notes

- No table in this system currently has retention configured for regulatory-compliance purposes (e.g. a fixed multi-year audit-trail requirement) — the 2-year figures above (`ldi_data_1h`, `ldi_data_hourly`) are engineering choices about rollup usefulness, not a compliance-driven policy.
- If a customer audit requires a specific minimum retention for LDI production records, **180 days of raw `ldi_data`** is the binding constraint today — the rollups retain longer but lose per-sample (PE1-6/JE1-4 individual reading) granularity.

## Related documents

- `docs/architecture/DATA_FLOW.md` — the CAGG rollup chain these policies apply to.
- `docs/operations/BACKUP_RESTORE.md` — retention is not a backup strategy; see that document for actual point-in-time recovery.
