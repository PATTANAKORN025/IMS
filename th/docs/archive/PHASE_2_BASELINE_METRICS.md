<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# ข้อมูลพื้นฐานระยะที่ 2 (ก่อนการออกแบบใหม่), บันทึกเมื่อ 2026-08-04

> **เก็บถาวร — ภาพรวมในอดีต, ลงวันที่ 2026-08-04** ไม่ใช่เอกสารที่มีการปรับปรุงต่อเนื่อง ตัวเลขด้านล่าง (จำนวนแดชบอร์ด, จำนวนการย้ายข้อมูล, จำนวนพาเนล ฯลฯ) สะท้อนถึงระบบตามที่เคยเป็นในวันนั้น และเป็นที่ทราบกันดีว่าล้าสมัยเมื่อเทียบกับระบบปัจจุบัน เก็บไว้เป็นบันทึกทางประวัติศาสตร์ตาม docs/archive/README.md สำหรับข้อมูลปัจจุบัน ดูที่ docs/architecture/ARCHITECTURE.md และ docs/architecture/DASHBOARD_INVENTORY.md

## เวลาในการประมวลผลคำสั่ง (ฝั่งเซิร์ฟเวอร์, ตัวกรองตัวแปรเทมเพลตที่สมจริง, การเลือก "ทั้งหมด")

| พาเนล | เวลาของคำสั่ง |
| ------------------------------------------------------- | ---------- |
| RCA Truth Test (ชุดข้อมูลเต็ม) | 179 ms |
| RCA Fleet Summary (24h) | 108 ms |
| PE Capability Snapshot (เหตุการณ์เดียว) | 103 ms |
| Worst Cpk Fleet (v_machine_spc_fleet) | 53 ms |
| Machine Capability Ranking (CROSS JOIN LATERAL unpivot) | 39 ms |
| Temp/Humidity trend (ldi_data_1m CAGG) | 32 ms |
| PE StdDev by Machine (CROSS JOIN LATERAL unpivot) | 27 ms |
| Scan Speed trend (ldi_data_1m CAGG) | 23 ms |

พาเนลที่สุ่มตัวอย่างทั้ง 8 ตัวใช้เวลาในการประมวลผลคำสั่งฝั่งเซิร์ฟเวอร์น้อยกว่า 300ms แล้ว ค่าสูงสุดคือ RCA Truth Test สำหรับชุดข้อมูลเต็ม (ไม่มีการกรองเวลาตามการออกแบบ) สิ่งที่ไม่ได้วัดในที่นี้คือ เวลาในการเรนเดอร์/วาดของ Grafana เองที่เพิ่มจากเวลาของคำสั่ง (การติดตั้งพาเนล React, การส่งข้อมูลผ่านเครือข่ายไปกลับ) — ซึ่งจะต้องมีการวัดประสิทธิภาพฝั่งเบราว์เซอร์ (Playwright + CDP network timing) เพื่อให้ได้ P95 แบบ end-to-end ที่แท้จริง; ตารางนี้แสดงเฉพาะเวลาของคำสั่งเท่านั้น

## ความพอดีของหน้าจอ (จากการตรวจสอบก่อนหน้า, โหมดคีออสก์, เนื้อหาเต็ม)

| แดชบอร์ด | 1280x720 | 3840x2160 |
| --------------------- | --------------------------------------- | --------------------------------------------------- |
| Operator Andon | ต้องเลื่อน (scrollHeight 1168 เทียบกับ 720) | พอดี (2160=2160) |
| Manufacturing | ต้องเลื่อน (scrollHeight 3191) | ต้องเลื่อน (3151) — เป็นไปตามคาด, แดชบอร์ดที่ต้องเลื่อน |
| Engineering Analytics | ต้องเลื่อน (scrollHeight 4512) | ต้องเลื่อน (4472) — เป็นไปตามคาด |
| Machine Snapshot | ต้องเลื่อน (scrollHeight 2802) | ต้องเลื่อน (2762) — เป็นไปตามคาด |

## ความครอบคลุมของหมวดหมู่การแจ้งเตือน RCA (ก่อนการขยาย)

มีการจัดหมวดหมู่รหัสการแจ้งเตือน 14/20 รายการ (70%) หมวดหมู่: VACUUM, REGISTRATION, ALIGNMENT, ENVIRONMENT, CALIBRATION, MOTION, OPTICS, DATA_QUALITY พาเนลแดชบอร์ด RCA แสดงเพียง 3 หมวดหมู่เท่านั้น (VACUUM, REGISTRATION+ALIGNMENT, ENVIRONMENT) เนื่องจากมีเพียง 3 หมวดหมู่นี้เท่านั้นที่มีการกำหนดค่าแฟล็ก out-of-spec ใน v_ldi_alarm_context
