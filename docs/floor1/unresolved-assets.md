# Floor 1 — Unresolved-Footprint Assets

76 of 431 Factory Twin assets (18%) have `footprint_status: UNRESOLVED` — no measurable CAD
footprint, rendered as a small marker in the Twin rather than a sized box (an established,
tested rendering behavior since Step 5B, `docs/evidence/FLOOR1_SPATIAL_RECONCILIATION.md`'s own
`EXPECTED_ABSTRACTION` classification — not an error). Listed here because these 76 need
DIFFERENT handling during data collection: a surveyor cannot be told "look for a machine
occupying this exact footprint," only "look for whatever occupies this position" — the CAD
position is still real and authoritative, the extent is simply not measurable from the drawing.

## Real, measured this step

```
total unresolved:            76 of 431
unresolved AND OUTSIDE_ROOM:  11
```

Zone distribution (`zone_id`, CAD functional zone):

| Zone | Count |
|---|---|
| `FZ-F1-0036` | 52 |
| (no zone — `OUTSIDE_ROOM`) | 11 |
| `FZ-F1-0011` | 7 |
| `FZ-F1-0014` | 2 |
| `FZ-F1-0002` | 1 |
| `FZ-F1-0005` | 1 |
| `FZ-F1-0007` | 1 |
| `FZ-F1-0034` | 1 |

`FZ-F1-0036` alone accounts for 68% of all unresolved assets — a real, measured concentration
worth a site team's attention: this single CAD functional zone is disproportionately affected,
which may indicate a specific area of the drawing (or a specific equipment type/CAD block
style used there) that consistently lacks measurable extent, not 52 independent coincidences.

## Full list — real, live, not sampled

`asset_id | zone | position (x, z) | zone_status`

