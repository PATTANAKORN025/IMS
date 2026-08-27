# Floor 1 Provisional Logical Layout

## Purpose

The Factory 3D Digital Twin now presents enabled LDI machines on a single
`Floor 1` surface. The view is intended for rapid status recognition and
machine-to-Snapshot navigation. It is not a surveyed physical floor plan.

## Data truth boundary

| Displayed item | Source | Truth status |
|---|---|---|
| Enabled machine list | `public.devices` (`device_type = 'ldi'`) | Database-backed |
| Group / zone name | `public.devices.location` | Database-backed label |
| Machine state, board progress, MO and alarm context | Existing `/api/state` query | Database-backed |
| Floor name | Application metadata (`Floor 1`) | Provisional |
| Zone and machine coordinates | Deterministic layout algorithm | Simulated / provisional |

The application therefore keeps a visible warning banner while any rendered
placement has `is_simulated = true`. Status and placement truth are described
separately in the HUD so a green machine does not imply that its drawn position
has been physically verified.

## Logical arrangement

`services/factory-twin-3d/layout.js` splits a registry location at `" - "`:

- `Site A - Zone 1` becomes group `Site A`, area `Zone 1`.
- `Factory 2 - DF INNER` becomes group `Factory 2`, area `DF INNER`.
- Unknown labels remain visible under an `Other` group instead of being dropped.

Groups are placed on separate rows. Zones are placed left-to-right within each
group and centered on the Floor 1 surface. Machines are sorted naturally and
placed on a collision-free grid inside their zone. The same input rows always
produce the same coordinates, regardless of database return order.

## State colors

| State | Color | Meaning |
|---|---|---|
| `OK` | Green | Reporting and running, no active Critical/Major alarm in the active window |
| `ALARM` | Red | Active Critical/Major alarm |
| `IDLE` | Amber | Reporting but not running |
| `NO_DATA` | Gray | No current or sufficiently fresh telemetry |

The existing read-only state query remains the source of these values. The
layout change does not alter alarm definitions or write lifecycle data.

## Interaction

- Clicking a machine box or its accessible HUD row opens Machine Snapshot.
- Alarmed machines carry the existing `log_id`, event timestamp and clicked
  machine context into the drill-down.
- `Reset view` restores the camera framing calculated from the current layout
  bounds, so newly registered devices remain visible without hardcoded camera
  coordinates.

## Replacing the provisional layout

When Facilities supplies an approved Floor 1 drawing and surveyed machine
coordinates, replace only the placement provider with rows from the planned
`device_3d_placement` contract, set `is_simulated = false`, and record a real
source such as `manual_survey` or `cad_import`. The state endpoint, color rules
and drill-down contract should remain unchanged.

## Verification

The service uses Node's built-in test runner:

```bash
cd services/factory-twin-3d
npm test
```

Tests cover location parsing, deterministic output, separate logical group
rows, the 10-machine/five-zone reference set, and collision-free expansion to
23 machines.
