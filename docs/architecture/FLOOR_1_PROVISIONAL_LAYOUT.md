# Floor 1 Provisional Logical Layout

## Purpose

The Factory Digital Twin provides switchable 2D and 3D views and can use
either the original enabled-LDI logical
fallback or an ignored local placement contract. The local contract is the
only appropriate path for a confidential Apex 3 floor plan. The view is
intended for rapid status recognition and asset drill-down; it is not a
surveyed physical floor plan until its verification status is `APPROVED`.

Both views are projections of the same placement response and six-state status
response. There is no separate 2D register to drift away from the 3D register.
Zone geometry is normalized to polygons before either renderer runs. Legacy
rectangle fields remain accepted only as an input compatibility fallback.

## Data truth boundary

| Displayed item | Source | Truth status |
|---|---|---|
| Enabled machine list | `public.devices` (`device_type = 'ldi'`) | Database-backed |
| Group / zone name | `public.devices.location` | Database-backed label |
| Machine state, board progress, MO and alarm context | Existing `/api/state` query | Database-backed |
| Floor name | Application or local private layout metadata | Must expose verification status |
| Zone and machine coordinates | Logical fallback or ignored local JSON | Draft until owner-approved |
| Non-LDI machine state | Configured per-asset adapter | `Undefine` while unbound in the default `real` mode |
| `DRL054-M` state | Latest `public.machine_event` status ordered by `event_time DESC, id DESC` | Database-backed; 15-minute freshness guard |

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
group and centered on the Floor 1 surface with a 2-unit logical clearance.
At the fitted Floor 1 scale this represents roughly 12–20 screen pixels.
Machines are sorted naturally and placed on a collision-free grid inside their
zone. The same input rows always produce the same coordinates, regardless of
database return order.

The private Floor 1 contract uses separate internal IDs `drilling-west` and
`drilling-east`; both intentionally expose the display label `DRILLING`.
Polygon bounds, not display labels, remain the authoritative layout identity.

Before `/api/placement` can render, geometry validation checks every zone pair,
every machine pair and every machine footprint against its assigned polygon.
Zone overlap, clearance below 1.5 logical units, machine collision or a machine
outside its zone stops the layout from loading. The response also includes a
sanitized `geometry_validation` summary with checked-pair counts and conflicts.

## Six-state operational colors

| State | Color | Meaning |
|---|---|---|
| `Off` | Gray | Authoritative source reports the machine is off |
| `Down` | Red | Authoritative source reports the machine is down |
| `Idle` | Amber | Machine reports idle; the LDI boolean false fallback is provisional |
| `Initial,PM,Stop` | Blue | Source reports initialization, preventive maintenance or stopped mode |
| `Run` | Bright green | Authoritative source reports running |
| `Undefine` | White | Missing, stale, unbound or unmapped source state |

The six names and color families are confirmed from the reference screen.
The exact hex values remain provisional until the original CFM CSS/config is
available for owner validation.

An active Critical/Major alarm is shown as a separate red outline and badge.
It must not overwrite the operational state or be interpreted as proof of
`Down`. `Off`, `Down` and `Initial,PM,Stop` cannot be derived from the current
LDI boolean column and require the owner's trigger/reset contract.

For the DG drilling feed, `RUN` maps to `Run` and `STOP` maps to
`Initial,PM,Stop`. The adapter exposes the last decoded error as historical
reference only. It does not activate the red alarm outline because the supplied
event table has no confirmed alarm clear/reset lifecycle. See
`DG_DRILLING_MACHINE_EVENT_INTEGRATION.md`.

## Safe mock preview mode

Production and the committed Compose default use `MACHINE_STATUS_MODE=real`.
For an isolated local preview only, set `MACHINE_STATUS_MODE=mock` on the
`factory-twin-3d` service. The service then assigns all six operational states
deterministically across the current placement registry, so the 2D and 3D
renderers, legend and responsive layout can be reviewed before the real
machine adapters are available.

Mock mode is deliberately visible and isolated:

- A red `SIMULATED STATUS — NOT PRODUCTION` banner is always shown.
- Every machine row is marked `SIMULATED` with basis
  `mock_preview_deterministic`.
- No mock alarm lifecycle is created; the alarm overlay stays independent.
- No values are written to PostgreSQL, TimescaleDB or an external status API.
- Removing the environment override restores fail-closed `real` behavior,
  where unbound or unavailable sources display `Undefine`.

## Interaction

- `2D` renders an SVG plan from the same zone bounds, machine coordinates and
  dimensions used by `3D`; `?view=2d` is a directly shareable view URL.
- Both renderers use the same polygon points. Zone fill is the bottom layer,
  boundary and label are the middle layer, and machines/status are the top
  layer. Zone labels are anchored inside the polygon's upper-left bounds.
- Clicking a machine box in either view or its accessible HUD row opens Machine
  Snapshot when that asset has a configured source binding.
- Alarmed machines carry the existing `log_id`, event timestamp and clicked
  machine context into the drill-down.
- `Fit 2D` restores the SVG view box and `Reset 3D` restores the camera framing
  calculated from the current layout bounds, so newly registered devices remain
  visible without hardcoded camera coordinates.

## Replacing the provisional layout

When Facilities supplies an approved asset register and coordinates, place
them in the ignored local contract described in
`PRIVATE_FLOOR_LAYOUT_WORKFLOW.md`. Do not commit the drawing, CAD export,
machine register or real coordinate payload to a public repository.

## Verification

The service uses Node's built-in test runner:

```bash
cd services/factory-twin-3d
npm test
```

Tests cover location parsing, deterministic output, separate logical group
rows, the 10-machine/five-zone reference set, polygon clearance, zone overlap,
machine collision/out-of-zone rejection, collision-free expansion to 23
machines, and the opt-in/no-database-write mock status contract.
