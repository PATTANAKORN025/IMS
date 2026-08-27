# Floor 1 Provisional Logical Layout

## Purpose

The Factory 3D Digital Twin can use either the original enabled-LDI logical
fallback or an ignored local placement contract. The local contract is the
only appropriate path for a confidential Apex 3 floor plan. The view is
intended for rapid status recognition and asset drill-down; it is not a
surveyed physical floor plan until its verification status is `APPROVED`.

## Data truth boundary

| Displayed item | Source | Truth status |
|---|---|---|
| Enabled machine list | `public.devices` (`device_type = 'ldi'`) | Database-backed |
| Group / zone name | `public.devices.location` | Database-backed label |
| Machine state, board progress, MO and alarm context | Existing `/api/state` query | Database-backed |
| Floor name | Application or local private layout metadata | Must expose verification status |
| Zone and machine coordinates | Logical fallback or ignored local JSON | Draft until owner-approved |
| Non-LDI machine state | Configured per-asset adapter | `Undefine` while unbound; never mocked |

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

## Interaction

- Clicking a machine box or its accessible HUD row opens Machine Snapshot.
- Alarmed machines carry the existing `log_id`, event timestamp and clicked
  machine context into the drill-down.
- `Reset view` restores the camera framing calculated from the current layout
  bounds, so newly registered devices remain visible without hardcoded camera
  coordinates.

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
rows, the 10-machine/five-zone reference set, and collision-free expansion to
23 machines.
