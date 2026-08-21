<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Security Reachability & Exploitability Gate

Run: 2026-08-21. Follows Security Phase 2 (`docs/evidence/CVE_TRIAGE.md`): 9 CRITICAL unresolved, 274 HIGH,
23 unique HIGH CVEs identified as reaching an actual listening binary (T1). This phase answers the question
Phase 2's tier classification couldn't: **for those T1 findings specifically, is the vulnerable code path
actually reachable, and under what conditions** — not just "which binary is it compiled into."

No package upgrades in this phase — everything below is analysis against the current, already-patched
(Phase 2) images. CVSS scores are reported exactly as published; nothing here downgrades a score, only adds
reachability context alongside it.

## Real infrastructure facts this analysis is grounded in

- **Grafana**: no direct host port (`docker inspect ims-grafana` → `{"3000/tcp":null}`). Reachable only
  through `ims-proxy`, which publishes `0.0.0.0:3000` (all interfaces — genuinely LAN-reachable, not just
  localhost). `proxy/nginx.conf`'s `location /` (which serves Grafana) has **no** `auth_request` gate —
  only `/alarm-api/` and `/factory-twin-3d/` do. Grafana's own session/login enforcement happens at the
  application layer, after nginx has already forwarded the request and Grafana's HTTP server has already
  parsed it.
- **Alertmanager / Prometheus**: both bound `127.0.0.1` only (`docker inspect` confirmed) — reachable only
  from the Docker host itself, never from the LAN. Neither has built-in authentication (standard for both
  tools) — anyone who can reach the loopback address gets full access, but that requires already being on
  the host machine.
- **No mTLS/client-certificate configuration anywhere** in this deployment (grepped `docker-compose.yaml`
  and `monitoring/`) — rules out the `encoding/asn1`/certificate-parsing class of findings across all three
  services.
- **No SAML or XML-based feature configured** — rules out `encoding/xml` findings.
- **Alertmanager runs single-instance**, no `--cluster.*` flags in its `command:` — rules out its gRPC
  clustering findings and its bundled `golang.org/x/crypto/ssh` findings (Alertmanager has no SSH
  client/server feature at all; the package is vendored but never invoked).
- **Grafana's `GF_PANELS_DISABLE_SANITIZE_HTML=true`** is a real, separate risk factor (frontend panel HTML
  rendering, unsanitized) — noted where relevant, but kept distinct from the server-side Go `html/template`
  CVE below, which is a different code path.
- **Grafana's plugin update checker makes real outbound HTTPS calls** (confirmed via startup logs) — this
  is what makes the client-side `crypto/tls` finding reachable at all, and only in the outbound direction.

## Categorization used

`EXTERNALLY_REACHABLE` (LAN/network, no auth needed to trigger) · `INTERNALLY_REACHABLE` (docker-network or
host-loopback only, no auth needed within that scope) · `AUTH_REQUIRED` (needs an authenticated session to
trigger) · `UNREACHABLE` (present in the image, feature not used/configured/invoked in this deployment) ·
`BUILD_CLI_ONLY` (not applicable to this T1 set — that covers Phase 2's peripheral-tool findings, not these
main-binary ones).

## Result summary

