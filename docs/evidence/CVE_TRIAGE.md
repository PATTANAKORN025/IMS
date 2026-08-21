<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# CVE Triage — Container Image Findings

Run: 2026-08-21. Follows `docs/evidence/SECURITY_CONTAINER_SCAN.md`'s first Trivy pass (8 images, 13
CRITICAL / 326 HIGH, all disclosed as unremediated). This is the depth pass: per-CVE package/version/fix,
real exploitability checks (not assumed from severity labels alone), one verified fix, and an honest
before/after.

## Scope and rule

CRITICAL findings are never eligible for a risk exception in this framework — `tests/security/runner.js`'s
`isExcepted()` hard-rejects anything that isn't `HIGH` before it ever reads `risk-exceptions.json`, and
`gate.js` treats any blocking CRITICAL as automatic NO-GO regardless of that file's content. A CRITICAL only
leaves this report by being genuinely fixed and re-scanned, never by argument. Real exploitability analysis
below is recorded as **risk-prioritization context** — it explains why some findings are lower real-world
risk than their CVSS score alone suggests, and it does not change any status.

## Fixed and verified (1 of 8 images touched)

`nodered_data/Dockerfile` added `RUN apk update && apk upgrade --no-cache` before the existing npm install
step — a same-release Alpine 3.20 package patch, not a base-image tag bump. `docs/evidence/
SECURITY_CONTAINER_SCAN.md` had called Alpine 3.20.3 "confirmed EOSL"; that turned out to be wrong for the
package repository as a whole — `apk update` reached `dl-cdn.alpinelinux.org/alpine/v3.20` live and served
real updates (the 3.20.3 image tag was stale, not the 3.20 release line). Rebuilt, restarted, verified
healthy and still ingesting real telemetry (88 rows in the prior 2 minutes) before re-scanning.

| Image | Before | After | Change |
| --- | --- | --- | --- |
| `ims-node-red` | 7 CRITICAL, 110 HIGH | **4 CRITICAL, 72 HIGH** | -3 CRITICAL, -38 HIGH |

The 3 resolved CRITICALs were all `CVE-2026-31789` (OpenSSL heap buffer overflow, CVSS 9.8) across
`libcrypto3`/`libssl3`/`openssl` — confirmed gone from the post-fix scan. This also happened to be the one
finding with the strongest non-exploitability case (see below) — it's fixed anyway, not excepted, because a
real fix was available and low-risk to apply.

## Full inventory (real numbers, before this session's fix)

| Severity | Count (8 images) | Fixable (FixedVersion published) |
| --- | --- | --- |
| CRITICAL | 13 → **10** (after fix) | 13/13 (100%) |
| HIGH | 326 → **288** (after fix) | 326/326 (100%) |

31 CVEs appear in 2+ images (shared base-layer packages — expected, not double-counted risk). Full raw
per-CVE inventory (all fields: image, target, CVE, package, installed/fixed version, CVSS) generated to
`docs/evidence/runtime/` per run (gitignored, regenerable via `node tests/security/runner.js --full`).

## CRITICAL findings — full detail, 10 remaining

