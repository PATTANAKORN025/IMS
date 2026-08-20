<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# สถาปัตยกรรมการจัดการความละเอียดของข้อมูลและการขยายระบบ (Data Fidelity & Scale Management)

เอกสารฉบับนี้อธิบายถึงความท้าทายเชิงสถาปัตยกรรมและแนวทางการแก้ปัญหา (Architectural Solutions) ของระบบ IMS เมื่อต้องรองรับอุปกรณ์ระดับ 1,000+ เครื่อง โดยเน้นที่การรักษาความถูกต้องของข้อมูลระดับมิลลิวินาที การจัดการการแจ้งเตือนไม่ให้เกิด Alert Fatigue และความสอดคล้องระหว่างข้อมูลจำลองกับข้อมูลจริง

---

## 1. ความเสี่ยงการสเกลระบบและหน่วงเวลาที่มากเกินไป (Scaling Risks & Latency)

เมื่อระบบขยายตัวเพื่อรองรับอุปกรณ์จำนวนมาก ปัญหาหลักที่พบคือ **Network Latency** และ **Event Loop Blocking** ในฝั่ง Ingestion (Node-RED) ซึ่งทำให้เกิดคอขวดและส่งผลกระทบต่อความละเอียดของข้อมูล

### <img src="../../../docs/assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> ปัญหาที่พบ (The Problem)

- หากใช้การประทับเวลา (Timestamping) ที่ฝั่งเซิร์ฟเวอร์ (Node-RED หรือ PostgreSQL) ข้อมูลที่ถูกหน่วงในเครือข่ายหรือค้างอยู่ในคิวจะได้รับ Timestamp ที่ผิดพลาด
- เมื่อเกิด Network Jitter ข้อมูลระดับมิลลิวินาที (Millisecond Resolution) จะสูญเสียความแม่นยำ และทำให้ลำดับของเหตุการณ์ (Event Sequencing) ผิดเพี้ยนไป

### <img src="../../../docs/assets/icons/check.svg" width="18" height="18" align="center" /> สถาปัตยกรรมที่ใช้แก้ปัญหา (Architectural Solution)

1. **Edge-Level Timestamping:**
   บังคับให้อุปกรณ์ปลายทาง (Edge Devices/Sensors) เป็นผู้ประทับเวลา Payload เสมอ (ตามมาตรฐาน ISO8601 precision) ระบบ IMS จะเชื่อถือ `time` จาก Edge เป็นหลัก
2. **TimescaleDB Micro-batching:**
   ใช้ PgBouncer เพื่อจัดการ Connection Pooling และออกแบบ Node-RED ให้รวบรวมข้อมูลเป็น Batch ก่อนทำการ `INSERT` ช่วยลด Overhead ของ Transaction และป้องกัน Database Locks
3. **Worker Thread Isolation:**
   แยก Flow การทำงานใน Node-RED ออกเป็น Worker Threads ที่เป็นอิสระต่อกัน (เช่น แยก Parser ของ SNMP ออกจาก HTTP LDI) เพื่อไม่ให้ CPU Bound task ไปบล็อกการรับข้อมูล I/O

---

## 2. การรักษาความสมจริงระหว่างข้อมูลจำลองกับข้อมูลจริง (Simulator vs. Real-World Fidelity)

การทดสอบระบบด้วยข้อมูลจำลอง (Simulated Data) มักให้ผลลัพธ์ที่สมบูรณ์แบบเกินไป ซึ่งไม่สะท้อนถึงพฤติกรรมจริงของอุปกรณ์ในโรงงานอุตสาหกรรม

### <img src="../../../docs/assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> ปัญหาที่พบ (The Problem)

- SNMP Simulator รุ่นดั้งเดิมสร้างข้อมูลที่เป็น Sine Wave ที่สมบูรณ์แบบ ทำให้ไม่สามารถทดสอบระบบ Caching, การทำ Compression ใน TimescaleDB หรือระบบ Alert ที่เกิดจาก Data Spike ได้อย่างแม่นยำ

### <img src="../../../docs/assets/icons/check.svg" width="18" height="18" align="center" /> สถาปัตยกรรมที่ใช้แก้ปัญหา (Architectural Solution)

1. **Chaos Engineering ใน Simulator:**
   มีการเพิ่ม `Jitter`, `Random Drops` และ `Spikes` เข้าไปในตัว Simulator (ผ่านการคอนฟิกใน `docker-compose.yml` ของตัวจำลอง) เพื่อสร้าง Noise ให้เหมือนสภาพแวดล้อมเครือข่ายจริง
2. **Real-World Data Replay:**
   ระบบสามารถดึงข้อมูล Raw Dump จากโรงงานจริงมา Replay ผ่าน Pcap หรือ JSON Loader เพื่อทดสอบความสามารถในการประมวลผลของ Pipeline และยืนยันว่า Dashboard (Grafana) ยังคงแสดงผลได้อย่างถูกต้องแม้ข้อมูลจะเกิดความผันผวน

---

## 3. การจัดการการแจ้งเตือนไม่ให้รบกวนมากเกินไป (Realistic Alarm Management & Alert Fatigue)

เป้าหมายของระบบ IMS คือการแจ้งเตือนเมื่อเกิดความผิดปกติ "ที่ส่งผลกระทบต่อธุรกิจเท่านั้น" การแจ้งเตือนที่มากเกินไปจะทำให้วิศวกรละเลย (Alert Fatigue)

