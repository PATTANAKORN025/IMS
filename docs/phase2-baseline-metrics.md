# Phase 2 Baseline (pre-redesign), captured 2026-08-04

## Query execution time (server-side, realistic template-var filters, "All" selections)
| Panel | Query time |
|---|---|
| RCA Truth Test (full dataset) | 179 ms |
| RCA Fleet Summary (24h) | 108 ms |
| PE Capability Snapshot (single event) | 103 ms |
| Worst Cpk Fleet (v_machine_spc_fleet) | 53 ms |
| Machine Capability Ranking (CROSS JOIN LATERAL unpivot) | 39 ms |
| Temp/Humidity trend (ldi_data_1m CAGG) | 32 ms |
| PE StdDev by Machine (CROSS JOIN LATERAL unpivot) | 27 ms |
| Scan Speed trend (ldi_data_1m CAGG) | 23 ms |

All 8 sampled panels are under 300ms server-side query time already. Highest is the
full-dataset RCA Truth Test (no time filter by design). Not measured here: Grafana's
own render/paint time on top of the query (React panel mount, network round-trip) —
would need browser-side instrumentation (Playwright + CDP network timing) for a true
end-to-end P95; this table is query time only.

## Viewport fit (from prior audit, kiosk mode, full content)
| Dashboard | 1280x720 | 3840x2160 |
|---|---|---|
| Operator Andon | Needs scroll (scrollHeight 1168 vs 720) | Fits exactly (2160=2160) |
| Manufacturing | Needs scroll (scrollHeight 3191) | Needs scroll (3151) — expected, scrolling dashboard |
| Engineering Analytics | Needs scroll (scrollHeight 4512) | Needs scroll (4472) — expected |
| Machine Snapshot | Needs scroll (scrollHeight 2802) | Needs scroll (2762) — expected |

## RCA alarm-category coverage (before extension)
14/20 alarm codes categorized (70%). Categories: VACUUM, REGISTRATION, ALIGNMENT,
ENVIRONMENT, CALIBRATION, MOTION, OPTICS, DATA_QUALITY. RCA dashboards only surface
3 of these (VACUUM, REGISTRATION+ALIGNMENT, ENVIRONMENT) since only those 3 have a
defined out-of-spec flag in v_ldi_alarm_context.
