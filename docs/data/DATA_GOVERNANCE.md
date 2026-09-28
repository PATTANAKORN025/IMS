<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Data Governance: Classification, Retention & Access</h1>
  <p><b>What data the stack holds, how long it keeps it, who can read or write it, and the gaps still open</b></p>
  <p>
    <a href="DATA_GOVERNANCE.md">English</a> |
    <a href="../../th/docs/data/DATA_GOVERNANCE.md">ไทย</a> |
    <a href="../../zh-CN/docs/data/DATA_GOVERNANCE.md">简体中文</a>
  </p>
</div>

---

> **Scope:** the `ims` database and the services in `docker-compose.yaml`. Every retention figure and role below is taken from the migrations and the live catalog (`timescaledb_information.jobs`), not from a target.
> **Standards:** IEC 62443 (industrial security) and ISO/IEC 27001:2022 are useful references for the controls this page lists. IMS is **not** certified against either, and this page does not claim compliance. Thailand's PDPA applies to the few personal identifiers the stack stores (section 3).

---

## 1. Data classification

| Class | Examples in IMS | Where it lives | Protection today |
| --- | --- | --- | --- |
| **Public** | Architecture docs, schema definitions, dashboard JSON | Git repository | Public repository |
| **Internal** | Aggregates (`*_hourly`, `ldi_data_1m/15m/1h`), alert rules, container metrics | TimescaleDB, Prometheus | Host ports bound to `127.0.0.1` except the nginx front door; no encryption at rest |
| **Confidential** | Raw machine telemetry (`ldi_data`, `ldi_metrics`), plant data in `eap_backup`, Floor 1 CAD data | TimescaleDB volumes; CAD data is kept outside git | Grafana login required; no encryption at rest; CAD is excluded from git by the leak scanner |
| **Restricted** | Credentials in `.env`; Grafana logins stored as `acknowledged_by` / `resolved_by` | `.env` on the host; `ldi_alarm_lifecycle` | `.env` is git-ignored and checked by gitleaks; logins are stored in plain text |

Traffic between services stays on the internal Docker network. The front door (nginx on `${GRAFANA_PORT:-3000}`) serves **plain HTTP**. Put TLS in front of it before exposing it beyond a trusted plant network.

---

## 2. Retention and compression (live policies)

| Object | Kind | Compressed after | Dropped after |
| --- | --- | --- | --- |
| `ldi_data` | hypertable | 7 days | 180 days |
| `ldi_metrics`, `sys_metrics`, `net_metrics` | hypertables | 7 days | 30 days |
| `ldi_alarm_log` | hypertable | — (not compressible: `ldi_alarm_lifecycle` holds a foreign key into it, migration 083) | 365 days |
| `ldi_data_1m` | continuous aggregate | — | 30 days |
| `ldi_data_15m` | continuous aggregate | — | 90 days |
| `ldi_data_1h`, `ldi_data_hourly` | continuous aggregates | — | 2 years |
| `sys_hourly`, `net_hourly`, `ldi_hourly` | continuous aggregates | — | not dropped |
| `ldi_alarm_lifecycle`, `container_restart_audit`, `devices` | plain tables | — | not dropped |

Check the live state at any time:

```bash
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT proc_name, hypertable_name, config
FROM timescaledb_information.jobs
WHERE proc_name IN ('\''policy_retention'\'','\''policy_compression'\'')
ORDER BY 1, 2;"'
```

Change a policy with a new numbered migration in `database/migrations/`, never by hand on the server. A hand edit is lost on the next fresh install.

---

## 3. Personal data

- **What is stored:** the Grafana login of whoever acknowledges or resolves an alarm (`ldi_alarm_lifecycle.acknowledged_by`, `resolved_by`), taken from the Grafana session by `alarm-api`. It is kept with no retention limit.
- **What is not stored:** operator badge IDs or names from the machines. No ingestion flow reads such a field, and no pseudonymisation pipeline exists.
- **If badge IDs are ever ingested**, hash them before insert with a keyed hash. The key must come from `.env` and never have a default in code. Add a retention policy for the column's table as well.

---

## 4. Database roles (least privilege)

| Role | Created by | Rights | Used by |
| --- | --- | --- | --- |
| `grafana_reader` | `postgres/init`, migrations | `SELECT` on `public`; `statement_timeout` 60 s (migration 083) | Grafana data sources, `factory-twin-3d` |
| `alarm_api_writer` | migration 078 | `SELECT, UPDATE` on `public.ldi_alarm_lifecycle` only | `alarm-api` |
| `${POSTGRES_USER}` (`ims_admin` in `.env.example`) | container init | superuser | migrations, backups, **and Node-RED ingestion** |

**Open gap:** Node-RED writes with the superuser role. A dedicated insert-only role for the ingestion tables would limit what a compromised flow could do. Not done yet.

---

## 5. Audit and verification

```bash
# Who holds which role and whether it can log in
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\du"'

# Alarm actions and who took them
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT logid, status, acknowledged_by, acknowledged_at, resolved_by, resolved_at
FROM public.ldi_alarm_lifecycle ORDER BY coalesce(resolved_at, acknowledged_at) DESC NULLS LAST LIMIT 20;"'

# Container restarts recorded by observability-archiver
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT * FROM public.container_restart_audit ORDER BY 1 DESC LIMIT 20;"'
```

---

[⬅️ Back to Telemetry Ontology](TELEMETRY_ONTOLOGY.md) | [<img src="../assets/icons/home.svg" width="18" align="center" /> Main Repository](../../README.md)
