# ฐานข้อมูลเปรียบเทียบการถดถอยของ UI และ Layout (Visual Baseline)

ชุดข้อมูลเปรียบเทียบมาตรฐานสำหรับ `tests/playwright/ui-visual-regression.js` (ข้อค้นพบจากการตรวจสอบ **F-8**)

## สิ่งที่บรรจุอยู่ในนี้

`<page>.<viewport>.<state>.layout.json` — **ข้อตกลงการถดถอยที่ตรวจ diff ได้**: สำหรับแต่ละสถานะที่บันทึก ประกอบด้วยค่า design token ของ `:root`, สไตล์ที่คำนวณแล้ว (computed style), ขอบเขต client rect สำหรับตัวเลือก chrome ที่กำหนด และแฟล็กการล้นในแนวนอน (horizontal overflow) ค่าเหล่านี้มีความแน่นอน (deterministic) และไม่ขึ้นกับเครื่องโฮสต์ เมื่อมีการปรับโครงสร้าง CSS ไฟล์นี้จะตรวจจับและยืนยันความถูกต้อง

ไฟล์ภาพ PNG (`<tag>.chrome.png` สำหรับส่วน UI ที่ไม่ใช่ canvas, `<tag>.full.png` สำหรับภาพเต็มเฟรม) จะถูกเขียนลงในโฟลเดอร์ `tests/playwright/screenshots/ui-visual/` และถูก **gitignored** ไว้ — เนื่องจากไฟล์ภาพขึ้นอยู่กับสภาพแวดล้อมฮาร์ดแวร์ (GPU rasterisation) และมีขนาดใหญ่ ภาพส่วน chrome จะถูกตรวจวัด pixel-diff โดยมีค่า tolerance ที่ยอมรับได้ ส่วนภาพเต็มเฟรมมีไว้สำหรับให้มนุษย์ตรวจสอบด้วยสายตาเท่านั้น

## เมทริกซ์การบันทึกภาพ (Capture matrix)

| | |
|---|---|
| เบราว์เซอร์ | Chromium (มาพร้อม Playwright), headless, `deviceScaleFactor: 1` |
| ขนาดหน้าจอ (Viewports) | 1366×768, 1920×1080, 2560×1440, 3840×2160 |
| สถานะ EAP | `production` (ปิดจำลอง, REAL/UNAVAILABLE), `demo` (เปิดจำลอง — คงที่ตาม `cell_id`), `selected` (เลือกเซลล์แรก), `drawer` (เปิด drawer โซนแรก), `webgl-lost` (จำลองการสูญเสีย WebGL context) |
| สถานะ Twin | `default`, `drawer` (ผ่าน `#drawer-toggle`, รอพ้นระยะ transition 140ms), `webgl-lost` |

## พื้นที่แบบไดนามิกที่ยกเว้นจากข้อตกลง JSON

- ทุกแท็ก `<canvas>` — ไม่รวมอยู่ในคลิปส่วน chrome; ไม่มีการ assert พิกเซลของ WebGL
- `#status-strip`, `.ss-cell`, `#factory-status`, `.fs-cell` ของ Twin — **ตัด rect ออก** (`"rect": "live-data"`); ขนาดจะเปลี่ยนตามจำนวนหลักของข้อมูลสดและแถวอุปกรณ์ แต่สไตล์ที่คำนวณแล้ว (*style*) ยังคงถูก assert
- rect ของ `body` / `#stage` — อิงตาม viewport จึงตัดออก

## การใช้งาน (Usage)

```bash
# ทดสอบกับคอนเทนเนอร์ factory-twin-3d ที่ให้บริการ public/ ที่พอร์ต :4199
EAP_URL=http://127.0.0.1:4199/ TWIN_DIRECT_URL=http://127.0.0.1:4199/ \
  node tests/playwright/ui-visual-regression.js            # เปรียบเทียบ, คืนค่า 1 หากมีการเบี่ยงเบน
EAP_URL=... TWIN_DIRECT_URL=... \
  node tests/playwright/ui-visual-regression.js --update    # อัปเดตข้อมูลเปรียบเทียบชุดนี้

# หากไม่ระบุ URL ทั้งสอง: จะข้ามการทำงาน (SKIP, คืนค่า 0)
```

อัปเดตข้อมูลเปรียบเทียบมาตรฐานชุดนี้ **เฉพาะเมื่อ** มีการตั้งใจเปลี่ยนหน้าตาของ UI จริงๆ และระบุไว้ในข้อความคอมมิตเสมอ