| Asset | Zone | Position (x, z) | Zone status |
|---|---|---|---|
| EQP-F1-0002 | FZ-F1-0014 | 79.05, -46.92 | CROSSES_ROOM_BOUNDARY |
| EQP-F1-0019 | FZ-F1-0011 | 64.4, -49.97 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0020 | FZ-F1-0011 | 67.32, -49.97 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0025 | — | 72.79, -45.19 | OUTSIDE_ROOM |
| EQP-F1-0042 | FZ-F1-0011 | 81.55, -54.02 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0043 | FZ-F1-0011 | 75.75, -54.02 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0044 | FZ-F1-0011 | 69.95, -54.02 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0063 | FZ-F1-0036 | 54.55, 7.74 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0064 | FZ-F1-0036 | 54.55, 4.94 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0065 | FZ-F1-0036 | 54.55, 5 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0066 | FZ-F1-0036 | 54.55, 2.36 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0067 | FZ-F1-0036 | 54.55, 2.42 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0068 | FZ-F1-0036 | 48.12, 16.47 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0069 | FZ-F1-0036 | 54.22, 16.48 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0070 | FZ-F1-0036 | 48.12, 11.15 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0071 | FZ-F1-0002 | 21.97, -36.49 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0072 | FZ-F1-0036 | 54.22, 11.14 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0073 | FZ-F1-0036 | 48.12, 13.21 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0074 | FZ-F1-0036 | 54.22, 13.22 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0078 | FZ-F1-0036 | 58.68, 7.74 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0079 | FZ-F1-0036 | 58.68, 4.94 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0080 | FZ-F1-0036 | 58.68, 5 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0081 | FZ-F1-0036 | 58.68, 2.36 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0082 | FZ-F1-0036 | 58.68, 2.42 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0083 | FZ-F1-0036 | 65.11, 16.47 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0084 | FZ-F1-0036 | 59.01, 16.48 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0085 | FZ-F1-0036 | 65.11, 11.15 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0086 | FZ-F1-0036 | 59.01, 11.14 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0087 | FZ-F1-0036 | 65.11, 13.21 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0088 | FZ-F1-0036 | 59.01, 13.22 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0093 | FZ-F1-0036 | 49.48, 7.74 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0094 | FZ-F1-0036 | 49.48, 4.94 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0095 | FZ-F1-0036 | 49.48, 5 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0096 | FZ-F1-0036 | 49.48, 2.36 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0097 | FZ-F1-0036 | 49.48, 2.42 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0098 | FZ-F1-0036 | 55.91, 16.47 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0099 | FZ-F1-0036 | 49.81, 16.48 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0100 | FZ-F1-0036 | 55.91, 11.15 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0101 | FZ-F1-0014 | 82.06, -36.49 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0102 | FZ-F1-0036 | 49.81, 11.14 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0103 | FZ-F1-0036 | 55.91, 13.21 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0104 | FZ-F1-0036 | 49.81, 13.22 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0153 | — | 69.2, 34.98 | OUTSIDE_ROOM |
| EQP-F1-0154 | — | 78.05, 34.98 | OUTSIDE_ROOM |
| EQP-F1-0155 | — | 87.05, 34.98 | OUTSIDE_ROOM |
| EQP-F1-0156 | — | 63.78, 59.95 | OUTSIDE_ROOM |
| EQP-F1-0157 | — | 63.78, 51.45 | OUTSIDE_ROOM |
| EQP-F1-0158 | — | 63.78, 41.45 | OUTSIDE_ROOM |
| EQP-F1-0159 | — | 63.78, 34.98 | OUTSIDE_ROOM |
| EQP-F1-0165 | FZ-F1-0011 | 58.47, -49.97 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0170 | FZ-F1-0011 | 56.78, -54.02 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0285 | FZ-F1-0005 | 47.55, -23.31 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0286 | FZ-F1-0036 | 72.08, 7.74 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0287 | FZ-F1-0036 | 72.08, 4.94 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0288 | FZ-F1-0036 | 72.08, 5 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0289 | FZ-F1-0036 | 72.08, 2.36 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0290 | FZ-F1-0036 | 72.08, 2.42 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0291 | — | 78.51, 16.47 | OUTSIDE_ROOM |
| EQP-F1-0292 | FZ-F1-0036 | 72.41, 16.48 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0293 | — | 78.51, 11.15 | OUTSIDE_ROOM |
| EQP-F1-0294 | FZ-F1-0036 | 72.41, 11.14 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0295 | — | 78.51, 13.21 | OUTSIDE_ROOM |
| EQP-F1-0296 | FZ-F1-0036 | 72.41, 13.22 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0306 | FZ-F1-0034 | 36.42, 21.84 | CROSSES_ROOM_BOUNDARY |
| EQP-F1-0312 | FZ-F1-0036 | 65.63, 7.58 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0313 | FZ-F1-0036 | 65.63, 4.79 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0314 | FZ-F1-0036 | 65.63, 4.85 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0315 | FZ-F1-0036 | 65.63, 2.21 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0316 | FZ-F1-0036 | 65.63, 2.27 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0317 | FZ-F1-0036 | 59.2, 16.32 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0318 | FZ-F1-0036 | 65.3, 16.33 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0319 | FZ-F1-0036 | 59.2, 11 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0320 | FZ-F1-0007 | 33.05, -36.64 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0321 | FZ-F1-0036 | 65.3, 10.99 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0322 | FZ-F1-0036 | 59.2, 13.06 | ROOM_BY_CENTRE_ONLY |
| EQP-F1-0323 | FZ-F1-0036 | 65.3, 13.07 | ROOM_BY_CENTRE_ONLY |

## Handling guidance for data collection

- Position (x, z) is CAD-authoritative and real — use it to locate the general area, not as a
  guarantee of exact machine boundaries.
- `OUTSIDE_ROOM` entries (11 of 76) have no CAD room polygon at all — treat as "somewhere near
  this coordinate, outside any drawn room," not as evidence of misplacement (Step 7's own
  `MODEL_REPRESENTATION` finding).
- Do not infer identity, equipment type, or footprint size from a neighboring resolved asset —
  each of these 76 is its own asset, evaluated independently, same rule as every other asset in
  `docs/floor1/floor1-data-collection-guide.md`.
- Regenerate this list at any time against the live deployment:
  `curl -s http://<host>/api/floor-geometry | jq '.equipment[] | select(.duplicate_of == null and .footprint_status == "UNRESOLVED") | .id'`
