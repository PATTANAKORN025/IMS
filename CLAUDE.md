# CLAUDE.md (IMS Project - v1.0.1)

> **CRITICAL INSTRUCTION FOR CLAUDE CODE:** 
> Do NOT rely on assumptions from older sessions. The project has evolved into a 13-container microservice architecture. 
> You MUST read `AGENTS.md` before making any modifications. `AGENTS.md` is the absolute single source of truth for architectural rules, design systems, and SRE protocols.

## Quick Start Context
- **Project:** IMS (Industrial Monitoring System) - Enterprise OT/IT Convergence Platform
- **Architecture:** 13 Docker Containers (Node-RED, PgBouncer, TimescaleDB, Grafana, Prometheus, Alertmanager, Factory-Twin-3D, Alarm-API, etc.)
- **Data Flow:** SNMP/HTTP → Node-RED → PgBouncer (Transaction Pooling) → TimescaleDB (Hypertable/CAGG) → Grafana
- **Security Level:** Production-Hardened (TLS Enforced, Zero-Trust `.env` secrets, Network Isolation).

## Execution Commands (Cross-Platform)
This project operates flawlessly on both Windows and Linux.
- **Verify System Health:** `.\scripts\verify-deployment.ps1` (Windows) or `./scripts/verify-deployment.sh` (Linux)
- **Deploy Flows:** Node-RED flows are split. Build with `node scripts/build-flows.js`
- **Testing:** The `tests/` directory contains multi-tier testing (K6 Load, Playwright UI, E2E, Smoke, Unit, and Linters).

*Proceed immediately to read `AGENTS.md` to internalize the Ironclad Rules (Schema definitions, O(N) Node-RED parsing, Grafana Grid-24 discipline).*
