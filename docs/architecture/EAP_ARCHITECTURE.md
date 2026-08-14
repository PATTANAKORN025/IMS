# Equipment Integration Layer Architecture (EAP)

> **EAP = Equipment Automation Program** — SECS/GEM-style equipment integration, per the scope confirmed 2026-08-10 (not "Enterprise Application Platform"). See `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §3 for the plan this doc fulfills.
>
> **Reality check, stated up front:** IMS is monitoring-only. It reads telemetry and raises alarms; it never writes commands, downloads recipes, or holds equipment state. There is no physical SECS/GEM-capable tool anywhere in this system today — LDI machines are SNMP-polled/simulated, not SECS/GEM-connected. This doc does **not** claim SECS/GEM compliance, does not implement HSMS session handling, and does not simulate SECS/GEM equipment. It documents the two adapters that are real, and defines a contract for a third that doesn't exist yet.
>
> **Provenance:** the SNMP and HTTP/JSON adapter descriptions below were checked directly against `nodered_data/flows/ingestion.json` and `nodered_data/flows/ldi_ingestion.json` on 2026-08-10, not written from memory.

---

## The pattern: three adapters, one equipment registry

Every adapter's job is the same regardless of protocol: get telemetry and alarm events from a physical or simulated device into `public.devices` / the device's telemetry table, using `device_id` as the join key across the whole system (dashboards, SPC/RCA views, alarm master). An adapter is defined by how it acquires data, not by what it feeds into.

### Adapter 1 — SNMP (legacy/infrastructure devices)

- **Where:** `nodered_data/flows/ingestion.json` ("IMS Ingestion Pipeline" tab).
- **Equipment model:** `public.devices` rows with `device_type IN ('server','workstation','network')`, holding `hostname`, `ip_address`, `snmp_community`, `snmp_port`, `poll_interval`.
- **Data collection plan:** every 30 seconds, `fork_5_ways` dispatches parallel SNMP v2c walkers (CPU, Storage, Network, Temperature, LDI OIDs) per registered device.
- **Event/alarm collection:** none at the protocol level — this adapter is telemetry-only; alarms are derived downstream from thresholds on the ingested metrics, not carried as native SNMP traps.
- **Data collection plan → telemetry mapping:** `sre_parser` maintains per-device state and batch-inserts into `sys_metrics` / `net_metrics` / `ldi_metrics`, keyed by `device_id`.

### Adapter 2 — HTTP/JSON (LDI manufacturing telemetry)

- **Where:** `nodered_data/flows/ldi_ingestion.json` ("IMS LDI Ingestion" tab).
- **Equipment model:** `public.devices` rows with `device_type='ldi'`, `process_type='ldi'` (migration 067/068).
- **Data collection plan:** the equipment (or its simulator) POSTs a JSON array batch to `POST /ldi-telemetry`, authenticated via an `x-api-key` header checked against `INGEST_API_KEY`. Each batch item carries `eqp_id` (maps to `device_id`) plus the full LDI parameter set (PE1-6, JE1-4, thickness, scan_speed, resist_dosage, ...).
- **Event/alarm collection:** a parallel simulator/producer path (`ldi_alarm_simulator.json`) writes to `public.ldi_alarm_log`, correlated to telemetry by `device_id` + `event_id` (not carried inside the same POST — a separate event stream, same equipment identity).
- **Data collection plan → telemetry mapping:** direct batch `INSERT INTO public.ldi_data`, `ON CONFLICT (log_id, "time") DO NOTHING` for idempotency.

### Adapter 3 — SECS/GEM (unimplemented contract, for a future real tool)

No code exists for this adapter. If a future process type's equipment actually speaks SECS/GEM, it would need to satisfy this contract to plug into the same registry and downstream views/dashboards without changing anything else:

| EAP concept                                  | What Adapter 3 would need to provide                                                                                                                                                                                                | Maps to (existing pattern)          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Equipment model registration**             | Register the tool as a `public.devices` row with a `device_id`, appropriate `device_type`, and a `process_type` (per `MANUFACTURING_DOMAIN.md`) — same identity contract as Adapters 1 and 2.                                       | `public.devices`                    |
| **Event report → alarm mapping**             | Translate SECS/GEM event reports (collection event IDs, CEIDs) into rows in that process's alarm master + alarm log table, keyed by `device_id` — same shape as `ldi_alarm_ms_code`/`ldi_alarm_log`.                                | Adapter 2's alarm path              |
| **Data collection plan → telemetry mapping** | Translate SECS/GEM SVID/ECID variable reports into rows in that process's telemetry hypertable, keyed by `(device_id, time)` — same shape as `ldi_data`.                                                                            | Adapter 2's telemetry path          |
| **Versioning**                               | Ship as an explicitly versioned contract (e.g. `adapter-contract-v1`) per `IMS_MANUFACTURING_PLATFORM_V2.md` §7 — the one integration point in this repo where a breaking change wouldn't be caught by any existing linter or test. | New requirement, no existing analog |

Building Adapter 3 is out of scope until a real SECS/GEM-speaking tool needs to be connected — there is nothing to integrate against or test today, and a simulated SECS/GEM stack would be speculative infrastructure with no requirement behind it.

---

## Security boundary note

Connecting a real Adapter 3 tool crosses into the plant-floor equipment network — a new external trust boundary that doesn't exist in this system today. See `IMS_MANUFACTURING_PLATFORM_V2.md` §8 (Boundary 3) — that connection requires its own hardening review before any real equipment is wired in. This doc defines the data contract only, not the network/credential hardening for that future connection.
