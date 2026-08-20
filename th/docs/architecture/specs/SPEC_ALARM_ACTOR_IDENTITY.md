<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Spec: Alarm Actor-Identity Verification (ข้อกำหนด: การตรวจสอบตัวตนผู้ดำเนินการจัดการการแจ้งเตือน)

> สถานะ: **เป็นเพียงข้อกำหนดเท่านั้น ยังไม่ได้ดำเนินการ** จัดเตรียมแบบออฟไลน์ในช่วงระหว่างการระงับ Soak Attempt 6 เมื่อวันที่ 2026-08-14 ไม่มีการเปลี่ยนแปลงระบบขณะรันไทม์ในการจัดทำเอกสารนี้

## ปัญหาโดยละเอียด

`services/alarm-api/server.js` เขียนค่า `acknowledged_by`/`resolved_by` ลงใน `public.ldi_alarm_lifecycle` โดยตรงจากส่วนเนื้อหาของคำขอ (request body) ส่วน UI (`ims-ldi-alarm-console.json` ปุ่ม Acknowledge/Resolve) มีการเติมค่าเหล่านี้อย่างถูกต้องโดยใช้ `${__user.login}` -- ซึ่งเป็นตัวแปรเทมเพลตของ Grafana สำหรับผู้ใช้ที่เข้าสู่ระบบ:

```js
fetch('/alarm-api/alarms/ack', {
 method: 'POST',
 body: JSON.stringify({ logdate_ms: {{When_ms}}, logid: '{{logid}}', acknowledged_by: '${__user.login}' })
})
```

ดังนั้นในการใช้งานปกติ การระบุแหล่งที่มาจึงถูกต้องอยู่แล้ว ช่องโหว่คือ: ข้อมูลนี้เป็นสตริง JS ทางฝั่งไคลเอ็นต์ที่แทรกเข้าไปในส่วนเนื้อหาของ fetch -- ซึ่งสามารถแก้ไขได้ในเบราว์เซอร์ devtools ก่อนที่คำขอจะถูกส่ง หรือสามารถจำลองได้อย่างง่ายดายด้วย `curl` โดยใช้ session cookie ของ Grafana ที่ถูกต้องร่วมกับค่า `acknowledged_by` ใดๆ ก็ตาม เซิร์ฟเวอร์ไม่มีวิธีที่จะบอกได้ว่า "UI ได้ส่งชื่อผู้เข้าสู่ระบบที่แท้จริง" หรือ "มีคนพิมพ์ชื่ออื่นลงในคำขอเดียวกัน" คำสั่ง `auth_request` ของ `proxy/nginx.conf` ได้พิสูจน์แล้วว่าผู้เรียกใช้มีเซสชัน Grafana ที่ถูกต้อง -- แต่ปัจจุบันยังไม่มีการส่งต่อข้อมูลว่าเซสชันนั้นเป็นของ *ใคร* ลงไปยัง alarm-api

นี่ **ไม่ใช่** บักของการควบคุมการเข้าถึงที่บกพร่อง (ผู้เรียกที่ไม่ได้ยืนยันตัวตนถูกปฏิเสธที่พร็อกซีแล้ว) แต่เป็นช่องโหว่ด้านความสมบูรณ์ในการระบุแหล่งที่มา: ผู้ปฏิบัติงานที่เข้าสู่ระบบสามารถใส่ชื่อคนอื่นในการรับทราบ/แก้ไข (ack/resolve) ได้ ถูกจัดขอบเขตความสำคัญไว้อย่างถูกต้องในระดับ Medium ไม่ใช่ "Highest" อย่างที่เคยถูกระบุผิดในครั้งแรก -- โปรดดูการแก้ไขที่ `BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md`

## การออกแบบ

ใช้การร้องขอย่อย (subrequest) `auth_request` ที่ nginx ทำงานอยู่แล้ว -- ซึ่งจะเรียกไปที่ `/api/user` ของ Grafana โดยจะส่งคืน `login` ของผู้ใช้ที่เข้าสู่ระบบในรูปแบบ JSON จากนั้นดักจับค่านั้นและส่งต่อไปยัง alarm-api ในรูปแบบของส่วนหัว (header) ที่เชื่อถือได้; ให้ alarm-api เลือกใช้ส่วนหัวมากกว่าฟิลด์ในส่วนเนื้อหา (body)

```text
proxy/nginx.conf, location /auth-check:
 proxy_pass http://grafana:3000/api/user;
 # NEW: capture the response body's "login" field so /alarm-api/
 # can forward it as a header the upstream service can trust.
 auth_request_set $verified_user $upstream_http_x_grafana_user;
 # (requires Grafana's /api/user response to expose login via a
 # header, OR a small Lua/njs snippet to parse the JSON body --
 # see "Open question" below, this is the one design decision
 # this spec does NOT resolve outright)

location /alarm-api/ {
 auth_request /auth-check;
 auth_request_set $verified_user ...;
 proxy_set_header X-Verified-User $verified_user;
 proxy_pass http://alarm-api:4000/;
}
```

```js
// services/alarm-api/server.js, transitionAlarm()
const verifiedUser = req.headers["x-verified-user"];
const claimedActor = req.body[actorField];
if (verifiedUser && claimedActor !== verifiedUser) {
  // Log the mismatch (real signal -- someone tampered with the
  // client, or the two are legitimately different for a reason we
  // don't understand yet). Do NOT silently accept -- and don't
  // silently overwrite either, until we've seen real mismatch
  // traffic and know which case we're actually seeing.
  console.warn(
    `actor mismatch: verified=${verifiedUser} claimed=${claimedActor}`,
  );
}
const actor = verifiedUser || claimedActor; // prefer verified once trusted
```

