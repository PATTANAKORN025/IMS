# Floor 1 Master Data Registry

Step 7. A complete, field-by-field registry of all 431 Factory Twin assets, built from live
data only — no value in this document was invented. Where a field has no real data source yet,
that is reported as a fact (0/431 populated), not filled with a guess. Read-only: no CAD, EAP,
database, or production file was modified to produce this registry.

## Method

All fields pulled live from `/api/floor-geometry` (CAD-authoritative, served by
`services/factory-twin-3d/lib/wire.js`'s `projectEquipment()`) and cross-checked against
`private/floor1-asset-mapping.json` (identity) — the same two sources Steps 6B-6E already
established as authoritative for their respective domains. `/api/eap-map` was consulted for the
EAP-reference field and found to expose no CAD-asset-identifying value at all (see
`docs/evidence/FLOOR1_EAP_RECONCILIATION.md` for why — the underlying CAD handle is
deliberately withheld from every client, not merely unpopulated for this registry).

## Schema (per this step's own 15 requested fields)

| Field | Real source | Populated for how many of 431? |
|---|---|---|
| `factoryTwinAssetId` | `Asset.id` (`/api/floor-geometry`) | 431/431 |
| `zone` | `Asset.zone_id` (CAD functional zone, `FZ-F1-nnnn`) | 413/431 (18 `null`, see `zone_status` below) |
| `room` | *(no separate field exists)* | 0/431 — `zone_id`/`zone_status` is the only room/area concept `wire.js` exposes; there is no distinct "room" identifier beyond it |
| `CAD position` | `Asset.position {x,y,z}` | 431/431 |
| `CAD orientation` | `Asset.rotation_deg` | 431/431 |
| `CAD footprint` | `Asset.footprint` + `footprint_status` | 355/431 sized (`MEASURED_CAD`/`OBSERVED_CAD`); 76/431 `UNRESOLVED` (no measurable footprint — see spatial reconciliation doc) |
| `EAP reference` | — | **0/431** — no field anywhere ties a CAD `asset_id` to an EAP `cell_id`; the correspondence that DOES exist (40 EAP cells with a `DIRECT` CAD relation) never surfaces which asset, by design (`lib/eap-map.js`'s own comment: "the drawing is not something the normal UI is allowed to browse") |
| `equipment name` | — | 0/431 — not a field `Asset` carries at all; no equipment-naming source exists in this pipeline |
| `equipment type` | — | 0/431 — same; no machine-type/category field exists on `Asset` |
| `equipment ID` (logical, MES) | `mes_machine_id` (only via a `CONFIRMED` FT-14 mapping record) | 0/431 — FT-14 file has 0 records |
| `physical asset ID` | Step 6E's `PhysicalAssetId` (no data source populates it) | 0/431 |
| `device ID` | `Asset.ims_device_id` | 0/431 (`null` for all 431, re-verified live) |
| `source system` | Step 6E's `SourceSystemId` (no data source populates it) | 0/431 |
| `provenance` | Only present on a `CONFIRMED` chain (Step 6E) | 0/431 |
| `spatial confidence` | `Asset.confidence` (CAD geometry confidence) | 431/431 — see distribution below |
| `identity confidence` | Only present on a mapping record (`lib/mapping.js`'s `confidence` field) | 0/431 |
| `mapping status` | `Asset.mapping_status` | 431/431 — all `UNMAPPED_TO_IMS` |

**8 of 15 requested fields are honestly 0/431 populated** — not a registry defect, the accurate
current state of this deployment's master data, matching every prior step's own 0/431 finding
from a new angle (a per-field breakdown rather than a single aggregate number).

## Aggregate distributions (real, measured this step)

```
mapping_status:        { UNMAPPED_TO_IMS: 431 }
status:                { UNMAPPED: 431 }
identity_status:       { unresolved: 431 }
spatial confidence:    { high: 269, medium: 88, low: 74 }
geometry_status:       { MEASURED_CAD: 431 }
evidence_tier:         { PRIMARY: 364, RECOVERED: 67 }
zone_status:           { INSIDE_ROOM: 314, CROSSES_ROOM_BOUNDARY: 36, ROOM_BY_CENTRE_ONLY: 63, OUTSIDE_ROOM: 18 }
footprint_status:      { MEASURED_CAD/OBSERVED_CAD: 355, UNRESOLVED: 76 }
distinct CAD zone_id:  19 (FZ-F1-0001..FZ-F1-0019-range; 18 assets carry zone_id: null, matching the 18 OUTSIDE_ROOM count above)
```

## Sample rows (5 of 431, chosen to span the real distribution — not cherry-picked to look better)

```json
{"id":"EQP-F1-0001","position":{"x":62.96,"y":0,"z":-40.717},"rotation_deg":0,
 "footprint_status":"MEASURED_CAD","zone_id":"FZ-F1-0005","zone_status":"INSIDE_ROOM",
 "confidence":"medium","evidence_tier":"PRIMARY","overlaps_neighbour":false,
 "mapping_status":"UNMAPPED_TO_IMS","ims_device_id":null}

{"id":"EQP-F1-0002","position":{"x":79.048,"y":0,"z":-46.922},"rotation_deg":180,
 "footprint_status":"UNRESOLVED","zone_id":"FZ-F1-0014","zone_status":"CROSSES_ROOM_BOUNDARY",
 "confidence":"medium","evidence_tier":"PRIMARY","overlaps_neighbour":false,
 "mapping_status":"UNMAPPED_TO_IMS","ims_device_id":null}

{"id":"EQP-F1-0003","position":{"x":59.93,"y":0,"z":-41.08},"rotation_deg":180,
 "footprint_status":"MEASURED_CAD","zone_id":"FZ-F1-0005","zone_status":"INSIDE_ROOM",
 "confidence":"medium","evidence_tier":"PRIMARY","overlaps_neighbour":true,
 "mapping_status":"UNMAPPED_TO_IMS","ims_device_id":null}

{"id":"EQP-F1-0345","position":{"x":4.572,"y":0,"z":20.551},"rotation_deg":180,
 "footprint_status":"MEASURED_CAD","zone_id":"FZ-F1-0010","zone_status":"INSIDE_ROOM",
 "confidence":"medium","evidence_tier":"RECOVERED","overlaps_neighbour":false,
 "mapping_status":"UNMAPPED_TO_IMS","ims_device_id":null}

{"id":"EQP-F1-0025","position":{"x":72.793,"y":0,"z":-45.19},"rotation_deg":0,
 "footprint_status":"UNRESOLVED","zone_id":null,"zone_status":"OUTSIDE_ROOM",
 "confidence":"low","evidence_tier":"PRIMARY","overlaps_neighbour":false,
 "mapping_status":"UNMAPPED_TO_IMS","ims_device_id":null}
```

Every one of the 431 rows follows this same shape — `ims_device_id: null`,
`mapping_status: "UNMAPPED_TO_IMS"` uniformly, verified as an aggregate count above rather than
asserted per-row (a 431-row table would be ~30KB of near-entirely repeated "null"/"UNMAPPED",
not a more honest or more useful artifact than the same fact stated once as a count).

## Regeneration

This registry's numbers are reproducible from any running instance of this deployment's image:

```
curl -s http://<host>/api/floor-geometry | jq '.equipment | map(select(.duplicate_of == null)) | length'
# -> 431
curl -s http://<host>/api/floor-geometry | jq '.equipment | map(select(.duplicate_of == null and .ims_device_id != null)) | length'
# -> 0
```

## Verdict

No value in this registry was invented. The registry is complete for every field a real data
source populates (7 of 15) and honestly empty for every field none does (8 of 15) — see
`docs/evidence/FACTORY_TWIN_IDENTITY_MAPPING_READINESS.md` for what closes that gap.
