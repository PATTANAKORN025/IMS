# Local Development & Contribution Guide

Welcome to the IMS Core Team. This guide will get you running the full telemetry stack locally in minutes.

## 1. Prerequisites
- Docker & Docker Compose (v2)
- GNU Make
- Node.js (for linting/tests)

## 2. Environment Setup
1. Clone the repository.
2. Copy environment file: `cp .env.example .env` (Populate secrets as needed).
3. Start the dev stack:
   ```bash
   make up
   ```
   *(This spins up Node-RED, TimescaleDB, Grafana, and local Simulators)*

## 3. Development Workflow
- **Node-RED**: Access `http://localhost:1880`. Edits in the UI are ephemeral! You MUST export flows to `nodered_data/flows/*.json`.
- **Grafana**: Access `http://localhost:3000` (admin / change-me-please). Edit dashboards, then save the JSON model back to `monitoring/grafana/dashboards/`.
- **Validation**: Run `make verify` before committing.

## 4. Git Conventions
- Branches: `feat/*`, `fix/*`, `perf/*`, `docs/*`.
- Commits: Conventional Commits (e.g., `feat(ldi): add spindle metric`).