### <img src="../../../docs/assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> ปัญหาที่พบ (The Problem)

- ข้อมูลที่มีความละเอียดสูงระดับมิลลิวินาที มักจะแกว่งผ่านเส้น Threshold ไปมา (Flapping) ทำให้เกิด False Positives และยิง Alert เข้า LINE/MS Teams นับพันข้อความต่อนาที

### <img src="../../../docs/assets/icons/check.svg" width="18" height="18" align="center" /> สถาปัตยกรรมที่ใช้แก้ปัญหา (Architectural Solution)

1. **Prometheus `FOR` Clauses:**
   กฎการแจ้งเตือนทั้งหมดจะต้องมีเงื่อนไขเรื่องเวลา เช่น `CPU > 90% FOR 5m` หมายความว่าค่าความผิดปกติต้องคงอยู่อย่างต่อเนื่องเป็นเวลา 5 นาที จึงจะถือว่าเป็นปัญหาจริง (ลด Noise จาก Spikes สั้นๆ)
2. **Alertmanager Grouping & Deduplication:**
   ใช้ Alertmanager ในการจัดกลุ่ม (Group By) การแจ้งเตือนตาม `machine_id` และ `severity` หากมี Error หลายตัวเกิดขึ้นกับเครื่องจักรเดียวกันในช่วงเวลาเดียวกัน ระบบจะส่งข้อความแจ้งเตือนรวมเพียง 1 ข้อความ
3. **Exponential Backoff สำหรับ Notification:**
   หากปัญหายังไม่ถูกแก้ไข ระบบจะไม่ส่งข้อความซ้ำรัวๆ แต่จะทิ้งระยะห่างนานขึ้นเรื่อยๆ (เช่น 15 นาที, 1 ชั่วโมง, 4 ชั่วโมง)

---

## 4. การจัดการความคลาดเคลื่อนของข้อมูลย้อนหลัง (Historical Data Drift Management)

TimescaleDB ใช้ Continuous Aggregates (CAGGs) เพื่อสรุปข้อมูล (Rollup) ล่วงหน้าสำหรับการดึงข้อมูลขึ้น Dashboard อย่างรวดเร็ว

### <img src="../../../docs/assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> ปัญหาที่พบ (The Problem)

- อุปกรณ์ Edge บางตัวอาจขาดการเชื่อมต่อและส่งข้อมูลย้อนหลัง (Late-Arriving Data) เข้ามาในระบบ หากข้อมูลนี้เข้ามาหลังจากที่ CAGG ทำการสรุปผลไปแล้ว ข้อมูลในระดับรายชั่วโมงหรือรายวันจะผิดเพี้ยนไปจากความจริง (Data Drift)

### <img src="../../../docs/assets/icons/check.svg" width="18" height="18" align="center" /> สถาปัตยกรรมที่ใช้แก้ปัญหา (Architectural Solution)

1. **Watermark Policies & Refresh Windows:**
   ตั้งค่า `refresh_continuous_aggregate` ให้ครอบคลุมช่วงเวลาที่มีโอกาสเกิด Late-Arriving Data (เช่น สั่ง Refresh ข้อมูลของเมื่อวานซ้ำอีกครั้งในเวลาเที่ยงคืน)
2. **Data Interpolation ใน Grafana:**
   หากเกิด Gap ของข้อมูลเนื่องจาก Network Drop การเขียน Query ใน Grafana จะใช้ฟังก์ชัน `interpolate()` หรือการเติม `$__interval` ลงใน TimescaleDB เพื่อไม่ให้กราฟขาดตอนโดยไม่ตั้งใจ
3. **Reconciliation Audits:**
   มี Script ตรวจสอบเทียบความแตกต่างระหว่าง CAGG tables และ Raw tables เพื่อยืนยันความถูกต้องของข้อมูล (Data Parity)

---

## 5. คุณค่าและประสิทธิภาพของระบบ (System Value & Efficiency)

การลงทุนแก้ไขปัญหาทางวิศวกรรมขั้นสูงเหล่านี้ ส่งผลโดยตรงต่อ **Return on Investment (ROI)** ของธุรกิจ:

- **ลดเวลาสูญเปล่า (Zero False-Positive Maintenance):** วิศวกรไม่ต้องเดินไปตรวจสอบเครื่องจักรเพียงเพราะเซ็นเซอร์แกว่งชั่วคราว (ลด Man-hours ได้มหาศาล)
- **ประหยัดค่าใช้จ่าย Storage (Storage Cost Efficiency):** ข้อมูลระดับมิลลิวินาทีมีขนาดใหญ่มาก การที่ระบบรักษาความละเอียดไว้ได้โดยใช้ TimescaleDB Compression (บีบอัดได้ถึง 90%) ทำให้ธุรกิจสามารถเก็บข้อมูลประวัติศาสตร์ได้ยาวนานหลายปีโดยไม่ต้องเสียเงินซื้อ Storage เพิ่มอย่างมหาศาล
- **ความน่าเชื่อถือระดับสากล (Audit-Ready Fidelity):** ความละเอียดของ Timestamp จาก Edge ควบคู่กับการไม่มี Data Drift ทำให้ข้อมูลจากระบบ IMS สามารถใช้เป็นหลักฐานในการตรวจสอบเชิงคุณภาพ (Quality Audits) ได้อย่างมั่นใจ
