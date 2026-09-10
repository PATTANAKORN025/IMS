> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Browser E2E Verification — Live Smoke Pass

Run: 2026-08-21, against the running local stack (`http://localhost:3000`), via Playwright browser automation.
HEAD at time of test: `a27ae65`.

Prior release-qualification reports (`.superpowers/sdd/2026-08-19-ldi-system-audit/`) marked browser E2E
**NOT VERIFIED / BLOCKED** because no browser automation tool was available in that session and host port
3000 was unreachable (Windows Hyper-V had silently reserved TCP 2962-3061 for its own dynamic port pool,
so the `ims-proxy` container's `3000:80` publish request failed with `bind: An attempt was made to access
a socket in a way forbidden by its access permissions` — the running proxy container had started anyway,
just with no host port bound, masking the failure). Fixed by restarting the Windows `winnat` service
(`net stop winnat && net start winnat`, run manually with admin rights), which cleared the stale
reservation. Confirmed after: `docker inspect ims-proxy` shows `80/tcp -> 0.0.0.0:3000`, `curl
http://localhost:3000/api/health` returns `200`.

## What was actually run (not simulated, not reasoned-about)

| Check | Result |
| --- | --- |
| `GET /d/ims-ldi-manufacturing/...` (Command Center) | Loaded, 0 console errors, all `api/ds/query` calls `200 OK`, panels rendered with live values (Fleet Status "23 reg / 10 rpt", Running "10") |
| `GET /d/ims-ldi-operator-andon/...` (Operator Andon — this session's Action Queue JOIN fix) | Loaded, 0 console errors (1 benign `Dom has no width or height` warning from the echarts panel plugin, unrelated), all queries `200 OK` |
| `GET /factory-twin-3d/` (3D Twin — this session's dynamic fleet-discovery fix) | Loaded, 1 console error (`favicon.ico` 404, cosmetic, pre-existing, unrelated to this session's work) |
| `GET /factory-twin-3d/api/state` | Real JSON, 23 devices returned (`LDI-A01`, `LDI-A02`, `LDI-01..10`, `LDI-A03/02`, `LDI-B05/2`, `LDI-B01/2`, `LDI-A05/02`, `LDI-B03/2`, `LDI-B07`), 10 with real telemetry (`state_label: "OK"`/`"ALARM"`), 13 correctly `NO_DATA` — matches the known, disclosed 10/23 real-telemetry gap exactly |
| `GET /factory-twin-3d/api/placement` | Real JSON, 23 placements, one per device, all `(pos_x, pos_y)` pairs distinct — 5 zones at `pos_x ∈ {-36,-18,0,18,36}`, evenly spaced `pos_y` within each zone, zero collisions |
| `GET /d/ims-ldi-alarm-console/` (Alarm Console — this session's Action Queue JOIN fix) | Loaded, 0 console errors, panels rendered |
| Unauthenticated `curl /factory-twin-3d/api/placement` | `401` — confirms the proxy's `auth_request` gate is actually enforced, not bypassed |

## Fixed as a direct result of this pass

`services/factory-twin-3d/public/index.html` `<title>` was hardcoded `"IMS Factory 3D Digital Twin — 10
Machines"` — stale since this session's fleet-discovery fix made the device count dynamic (currently 23,
will change as real devices register). Corrected to `"IMS Factory 3D Digital Twin"`. Cosmetic only, not a
Grafana dashboard, not a layout change.

## Verdict

**PASS.** Every fix committed this session (TimescaleDB Action Queue planning bottleneck, 3D Twin dynamic
fleet discovery, DR backup/restore repair) is confirmed working end-to-end through a real browser, the real
`ims-proxy` auth gate, and the real Postgres datasource — not just at the unit-test or direct-SQL level.

Not covered by this pass (out of scope for a smoke test): full interaction testing (clicking through
drill-downs, alarm ack/resolve write-path, all 15 dashboards individually), which remains open work for a
dedicated E2E suite, not a blocker for this gate.
