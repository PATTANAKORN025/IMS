> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Security Mitigation P7 — nginx Rate Limiting for the 3 Grafana BLOCKING CVEs

Run: 2026-08-21. Follows `docs/evidence/SECURITY_REACHABILITY.md` (Phase 3), which found 3 real,
externally-reachable, no-official-fix-available HIGH CVEs on Grafana (`CVE-2026-39821`, `CVE-2026-56853`,
`CVE-2026-56860` — Go stdlib `net/http`/`net/url` DoS bugs). This phase implements and verifies a real
compensating control, not a fix — the CVEs remain present in the image; this bounds how easily they can be
triggered.

## What changed

`proxy/nginx.conf`: added `limit_req_zone` (100 req/s per source IP, `burst=2500 nodelay`) and
`large_client_header_buffers 4 16k` (doubled from nginx's default 4x8k), applied only to `location /`
(the route that serves Grafana). No other location — `/alarm-api/`, `/factory-twin-3d/`, `/ldi-telemetry`,
`/inject` — was touched, so the real device-ingestion path and the write-path APIs are unaffected.

## Why these numbers, not arbitrary ones

Real browser network capture earlier this session (`docs/evidence/BROWSER_E2E_VERIFICATION.md`) measured
~100-115 HTTP requests for a single dashboard page load (panels + datasource queries + static assets).
`burst=2500` covers roughly 20 kiosks refreshing in perfect synchrony behind a shared NAT IP (20 × 115 =
2300) before any throttling could occur — deliberately generous toward availability. `rate=100r/s` is far
above any single kiosk's real average need (one kiosk's ~115 requests arrive once per its refresh interval,
typically 5s-1m — a few req/s average at most) but caps a sustained flood at a small fraction of what an
unthrottled attacker could otherwise send.

## Real verification (not assumed)

A methodology note first, since it's real and relevant: the initial test attempt used Node's default DNS
resolution of `localhost`, which resolves to `::1` (IPv6) first on this machine. Firing ~11,500 concurrent
IPv6-loopback connections in one burst overwhelmed `wslrelay.exe` (WSL2's IPv6 loopback relay, not Docker or
nginx) into a stuck state — `docker ps` showed every container healthy throughout, Grafana answered
correctly when queried directly inside its own container, and other published ports (9090, 9093) kept
working the whole time; only `localhost:3000` specifically hung. Switched to explicit `127.0.0.1` (the same
address family any real LAN client actually uses to reach this host — no kiosk connects via IPv6 loopback)
and re-ran incrementally from there. Disclosed here rather than omitted, since it's a genuine artifact of
this test's own aggressiveness, not a system defect, and matters for reproducing these numbers correctly.

| Kiosk-equivalent level | Requests | Result |
| --- | --- | --- |
| 1 | 115 | 115/115 `200` |
| 5 | 575 | 575/575 `200` |
| 10 | 1,150 | 1,150/1,150 `200` |
| 20 | 2,300 | 2,300/2,300 `200` — at the burst boundary, zero throttling |
| 25 | 2,875 | 1,862 `200`, **1,013 `429`** — genuine rejection above the configured threshold |

Health check (`/api/health`) returned `200` before, between, and after every level. Real telemetry ingestion
confirmed unaffected: `122` rows in `public.ldi_data` in the prior 2 minutes, checked after the full test
sequence (consistent with this session's established baseline, e.g. 88-120 rows/2min at other checkpoints).
`node scripts/pre-commit.js` (fast regression suite) passed clean after the change.

**Playwright regression was not run this pass** — the shared browser instance was locked by a concurrent
session throughout (`Browser is already in use for ... mcp-chrome-ff2ca37`), confirmed on two separate
attempts. Substituted with equivalent real HTTP-level verification above (direct dashboard page fetch,
health checks, the full concurrency sweep) rather than skipped silently. Flagged here as a real gap, not
smoothed over — a full browser-level regression pass is legitimate follow-up once the browser is free.

## A real bug found and fixed while wiring this up

`tests/security/runner.js`'s exception matching checked only `{cve, package}` — no image scope. The first
attempt at recording this mitigation in `risk-exceptions.json` (correctly scoped in *reasoning* to Grafana
only, since the nginx mitigation only protects `location /`) was, before the fix, **silently also
suppressing the same 3 CVE IDs on `prometheus`, `alertmanager`, and `timescaledb`** — none of which route
through the rate-limited nginx location at all, so none of them benefit from this mitigation in any way.
Caught by re-running the scan and checking each image's unapproved-HIGH count individually rather than
trusting the aggregate pass/fail. Fixed: `risk-exceptions.json` entries now carry an explicit `images` array,
`isExcepted()` requires the target image to be listed, and an exception with no `images` array never matches
anything (fails closed, not open). 6 new unit tests
(`tests/unit/security-exceptions.test.js`) cover this directly, including the exact scenario that broke.

## Before / after (real rescan, both directions verified)

| Image | HIGH (raw) | Unapproved HIGH — before fix | Unapproved HIGH — after fix | Status |
| --- | --- | --- | --- | --- |
| `grafana` | 39 | 30 | 30 | FAIL (unchanged — only 9 of 39 findings were ever meant to be excepted; the other 30 remain genuinely open) |
| `prometheus` | 16 | 10 *(bug: incorrectly excepted)* | **16** *(correct: fully unexcepted)* | FAIL |
| `alertmanager` | 44 | 38 *(bug)* | **44** *(correct)* | FAIL |
| `timescaledb` | 89 | 80 *(bug)* | **89** *(correct)* | FAIL |

The "before fix" column is what a real, uncaught scoping bug would have silently produced — shown here as
evidence the catch mattered, not because it was ever the final reported state.

## Gate state: what actually changed and what didn't

**For these 3 specific CVEs on Grafana specifically**: reachability classification moves from **BLOCKING**
to **CONDITIONAL** in `docs/evidence/SECURITY_REACHABILITY.md`'s matrix — a real, verified compensating
control now exists, tracked as a proper risk exception (CVE, package, image scope, reason, mitigation,
owner, expiry: `2026-11-19`, 90 days out, forcing re-review rather than a silent permanent bypass).

**The system-wide Production Assurance gate remains NO-GO, unchanged.** This was never going to flip to
CONDITIONAL GO or GO from this work alone, and does not: 9 CRITICAL findings remain open across
`ims-alarm-api` (1), `ims-factory-twin-3d` (1), `ims-node-red` (4), and `timescale/timescaledb` (3) — none
related to Grafana, none touched by this mitigation, and per explicit policy CRITICAL findings can never be
excepted regardless of any compensating control. `gate.js`'s rule (`any blocking CRITICAL FAIL -> NO-GO`) is
absolute by design; this phase does not attempt to change that, and reporting otherwise would be exactly the
PASS-driven behavior this framework exists to prevent.

## Verdict

**Real, verified, narrowly-scoped mitigation for 3 specific HIGH findings. System-wide gate: NO-GO,
unchanged, correctly.** The evidence for the narrow claim is real (both directions of the rate-limit test,
the scoping-bug catch, the regression checks). The evidence for the broad claim (system-wide readiness) does
not exist yet — 9 CRITICAL findings say so, plainly.