| Gate | Count | Meaning |
| --- | --- | --- |
| **BLOCKING** | 0 *(was 3 as of this phase; 0 after P7's nginx rate limiting, see below)* | Externally reachable (LAN), no auth needed, real DoS-class trigger |
| **CONDITIONAL** | 20 *(was 17; +3 from P7)* | Reachable but requires an elevated prerequisite (loopback-only access, a compromised upstream data source, an authenticated session, an attacker-controlled outbound destination, **or a verified compensating control that bounds but doesn't close the path**) |
| **INFORMATIONAL** | 18 | Present in the image, confirmed not exercised by this deployment's actual configuration/feature usage |

**Update, 2026-08-21 (P7)**: the 3 BLOCKING findings below were real and unresolved when this phase was
written. `docs/evidence/SECURITY_MITIGATION_P7.md` deployed and verified real nginx rate limiting for them —
the table rows below are updated in place to CONDITIONAL rather than duplicated, since the underlying
finding (image row) is the same, only its reachability classification changed with real new evidence. This
does **not** change the system-wide Production Assurance gate, which remains NO-GO on 9 unrelated CRITICAL
findings — see P7's evidence doc for that distinction spelled out explicitly.

## Full matrix (38 findings — 23 unique CVEs × affected images)

<!-- The 3 BLOCKING findings are the same CVE (net/http-family DoS bugs) hitting Grafana specifically,
     since Grafana is the one T1 service actually reachable from the LAN. -->

| CVE | Image | Severity | CVSS | Reachability | Auth | Code Path | Exploitability | Fix | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CVE-2026-39821 | grafana | HIGH | 8.2 | EXTERNALLY_REACHABLE | NO (pre-auth HTTP parsing) | net/http core request/response handling — exercised by every request including pre-auth ones (login page, health check) | Proxy publishes `0.0.0.0:3000` (LAN-reachable); nginx forwards `/` to Grafana without an `auth_request` gate — HTTP parsing occurs before Grafana's own app-level auth. DoS-class bug (malformed input). **P7 (2026-08-21): nginx rate limiting deployed and verified — see `docs/evidence/SECURITY_MITIGATION_P7.md`. Does not close the CVE, bounds exploitation volume.** | 1.25.13 | **CONDITIONAL** *(was BLOCKING, see P7)* |
| CVE-2026-56853 | grafana | HIGH | 7.5 | EXTERNALLY_REACHABLE | NO (pre-auth HTTP parsing) | net/http core request/response handling | Same reachability as above — unencrypted HTTP/2 handling bug. **P7: same mitigation, see `docs/evidence/SECURITY_MITIGATION_P7.md`.** | 1.25.13 | **CONDITIONAL** *(was BLOCKING, see P7)* |
| CVE-2026-56860 | grafana | HIGH | 7.5 | EXTERNALLY_REACHABLE | NO (pre-auth HTTP parsing) | net/url parsing (quadratic-complexity DoS) | Same reachability — any malformed URL sent to Grafana's port triggers `net/url` parsing pre-auth. **P7: same mitigation plus the header/URL size cap directly bounds this parser's worst-case input, see `docs/evidence/SECURITY_MITIGATION_P7.md`.** | 1.25.13 | **CONDITIONAL** *(was BLOCKING, see P7)* |
| CVE-2026-46600 | grafana | HIGH | 7.5 | INTERNALLY_REACHABLE | NO | Pure-Go DNS resolver (`x/net/dns/dnsmessage`), outbound lookups | Requires attacker to control/spoof a DNS response Grafana resolves (webhook/datasource hostname, plugin update check) — elevated prerequisite, real outbound-DNS feature confirmed active | 1.26.6 | CONDITIONAL |
| CVE-2026-56858 | grafana | HIGH | 8.1 | AUTH_REQUIRED | YES (editor/admin to inject; any session to trigger) | Server-side `html/template` rendering — distinct from the frontend panel-HTML sanitization setting (`GF_PANELS_DISABLE_SANITIZE_HTML=true`, a separate, compounding risk factor, not the same code path) | Stored-XSS pattern: needs an authenticated editor/admin to create malicious content, then any viewer session to trigger. Real path exists; exact internal trigger not independently confirmed | 1.25.13 | CONDITIONAL |
| CVE-2026-56862 | grafana | HIGH | 7.5 | INTERNALLY_REACHABLE | NO | `crypto/tls`, client-side only — Grafana never terminates inbound TLS (plain HTTP behind nginx, no cert config anywhere) | Only exercised on Grafana's *outbound* HTTPS calls (plugin update checker, confirmed active). Requires attacker to control/MITM an outbound destination — not triggerable via inbound port access | 1.25.13 | CONDITIONAL |
| CVE-2026-46600 | alertmanager | HIGH | 7.5 | INTERNALLY_REACHABLE | NO | Pure-Go DNS resolver, outbound lookups | Same DNS-spoofing prerequisite as Grafana's; bound `127.0.0.1` only | 0.56.0 | CONDITIONAL |
| CVE-2026-56852 | alertmanager | HIGH | 7.5 | INTERNALLY_REACHABLE | NO | General text normalization in request handling | Low confidence on exact trigger; part of core request-processing path | 0.39.0 | CONDITIONAL |
| CVE-2026-39821 | alertmanager | HIGH | 8.2 | INTERNALLY_REACHABLE | NO (pre-auth) | net/http core request handling | Bound `127.0.0.1` only — not LAN-reachable; no app auth either way | 1.25.13 | CONDITIONAL |
| CVE-2026-39822 | alertmanager | HIGH | 7.8 | INTERNALLY_REACHABLE | NO (pre-auth) | net/http core (`os.Root` symlink-following) | Same loopback-only reachability | 1.25.12 | CONDITIONAL |
| CVE-2026-56853 | alertmanager | HIGH | 7.5 | INTERNALLY_REACHABLE | NO (pre-auth) | net/http core (HTTP/2 cleartext) | Same loopback-only reachability | 1.25.13 | CONDITIONAL |
| CVE-2026-56858 | alertmanager | HIGH | 8.1 | INTERNALLY_REACHABLE | NO | Server-side `html/template` — notification templates for email/webhook receivers | Requires a malicious/compromised upstream alert source (label/annotation content) reaching the renderer — real feature (`alertmanager.yml` templates), elevated prerequisite via upstream data | 1.25.13 | CONDITIONAL |
| CVE-2026-56860 | alertmanager | HIGH | 7.5 | INTERNALLY_REACHABLE | NO (pre-auth) | net/url parsing | Same loopback-only reachability | 1.25.13 | CONDITIONAL |
| CVE-2026-56862 | alertmanager | HIGH | 7.5 | INTERNALLY_REACHABLE | NO | `crypto/tls`, client-side only — no inbound TLS termination | Only exercised on outbound HTTPS calls, if any (not confirmed for this service) | 1.25.13 | CONDITIONAL |
| CVE-2026-39821 | prometheus | HIGH | 8.2 | INTERNALLY_REACHABLE | NO (pre-auth) | net/http core request handling | Bound `127.0.0.1` only | 1.25.13 | CONDITIONAL |
| CVE-2026-46600 | prometheus | HIGH | 7.5 | INTERNALLY_REACHABLE | NO | Pure-Go DNS resolver, outbound lookups | Same DNS-spoofing prerequisite | 1.26.6 | CONDITIONAL |
| CVE-2026-56853 | prometheus | HIGH | 7.5 | INTERNALLY_REACHABLE | NO (pre-auth) | net/http core (HTTP/2 cleartext) | Same loopback-only reachability | 1.25.13 | CONDITIONAL |
| CVE-2026-56858 | prometheus | HIGH | 8.1 | INTERNALLY_REACHABLE | NO | Server-side `html/template` — expression-browser UI | Prometheus's own query/graph UI renders via html/template; same elevated-prerequisite reasoning as above, lower confidence on exact trigger | 1.25.13 | CONDITIONAL |
| CVE-2026-56860 | prometheus | HIGH | 7.5 | INTERNALLY_REACHABLE | NO (pre-auth) | net/url parsing | Same loopback-only reachability | 1.25.13 | CONDITIONAL |
| CVE-2026-56862 | prometheus | HIGH | 7.5 | INTERNALLY_REACHABLE | NO | `crypto/tls`, client-side only — no inbound TLS termination | Only exercised on outbound HTTPS calls, if any (not confirmed for this service) | 1.25.13 | CONDITIONAL |
| CVE-2026-21728 | grafana | HIGH | 7.5 | UNREACHABLE | N/A | Tempo datasource plugin | No Tempo datasource provisioned (`monitoring/grafana/provisioning/datasources/` — only `postgres` and `prometheus` types configured) | 2.8.4 | INFORMATIONAL |
| CVE-2026-28377 | grafana | HIGH | 6.5 | UNREACHABLE | N/A | Tempo datasource plugin | Same — not provisioned | 2.10.3 | INFORMATIONAL |
| CVE-2026-33818 | grafana | HIGH | 7.5 | UNREACHABLE | N/A | `encoding/asn1` (cert parsing) | No mTLS/client-cert config anywhere | 1.25.13 | INFORMATIONAL |
| CVE-2026-56859 | grafana | HIGH | 7.5 | UNREACHABLE | N/A | `encoding/xml` decoding | No XML-processing feature in use | 1.25.13 | INFORMATIONAL |
| CVE-2026-39828 | alertmanager | HIGH | 8.8 | UNREACHABLE | N/A | `x/crypto/ssh` (client+agent+knownhosts) | No SSH feature; single-instance, no clustering; dead vendored code | 0.52.0 | INFORMATIONAL |
| CVE-2026-39829 | alertmanager | HIGH | 7.5 | UNREACHABLE | N/A | `x/crypto/ssh` | Same | 0.52.0 | INFORMATIONAL |
| CVE-2026-39830 | alertmanager | HIGH | 7.5 | UNREACHABLE | N/A | `x/crypto/ssh` | Same | 0.52.0 | INFORMATIONAL |
| CVE-2026-39831 | alertmanager | HIGH | 8.1 | UNREACHABLE | N/A | `x/crypto/ssh` | Same | 0.52.0 | INFORMATIONAL |
| CVE-2026-39832 | alertmanager | HIGH | 8.7 | UNREACHABLE | N/A | `x/crypto/ssh/agent` | Same | 0.52.0 | INFORMATIONAL |
| CVE-2026-39835 | alertmanager | HIGH | 7.5 | UNREACHABLE | N/A | `x/crypto/ssh` | Same | 0.52.0 | INFORMATIONAL |
| CVE-2026-42508 | alertmanager | HIGH | 7.4 | UNREACHABLE | N/A | `x/crypto/ssh/knownhosts` | Same | 0.52.0 | INFORMATIONAL |
| CVE-2026-46595 | alertmanager | HIGH | 7.1 | UNREACHABLE | N/A | `x/crypto/ssh` | Same | 0.52.0 | INFORMATIONAL |
| CVE-2026-46597 | alertmanager | HIGH | 7.5 | UNREACHABLE | N/A | `x/crypto/ssh` | Same | 0.52.0 | INFORMATIONAL |
| GHSA-hrxh-6v49-42gf | alertmanager | HIGH | n/a | UNREACHABLE | N/A | gRPC clustering | No `--cluster.*` flags — clustering inactive | 1.82.1 | INFORMATIONAL |
| CVE-2026-33818 | alertmanager | HIGH | 7.5 | UNREACHABLE | N/A | `encoding/asn1` | No mTLS/client-cert config | 1.25.13 | INFORMATIONAL |
| CVE-2026-56859 | alertmanager | HIGH | 7.5 | UNREACHABLE | N/A | `encoding/xml` | No XML-processing feature in use | 1.25.13 | INFORMATIONAL |
| CVE-2026-33818 | prometheus | HIGH | 7.5 | UNREACHABLE | N/A | `encoding/asn1` | No mTLS/client-cert config | 1.25.13 | INFORMATIONAL |
| CVE-2026-56859 | prometheus | HIGH | 7.5 | UNREACHABLE | N/A | `encoding/xml` | No XML-processing feature in use | 1.25.13 | INFORMATIONAL |

## Reading this honestly

- **3 BLOCKING findings as of this phase, all on Grafana, all the same root cause**: it's the one T1 service
  genuinely reachable from the LAN (not just loopback), and nginx doesn't gate `/` the way it gates the
  write-path routes. These were real, not manufactured — CVSS 7.5–8.2, no auth needed, DoS-class (crash/hang
  the HTTP parser). Not fixed this phase (no concrete remediation beyond what Phase 2 already applied — the
  `13.1.2` tag didn't include these particular fixes, confirmed neither did `13.1.4` or `13.2.0`; a further
  version jump would need its own regression pass, out of scope for an analysis-only phase per instruction).
  **Update (P7, same day): a real nginx rate-limiting mitigation was deployed and verified for these 3 —
  they now read CONDITIONAL in the matrix above. Details: `docs/evidence/SECURITY_MITIGATION_P7.md`.**
- **17 CONDITIONAL findings share one of four elevated-prerequisite patterns**: loopback-only access (needs
  the attacker already on the host), a compromised/malicious upstream data source (DNS response or alert
  label content), an authenticated Grafana session, or control of an outbound HTTPS destination. None of
  these are "safe to ignore" — they're real paths with a real precondition, correctly not downgraded to
  INFORMATIONAL.
- **18 INFORMATIONAL findings are backed by concrete configuration evidence**, not assumption: grepped for
  Tempo provisioning (absent), mTLS config (absent), XML features (absent), cluster flags (absent). Every
  "not reachable" claim here traces to a specific file/command checked, not a guess.
- **No CVSS score was altered.** The Severity/CVSS columns are exactly what Trivy reported. Reachability is
  an additional column, not a replacement for severity.
- **No exceptions were written to `risk-exceptions.json`.** This phase is CRITICAL-free (all 38 rows are
  HIGH), and even the 18 INFORMATIONAL rows aren't formally excepted — they're documented as low-priority
  with evidence, which is a different thing from a tracked, expiring risk exception. That distinction is
  intentional: an exception is a decision to accept risk for a *scanned* finding; INFORMATIONAL here means
  the evidence says the finding doesn't apply to this deployment's actual configuration.

## Gate

**NO-GO as of this phase (reachability analysis, not remediation) — see `docs/evidence/
SECURITY_MITIGATION_P7.md` for the same-day follow-up that mitigated the 3 BLOCKING findings and the
system-wide gate state after that work (still NO-GO, on unrelated CRITICAL findings).** No CRITICAL or HIGH
count changed in this phase itself. It replaces "274 undifferentiated HIGH findings" with a precise,
evidence-backed answer to "which of these can someone actually reach, and how" for the 38 T1 rows. 3 were
real, externally-reachable, no-fix-applied-yet DoS bugs on the one LAN-facing service. That is exactly the
kind of finding this
framework exists to surface plainly rather than average away into a single pass/fail number.
