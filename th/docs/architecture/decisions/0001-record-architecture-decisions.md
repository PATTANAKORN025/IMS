<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>ADR 0001: บันทึกการตัดสินใจเชิงสถาปัตยกรรม (Record Architecture Decisions)</h1>
  <p><b>มาตรฐานบันทึกการตัดสินใจทางสถาปัตยกรรม วงจรชีวิต และการกำกับดูแลการออกแบบระบบ</b></p>
  <p>
    <a href="../../../../docs/architecture/decisions/0001-record-architecture-decisions.md">English</a> |
    <a href="0001-record-architecture-decisions.md">ไทย</a> |
    <a href="../../../../zh-CN/docs/architecture/decisions/0001-record-architecture-decisions.md">简体中文</a>
  </p>
</div>

---

> **สถานะ (Status):** ยอมรับ (Accepted)  
> **วันที่ (Date):** 2026-08-26  
> **ผู้มีอำนาจตัดสินใจ (Deciders):** หัวหน้าสถาปนิกวิศวกรรม (Lead Architect), ทีมวิศวกร SRE, วิศวกรระบบ OT  
> **ขอบเขตทางเทคนิค (Technical Scope):** มาตรฐานการจัดทำเอกสารสถาปัตยกรรม, การจัดการองค์ความรู้, การกำกับดูแลการเปลี่ยนแปลง

---

## 1. บริบทและปัญหาที่ต้องตัดสินใจ (Context & Problem Statement)

ระบบ **Industrial Monitoring System (IMS)** เป็นแพลตฟอร์มโทรมาตร (Telemetry) ระดับอุตสาหกรรมที่มีภารกิจสำคัญสูง (Mission-Critical) ทำหน้าที่รับ ประมวลผล และแสดงผลข้อมูลจากเครื่องจักรการผลิตแผงวงจรพิมพ์ (PCB) ความเร็วสูง เช่น LDI Photolithography, CNC Drilling, VCP Plating ร่วมกับโครงสร้างพื้นฐานเครือข่าย IT/OT

ตลอดวงจรชีวิตของระบบ มีการตัดสินใจเชิงสถาปัตยกรรมที่มีผลกระทบสูงเกิดขึ้นอย่างต่อเนื่อง เช่น การเลือกฐานข้อมูล, อะแดปเตอร์เชื่อมต่อโปรโตคอล, ตัวจัดการ Connection Pool, การจัดการหน่วยความจำ และการออกแบบแดชบอร์ด หากปราศจากบันทึกการตัดสินใจที่มีการควบคุมเวอร์ชัน จะก่อให้เกิดความเสี่ยงวิกฤต:
1. **การเบี่ยงเบนทางสถาปัตยกรรม (Architectural Drift):** วิศวกรในอนาคตอาจละเมิดข้อจำกัดสำคัญโดยไม่ตั้งใจ (เช่น การบายพาส PgBouncer หรือการสร้างสคีมาต้องห้าม `ims.*`)
2. **การสูญหายขององค์ความรู้ (Tribal Knowledge Loss):** เหตุผลเบื้องหลังการปรับแต่งประสิทธิภาพ (เช่น O(1) GC ใน Node-RED) อาจเลือนหายกลายเป็นเพียงเรื่องเล่า
3. **ช่องโหว่ด้านการตรวจสอบและการปฏิบัติตามมาตรฐาน (Audit & Compliance Gaps):** ขาดหลักฐานการกำกับดูแลการเปลี่ยนแปลงตามมาตรฐานความปลอดภัยอุตสาหกรรม (IEC 62443 / ISO 27001)

---

## 2. ปัจจัยผลักดันการตัดสินใจ (Decision Drivers)

