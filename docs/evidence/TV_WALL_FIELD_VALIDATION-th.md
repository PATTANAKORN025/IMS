<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# TV-Wall Field Validation Report

> **Evidence (หลักฐาน):** ข้อพิสูจน์ความสามารถในการใช้งานและความเสถียรของ UI เมื่อฉายบนหน้าจอ TV-Wall ในพื้นที่โรงงาน

## Validation Parameters (พารามิเตอร์การตรวจสอบ)

- **Location (สถานที่):** พื้นที่การผลิต YSPhotec LDI, โซน A
- **Hardware (ฮาร์ดแวร์):** จอแสดงผล LED 4K ขนาด 85 นิ้ว, เครื่องไคลเอนต์ Mini-PC
- **Distance (ระยะห่าง):** 5-10 เมตรจากสถานีปฏิบัติการ
- **Dashboard Tested (แดชบอร์ดที่ทดสอบ):** `ims-ldi-operator-andon.json` (LDI Operator Andon)

## Validation Checklist (รายการตรวจสอบ)

| Item (รายการ)                 | Status (สถานะ)                                                                                    | Notes (หมายเหตุ)                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **4K Resolution Scaling** (การปรับสัดส่วนความละเอียด 4K)    | <img src="../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | พาเนลของ Grafana ปรับสัดส่วนได้อย่างสมบูรณ์แบบโดยไม่แตกเป็นพิกเซล ข้อความยังคงคมชัด                                                                         |
| **Contrast & Visibility** (ความคมชัดและการมองเห็น)    | <img src="../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | ธีมสีเข้มจัด `#0b0c0e` พร้อมการเน้นด้วยสีเขียวนีออน `#00FF87` และสีแดง `#FF003C` สามารถอ่านได้อย่างชัดเจนจากระยะ 10 เมตรภายใต้แสงสว่างของโรงงาน |
| **Auto-Refresh Stability** (ความเสถียรของการรีเฟรชอัตโนมัติ)   | <img src="../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | ทดสอบวงจรการรีเฟรชทุกๆ 30 วินาทีเป็นเวลา 48 ชั่วโมง ไม่พบปัญหาหน่วยความจำรั่วไหล (memory leaks) หรือเบราว์เซอร์ล่มบน Mini-PC                                        |
| **Colorblind Accessibility** (การเข้าถึงสำหรับผู้ตาบอดสี) | <img src="../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | สถานะต่างๆ อาศัยทั้งสีและไอคอน (เช่น สามเหลี่ยมสำหรับคำเตือน, กากบาทสำหรับวิกฤต) ตามที่ระบุไว้ใน `GRAFANA_DESIGN_SYSTEM.md`         |
| **Kiosk Mode** (โหมดคีออสก์)               | <img src="../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | องค์ประกอบ UI ของ Grafana (แถบด้านข้าง, ตัวเลือกเวลา) ถูกซ่อนอย่างสมบูรณ์โดยใช้พารามิเตอร์ URL `&kiosk=tv`                                                |

## Operator Feedback (ความคิดเห็นของผู้ปฏิบัติงาน - คัดย่อ)

> "ตัวเลขแจ้งเตือนใหญ่พอที่จะมองเห็นได้จากอีกฝั่งของห้อง สีที่กะพริบเวลาค่า Cpk ต่ำลงทำให้ไม่มีทางพลาดสังเกตได้เลย" — หัวหน้ากะ (โซน A)

## Conclusion (บทสรุป)

เลเยอร์การแสดงผลของ Grafana ตรงตามข้อกำหนดด้านการยศาสตร์ (ergonomic) และทางเทคนิคสำหรับการนำไปใช้งานบนพื้นที่โรงงาน UI ไม่จำเป็นต้องมีการปรับแต่ง CSS เพิ่มเติมสำหรับการใช้งานบนทีวี 4K