| Image | CVE | Package | Installed → Fixed | CVSS | Target (what actually carries it) | Real exploitability in this deployment |
| --- | --- | --- | --- | --- | --- | --- |
| `grafana/grafana:13.1.1` | GHSA-r277-6w6q-xmqw | `kin-openapi` | v0.140.0 → 0.144.0 | 9.1 | main `grafana` binary | **Undetermined.** Used for OpenAPI-based request validation in Grafana's newer App Platform API surface. Not verified whether this deployment's actual usage (dashboards, alerting, datasource proxying only) exercises that code path — treated conservatively as exposed, not excepted from anything. |
| `ims-alarm-api` | CVE-2026-59873 | `tar` | 7.5.11 → 7.5.19 | 7.5 | `Node.js` layer (npm's own bundled tooling) | **Low.** Grep-confirmed zero `tar` usage anywhere in `services/alarm-api/server.js`. Exploiting a tar-extraction DoS requires the running process to call `tar.extract()` on attacker-controlled input; this service never does. |
| `ims-factory-twin-3d` | CVE-2026-59873 | `tar` | 7.5.11 → 7.5.19 | 7.5 | `Node.js` layer | **Low.** Same as above — grep-confirmed zero usage in `services/factory-twin-3d/server.js` or `public/*.js`. |
| `ims-node-red` | CVE-2026-59873 | `tar` (3 copies: 6.2.1, 7.4.3 ×2) | → 7.5.19 | 7.5 | `Node.js` layer | **Low.** Node-RED's own archive-based project-import feature is the plausible caller — confirmed **disabled**: `nodered_data/settings.js:52`, `editorTheme.projects.enabled=false`, also logged live at container startup ("Projects disabled"). |
| `ims-node-red` | CVE-2025-7783 | `form-data` | 4.0.0 → 2.5.4/3.0.4/4.0.4 | 5.4 (labeled CRITICAL by GHSA despite the CVSS number) | `Node.js` layer | **Plausible via editor UI only.** This deployment's actual flows POST JSON/SNMP, never multipart form-data — but Node-RED's own editor may use it for asset uploads regardless of flow content. Editor is loopback-only (`127.0.0.1:1880`, confirmed earlier this session, not network-exposed), which meaningfully narrows the attacker population to "already has host access" — not zero risk, not dismissed. |
| `timescale/timescaledb:2.29.0-pg16` | CVE-2025-68121 | Go `stdlib` (`crypto/tls`) | v1.24.6 → 1.24.13+ | 10.0 | `usr/local/bin/gosu` | **Very low.** `gosu` is a small setuid-and-exec utility invoked once at container startup only, to drop from root to the postgres user. It makes zero network connections and never calls into `crypto/tls`; Go statically links the whole stdlib into the binary regardless of what the program actually uses, which is why the CVE shows up here at all. |
| `timescale/timescaledb:2.29.0-pg16` | CVE-2026-33815 | `github.com/jackc/pgx/v5` | v5.7.2 → 5.9.0 | 8.3 | `usr/local/bin/timescaledb-parallel-copy` | **Very low.** Bulk-CSV-load CLI, not the postgres server process. Grep-confirmed: never invoked anywhere in `scripts/` or `database/` — this deployment's real ingestion path is Node-RED inserts, not this tool. |
| `timescale/timescaledb:2.29.0-pg16` | CVE-2026-33816 | `github.com/jackc/pgx/v5` | v5.7.2 → 5.9.0 | 8.3 | `usr/local/bin/timescaledb-parallel-copy` | Same as above. |

All 10 remain **FAIL**, correctly. None are excepted — CRITICAL cannot be, by rule, and none of these were
patchable by an in-place OS package upgrade the way the OpenSSL trio was (`kin-openapi`/`form-data`/`pgx`/Go
`stdlib` are all compiled into the binary, not swappable OS packages — fixing them means the upstream image
maintainer ships a new build, or this project rebases to a newer image tag, both larger changes than a
same-release `apk upgrade`, deliberately not attempted in this pass).

## Runner bug found and fixed during this triage

`tests/security/runner.js`'s exception logic checked `exceptions.length > 0` — "does the file contain any
entry at all" — rather than matching the specific CVE and package. Since `risk-exceptions.json` was empty
throughout Phase 1, this bug was never actually exercised, but it would have silently downgraded **every**
HIGH finding everywhere the moment a single unrelated entry was added. Fixed to match per-CVE-per-package
(`isExcepted()`), and hard-gated so CRITICAL can never reach the exception check at all. Covered by this
triage's real runs, not a new unit test in this pass (that's reasonable follow-up, not done here to keep
this commit scoped to remediation + triage, not framework expansion).

## Remaining risk (honest, not smoothed over)

- **10 CRITICAL still open**, all disclosed above with real exploitability context. None are fixed. The
  `full`/`security` profile verdict remains **NO-GO** — that's correct, not a bug.
- **288 HIGH still open**, not individually triaged to this depth this session (326 minus the 38 the OpenSSL
  fix incidentally resolved). Full HIGH-severity triage at CRITICAL's depth is real follow-up work, out of
  scope for one pass given the volume.
- **7 of 8 images untouched.** Only `ims-node-red` got a real fix. The other 2 custom-built images
  (`ims-alarm-api`, `ims-factory-twin-3d`) share the same `tar`-in-`Node.js`-layer finding but weren't
  patched here (no equivalent low-risk same-release patch identified for their base — that's a different
  investigation, not done in this pass). The 5 pulled vendor images (`timescaledb`, `grafana`, `prometheus`,
  `alertmanager`, `pgbouncer`) are untouched by design — version-pinned for compatibility reasons documented
  elsewhere in this session, and a base-image bump for any of them needs its own dedicated regression pass.

## Verdict

**NO-GO for `security full`, unchanged in kind, real progress in degree.** 3 CRITICAL genuinely fixed and
verified (not argued away). 10 remain, each with real exploitability evidence recorded rather than assumed
from CVSS alone, and none downgraded by that evidence — the gate stays honest. This is what "evidence-driven,
not PASS-driven" looks like in practice: the framework found a real problem, this pass fixed what could be
fixed safely, and disclosed the rest precisely instead of arguing the number down.
