# Changelog

รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)

## [Unreleased]

### Fixed
- LDI enterprise OID mismatch ระหว่างเอกสารกับโค้ด (9999 vs 99999)
- `bypass_error` node wire ไม่เชื่อมต่อ ทำให้ join barrier รอ timeout เต็มทุกครั้งที่ error
- `walk_ldi` ไม่อยู่ใน scope ของ `catch_walker`
- `ldiTemp` คำนวณแล้วไม่ถูกบันทึกลงฐานข้อมูล
- Counter wraparound heuristic ผิดสำหรับ 64-bit counter (ไม่เช็ค device reboot)
- Emoji escape sequence พิมพ์ผิดใน alert message

### Added
- Device registry pattern เชื่อม `public.machines` กับ SNMP walker (รองรับหลายเครื่องจริง)
- LINE Notify / MS Teams webhook ที่ส่งออกจริง (เดิมมีแค่ format ข้อความ)
- Database migration system (`database/migrations/`)
- Unit tests สำหรับ parsing logic
- CI/CD secret stubs for compose validation
- Gitleaks allowlist for `.env`, `.playwright-mcp/`, `nodered_data/`
- `scripts/backup-db.sh` and `scripts/restore-db.sh`
- `SECURITY.md`, `CHANGELOG.md`, `Makefile`
- `docker-compose.override.yaml` (dev) and `docker-compose.prod.yaml` (prod)

### Changed
- แยก `docker-compose.yaml` เป็น base/dev/prod
- ย้าย `flows-ubuntu.json` ไปยัง `node-red/flows/` แยกเป็น ingestion + alerting
- LDI column types changed from INT to DOUBLE PRECISION
- Architecture upgraded to 5-Thread Parallel Walker (added LDI walker)

## [0.9.0] - Phase 18 (Pre-refactor baseline)
- 5-Thread Bulletproof AIOps Parser v7
- Dual-Engine SNMP Walker (Network only)
- Alertmanager inhibition rules
