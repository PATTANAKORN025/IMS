<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Security Model

> **Audience:** SRE/Operations, QA/Audit, Security Review.
> **Objective:** The architectural trust-boundary view of IMS. (Note: Read `SECURITY.md` in the repo root for the authoritative security policy).
> **Provenance:** Verified against the live docker-compose and proxy configs on 2026-08-10; re-verified against `main` (compose, `proxy/nginx.conf`, `.github/CODEOWNERS`, the `main` ruleset) on 2026-09-26.

---

## Trust boundaries

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: Trust boundaries
  accDescr: Only nginx listens on all host interfaces; Node-RED, Prometheus, Alertmanager, Blackbox and pgAdmin bind to 127.0.0.1; every database client uses its own least-privilege role; the archiver reaches Docker only through a read-only socket proxy on an isolated network; alert webhooks need a bearer token.
  EXT1["LDI machines"]:::ext
  EXT2["SNMP devices"]:::ext
  USER["Browser users"]:::actor
  subgraph PUBLIC["Host · all interfaces"]
    PROXY["nginx :3000<br/>rate limits · auth_request"]:::ingress
  end
  subgraph LOOP["Host · 127.0.0.1 only"]
    NR["Node-RED :1880"]:::flow
    PROM["Prometheus :9090 · Alertmanager :9093 · Blackbox :9115"]:::obs
    PGADMIN["pgAdmin :5050"]:::app
  end
  subgraph INTERNAL["ims-internal · no host port"]
    GRAF["Grafana"]:::viz
    ALARM["alarm-api · read-only root FS"]:::app
    TWIN["factory-twin-3d · read-only root FS"]:::app
    PGB["PgBouncer · SCRAM"]:::app
    TSDB[("TimescaleDB")]:::store
  end
  subgraph DOCKERAPI["ims-docker-api · internal network"]
    ARCH["observability-archiver"]:::app
    SOCK["docker-socket-proxy · GET only"]:::app
  end
  NOTIFY["LINE · MS Teams"]:::notify
  FUT["SECS/GEM equipment · boundary not designed"]:::future

  EXT1 -->|"X-API-Key"| PROXY
  USER -->|"Grafana session"| PROXY
  EXT2 -->|"SNMP community"| NR
  PROXY --> NR
  PROXY --> GRAF
  PROXY -->|"auth_request"| ALARM
  PROXY -->|"auth_request"| TWIN
  NR -->|"nodered_writer"| PGB
  ALARM -->|"alarm_api_writer"| PGB
  GRAF -->|"grafana_reader"| PGB
  TWIN -->|"grafana_reader"| PGB
  PGB --> TSDB
  GRAF -->|"drilling-timescaledb"| TSDB
  ARCH -->|"observability_archiver"| TSDB
  PGADMIN -->|"admin"| TSDB
  ARCH --> SOCK
  PROM -->|"Bearer token"| NR
  GRAF -->|"Bearer token"| NR
  NR -->|"tokens set by operator"| NOTIFY
  FUT -.-> NR

  subgraph LEGEND["Legend · arrows = data flow"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_actor["Person"]:::actor ~~~ LG_ext["External system"]:::ext ~~~ LG_ingress["Ingress / gateway"]:::ingress ~~~ LG_flow["Node-RED flow"]:::flow ~~~ LG_app["IMS service"]:::app
    end
    subgraph LEGEND_1[" "]
      direction LR
      LG_store["Data store"]:::store ~~~ LG_viz["Grafana / UI"]:::viz ~~~ LG_obs["Monitoring"]:::obs ~~~ LG_notify["Notification"]:::notify ~~~ LG_future["Not built yet"]:::future
    end
    LEGEND_0 ~~~ LEGEND_1
  end
  NOTIFY ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
  style LEGEND_1 fill:transparent,stroke:transparent
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

**Boundary 1 — Host ↔ Docker network.** The only service listening on external host interfaces is the `proxy` service (nginx, `${GRAFANA_PORT:-3000}`). `pgadmin` (`5050`), Node-RED, Prometheus, Alertmanager and the Blackbox exporter publish ports bound to `127.0.0.1` loopback only. Grafana, alarm-api and the Factory Twin sit behind `proxy`, so every browser-facing request — read or write — goes through one front door. PgBouncer, TimescaleDB, the SNMP simulator and the image renderer are never exposed to the host — internal Docker DNS only. `observability-archiver` connects to Docker through `ims-docker-socket-proxy` over the internal network with read-only endpoint permissions.

**Boundary 1a — Grafana session as the write-path credential.** `alarm-api` (`services/alarm-api`) is the only service in this stack that mutates state from a Grafana dashboard (`IMS LDI - Alarm Console`'s Acknowledge/Resolve buttons, writing to `public.ldi_alarm_lifecycle`). It has no login of its own: `proxy`'s `/alarm-api/` location runs an `auth_request` subrequest against Grafana's own `/api/user` before forwarding anything, so a request only reaches alarm-api if the caller already holds a valid Grafana session — the same login an operator already has to see the dashboard, not a second credential to manage. The `/factory-twin-3d/` location uses the same gate. alarm-api connects to Postgres as `alarm_api_writer` (migration 078), a role scoped to `SELECT`+`UPDATE` on `ldi_alarm_lifecycle` only — not the superuser, not `grafana_reader`. alarm-api then identifies the caller itself. It asks Grafana for `/api/user` (the login) and `/api/user/orgs` (the role in the current organisation), and stores that login as the actor. It ignores any `acknowledged_by` / `resolved_by` sent in the request body, and answers 403 to a Viewer. Only Editor, Admin or a Grafana server admin may acknowledge or resolve. `tests/unit/alarm-api-server.test.js` covers this, and it was checked end to end through nginx against Grafana 13.1.2.

**Boundary 1b — Ingest endpoints.** `/ldi-telemetry` and `/inject` are reachable by anyone who can reach the front door's port. They are protected only by the `x-api-key` header matching `INGEST_API_KEY`, so that key must be a freshly generated secret, never the public `.env.example` value.

**Boundary 2 — Infrastructure domain ↔ Manufacturing domain.** Per `docs/architecture/OWNERSHIP.md`, this is a _logical_ separation only (folder/tag/CODEOWNERS boundaries) — both domains share one database, one Grafana instance, one Node-RED process. There is no hard security boundary between them. This is an accepted, explicitly-stated trade-off for a single-tenant deployment at this size, not an oversight.

**Boundary 3 — Equipment Integration Layer (forward-looking, not built).** Per `docs/architecture/EAP_ARCHITECTURE.md`, the day a real SECS/GEM-speaking tool is connected via the unimplemented third adapter, that connection crosses into the plant-floor equipment network — a genuinely new external trust boundary. Requires its own hardening review (credential handling, network segmentation) before any real equipment is wired in. Not designed yet because nothing exists to design it against.

**PgBouncer `MAX_CLIENT_CONN`** (`200` in `docker-compose.yaml`): do not raise it arbitrarily. Memory limits must scale alongside it (`1 connection ≈ 2MB`).

## Authentication per adapter

| Adapter | Mechanism | Where enforced |
| --- | --- | --- |
| SNMP (infrastructure) | Community string (v2c), stored per device in the database — not hardcoded in flows | `public.devices.snmp_community`, read by `nodered_data/flows/ingestion.json` |
| HTTP/JSON (LDI) | `x-api-key` header checked against `INGEST_API_KEY` | `nodered_data/flows/ldi_ingestion.json`, exposed through `proxy/nginx.conf` |
| Grafana → PgBouncer → TimescaleDB | `grafana_reader` role (read-only), password from `GRAFANA_DB_PASSWORD` | `docker-compose.yaml` env; PgBouncer userlist seeded by `pgbouncer/entrypoint-wrapper.sh`; role password set by `postgres/init/003-grafana-password.sh` |
| Alarm Console → alarm-api (write path) | Grafana session, validated via nginx `auth_request` against Grafana's `/api/user`; DB side uses the least-privilege `alarm_api_writer` role | `proxy/nginx.conf`, `services/alarm-api/server.js`, migration `078-alarm-api-writer-role.sql` |
| Browser → Factory Twin 3D | Same Grafana-session `auth_request` gate; every twin route answers 401 without a valid session (asserted by the browser regression in proxy mode) | `proxy/nginx.conf`, `services/factory-twin-3d` |
| Node-RED editor / admin API | `adminAuth` with a bcrypt hash; Node-RED refuses to start without `NODE_RED_ADMIN_PASSWORD_HASH` | `nodered_data/settings.js` |
| Alert delivery (LINE/Teams) | Bearer token / webhook URL — **absent from `.env` by design** | `nodered_data/flows/alerting.json` |

SNMPv2c's community-string auth is inherently weaker than SNMPv3 (no encryption, community string is effectively a shared password) — `SECURITY.md`'s hardening checklist already tracks migrating to SNMPv3 before connecting real production devices; not re-tracked here to avoid the two documents disagreeing over time.

## CODEOWNERS and branch protection as security controls

`.github/CODEOWNERS` lists the security-sensitive paths (`/SECURITY.md`, `/.env.example`, `/docker-compose*.yaml`, `/database/`, `/postgres/`, `/.github/`, `/nodered_data/flows/`) and requests the owner's review on them. The `main` ruleset requires one approving review, resolved threads, linear history and a `validate-architecture` status check, but it does **not** set `require_code_owner_review`, so CODEOWNERS requests a review without enforcing it — and no current workflow job reports `validate-architecture`, so merges presently rely on an administrator bypass. Both are tracked as follow-ups in `CONTRIBUTING.md`. The domain-scoped lines added for the infra/manufacturing split (`docs/architecture/OWNERSHIP.md`) are additive to the security-sensitive entries, not a replacement.

## What this document does not cover

- The known-limitations table (public example secrets, pgAdmin exposure, plain HTTP, etc.) — see `SECURITY.md`.
- AI tooling supply-chain security (MCP servers, skills, plugins) — see `SECURITY.md`'s AI Tooling Security section.
- Vulnerability reporting process — see `SECURITY.md`.

## Related documents

- `SECURITY.md` — the authoritative security policy.
- `docs/architecture/OWNERSHIP.md` — the infra/manufacturing domain boundary.
- `docs/architecture/EAP_ARCHITECTURE.md` — the equipment-adapter pattern and Boundary 3's full context.
- `docs/architecture/FACTORY_TWIN_SECURITY_MODEL.md` — the Factory Twin's own disclosure model.
- `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §8 — where this trust-boundary framing originated.

---

[⬅️ Back to IMS Platform Book](IMS_PLATFORM_BOOK.md) | [<img src="../assets/icons/home.svg" width="18" align="center" /> Main Repository](../../README.md)
