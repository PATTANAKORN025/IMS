<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Panel Design Tokens

ไฟล์นี้กำหนดหน่วย (units), ช่วง (ranges), และเกณฑ์ (thresholds) ที่เป็นมาตรฐานสำหรับเมตริกหลักๆ ในทุกแดชบอร์ดของ IMS เพื่อป้องกันความคลาดเคลื่อนของสไตล์ โทเค็น (tokens) เหล่านี้จะถูกบังคับใช้โดยตัวตรวจสอบ (linter) ของแดชบอร์ด

## Temperature

- **Metric Match**: `temp` (ไม่สนใจตัวพิมพ์เล็ก-ใหญ่ในชื่อหรือฟิลด์ของพาเนล)
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

- **Metric Match**: `humid` (ไม่สนใจตัวพิมพ์เล็ก-ใหญ่ในชื่อหรือฟิลด์ของพาเนล)
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

`"lengthum"` **ไม่ใช่** ID หน่วยของ Grafana ที่ถูกต้อง — Grafana ไม่สามารถแปลงได้ ดังนั้นมันจึง
เรนเดอร์เป็นข้อความต่อท้าย (suffix) ตรงๆ (`"lengthum"`) ถัดจากตัวเลขแทนที่จะถูก
ตีความ ดังนั้นห้ามให้มันปรากฏเป็นค่า `unit` โดยเด็ดขาด; ตัวตรวจสอบ (linter) ไม่อนุญาตให้ใช้
ในทุกๆ ที่ สำหรับกลุ่มเมตริกนี้ไม่มีหน่วยใดหน่วยหนึ่งที่ถูกต้องเพียงหน่วยเดียว — โปรดเลือกหน่วย
ที่ตรงกับสิ่งที่พาเนลแสดงผลอย่างแท้จริง:

- **Position Error (PE1-PE6, MAX|PE|, PE Std Dev, PE Histogram)**: `suffix: µm`
- **Judgment Error (JE1-JE4, MAX|JE|)**: `suffix: µm`
- **Resist Dosage**: `suffix: mJ/cm²`
- **air_vacuum**: `suffix: kPa`
- **Cp / Cpk / Sigma Level / scale_x / scale_y (dimensionless ratios)**: `none`
- **Coverage / completeness percentages**: `percent`

## Z-Score

- **Metric Match**: `z-score` (ไม่สนใจตัวพิมพ์เล็ก-ใหญ่) — จะถูกตรวจสอบ _ก่อน_ การจับคู่ Temperature/
  Humidity เนื่องจากพาเนลที่ชื่อเช่น "Temperature Z-Score Anomaly" จะเป็น
  Z-Score ไม่ใช่การอ่านค่าอุณหภูมิดิบ และจะต้องไม่รับช่วงโทเค็นของ Temperature
  ที่มีหน่วยเป็น `celsius`/ช่วง `18-28` มาใช้
- **Unit**: `none`
- **Decimals**: `2`
- **Thresholds**:
- `Green`: `< 2`
- `Amber`: `2`
- `Red`: `> 3`
