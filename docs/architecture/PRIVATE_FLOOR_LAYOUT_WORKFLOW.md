# Private Floor Layout Workflow

## Why the plan stays local

Factory drawings, machine identities and surveyed coordinates may be company
confidential. They must not be committed to this public repository. The 3D
twin therefore separates the application contract from the real placement
payload:

- committed: schema, synthetic example, renderer, status adapters and tests;
- local only: the real floor image, asset register and calibrated coordinates.

The repository ignores `services/factory-twin-3d/private/`,
`*.floor-layout.local.json` and `docker-compose.private-layout.yaml`.

## Local setup

1. Copy `services/factory-twin-3d/config/floor-layout.example.json` to
   `services/factory-twin-3d/private/apex3-floor1.floor-layout.local.json`.
2. Enter approved zones and assets using normalized local coordinates.
3. Keep `verification_status` as `DRAFT` until Facilities or the layout owner
   confirms the placement. Only an approved layout may remove the warning.
4. Start Compose with the untracked override:

   ```powershell
   docker compose -f docker-compose.yaml -f docker-compose.private-layout.yaml up -d --build factory-twin-3d proxy
   ```

No floorplan image is uploaded by this workflow.

## Asset state binding

Each machine declares one state binding:

- `{ "type": "ldi", "source_id": "LDI-01" }` uses the existing read-only LDI
  adapter. Its boolean state can currently distinguish only provisional Run,
  Idle and Undefine.
- `{ "type": "unbound", "source_id": null }` is displayed as `Undefine` and
  has no drill-down. This is the required representation for non-LDI assets
  until a real DB/API source is connected.

The six operational states are `Off`, `Down`, `Idle`, `Initial,PM,Stop`, `Run`
and `Undefine`. Alarm lifecycle is a separate red outline/badge and never
changes an operational state to Down by itself.

`GET /api/state` exposes the canonical string in `operational_state`. The
numeric `state` field is retained only for backward compatibility with the
old 0..3 renderer contract and must not be used as the new operating-state
definition.

CI runs `tests/lint/private-layout-leak-linter.js`, which rejects tracked
private-layout files and any raster/PDF/CAD material inside the twin service.
Run the same command locally before every commit because CI cannot remove a
file that has already been pushed to a public repository.

## Remaining production inputs

Before this can be called a complete Apex 3 Floor 1 twin, the owner must
provide or locally enter:

1. the authoritative asset register for every visible machine;
2. approved coordinates, footprint and rotation;
3. a state source and source ID per asset;
4. trigger/reset definitions for all six operational states;
5. the approved priority rule when multiple source states share a timestamp.

Screenshots alone are sufficient for drafting zone boundaries, but not for
claiming a complete or production-accurate machine inventory.
