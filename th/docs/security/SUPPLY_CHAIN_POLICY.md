<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>นโยบายความมั่นคงปลอดภัยห่วงโซ่อุปทานซอฟต์แวร์และการจัดการ Dependency (IMS Supply Chain)</h1>
  <p><b>กรอบการทำงาน SLSA Level 3, การสร้าง CycloneDX SBOM, การล็อก Image Digest ของคอนเทนเนอร์, ข้อกำหนดสิทธิ์การใช้งาน และ SLA การแก้ไขช่องโหว่</b></p>
  <p>
    <a href="../../../docs/security/SUPPLY_CHAIN_POLICY.md">English</a> |
    <a href="SUPPLY_CHAIN_POLICY.md">ไทย</a> |
    <a href="../../../zh-CN/docs/security/SUPPLY_CHAIN_POLICY.md">简体中文</a>
  </p>
</div>

---

## 1. วัตถุประสงค์การกำกับดูแลและกรอบการทำงาน SLSA

ระบบ Telemetry ทางอุตสาหกรรมในปัจจุบันพึ่งพาคอมโพเนนต์ร่วมกันระหว่างรันไทม์คอนเทนเนอร์, ไลบรารีโอเพนซอร์ส (Node.js, Python, Go, Rust) และอิมเมจโครงสร้างพื้นฐาน การมีช่องโหว่หรือภัยคุกคามแฝงใน Dependency ต้นทาง อาจนำไปสู่ความเสี่ยงร้ายแรงต่อเครือข่ายอุตสาหกรรมการผลิต

ระบบ IMS นำกรอบการทำงาน **Supply-chain Levels for Software Artifacts (SLSA v1.0) Level 3** มาใช้ตลอดกระบวนการสร้างและส่งมอบระบบ:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ การควบคุมซอร์สโค้ด │ ----> │ กระบวนการบิลด์แยกส่วน │ ----> │ Registry ลงนามแล้ว │
│ Pinned Commits  │       │ Ephemeral Runner│       │ Cosign / OCI    │
│ กฎคุ้มครอง Branch │       │ SLSA Provenance │       │ รหัส Hash คงที่   │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

- **ความสมบูรณ์ของซอร์สโค้ด (Source Integrity)**: ทุกคำสั่งรวมโค้ด (Merge) ต้องผ่านการลงนามดิจิทัล (`GPG` / `SSH`), ผ่านการอนุมัติจากผู้ตรวจทาน และผ่านเครื่องมือตรวจสอบ Pre-commit Linter
- **การแยกส่วนสิ่งแวดล้อมบิลด์ (Build Isolation)**: กระบวนการบิลด์คอนเทนเนอร์จะทำงานบน GitHub Actions Runner ชั่วคราว (Ephemeral) โดยไม่มีการแคช Volume ข้ามรอบ
- **การยืนยันที่มา (Provenance & Attestation)**: ไฟล์ Release Artifacts ทุกตัวจะถูกสร้างเอกสารรับรองที่มา (In-toto Provenance) และลงนามดิจิทัลผ่าน Sigstore `cosign`

---

## 2. การสร้างรายการส่วนประกอบซอฟต์แวร์ (SBOM Generation)

ระบบ IMS บังคับใช้การสร้างเอกสาร Software Bill of Materials (SBOM) ในรูปแบบที่เครื่องจักรประมวลผลได้ตามมาตรฐาน **CycloneDX v1.5 (JSON)** และ **SPDX v2.3** สำหรับทุกคอนเทนเนอร์และซอฟต์แวร์บันเดิลที่เผยแพร่

### คำสั่งสร้างเอกสาร CycloneDX SBOM ผ่าน CLI

นักพัฒนาและไปป์ไลน์ CI/CD จะใช้เครื่องมือ Anchore `syft` และ Aqua Security `trivy` ในการสแกนและสร้างรายการ Dependency:

```bash
# 1. สร้างเอกสาร SBOM ระบบไฟล์คอนเทนเนอร์ในรูปแบบ CycloneDX JSON
syft ims-alarm-api:latest -o cyclonedx-json=sbom-alarm-api.cdx.json

# 2. สร้างเอกสาร SBOM สำหรับไลบรารีของ Node-RED Runtime
syft dir:./nodered_data -o cyclonedx-json=sbom-nodered.cdx.json

# 3. ตรวจสอบรายชื่อคอมโพเนนต์สำคัญจากไฟล์ SBOM ที่สร้างขึ้น
jq '.components[] | {name: .name, version: .version, type: .type}' sbom-alarm-api.cdx.json | head -n 25
```

---

## 3. การกำกับดูแล Base Image คอนเทนเนอร์และการล็อกรหัส Digest (Pinning)

เพื่อป้องกันปัญหาแท็กเปลี่ยนแปลงได้ (Tag Drift เช่น การใช้ `:latest` หรือการถูกสับเปลี่ยนอิมเมจต้นทางโดยไม่รู้ตัว) ทุกคอนฟิกสำหรับสภาพแวดล้อมจริง (`docker-compose.yml`, `docker-compose.prod.yml`) ต้องระบุรหัส Cryptographic SHA-256 Digest ที่ไม่สามารถแก้ไขได้เสมอ:

```yaml
# รูปแบบการล็อก Image Digest ที่ปลอดภัย
services:
  timescaledb:
    image: timescale/timescaledb-ha:pg16-ts2.15-oss@sha256:69b4e3c98dc65b53eef6a06be38b4b734898165cf9c0daae1540608ebcf2fe56
```

### รายการแคตตาล็อก Base Image ที่ได้รับการอนุมัติ

| เซอร์วิสคอมโพเนนต์ | ระบบปฏิบัติการฐาน | มาตรฐานขั้นต่ำของ Base Image | มาตรการความปลอดภัยและ Hardening |
|:------------------|:-----------------|:-----------------------------|:--------------------------------|
| `timescaledb` | Debian Bookworm Slim | อิมเมจทางการจากผู้พัฒนาพร้อม Digest | รันด้วย Non-root `postgres` UID 70, Read-only rootfs |
| `pgbouncer` | Alpine Linux 3.19 | สแตติกไบนารีขนาดเล็กที่สุด | รันด้วย Non-root `postgres` UID 70, ตัดสิทธิ์ `CAP_NET_RAW` |
| `node-red` | Alpine Linux 3.19 | อิมเมจทางการของ Node-RED | รันด้วย Non-root `node-red` UID 1000, แซนด์บ็อกซ์ตัวแปรโกลบอล |
| `grafana` | Alpine Linux 3.19 | อิมเมจทางการ Grafana Enterprise/OSS | รันด้วย Non-root `grafana` UID 472, ระบบตั้งค่าแบบ Read-only |
| `prometheus` | Alpine / Distroless | ไบนารีทางการของ Prometheus | รันด้วย Non-root `nobody` UID 65534, พื้นที่จัดเก็บ TSDB แยกอิสระ |
| `nginx-proxy` | Alpine Linux 3.19 | อิมเมจ Nginx Unprivileged ทางการ | รันด้วย Non-root `nginx` UID 101, พอร์ตสิทธิ์ต่ำ (:8080/:8443) |

---

## 4. การปฏิบัติตามสัญญาอนุญาตสิทธิ์โอเพนซอร์ส (License Compliance)

เพื่อปกป้องทรัพย์สินทางปัญญาและหลีกเลี่ยงข้อผูกมัดทางกฎหมายต่ออัลกอริทึมการผลิตภายใน ไลบรารีภายนอกทั้งหมดต้องอยู่ภายใต้เกณฑ์สัญญาอนุญาตดังนี้:

```
[สัญญาอนุญาตที่อนุญาตให้ใช้งานได้ - ปลอดภัยต่อเชิงพาณิชย์]
  ├── MIT License
  ├── Apache License 2.0
  ├── BSD 2-Clause / 3-Clause
  ├── ISC License
  └── Creative Commons Zero (CC0)

[สัญญาอนุญาตที่มีเงื่อนไข - ใช้ได้เฉพาะในคอนเทนเนอร์แยกส่วน]
  ├── LGPL v2.1 / v3.0 (เฉพาะไลบรารีที่ลิงก์แบบไดนามิกเท่านั้น)
  └── Mozilla Public License 2.0 (MPL-2.0)

[สัญญาอนุญาตต้องห้ามเด็ดขาด - ปฏิเสธการดึงโค้ดทันที (Contagious Copyleft)]
  ├── GNU General Public License v3.0 (GPLv3)
  ├── Affero General Public License (AGPL-3.0)
  └── Server Side Public License (SSPL)
```

### คำสั่งสคริปต์ตรวจสอบ License อัตโนมัติ

```bash
# ตรวจสอบ Dependency ทั้งหมดในโปรเจกต์ Node.js ป้องกัน License นอกรายการที่อนุญาต
npx license-checker --summary --excludePrivatePackages \
  --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;CC0-1.0;0BSD"
```

---

## 5. ข้อตกลงระดับการบริการในการแก้ไขช่องโหว่ (Vulnerability SLAs & CVSS)

ช่องโหว่ทั้งหมดที่ตรวจพบในอิมเมจคอนเทนเนอร์, แพ็กเกจแอปพลิเคชัน และระบบปฏิบัติการ จะถูกจัดระดับความรุนแรงตามมาตรฐาน **Common Vulnerability Scoring System (CVSS v3.1 / v4.0)** และต้องแก้ไขภายในกรอบเวลา SLA ภาคบังคับ:

| ระดับความรุนแรงของช่องโหว่ | คะแนน CVSS Base Score | ข้อกำหนด SLA ในการแก้ไข | ขั้นตอนการยกระดับปัญหาและการรับมือ |
|:--------------------------|:----------------------|:------------------------|:----------------------------------|
| **CRITICAL (วิกฤต)** | `9.0 - 10.0` | **ภายใน 24 ชั่วโมง** | เปิดกิ่ง Hotfix ฉุกเฉิน; ปล่อยอัปเดตระบบจริงทันที; แจ้งเตือน CISO และผู้จัดการโรงงาน |
| **HIGH (สูง)** | `7.0 - 8.9` | **ภายใน 7 วัน** | กำหนดรอบ Release พิเศษเร่งด่วน; ทีมความปลอดภัยตรวจทาน; ทดสอบระบบใน Staging |
| **MEDIUM (ปานกลาง)** | `4.0 - 6.9` | **ภายใน 30 วัน** | ปรับปรุงในรอบสปรินต์ปกติ หรือช่วงบำรุงรักษาประจำเดือน |
| **LOW (ต่ำ)** | `0.1 - 3.9` | **ภายใน 90 วัน** | ประเมินความจำเป็นในรอบอัปเกรดประจำไตรมาส |

---

## 6. คำสั่งการสแกนความปลอดภัยอัตโนมัติ (CLI Security Workflows)

การตรวจสอบความปลอดภัยถูกผนวกเข้ากับกระบวนการทำงานของนักพัฒนาและไปป์ไลน์ CI:

```bash
# 1. สแกนซอร์สโค้ดและระบบไฟล์เพื่อตรวจหารหัสลับที่เผลอใส่ไว้และช่องโหว่ CVE
trivy fs --severity HIGH,CRITICAL --scanners vuln,secret,config .

# 2. สแกนอิมเมจคอนเทนเนอร์ก่อนที่จะอัปโหลดขึ้น Registry
trivy image --severity HIGH,CRITICAL ims-alarm-api:latest

# 3. ยืนยันลายเซ็นดิจิทัลของคอนเทนเนอร์ก่อนนำไปรันจริงด้วย Cosign
cosign verify \
  --key cosign.pub \
  ghcr.io/pattanakorn025/ims-alarm-api:v2.4.0
```
