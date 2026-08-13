# Security Model

> **Audience:** SRE/operations, QA/audit, security review.
>
> This document is the **architectural trust-boundary view**. `SECURITY.md` (repo root) is the authoritative security *policy* — known limitations, hardening checklist, secrets handling. Read both; they don't duplicate each other.

---

## Trust boundaries

```mermaid
flowchart TB
    subgraph HOST["Host network"]
        subgraph DOCKER["Docker bridge network (ims-internal / ims-monitoring)"]
            PROXY["nginx proxy :3000\n(only host-published entry to Grafana + alarm-api)"]
            GRAFANA["Grafana\ninternal only, no host port"]
            ALARMAPI["alarm-api\ninternal only, no host port"]
            NODERED["Node-RED :1880"]
            PROM["Prometheus :9090"]
            AM["Alertmanager\n127.0.0.1:9093 loopback-only"]
            PGB["PgBouncer\ninternal only"]
            TSDB["TimescaleDB\ninternal only"]
            SNMPSIM["SNMP simulator\ninternal only"]
            BLACKBOX["Blackbox exporter\ninternal only"]
        end
    end

    EXT1["Real SNMP devices\n(servers, network gear)"] -->|"community-string auth"| NODERED
    EXT2["Real/simulated LDI machines"] -->|"HTTP POST, x-api-key auth"| NODERED
    NODERED --> PGB --> TSDB
    PROXY -->|"reverse proxy"| GRAFANA
    PROXY -->|"auth_request /api/user\n(rejects if session invalid)\nthen reverse proxy"| ALARMAPI
    GRAFANA --> PGB
    ALARMAPI -->|"alarm_api_writer role:\nSELECT+UPDATE on\nldi_alarm_lifecycle only"| PGB
    PROM --> AM
    AM --> NODERED
    NODERED -->|"credentials not shipped"| LINE["LINE Messaging API"]
    NODERED -->|"credentials not shipped"| TEAMS["MS Teams"]

    FUTURE["Future: real SECS/GEM equipment\n(not built)"] -.->|"NEW boundary, not yet designed"| NODERED
```

**Boundary 1 — Host ↔ Docker network.** Only the `proxy` service (nginx), Node-RED, Prometheus, and Alertmanager (loopback-only) publish host ports. Grafana and alarm-api used to publish their own ports directly; both were moved behind `proxy` so every browser-facing request — read or write — goes through one front door. PgBouncer, TimescaleDB, and the SNMP simulator are never exposed to the host — internal Docker DNS only.

**Boundary 1a — Grafana session as the write-path credential.** `alarm-api` (`services/alarm-api`) is the only service in this stack that mutates state from a Grafana dashboard (`IMS LDI - Alarm Console`'s Acknowledge/Resolve buttons, writing to `public.ldi_alarm_lifecycle`). It has no login of its own: `proxy`'s `/alarm-api/` location runs an `auth_request` subrequest against Grafana's own `/api/user` before forwarding anything, so a request only reaches alarm-api if the caller already holds a valid Grafana session — the same login an operator already has to see the dashboard, not a second credential to manage. alarm-api connects to Postgres as `alarm_api_writer` (migration 078), a role scoped to `SELECT`+`UPDATE` on `ldi_alarm_lifecycle` only — not `ims_admin`, not `grafana_reader`. Known gap: this authenticates *that* the caller is some logged-in Grafana user, not *which* one beyond the actor name the client sends in the request body (`acknowledged_by`/`resolved_by` are self-reported, not cross-checked against the session's own username) — acceptable for a single-tenant deployment where every Grafana user is already a trusted operator, revisit if that stops being true.

**Boundary 2 — Infrastructure domain ↔ Manufacturing domain.** Per `docs/architecture/OWNERSHIP.md`, this is a *logical* separation only (folder/tag/CODEOWNERS boundaries) — both domains share one database, one Grafana instance, one Node-RED process. There is no hard security boundary between them. This is an accepted, explicitly-stated trade-off for a single-tenant deployment at this size, not an oversight.

**Boundary 3 — Equipment Integration Layer (forward-looking, not built).** Per `docs/architecture/EAP_ARCHITECTURE.md`, the day a real SECS/GEM-speaking tool is connected via the unimplemented third adapter, that connection crosses into the plant-floor equipment network — a genuinely new external trust boundary. Requires its own hardening review (credential handling, network segmentation) before any real equipment is wired in. Not designed yet because nothing exists to design it against.

## Authentication per adapter

| Adapter | Mechanism | Where enforced |
|---|---|---|
| SNMP (infrastructure) | Community string (v2c) — file-based, not hardcoded in flows | `nodered_data/flows/ingestion.json`, `public.devices.snmp_community` |
| HTTP/JSON (LDI) | `x-api-key` header checked against `INGEST_API_KEY` | `nodered_data/flows/ldi_ingestion.json` |
| Grafana → PgBouncer → TimescaleDB | Connection-pooled DB credentials | `docker-compose.yaml` env, `pgbouncer.ini` |
| Alarm Console → alarm-api (write path) | Grafana session, validated via nginx `auth_request` against Grafana's `/api/user`; DB side uses the least-privilege `alarm_api_writer` role | `proxy/nginx.conf`, `services/alarm-api/server.js`, migration `078-alarm-api-writer-role.sql` |
| Alert delivery (LINE/Teams) | Bearer token / webhook URL — **absent from `.env` by design** | `nodered_data/flows/alerting.json` |

SNMPv2c's community-string auth is inherently weaker than SNMPv3 (no encryption, community string is effectively a shared password) — `SECURITY.md`'s hardening checklist already tracks migrating to SNMPv3 before connecting real production devices; not re-tracked here to avoid the two documents disagreeing over time.

## CODEOWNERS as a security control

`.github/CODEOWNERS`'s security-sensitive lines (`/.env.example`, `docker-compose*.yaml`, `/database/`, `/.github/`) gate review on those paths regardless of domain. The domain-scoped lines added for the infra/manufacturing split (`docs/architecture/OWNERSHIP.md`) are additive to this, not a replacement — they don't weaken or reorder the security-sensitive entries.

## What this document does not cover

- The known limitations table (PgBouncer port exposure trade-offs, Node-RED admin auth, etc.) — see `SECURITY.md`.
- AI tooling supply-chain security (MCP servers, skills, plugins) — see `SECURITY.md`'s AI Tooling Security section.
- Vulnerability reporting process — see `SECURITY.md`.

## Related documents

- `SECURITY.md` — the authoritative security policy.
- `docs/architecture/OWNERSHIP.md` — the infra/manufacturing domain boundary.
- `docs/architecture/EAP_ARCHITECTURE.md` — the equipment-adapter pattern and Boundary 3's full context.
- `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §8 — where this trust-boundary framing originated.
