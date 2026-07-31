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

## PE / Dosage / Scale (Micrometers)
- **Metric Match**: `pe`, `dosage`, `scale` (case-insensitive)
- **Unit**: `lengthum`
- **Decimals**: `2`
- **Note**: Auto-scales to `mm` if value exceeds 1000µm.

## Z-Score
- **Metric Match**: `z-score` (case-insensitive)
- **Unit**: `none`
- **Decimals**: `2`
- **Thresholds**:
  - `Green`: `< 2`
  - `Amber`: `2`
  - `Red`: `> 3`