- **ความสามารถในการตรวจสอบผ่าน Version Control:** บันทึกต้องอยู่ใน Git ควบคู่กับโค้ดจริง และอัปเดตไปพร้อมกับ Pull Request
- **ความเร็วในการรับพนักงาน/วิศวกรใหม่ (Onboarding Velocity):** วิศวกรใหม่ต้องเข้าใจไม่เพียงแค่ *ระบบทำอะไร* แต่เข้าใจลึกซึ้งว่า *ทำไมจึงเลือกเทคโนโลยีและข้อจำกัดนั้น*
- **การตรวจสอบอัตโนมัติ (Automated Validation):** เอกสารต้องสามารถอ้างอิงตรงจากคอมเมนต์ในโค้ด และตรวจสอบผ่าน CI Linters ได้
- **รองรับ 3 ภาษาอย่างเท่าเทียม (Tri-lingual Parity):** สถาปัตยกรรมต้องมีเนื้อหาตรงกันแบบ 1:1 ทั้งภาษาอังกฤษ ไทย และจีน เพื่อรองรับโรงงานระดับสากล

---

## 3. ทางเลือกที่ได้รับการพิจารณา (Considered Options)

* **ทางเลือกที่ 1: บันทึกผ่าน Git Commit Messages และคำอธิบายใน PR** — ภาระงานต่ำ แต่กระจัดกระจาย ค้นหายาก และสูญหายเมื่อทำ Squash Merge
* **ทางเลือกที่ 2: ใช้ Wiki กลาง หรือ Confluence Space** — ภาระดูแลรักษาสูง มักไม่อัปเดตตามโค้ดจริง และเข้าถึงไม่ได้ในโรงงานที่เป็นเครือข่ายปิด (Air-gapped Network)
* **ทางเลือกที่ 3: ใช้ Architecture Decision Records (ADRs) ใน Git (ตัวเลือกที่เลือก)** — ไฟล์ Markdown ขนาดกะทัดรัดจัดเก็บในโฟลเดอร์ `docs/architecture/decisions/` มีการควบคุมเวอร์ชันและรีวิวผ่านกระบวนการ Pull Request ตามมาตรฐาน

---

## 4. ผลลัพธ์การตัดสินใจ (Decision Outcome)

เราตัดสินใจนำมาตรฐาน **Architecture Decision Records (ADRs)** ตามรูปแบบ **MADR (Markdown Architectural Decision Records)** มาใช้ในโครงการ

ทุกการตัดสินใจที่มีผลกระทบอย่างมีนัยสำคัญต่อระบบจะต้องจัดทำเป็นไฟล์ ADR แยกเฉพาะภายใต้ `docs/architecture/decisions/`

### แผนผังวงจรชีวิตของ ADR (Lifecycle State Machine)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
stateDiagram-v2
  accTitle: Lifecycle ของ ADR
  accDescr: ADR ถูกเสนอ แล้วได้รับการยอมรับหรือถูกปฏิเสธ ADR ที่ยอมรับแล้วอาจถูกเลิกใช้หรือถูกแทนที่ด้วย ADR ใหม่ในภายหลัง
  [*] --> Proposed: ผู้เขียนร่าง
  Proposed --> Accepted: ผ่านการรีวิว
  Proposed --> Rejected: ไม่นำไปใช้
  Accepted --> Deprecated: ไม่ใช้แล้ว
  Accepted --> Superseded: ถูกแทนด้วย ADR ใหม่
  Rejected --> [*]
  Deprecated --> [*]
  Superseded --> [*]
```

### โครงสร้างไดเรกทอรีและรูปแบบการตั้งชื่อไฟล์

ไฟล์ ADR ต้องใช้รูปแบบตัวเลข 4 หลักนำหน้า:
```text
docs/architecture/decisions/
├── 0001-record-architecture-decisions.md
├── 0002-timescaledb-for-timeseries.md
└── ...
```

ทุกไฟล์ใน `docs/` จะต้องมีไฟล์แปลที่สอดคล้องกันแบบ 1:1 ใน:
- `th/docs/architecture/decisions/`
- `zh-CN/docs/architecture/decisions/`

---

## 5. เทมเพลตมาตรฐานสำหรับ ADR (Standard ADR Template)

ทุกการบันทึกการตัดสินใจใหม่จะต้องใช้โครงสร้างดังนี้:

```markdown
<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>ADR NNNN: [ชื่อหัวข้อการตัดสินใจแบบกระชับ]</h1>
  <p><b>[สรุปบริบทและผลการตัดสินใจใน 1 บรรทัด]</b></p>
  <p>
    <a href="NNNN-[title].md">English</a> |
    <a href="../../../th/docs/architecture/decisions/NNNN-[title].md">ไทย</a> |
    <a href="../../../zh-CN/docs/architecture/decisions/NNNN-[title].md">简体中文</a>
  </p>
