# Floor 1 — Evidence Source Audit (Phase 9A)

Read-only search of this repository for REAL identity evidence usable toward CONFIRMED
mappings for the Factory Twin's 431 assets. No application code touched. Every source below was
read in full, not keyword-counted; nothing here is manufactured — an absence is reported as an
absence. Reconfirms and re-frames `docs/evidence/FACTORY_TWIN_OPERATIONAL_SOURCE_AUDIT.md`
(Step 6B) and `docs/evidence/FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md` (§4) against this
phase's own 10-item checklist — no new source found beyond what those two already identified.

## Checklist result

| # | Source class | Found? | Detail |
|---|---|---|---|
| 1 | MES exports/imports | Boundary exists, no data | `services/factory-twin-3d/lib/mes-import.js` — see below |
| 2 | CMMS/EAM references | Not found | No CMMS/EAM integration, table, or file anywhere in repo |
| 3 | PLC/SCADA tag registries | Not found | No PLC/SCADA/OPC-UA/Modbus integration anywhere in repo (confirmed again this pass) |
| 4 | Historian metadata | Not found | No historian system present |
| 5 | Vendor/device registries | Partial — `public.devices` table exists | Real, but device-domain only, no CAD tie — see below |
| 6 | Maintenance records | Not found | No maintenance/CMMS record, nameplate log, or warranty file anywhere in repo |
| 7 | Node-RED flows with authoritative device identity | Found, LDI-scoped only | `nodered_data/flows.json` — see below |
| 8 | Deployment/configuration inventories | Found, confirms same gap | `database/migrations/040-register-ldi-devices.sql` — see below |
| 9 | Existing mapping files | Found, empty | `private/floor1-asset-mapping.json` — see below |
| 10 | Docs describing real machine/device relationships | Found, all say "none yet" | Step 6B/6D/6E/7 evidence docs, `lib/evidence.js` — see below |

## Per-source detail

### 1/9. `services/factory-twin-3d/private/floor1-asset-mapping.json` (FT-14 mapping table)

- **Path/system**: `services/factory-twin-3d/private/floor1-asset-mapping.json`
- **Authoritative?**: Yes — the ONLY file `lib/mapping.js`'s `resolveMapping()` ever reads for
  CAD-asset-to-device identity. Not authoritative in content, because content is empty.
- **Identity fields provided**: `asset_id`, `ims_device_id`, `mes_machine_id`,
  `mapping_status`, `confidence`, `source`, `source_record`, `verified_at` — the full schema.
- **Coverage**: 0/431 (`"mappings": []`, read live this pass).
- **Provenance quality**: n/a — no records to assess.
- **Timestamp quality**: n/a.
- **Conflict risk**: None currently — an empty file cannot conflict.
- **Maps to FactoryTwinAssetId?**: Yes, directly — this is the canonical join key (`asset_id`
  namespace pattern includes `EQP-F1-nnnn`).
- **Direct or requires external evidence?**: This file only ever RECORDS evidence collected
  elsewhere; it is never itself a source of evidence.

### 2. `services/factory-twin-3d/lib/mes-import.js` (MES import boundary)

- **Path/system**: `services/factory-twin-3d/lib/mes-import.js`
- **Authoritative?**: No — a validated dry-run boundary for a future export. Its own header:
  "no real export exists yet." `planImport()` never called from any live route (grepped, no
  callers outside its own test file).
- **Identity fields provided**: `mes_machine_id`, `process_group`, optional
  `physical_slot_id` — but only IF a real export file is ever supplied. None exists today.
- **Coverage**: 0/431 — no input has ever been fed to this module in production.
- **Provenance quality**: n/a — no real data processed.
- **Timestamp quality**: n/a.
- **Conflict risk**: n/a until real data exists; code path explicitly rejects a slot already
  confirmed by another source rather than overwriting (`ctx.confirmedSlotToMes` check).
- **Maps to FactoryTwinAssetId?**: Would, via `physical_slot_id` — CAN produce a `CANDIDATE`
  row in `lib/mapping.js`'s shape, never a `CONFIRMED` one on its own authority.
- **Direct or requires external evidence?**: Requires external evidence — a real MES export
  file this repository has never received.

### 3. `public.devices` table (device/vendor registry)

- **Path/system**: `database/exports/ims_schema_export.sql` (schema), seeded by
  `database/migrations/040-register-ldi-devices.sql`
- **Authoritative?**: Authoritative for its own domain — LDI device existence, hostname,
  location, `device_type`. NOT authoritative for Factory Twin identity: it has no column
  referencing any CAD/Twin asset id.
