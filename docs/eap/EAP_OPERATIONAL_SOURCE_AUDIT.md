# FT-EAP-STATE-03 — Authoritative APEX3 Operational-State Source Audit

Continues from `878a1bdd`. Answers one question with evidence, not
assumption: does an authoritative real operational-state source exist for
APEX3's EAP cells, anywhere in this repository, that is not LDI?

## Method

Real repository-wide search (`ripgrep`, word-bounded, case-insensitive) for
every candidate this phase named: PLC, SCADA, historian, OPC-UA, Modbus,
MES, plus a targeted read of every real hit — not a keyword count. LDI's
own database schema (`postgres/init/001-init-timescaledb.sql`) was read in
full for its actual table list, not assumed from table-name guesses.

## What was found, and what each hit actually is

| Hit | What it actually is |
|---|---|
| `services/factory-twin-3d/lib/contracts.js` | A code comment explaining a vocabulary choice: "Off/Down/Idle/Run/PM-Stop/Undefined-style labels are industry-standard on SCADA/HMI status boards generally, not a real facility's proprietary data." Documents a naming decision, not an integration. |
| `services/factory-twin-3d/server.js` | One `CASE WHEN 'PLC' THEN 'Automation'` — an alarm-category display-label mapping in an existing alarm-classification query, unrelated to any live PLC connection. |
| `services/factory-twin-3d/lib/mes-import.js` | A real, 200-line module — but its own header states it plainly: "This module accepts a future structured export from the external manufacturing system. It is deliberately NOT connected to that system, and no real export exists yet." It validates and plans an import of **machine identity/mapping** records (`MesImportState`: unmapped/candidate/confirmed/rejected), never operational state, and is never invoked by any running code path today (confirmed: no caller in `server.js` or any route). |
| `postgres/init/036-ldi-alarm-master-mock.sql` | A **mock** reference table (alarm code master list) — the filename says so; not a live source. |
| Everything else (docs, dashboard JSON, `.agents/` font-license CSVs, migration files) | Narrative mentions, alarm-knowledge-base category tags, or unrelated matches (font metadata). None is a data source. |

**No PLC, SCADA, historian, OPC-UA or Modbus integration exists anywhere
in this codebase's server code, Node-RED flows, or database schema.**

## The real database schema (read in full, not guessed)

`postgres/init/001-init-timescaledb.sql` defines exactly these tables:

| Table | Real content | Relevant to EAP operational state? |
|---|---|---|
| `devices` | Asset registry (SNMP-monitored network devices) | No — network/IT inventory, not machine state |
| `sys_metrics`, `net_metrics` | SNMP system/network health metrics | No — CPU/network telemetry, not machine RUN/DOWN |
| `ldi_data`, `ldi_metrics` | The LDI family — the **only** table with machine-state-shaped fields (`machine_state`, factory/process/eqp_id) | The only real candidate — see below |
| `ldi_alarm_log`, `ldi_alarm_ms_code` | LDI alarm history and its code master | Alarm data, not run-state |

## Node-RED flows (read, not assumed)

`nodered_data/flows/*.json` are all named and scoped to LDI:
`ldi_ingestion.json`, `ldi_simulator.json`, `ldi_alarm_simulator.json`, plus
a generic `ingestion.json`/`alerting.json`. None connects to an external
PLC, SCADA, or MES system — `ldi_simulator.json`'s own name discloses it
generates synthetic LDI rows, the same honesty this engagement has
documented about LDI's own simulated fixtures in prior phases.

## Why LDI itself is still not the answer for EAP

`ldi_data` is real, live, and does carry a real `machine_state` field for
its own 40-some monitored devices. It is excluded as an EAP source for the
same reason every prior phase in this engagement already established and
re-confirmed here: **no authoritative mapping exists from an EAP cell to
an LDI device**. `lib/eap-map.js`'s own wire contract states this on every
one of the 210 cells (`status: 'UNKNOWN'`, `status_reason: 'no
authoritative IMS mapping exists for this cell'`) and this phase's own
brief explicitly forbids assuming LDI is the source or introducing that
coupling. Using LDI here would not be "finding a real source" — it would
be fabricating a mapping this repository has, three times now, explicitly
refused to invent.

## Runtime lineage (Phase 2) — both real chains, restated with adapter names

| Stage | REAL chain | SIMULATED chain |
|---|---|---|
| Source | None found (this audit) | `cell.cell_id` string |
| Transport | n/a | n/a — no network hop |
| Parser | n/a | n/a |
| State mapper | `RealOperationalStateAdapter.resolve()` — always answers `UNAVAILABLE` | `SimulatedOperationalStateAdapter.resolve()` (`operational-state-adapters.js`) |
| Canonical state | `{ state: null, source_type: 'REAL', quality: 'UNAVAILABLE' }` | `{ state, source_type: 'SIMULATED', quality: 'SIMULATION'/'NO_DATA'/'UNAVAILABLE' }` |
| EAP object | Read via `resolveOperationalState(cell)` — tries REAL first, every call, falls through to SIMULATED because REAL genuinely answers UNAVAILABLE | same |
| Renderer | `paintStates()`, inspector, zone/factory breakdown tables | same |

Freshness/coverage/authority/failure-behavior, per candidate:

| Source | Update interval | Timestamp | Freshness | Coverage | Authority | Failure behavior |
|---|---|---|---|---|---|---|
| RealOperationalStateAdapter | n/a — no polling, nothing to fetch | n/a | n/a | 0 of 210 cells | Would be authoritative if it existed | Always answers UNAVAILABLE, deterministically, never throws |
| SimulatedOperationalStateAdapter | n/a — pure function, no polling loop (confirmed: no `setInterval` in `eap.js`) | `observed_at: null` always, disclosed as not a real reading | n/a — static | 171 of 210 cells (those with `unit_state === 'ATTACHED'`); the other 39 report `NO_DATA` | None — explicitly disclosed as simulation everywhere it appears | Toggled off by the user (`Simulation: OFF`) → every cell reports `UNAVAILABLE` |

## Conclusion

**No authoritative APEX3 operational-state source exists for EAP cells.**
This is not a gap left for a future phase to close casually — it is a
repository-wide, evidence-backed fact as of this audit. `RealOperational-
StateAdapter` (`operational-state-adapters.js`) encodes exactly this
finding in code: it is queried first on every resolution and answers
`UNAVAILABLE` unconditionally, so the absence is a fact the data model
states, not a fact inferred from a missing adapter. If a real source is
ever integrated (an authoritative EAP-cell-to-machine mapping plus a real
PLC/SCADA/MES/historian feed), this is the one file that changes — no
caller elsewhere in `eap.js` needs to.
