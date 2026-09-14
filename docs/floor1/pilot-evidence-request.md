# Floor 1 Pilot Evidence Request

For the factory/data owner. NOT a dataset — no identity values below are
filled in, because none exist in this repository yet
(`docs/floor1/evidence-source-audit.md`, Phase 9A). This is the exact list
of what to provide, per pilot asset, so a real mapping can be reviewed and
promoted to `CONFIRMED` per `docs/floor1/evidence-intake-contract.md`.

## What each of these 10 CAD positions is, today

Each row below is a Factory Twin CAD position (`FactoryTwinAssetId`) with a
real, measured floor zone (`zone`, from `docs/floor1/pilot-evidence-matrix.csv`).
That is all this repository currently knows about it. Nothing else — no
equipment name, vendor, model, or device — is known, guessed, or should be
assumed.

| FactoryTwinAssetId | Zone |
|---|---|
| EQP-F1-0030 | FZ-F1-0004 |
| EQP-F1-0062 | FZ-F1-0016 |
| EQP-F1-0075 | FZ-F1-0036 |
| EQP-F1-0076 | FZ-F1-0036 |
| EQP-F1-0077 | FZ-F1-0036 |
| EQP-F1-0092 | FZ-F1-0016 |
| EQP-F1-0108 | FZ-F1-0016 |
| EQP-F1-0109 | FZ-F1-0006 |
| EQP-F1-0124 | FZ-F1-0003 |
| EQP-F1-0125 | FZ-F1-0003 |

## What to provide, per asset

For EACH of the 10 `FactoryTwinAssetId` values above, provide as many of
the following 17 items as your real records actually support. An item left
blank stays blank — do not fill it with a guess, a zone name, or a CAD
label standing in for a real identity value.

1. `FactoryTwinAssetId` (already given above — confirm which physical/logical
   equipment, if any, occupies this exact CAD position)
2. Equipment tag / `EquipmentId` (the logical unit id in your MES, if one exists)
3. Physical asset ID / fixed asset ID (`PhysicalAssetId` — the specific
   physical unit installed at this position TODAY; distinct from the
   equipment tag because a physical unit can be swapped without changing
   the logical equipment)
4. Device / PLC / SCADA tag (`DeviceId`), if this position reports into a
   monitoring or control system
5. MES equipment code, if applicable
6. CMMS/EAM asset code, if applicable
7. Vendor
8. Manufacturer
9. Model
10. Serial number
11. Source system (which real system this evidence comes from — named
    explicitly, e.g. "SAP PM", "Ignition SCADA export", never "site visit"
    with nothing retrievable)
12. Source record / reference (the specific row, document, ticket, or
    export filename within that source system, re-checkable later)
13. Evidence type — one of: `DIRECT_SYSTEM_RECORD`, `NAMEPLATE_PHOTO`,
    `PLC_SCADA_TAG_RECORD`, `MES_RECORD`, `CMMS_EAM_RECORD`,
    `VENDOR_REGISTRY`, `SITE_SURVEY`, `ENGINEERING_DOCUMENT`
14. Evidence location — where the evidence itself can be found or
    re-checked (file path, photo location, system query)
15. Reviewer (`verified_by`) — a real name or a named, real approval process
16. Verification date (`verified_at`) — the actual date/time you verified
    this, not a file's own creation date
17. Notes on conflicts — if you are aware of ANY other record, system, or
    person that disagrees with this identity claim for this position, say
    so here. A disclosed conflict is far more useful than a confident
    single answer that turns out to be wrong.

## Rules — read before submitting

- **CAD coordinates are NOT identity evidence.** Where the drawing places
  this asset says nothing about which real equipment sits there.
- **EAP location is NOT identity evidence.** Cell/zone association is
  spatial context, not a machine identity claim.
- **Nearest-machine matching is NOT acceptable.** "It's probably the one
  closest to X" is a guess, not evidence, no matter how confident.
- **Naming similarity is NOT sufficient.** A device or tag that merely
  sounds like this CAD zone's label does not establish identity.
- **Screenshots and photos must retain traceability.** A photo with no
  note of where/when it was taken, or which system generated it, cannot be
  verified later and will not be promoted.
- **Every promoted identity must be reviewable later.** If a reviewer five
  years from now cannot find the underlying record from what you provide,
  it is not usable as evidence, regardless of how confident it is.
- **Partial is fine. Guessed is not.** If you can confirm the `EquipmentId`
  but not the `PhysicalAssetId` or `DeviceId`, say exactly that — a partial,
  honest answer is recorded as real evidence
  (`docs/floor1/evidence-intake-contract.md` §3). A complete-looking answer
  built from assumption is worse than no answer at all — it will be
  rejected once discovered, and discovered rejections cost more reviewer
  time than an honest blank.

## What happens after you submit

Each field above maps directly onto `docs/floor1/evidence-intake-contract.md`'s
own evidence-record shape and is run through
`services/factory-twin-3d/lib/floor1-evidence-validator.js` — a pure,
deterministic check, not a subjective call. A record with a full identity
chain (`EquipmentId` + `PhysicalAssetId` + `DeviceId`), a named source,
provenance, reviewer and verification date, and no conflict, becomes
eligible for `CONFIRMED`. Anything less honestly becomes `CANDIDATE` — real,
recorded, useful, but not yet promoted. Nothing is promoted automatically;
a human review step follows, per
`docs/evidence/FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md` §6.