- **Identity fields provided**: `device_id`, `hostname`, `device_type`, `location`,
  `ip_address`. No `asset_id`, no CAD reference, no physical-position field of any kind.
- **Coverage**: 23 real rows (`device_type='ldi', enabled=true`, re-counted this pass) against
  431 Twin assets — 0 of the 23 carry any correspondence to any of the 431.
- **Provenance quality**: High for what it asserts (real device seed, migration 040's own
  header documents the 2026-08-07 real-data cutover) — but it asserts device existence only,
  never a Twin-asset relationship, so provenance quality for IDENTITY MAPPING purposes is n/a.
- **Timestamp quality**: `created_at`/`updated_at` columns exist on the table; migration itself
  is dated and version-controlled.
- **Conflict risk**: None for mapping purposes — there is nothing here to conflict with a CAD
  asset since no column links the two.
- **Maps to FactoryTwinAssetId?**: No — confirmed again this pass, same finding as
  Step 6B/6D/7: a device existing is not evidence of WHICH CAD position it occupies.
- **Direct or requires external evidence?**: Requires external evidence — a real record tying
  a specific `device_id` to a specific `EQP-F1-nnnn` position, which does not exist anywhere.

### 4. `nodered_data/flows.json` (Node-RED flows)

- **Path/system**: `nodered_data/flows.json`
- **Authoritative?**: Authoritative for LDI telemetry/alarm transport topology
  (`ldi_ingestion.json`-equivalent nodes), not for Factory Twin identity.
- **Identity fields provided**: LDI `device_id`/`eqp_id` references within ingestion/simulator
  node configs only.
- **Coverage**: 0/431 — grepped this pass for `EQP-F1`, `factory-twin`, `FT-14`: zero matches
  anywhere in the flow file. Node-RED has no concept of a Twin CAD asset.
- **Provenance quality**: n/a for Twin identity — no Twin-relevant claim is made at all.
- **Timestamp quality**: n/a.
- **Conflict risk**: None — disjoint namespace.
- **Maps to FactoryTwinAssetId?**: No.
- **Direct or requires external evidence?**: Requires external evidence AND a Twin-identity
  concept Node-RED does not currently have.

### 5. `docs/evidence/*`, `lib/evidence.js` (documentation / evidence-governance code)

- **Path/system**: `services/factory-twin-3d/lib/evidence.js`,
  `docs/evidence/FACTORY_TWIN_OPERATIONAL_SOURCE_AUDIT.md`,
  `docs/evidence/FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md`, and this migration's own
  Step 6B/6D/6E/7 docs.
- **Authoritative?**: Authoritative as PROCESS/RULES (what counts as evidence, what promotion
  requires), not as a source of facts — `lib/evidence.js`'s own header: "ships empty."
- **Identity fields provided**: None — defines the RULES a real source's fields must satisfy
  (`EvidenceState`, `SourceType`, `evaluateMappingProposal()`), holds no facility data itself.
- **Coverage**: n/a — a rules engine, not a data source.
- **Provenance quality**: n/a.
- **Timestamp quality**: n/a.
- **Conflict risk**: n/a.
- **Maps to FactoryTwinAssetId?**: Indirectly — it is the gate any future real source's claim
  must pass through, not a source itself.
- **Direct or requires external evidence?**: Requires external evidence; this is the governor
  of that evidence, not a supplier of it.

### 6/7/8. CMMS/EAM, PLC/SCADA/historian, maintenance records — none found

Repository-wide search (word-bounded, case-insensitive) this pass: `cmms`, `eam `, `plc`,
`scada`, `opc`, `modbus`, `historian`, `maintenance_record`, `nameplate`, `warranty`,
`vendor_registry`. Matches found only inside this migration's OWN prior evidence docs and the
`docs/floor1/` pack itself (which describe the ABSENCE of these systems, not their presence).
No such system, table, export, or integration exists anywhere in this repository. Same
conclusion as Step 6B, re-verified independently this pass rather than cited.

## Summary — no new evidence source exists

Every one of the 10 checklist items was searched for real. Two real, authoritative-in-their-own-
domain sources exist (`public.devices` for LDI device existence, Node-RED flows for LDI
transport) and one real, empty mechanism exists for recording future evidence (FT-14 mapping
file) plus one real, never-fed import boundary (`mes-import.js`). None of the four bridges CAD
asset identity to device/equipment identity. This is a real-world evidence gap — a physical
survey, an MES export, or an approved manual site record has never been supplied to this
repository — not a code or search gap. Matches `FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md`
§4's own conclusion exactly, independently re-derived here.
