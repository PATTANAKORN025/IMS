<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Container Image Vulnerability Scan — First Real Run

Run: 2026-08-21, `node tests/security/runner.js --full` (Trivy via Docker, same trick proven for gitleaks
earlier this session). This is the framework's first end-to-end run of the `security.trivy.*` checks —
container image scanning had never actually been performed against this stack before.

## Results (real, not simulated)

| Image | CRITICAL | HIGH | Status |
| --- | --- | --- | --- |
| `ims-alarm-api` (custom build) | 1 | 7 | FAIL |
| `ims-factory-twin-3d` (custom build) | 1 | 7 | FAIL |
| `ims-node-red` (custom build) | 7 | 110 | FAIL |
| `timescale/timescaledb:2.29.0-pg16` | 3 | 89 | FAIL |
| `grafana/grafana:13.1.1` | 1 | 45 | FAIL |
| `prom/prometheus:v3.13.1` | 0 | 22 | FAIL |
| `prom/alertmanager:v0.33.1` | 0 | 44 | FAIL |
| `edoburu/pgbouncer:v1.25.2-p0` | 0 | 2 | FAIL |

`npm audit` across all 4 real lockfiles (root, alarm-api, factory-twin-3d, nodered_data) is **clean, 0
vulnerabilities** — every finding above is at the OS-package layer (Trivy's `Vulnerabilities[].PkgName`
entries are OS packages, not npm packages; confirmed by checking `ims-node-red`'s result specifically for the
`socket.io-parser` HIGH that `npm audit` did catch separately — Trivy's OS-layer scan doesn't overlap with
that finding at all, they're two different vulnerability surfaces).

## Reading this honestly

This is not a defect introduced by this project's own Dockerfiles or application code. All 8 images'
findings live in the OS package layer of their **base images** — 5 of the 8 are official upstream vendor
images (`timescale/timescaledb`, `grafana/grafana`, `prom/prometheus`, `prom/alertmanager`,
`edoburu/pgbouncer`) pulled and pinned to specific tags for compatibility reasons already documented
elsewhere in this session (e.g. `timescaledb:2.29.0-pg16` matches exact schema/extension behavior this
system's migrations depend on). The 3 custom-built images (`ims-alarm-api`, `ims-factory-twin-3d`,
`ims-node-red`) inherit their base-OS vulnerability surface from `node:*`/`nodered/node-red:*` base images,
not from anything added in this repo's own `Dockerfile`s.

One specific, named root cause: `ims-node-red`'s base (`nodered/node-red:4.0.5-22-minimal`) runs on
**Alpine 3.20.3, confirmed EOSL (end-of-service-life)** by Trivy's own metadata — no further security patches
ship for that Alpine release, which is why it carries by far the worst count (7 CRITICAL, 110 HIGH) of the
three custom images.

## What this session does NOT do about it

Bumping 8 base image tags (5 of them exact-pinned upstream images this system's real behavior depends on) is
a large, cross-cutting, high-blast-radius change that needs its own careful testing per image — not a
same-turn fix bundled into building the scanning framework itself. Consistent with this session's standing
practice (see the TimescaleDB backup/restore and soak-script fixes: real defects get disclosed and either
fixed with direct evidence or explicitly deferred, never silently patched around or hidden behind a weakened
check): **this finding is disclosed, not remediated, and the gate is not weakened to hide it.**
`tests/security/risk-exceptions.json` stays empty — none of these findings have a documented mitigation,
owner, or expiry yet, so none of them get downgraded from FAIL to WARN. The Production Assurance
Framework's `security`/`full` profile correctly reports **NO-GO** for this run, and that NO-GO is accurate,
not a bug to be argued away.

## Verdict

**NO-GO for `security full` today, and that's the framework working as designed** — it surfaced a real,
previously-unmeasured problem (8/8 images carry unpatched OS-layer CVEs, one image on an EOSL base) instead
of reporting a false PASS. Remediation (base-image version strategy per image, tracked risk exceptions where
a finding genuinely doesn't apply to this deployment's attack surface, or upgrades where it does) is real
follow-up work, out of scope for this framework-building session.