## คำถามปลายเปิดที่ข้อกำหนดนี้ยังไม่ได้ระบุชัดเจน

`auth_request_set` ของ Nginx สามารถดักจับได้เฉพาะ **header** ของการตอบกลับ ไม่สามารถแยกวิเคราะห์ JSON response **body** (`/api/user` ส่งคืน `{"login": "...", ...}` เป็น JSON ไม่ใช่ส่วนหัว) โดยไม่มีโมดูล njs/Lua มี 2 ทางเลือกที่เป็นไปได้ ซึ่งยังไม่ได้เลือก:

1. เพิ่มสคริปต์ njs (`ngx_http_js_module`) เพื่อแยกวิเคราะห์ส่วนเนื้อหา JSON และตั้งค่าตัวแปรจากนั้น -- มีองค์ประกอบที่ต้องจัดการมากขึ้น แต่ยังคงอยู่ใน nginx
2. ให้ alarm-api เรียกใช้ `/api/user` ของ Grafana ฝั่งเซิร์ฟเวอร์โดยตรง (service-to-service, โดยใช้ session cookie ที่ส่งต่อมา) แทนที่จะเชื่อถือทุกอย่างจาก nginx -- ลดความซับซ้อนใน nginx แต่ alarm-api จะต้องทำการเรียกเครือข่ายเพิ่มเติมหนึ่งครั้งต่อคำขอการเขียน

ขอแนะนำให้ประเมินทั้งสองวิธีกับโมดูลที่มีอยู่ของ `nginx:alpine` จริง (อาจไม่ได้คอมไพล์ `ngx_http_js_module` มาให้) ก่อนตัดสินใจ แทนที่จะสรุปเอาเองว่าตัวเลือกที่ 1 จะใช้งานได้

## แผนการปล่อยอัปเดต

1. เริ่มต้นด้วยการนำไปใช้เฉพาะการบันทึกการไม่ตรงกันด้วย `console.warn` (ไม่มีการเปลี่ยนแปลงพฤติกรรมสำหรับไคลเอ็นต์ปัจจุบันที่ถูกต้อง) -- ช่วยให้ปล่อยอัปเดตได้อย่างปลอดภัย และสร้างหลักฐานที่แท้จริงว่ามีความไม่ตรงกันเกิดขึ้นจริงหรือไม่
2. ตรวจสอบบันทึกข้อมูล (logs) ในช่วงเวลาการสังเกตจริง (เป็นหลักวัน ไม่ใช่หลักนาที)
3. หลังจากนั้นค่อยตัดสินใจว่าจะให้ `verifiedUser` เป็นข้อมูลหลักที่เชื่อถือได้ (เขียนทับ `claimedActor` โดยไม่แจ้ง) หรือปฏิเสธกรณีที่ไม่ตรงกันไปเลย (`403`) -- การตัดสินใจนี้ต้องการข้อมูลความถี่ของความไม่ตรงกันที่แท้จริง ไม่ใช่การคาดเดาในตอนนี้

## แผนการทดสอบ

- Unit: `transitionAlarm` มีส่วนหัวปรากฏ + ส่วนเนื้อหาตรงกัน -> ไม่มีคำเตือน, บันทึกได้ปกติ
- Unit: มีส่วนหัวปรากฏ + ส่วนเนื้อหาไม่ตรงกัน -> บันทึกคำเตือน, การเขียนข้อมูลยังคงสำเร็จ (พฤติกรรมระยะที่ 1)
- Integration: ใช้ `curl` ยิงไปที่ `/alarm-api/alarms/ack` พร้อมกับเซสชันคุกกี้ที่ถูกต้อง แต่มีการปลอมแปลง `acknowledged_by` -> ยืนยันว่าการไม่ตรงกันนั้นมองเห็นได้ใน `docker logs ims-alarm-api`
- Regression: ปุ่มรับทราบ/แก้ไขใน Alarm Console ปัจจุบันยังคงทำงานได้ตั้งแต่ต้นจนจบ (นี่คือเส้นทางการเขียนเส้นทางเดียวในระบบทั้งหมด -- การทำให้เกิดการพังไม่ใช่สิ่งที่ยอมรับได้สำหรับรายการเสริมความปลอดภัยที่มีความสำคัญระดับ Medium)

## ขอบเขตที่อยู่นอกเหนือข้อกำหนดนี้

- การเพิ่มข้อมูลรับรองที่สองแยกต่างหากให้กับ alarm-api (การเชื่อถือตามเซสชันผ่าน Grafana เป็นทางเลือกในการออกแบบที่ตั้งใจและมีการจัดทำเอกสารไว้ -- `SECURITY_MODEL.md` ขอบเขต 1a -- จะไม่นำมาพิจารณาใหม่ในที่นี้)
- การจำกัดอัตรา / การป้องกันการใช้งานในทางที่ผิดที่จุดเชื่อมต่อรับทราบ/แก้ไข (ack/resolve) -- เป็นเรื่องที่แยกออกไป ไม่ใช่ปัญหาเกี่ยวกับการระบุตัวตน