</div>

---

> **Status:** [Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-XXXX]  
> **Date:** YYYY-MM-DD  
> **Deciders:** [รายชื่อผู้มีอำนาจตัดสินใจ]  
> **Technical Scope:** [ระบบย่อย / องค์ประกอบ]

---

## 1. บริบทและปัญหาที่ต้องตัดสินใจ (Context & Problem Statement)
[อธิบายบริบททางวิศวกรรมและปัญหาที่ต้องตัดสินใจ]

## 2. ปัจจัยผลักดันการตัดสินใจ (Decision Drivers)
[ระบุข้อกำหนดด้านประสิทธิภาพ ข้อจำกัด และเงื่อนไขการทำงาน]

## 3. ทางเลือกที่ได้รับการพิจารณา (Considered Options)
* **ทางเลือกที่ 1:** [ชื่อและคำอธิบายย่อ]
* **ทางเลือกที่ 2:** [ชื่อและคำอธิบายย่อ]
* **ทางเลือกที่ 3:** [ชื่อและคำอธิบายย่อ]

## 4. ผลลัพธ์การตัดสินใจ (Decision Outcome)
[ระบุทางเลือกที่เลือก พร้อมเหตุผลทางเทคนิคอย่างละเอียด]

### แผนภาพสถาปัตยกรรม (Architectural Model)
```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart LR
  accTitle: แม่แบบ ADR: ภาพร่างสถาปัตยกรรม
  accDescr: ตัวอย่างโครงของแผนภาพใน ADR ใหม่ ให้แทนที่องค์ประกอบทั้งสองและความสัมพันธ์
  A["องค์ประกอบ A"]:::app -->|"ความสัมพันธ์"| B["องค์ประกอบ B"]:::app
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

## 5. ผลกระทบและการประนีประนอม (Consequences & Trade-offs)
* **ผลกระทบเชิงบวก:** [ประโยชน์ที่ได้รับ, ประสิทธิภาพที่เพิ่มขึ้น, ความปลอดภัย]
* **ผลกระทบเชิงลบ:** [ความซับซ้อนที่เพิ่มขึ้น, ปริมาณการใช้ทรัพยากร]
* **กลยุทธ์การบรรเทาผลกระทบ:** [วิธีรับมือกับข้อจำกัดเชิงลบ]
```

---

## 6. ผลกระทบและการกำกับดูแล (Consequences & Governance)

* **ผลกระทบเชิงบวก:**
  - มีหลักฐานประวัติศาสตร์ที่โปร่งใสสำหรับการตัดสินใจทางวิศวกรรมที่สำคัญทั้งหมด
  - ช่วยให้วิศวกรใหม่เริ่มงานและเข้าใจระบบได้อย่างรวดเร็ว
  - ควบคุมการปฏิบัติตามกฎเหล็กทางสถาปัตยกรรมอย่างเคร่งครัด (เช่น การใช้เฉพาะสคีมา `public`, การใช้ Transaction Pooling ใน PgBouncer)
* **ผลกระทบเชิงลบ:**
  - มีขั้นตอนการจัดทำเอกสารเพิ่มเติมเล็กน้อยเมื่อเสนอกลยุทธ์ทางสถาปัตยกรรมใหม่
* **กลยุทธ์การบรรเทาผลกระทบ:**
  - เทมเพลตมาตรฐานที่กระชับช่วยให้เขียน ADR เสร็จสิ้นได้ภายในไม่เกิน 30 นาที
  - มีระบบ CI Linters ตรวจสอบความถูกต้องของลิงก์และความเท่าเทียมของเนื้อหาทั้ง 3 ภาษาโดยอัตโนมัติ

---

[⬅️ กลับสู่ภาพรวมสถาปัตยกรรม](../ARCHITECTURE.md) | [<img src="../../../../docs/assets/icons/home.svg" width="18" align="center" /> หน้าหลักคลังข้อมูล](../../../README.md)
