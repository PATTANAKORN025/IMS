# Floor 1 Evidence Intake Contract

Defines the minimum evidence a real-world source must supply before this repository will ever
promote a mapping toward `CONFIRMED`. Read-only contract — no application code, database,
nginx, Grafana, Node-RED, EAP, or CAD data changed by this document. Pairs with
`docs/floor1/floor1-data-collection-guide.md` (field-by-field collection guidance) and
`docs/evidence/FACTORY_TWIN_CANONICAL_IDENTITY_CONTRACT.md` (Step 6E's own 5-namespace model,
reused here unchanged, not redefined).

## 1. Fields

### Always required for any evidence record to be assessable at all

| Field | Meaning |
|---|---|
| `FactoryTwinAssetId` | The CAD position this evidence is ABOUT (`EQP-F1-nnnn`). Never absent — an evidence record with no asset to attach to is not a record. |
| `source_system` | WHICH system/process supplied this evidence (Step 6E's `SourceSystemId`) — named explicitly, never "site visit" with nothing retrievable. |
| `source_record` | The specific record/document/ticket within that source — a row id, export filename, survey form number. |
| `evidence_type` | One of §2's explicit evidence classes. Never a spatial-only class asserting identity. |
| `evidence_location` | Where the evidence itself can be found/re-checked (file path, photo location, system query). |
| `provenance` | Free-text account of how this evidence was obtained/verified — the load-bearing field `lib/evidence.js` already requires for any source to be trusted at all. |
| `verified_by` | A real name or a named, real approval process. Never blank, never a placeholder. |
| `verified_at` | ISO-8601 timestamp of verification — the actual date/time, never a guess or a file's own creation date. |

### At least one required to assert ANY identity (may be supplied independently of the others — see §3)

| Field | Meaning |
|---|---|
| `EquipmentId` | The logical unit id in the MES, if one exists (Step 6E's `EquipmentId`). |
| `PhysicalAssetId` | The specific physical unit occupying this position today (Step 6E's `PhysicalAssetId` — separate from `EquipmentId` because a physical unit can be swapped without changing the logical equipment). |
| `DeviceId` | The id this equipment reports under in a real monitoring/control system (Step 6E's `DeviceId`, `ims_device_id` in the legacy engine). |
| `SourceSystemId` | Which real system asserted whichever of the three above is present — required alongside any of them, never supplied alone. |

A record naming zero of these four fields carries no identity claim at all — it may still be
valid spatial/context evidence, but can never reach `CANDIDATE` or `CONFIRMED` (§3).

### Optional, strongly useful when available

`equipment_name`, `equipment_type`, `vendor`, `manufacturer`, `model`, `serial_number`,
`device_tag`, `PLC_tag`, `MES_equipment_code`, `CMMS_asset_code` — record whenever the source
provides them; never required for promotion, never invented when absent.

## 2. Evidence classes

Direct, identity-capable classes — the only classes that may ever support `CANDIDATE` or
`CONFIRMED`:

```
DIRECT_SYSTEM_RECORD    -- a system's own authoritative record of this exact unit
NAMEPLATE_PHOTO         -- a photo of the physical nameplate
PLC_SCADA_TAG_RECORD    -- a real PLC/SCADA tag browse/export naming this unit
MES_RECORD              -- a real MES export naming this unit
CMMS_EAM_RECORD         -- a real CMMS/EAM asset record
VENDOR_REGISTRY         -- a vendor's own device/asset registry entry
SITE_SURVEY             -- an approved, named manual site survey record
ENGINEERING_DOCUMENT    -- a real, named engineering document (as-built, commissioning record)
OTHER                   -- present but insufficiently specified; always downgraded (§5)
```

Never identity evidence — spatial/context only, exactly the bases
`services/factory-twin-3d/lib/evidence.js`'s own `REJECTED_MAPPING_BASIS` already rejects:

```
CAD_POSITION            -- where the drawing places it
EAP_POSITION            -- which EAP cell it is spatially associated with
GEOMETRY_SIMILARITY     -- footprint/dimension resemblance to another known unit
NAME_SIMILARITY         -- a device named similarly to a CAD zone/label
NEAREST_ASSET           -- proximity to another asset with known identity
```

A record whose `evidence_type` is one of these five may describe WHERE something is, never
WHICH real equipment/device it is. `docs/floor1/floor1-data-collection-guide.md`'s "one rule
that matters most" applies unchanged.

## 3. Promotion policy

`CONFIRMED` requires ALL of:

1. Direct traceability to a real asset/equipment record (`evidence_type` is one of the eight
   direct classes above, never spatial/context-only, never `OTHER`).
2. An identifiable source (`source_system` present and named, not "unknown").
3. A source record locator (`source_record`, re-checkable by a reviewer).
4. A reviewer (`verified_by`).
5. A verification timestamp (`verified_at`, valid ISO-8601).
6. No conflicting identity claim against the same `EquipmentId`/`PhysicalAssetId`/`DeviceId`
   from a different asset (mirrors `lib/mapping.js`'s own duplicate-claim rejection exactly).
7. An explainable relationship between the logical equipment and the physical asset — i.e. all
   three identity fields (`EquipmentId`, `PhysicalAssetId`, `DeviceId`) resolved, not merely
   asserted from one alone. This is the one place this contract is STRICTER than "any single
   identity field is useful real evidence" (§1): a single resolved field is real, valuable
   evidence, but is a **partial state** — recorded honestly as `CANDIDATE`, promoted to
   `CONFIRMED` only once the full chain resolves. **Never fabricate a missing link to force a
   false complete chain.**

A source establishing `EquipmentId` alone, or `PhysicalAssetId` alone, or `DeviceId` alone, is
real and worth recording — it lands the mapping at `CANDIDATE`, not `UNMAPPED` and never
`CONFIRMED` on that partial basis alone. Two independent partial sources for the SAME asset may
together complete a chain over time; each remains individually recorded with its own
provenance, never merged silently.

## 4. Reuses, does not redefine

Mapping-status vocabulary: Step 6E's own 6-state lifecycle
(`UNMAPPED`/`CANDIDATE`/`CONFIRMED`/`AMBIGUOUS`/`RETIRED`/`INVALID`) — same as
`docs/floor1/floor1-data-collection-guide.md`. Evidence quality vocabulary (kept separate from
mapping status, per this phase's own §3 rule): `GOOD_EVIDENCE`/`PARTIAL_EVIDENCE`/
`CONFLICTING_EVIDENCE`/`NO_EVIDENCE`, matching Phase 9C exactly.
