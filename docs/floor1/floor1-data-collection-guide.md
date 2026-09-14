# Floor 1 Data Collection Guide

For whoever collects real-world equipment/device evidence for the Factory Twin's 431 assets.
Pairs with `equipment-registry-template.csv` (one row per Factory Twin asset, pre-seeded with
real CAD data) and `mapping-evidence-template.csv` (one row per identity claim, filled in as
evidence is gathered). Produces input for `private/floor1-asset-mapping.json`'s own
`CONFIRMED`-record requirement (`services/factory-twin-3d/lib/mapping.js`) — this guide does
not write that file itself; a real evidence-review workflow does
(`docs/evidence/FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md`'s own §6).

## The one rule that matters most

**Identity is never inferred. It is only recorded when directly observed or authoritatively
asserted by a real source.** Every field below says explicitly what counts as evidence and what
does not. When in doubt, leave the field blank and mark the asset `UNMAPPED` — an honest blank
is always correct; a guessed value is never correct, even if it later turns out right, because
nothing downstream can tell a guess from a fact once it's written down.

## Field-by-field guide

| Field | What it is | Where it comes from | What does NOT count as evidence |
|---|---|---|---|
| `factory_twin_asset_id` | The CAD position's own id (`EQP-F1-nnnn`) | Already filled in `equipment-registry-template.csv` — never write your own | — |
| `zone` | CAD functional zone (`FZ-F1-nnnn`) | Already filled — the Twin's own authoritative geometry | — |
| `room` | *(intentionally left blank in the template)* | No separate "room" concept exists in this repository's current data model (`docs/evidence/FLOOR1_MASTER_DATA_REGISTRY.md`) — leave blank unless a real, named site drawing/room schedule is consulted, in which case record the SOURCE in `source_record`, not just the room name | Guessing from zone name or position |
| `equipment_name` | The real, physical nameplate/label text | A photo of the actual equipment nameplate, or a site equipment list that names this exact unit | The CAD block's own label/layer name (that is drawing metadata, not equipment identity) |
| `equipment_type` | The real equipment category (e.g. "laser driller," "AOI inspector") | Nameplate, spec sheet, or a real equipment register | Guessing from CAD zone/process area name (`process` fields in EAP/CAD describe an AREA, not a specific machine) |
| `equipment_id` | The logical unit id in the MES, if one exists | A real MES export (`lib/mes-import.js`'s own expected input shape — see `docs/evidence/FACTORY_TWIN_OPERATIONAL_SOURCE_AUDIT.md`) | Inventing an id because none was found |
| `physical_asset_id` | The specific PHYSICAL unit occupying this position today (Step 6E's own concept — separate from `equipment_id` because a physical unit can be swapped without changing the logical equipment or the CAD position) | An asset tag / physical inventory tag actually affixed to the unit | The CAD asset id (that's the position, not the physical unit) |
| `serial_number` | The manufacturer's own serial number | Read directly off the nameplate | — |
| `manufacturer` | The manufacturer's own name | Nameplate | — |
| `model` | The manufacturer's own model designation | Nameplate | — |
| `device_id` | The id this equipment reports under in a real monitoring/control system | The system's own device registry (e.g. the `devices` table's `device_id` column, IF a real, verified correspondence to THIS physical unit exists — the registry entry alone is not that correspondence, see below) | Assuming the device registry's Nth row corresponds to the Nth CAD asset, or any other positional/ordering guess |
| `plc_scada_mes_identifier` | The tag/point name this equipment uses in a PLC, SCADA, or MES system, if different from `device_id` | The system's own tag database/export | — |
| `source_system` | WHICH system supplied the evidence for THIS row (Step 6E's own `SourceSystemId`) | Name it explicitly — "LDI devices table," "vendor registry export 2026-03-01," "manual site survey" | — |
| `source_record` | The specific record/document/ticket within that source | A row id, export filename, survey form number — something a reviewer could go look up | A vague description like "site visit" with no retrievable record |
| `verification_method` | HOW this was checked | "nameplate photo," "cross-referenced against vendor registry export X," "PLC tag browse session on 2026-03-01" | "assumed," "looks right," "probably" |
| `verified_at` | ISO-8601 timestamp of verification | The actual date/time the check was performed | A guess or the file's own creation date |
| `verifier_or_process` | Who (or what approved process) verified this | A real name or a named, real approval process | Blank, or a placeholder |
| `mapping_status` | See vocabulary below | Set by the reviewer, not the field collector alone (Step 6E's own lifecycle: a `CANDIDATE` becomes `CONFIRMED` only after review, `docs/evidence/FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md`'s own §6) | — |
| `spatial_status` | Already filled in the template (`footprint_status` from live CAD data) | Do not overwrite | — |
| `identity_confidence` | `high`/`medium`/`low` — the REVIEWER's own confidence in the evidence, not the field collector's guess | Set during review, matching `lib/mapping.js`'s own `confidence` field | — |

## Mapping status vocabulary

Reuses Step 6E's own 6-state lifecycle exactly (`docs/evidence/
FACTORY_TWIN_CANONICAL_IDENTITY_CONTRACT.md`) — no new vocabulary invented here:

```
UNMAPPED   -- no relationship asserted (every row's starting state)
CANDIDATE  -- a relationship has been proposed with SOME evidence, not yet reviewed
AMBIGUOUS  -- two or more sources disagree about this asset -- never auto-resolved,
              never silently picked
CONFIRMED  -- reviewed, provenanced (source + source_record + verified_at all present),
              production-eligible
RETIRED    -- was CONFIRMED once, the physical unit has since been replaced or the
              mapping is otherwise known stale
INVALID    -- the row itself fails basic structural sanity (e.g. a malformed id) --
              flag it, do not attempt to fix it by guessing what was meant
```

A row may ONLY be marked `CONFIRMED` if `source`, `source_record`, and `verified_at` are all
populated — this is not a style preference, it is the exact requirement the real, unmodified
`validateMappings()` engine already enforces (`services/factory-twin-3d/lib/mapping.js`) and
will reject the whole file over if violated.

## The rules this guide exists to enforce (repeated, because they matter most)

- **Never infer identity from position.** A device being physically near a CAD asset is not
  evidence it occupies that CAD asset's position — CAD proximity has been explicitly ruled out
  as identity evidence since Step 6B/6D/6E's own audits.
- **Never infer identity from array/list order.** The Nth row of any export, registry, or list
  is not evidence it corresponds to the Nth Factory Twin asset.
- **Never infer identity from similar names.** A device named similarly to a CAD zone or label
  is not evidence — names are drawing/system metadata, not identity proof.
- **Never create a fake device ID.** If no real device id exists for an asset yet, leave the
  field blank and the row `UNMAPPED`. A placeholder value (even one clearly marked "TBD") risks
  being mistaken for real data later — leave it genuinely empty.
- **Every `CONFIRMED` row requires provenance.** No exceptions, no "obviously correct" shortcut.

## What this guide does NOT do

- It does not write to `private/floor1-asset-mapping.json` — that remains a separate,
  evidence-reviewed, out-of-band data-operations step (`docs/evidence/
  FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md`'s own §8).
- It does not change 0/431 — that number moves only when real `CONFIRMED` rows exist and are
  loaded, never by editing a template.
- It does not touch any application code, database, nginx, or Grafana configuration.
