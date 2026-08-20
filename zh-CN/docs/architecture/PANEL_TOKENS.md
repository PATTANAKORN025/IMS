<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Panel Design Tokens

本文件定义了所有 IMS 仪表板中关键指标的标准单位、范围和阈值，以防止出现样式偏差。这些令牌由仪表板 linter 强制执行。

## Temperature

- **Metric Match**: `temp`（在标题或面板字段中不区分大小写）
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

- **Metric Match**: `humid`（在标题或面板字段中不区分大小写）
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

`"lengthum"` **不是**一个有效的 Grafana 单位 ID — Grafana 无法解析它，因此它
会作为字面上的后缀文本（`"lengthum"`）呈现在数字旁边，而不是被
解释。它绝不能作为 `unit` 的值出现；linter 在所有地方都禁止使用它。
对于这个指标系列，没有单一的正确单位 — 请选择一个
与面板实际显示相匹配的单位：

- **Position Error (PE1-PE6, MAX|PE|, PE Std Dev, PE Histogram)**: `suffix: µm`
- **Judgment Error (JE1-JE4, MAX|JE|)**: `suffix: µm`
- **Resist Dosage**: `suffix: mJ/cm²`
- **air_vacuum**: `suffix: kPa`
- **Cp / Cpk / Sigma Level / scale_x / scale_y (dimensionless ratios)**: `none`
- **Coverage / completeness percentages**: `percent`

## Z-Score

- **Metric Match**: `z-score`（不区分大小写）— 在匹配 Temperature/Humidity _之前_
  进行检查，因为一个名为例如 "Temperature Z-Score Anomaly" 的面板是一个
  Z-Score，而不是原始温度读数，绝不能继承 Temperature
  令牌的 `celsius`/`18-28` 范围。
- **Unit**: `none`
- **Decimals**: `2`
- **Thresholds**:
- `Green`: `< 2`
- `Amber`: `2`
- `Red`: `> 3`
