<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Panel Design Tokens

This file defines the canonical units, ranges, and thresholds for key metrics across all IMS dashboards to prevent style drift. These tokens are enforced by the dashboard linter.

## Temperature

- **Metric Match**: `temp` (case-insensitive in title or panel fields)
- **Unit**: `celsius`
- **Decimals**: `1`
- **Min**: `18`
- **Max**: `28`
- **Thresholds**:
- `Red`: `< 19`
- `Amber`: `19`
- `Green`: `20-24`
- `Amber`: `24`
- `Red`: `> 25`

## Humidity

- **Metric Match**: `humid` (case-insensitive in title or panel fields)
- **Unit**: `humidity`
- **Decimals**: `1`
- **Min**: `40`
- **Max**: `70`
- **Thresholds**:
- `Red`: `< 45`
- `Amber`: `45`
- `Green`: `50-60`
- `Amber`: `60`
- `Red`: `> 65`

## PE / Dosage / Scale

`"lengthum"` is **not** a valid Grafana unit ID — Grafana can't resolve it, so it
renders as literal suffix text (`"lengthum"`) next to the number instead of being
interpreted. It must never appear as a `unit` value; the linter forbids it
everywhere. There is no single correct unit for this metric family — pick the one
that actually matches what the panel displays:

- **Position Error (PE1-PE6, MAX|PE|, PE Std Dev, PE Histogram)**: `suffix: µm`
- **Judgment Error (JE1-JE4, MAX|JE|)**: `suffix: µm`
- **Resist Dosage**: `suffix: mJ/cm²`
- **air_vacuum**: `suffix: kPa`
- **Cp / Cpk / Sigma Level / scale_x / scale_y (dimensionless ratios)**: `none`
- **Coverage / completeness percentages**: `percent`

## Z-Score

- **Metric Match**: `z-score` (case-insensitive) — checked _before_ the Temperature/
  Humidity match, since a panel titled e.g. "Temperature Z-Score Anomaly" is a
  Z-Score, not a raw-temperature readout, and must not inherit the Temperature
  token's `celsius`/`18-28` range.
- **Unit**: `none`
- **Decimals**: `2`
- **Thresholds**:
- `Green`: `< 2`
- `Amber`: `2`
- `Red`: `> 3`
