<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>Synthetic Drilling & VCP Operational Data Architecture</h1>
  <p><b>Isolated stand-in database generator, rule-based synthetic telemetry, migration boundaries, and dashboard verification</b></p>
  <p>
    <a href="MOCK_DATA.md">English</a> |
    <a href="../../th/docs/data/MOCK_DATA.md">ไทย</a> |
    <a href="../../zh-CN/docs/data/MOCK_DATA.md">简体中文</a>
  </p>
</div>

---

The drilling and VCP dashboards read the `eap_backup` database. On the plant server that database is a restore of factory data, and it is not in git. This page shows how to build a stand-in `eap_backup` from generated data, so the drilling folder, the VCP folder, the VCP alert rules and migrations 084–086 all run with no factory data.

---

## 1. Mock Data Pipeline & Verification Topology

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: Synthetic eap_backup data and its verification
  accDescr: The schema script and migrations 084 to 086 build the stand-in eap_backup database, the generator fills it with MOCK- rows, and the verifier runs every drilling and VCP panel query and the seven VCP alert queries against it.
  SCHEMA["database/mock/eap_backup-schema.sql"]:::app
  MIG["migrations 084–086"]:::app
  GEN["scripts/mock/eap-mock-data.js<br/>--hours=168 --apply"]:::app
  TEST["tests/unit/eap-mock-data.test.js"]:::app
  DB[("eap_backup<br/>marker table mock_dataset · MOCK- prefix")]:::store
  DASH["7 dashboards · drilling 4 · VCP 3"]:::viz
  RULES["7 VCP alert rules"]:::obs
  VERIFY["scripts/mock/verify-mock-dashboards.js<br/>every panel and alert query"]:::app
  SCHEMA --> DB
  MIG --> DB
  GEN --> DB
  TEST -.->|"checks the generator"| GEN
  DB --> DASH
  DB --> RULES
  VERIFY -->|"runs queries"| DB

  subgraph LEGEND["Legend · arrows = data flow"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_app["IMS service"]:::app ~~~ LG_store["Data store"]:::store ~~~ LG_viz["Grafana / UI"]:::viz ~~~ LG_obs["Monitoring"]:::obs
    end
  end
  VERIFY ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

---

## 2. Core Components

| Component | Repository Path | Functional Role |
|---|---|---|
| **Schema Definition** | `database/mock/eap_backup-schema.sql` | Instantiates tables and views required by drilling/VCP dashboards, alert rules, and migrations 084–086. |
| **Data Generator** | `scripts/mock/eap-mock-data.js` | Generates realistic synthetic drilling cycle events and VCP plating telemetry. |
| **Query Verifier** | `scripts/mock/verify-mock-dashboards.js` | Executes every drilling/VCP dashboard panel query and alert rule; validates returned row counts. |
| **Unit Test Suite** | `tests/unit/eap-mock-data.test.js` | Validates generator logic and data shapes in memory without database dependency (runs in CI). |

Every value is synthetic: machine counts, setpoints, recipes, panel sizes, lot codes, and alarm messages. None of it is derived from real factory operations.

The generator preserves the exact data shapes that the dashboards parse:
- Event codes and message formats.
- Equipment ID shapes (`-VCP` suffix for plating lines).
- Swapped bath tags (`preset_<bath>` is the measured reading, `actual_<bath>` is the target setpoint).
- Recipe identity: $\text{plating\_time} \times \text{line\_speed} = 54$.
- Triggered / Reset alarm pairs.

---

## 3. Operational Safety & Isolation

- **Production Guard:** The schema script aborts immediately if executed against a database containing `machine_event` or `vcp_upp` without the `public.mock_dataset` marker table, preventing accidental overwrites of restored plant databases.
- **Transactional Safety:** `--apply` runs within a single atomic transaction and validates the marker table before inserting records.
- **Scoped Cleanup:** Every generated record carries an identifier prefixed with `MOCK-`. Running `--undo --apply` safely purges only generated rows.

---

## 4. Execution on an Empty Stack

When `eap_backup` does not yet exist on a fresh installation, run the following commands from the repository root:

```bash
docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE eap_backup"'
docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d eap_backup -v ON_ERROR_STOP=1' < database/mock/eap_backup-schema.sql
for m in 084 085 086; do
  docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < database/migrations/$m-*.sql
done
node scripts/mock/eap-mock-data.js --hours=168 --apply   # 7 days of operational data
```

---

## 5. Execution in a Disposable Container

To verify the complete mock pipeline without modifying the active development stack:

```bash
docker run -d --name ims-mock-verify -e POSTGRES_PASSWORD=mockonly -e POSTGRES_DB=ims timescale/timescaledb:2.29.2-pg16
docker exec ims-mock-verify psql -U postgres -d ims -c "CREATE DATABASE eap_backup"
docker exec -i ims-mock-verify psql -U postgres -d eap_backup -v ON_ERROR_STOP=1 < database/mock/eap_backup-schema.sql
for m in 084 085 086; do 
  docker exec -i ims-mock-verify psql -U postgres -d ims -v ON_ERROR_STOP=1 < database/migrations/$m-*.sql
done
node scripts/mock/eap-mock-data.js --hours=168 --apply --container=ims-mock-verify --psql-user=postgres
node scripts/mock/verify-mock-dashboards.js --container=ims-mock-verify --psql-user=postgres
docker rm -f ims-mock-verify
```

---

## 6. Generator Options & CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--hours=N` | `24` | Historical window duration ending at current timestamp. |
| `--seed=N` | `20260928` | Deterministic random seed for reproducible datasets. |
| `--drilling=N` | `12` | Number of simulated drilling machines (range: 3–200). |
| `--incidents` | `false` | Injects deliberate anomalies into the last 35 minutes to trigger all 7 VCP alert rules. |
| `--apply` | `false` | Commits generated rows directly to database. Without `--apply`, output prints to file. |
| `--undo` | `false` | When paired with `--apply`, deletes all records prefixed with `MOCK-`. |
| `--container` | `ims-timescaledb` | Target Docker container name. |

---

## 7. Verified Test Results

Evidence recorded against TimescaleDB 2.29.2-pg16:
- Schema and migrations 084, 085, and 086 apply cleanly with zero errors.
- **Healthy Baseline (168 hours):** 41 queries executed with **0 errors**. All 34 dashboard panel queries return valid data, and all 7 alert breach queries return 0 rows (plant healthy).
- **Incident Injection (`--incidents`):** All 7 VCP alert rules fire positive breaches in the final 35-minute window.

---

[⬅️ Back to Telemetry Ontology](TELEMETRY_ONTOLOGY.md) | [<img src="../assets/icons/home.svg" width="18" align="center" /> Main Repository](../../README.md)
