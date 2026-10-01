<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Software Supply Chain & Dependency Governance Policy</h1>
  <p><b>SLSA Level 3 framework, CycloneDX SBOM generation, container image digest pinning, open-source license compliance, and vulnerability remediation SLAs</b></p>
  <p>
    <a href="SUPPLY_CHAIN_POLICY.md">English</a> |
    <a href="../../th/docs/security/SUPPLY_CHAIN_POLICY.md">ไทย</a> |
    <a href="../../zh-CN/docs/security/SUPPLY_CHAIN_POLICY.md">简体中文</a>
  </p>
</div>

---

## 1. Governance Objectives & SLSA Framework

Modern industrial telemetry systems rely on a combination of container runtimes, open-source libraries (Node.js, Python, Go, Rust), and infrastructure images. A compromised upstream dependency or poisoned base image introduces severe supply chain risks into industrial manufacturing networks.

IMS adopts the **Supply-chain Levels for Software Artifacts (SLSA v1.0) Level 3** framework across all build and release pipelines:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Source Control  │ ----> │ Ephemeral Build │ ----> │ Signed Registry │
│ Pinned Commits  │       │ Isolated Runner │       │ Cosign / OCI    │
│ Branch Rulesets │       │ SLSA Provenance │       │ Immutable Hash  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

- **Source Integrity**: All code merges require signed commits (`GPG` / `SSH`), multi-reviewer approval, and passing pre-commit linters.
- **Build Isolation**: Container builds execute inside ephemeral GitHub Actions runners without persistent volume caches.
- **Provenance & Attestation**: Release artifacts generate cryptographically signed in-toto provenance attestations via Sigstore `cosign`.

---

## 2. Software Bill of Materials (SBOM) Generation

IMS mandates the continuous generation of machine-readable Software Bill of Materials (SBOM) adhering to the **CycloneDX v1.5 (JSON)** and **SPDX v2.3** specifications for every released container and software bundle.

### Generating CycloneDX SBOMs via CLI

Developers and CI/CD pipelines use Anchore `syft` and Aqua Security `trivy` to generate comprehensive dependency inventories:

```bash
# 1. Generate container filesystem SBOM in CycloneDX JSON format
syft ims-alarm-api:latest -o cyclonedx-json=sbom-alarm-api.cdx.json

# 2. Generate Node-RED runtime dependencies SBOM
syft dir:./nodered_data -o cyclonedx-json=sbom-nodered.cdx.json

# 3. Inspect high-level package components from generated SBOM
jq '.components[] | {name: .name, version: .version, type: .type}' sbom-alarm-api.cdx.json | head -n 25
```

---

## 3. Container Base Image Governance & Digest Pinning

To prevent mutable tag pollution (`:latest` drift or unauthorized upstream image replacements), all production deployment configurations (`docker-compose.yaml`, `docker-compose.prod.yaml`) must pin images to their immutable SHA-256 cryptographically verified digest:

```yaml
# Strict Image Digest Pinning Pattern
services:
  timescaledb:
    image: timescale/timescaledb-ha:pg16-ts2.15-oss@sha256:69b4e3c98dc65b53eef6a06be38b4b734898165cf9c0daae1540608ebcf2fe56
```

### Approved Base Image Catalog

| Service Component | Base OS / Distribution | Minimum Base Image Standard | Hardening Measures |
|:------------------|:-----------------------|:----------------------------|:-------------------|
| `timescaledb` | Debian Bookworm Slim | Pinned Vendor Official Image | Non-root `postgres` UID 70, read-only rootfs |
| `pgbouncer` | Alpine Linux 3.19 | Minimal static binary | Non-root `postgres` UID 70, dropped `CAP_NET_RAW` |
| `node-red` | Alpine Linux 3.19 | Official Node-RED container | Non-root `node-red` UID 1000, sandbox global bindings |
| `grafana` | Alpine Linux 3.19 | Official Grafana Enterprise/OSS | Non-root `grafana` UID 472, read-only provisioning |
| `prometheus` | Alpine / Distroless | Official Prometheus binary | Non-root `nobody` UID 65534, isolated TSDB storage |
| `nginx-proxy` | Alpine Linux 3.19 | Official Nginx unprivileged | Non-root `nginx` UID 101, unprivileged ports (:8080/:8443) |

---

## 4. Open-Source License Compliance

To protect intellectual property and eliminate legal contamination of proprietary industrial algorithms, third-party software dependencies are governed by strict license filters:

```
[Permitted Licenses - Commercial / Enterprise Safe]
  ├── MIT License
  ├── Apache License 2.0
  ├── BSD 2-Clause / 3-Clause
  ├── ISC License
  └── Creative Commons Zero (CC0)

[Conditionally Permitted - Isolated Microservice Containers Only]
  ├── LGPL v2.1 / v3.0 (Dynamically linked libraries only)
  └── Mozilla Public License 2.0 (MPL-2.0)

[Strictly Prohibited - Contagious Copyleft (Instant PR Rejection)]
  ├── GNU General Public License v3.0 (GPLv3)
  ├── Affero General Public License (AGPL-3.0)
  └── Server Side Public License (SSPL)
```

### Automated License Audit Script

```bash
# Audit all Node.js workspace dependencies for non-compliant licenses
npx license-checker --summary --excludePrivatePackages \
  --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;CC0-1.0;0BSD"
```

---

## 5. Vulnerability Remediation SLAs & CVSS Scoring

All discovered vulnerabilities across container images, application dependencies, and operating system packages are classified using the **Common Vulnerability Scoring System (CVSS v3.1 / v4.0)** and must be remediated according to strict Service Level Agreements (SLAs):

| Vulnerability Severity | CVSS Base Score | Mandatory Remediation SLA | Escalation & Response Protocol |
|:-----------------------|:----------------|:--------------------------|:-------------------------------|
| **CRITICAL** | `9.0 - 10.0` | **Within 24 Hours** | Emergency hotfix branch; immediate production rollout; CISO & Plant Manager notification. |
| **HIGH** | `7.0 - 8.9` | **Within 7 Days** | Scheduled expedited release; security team review; regression testing in staging. |
| **MEDIUM** | `4.0 - 6.9` | **Within 30 Days** | Addressed during regular sprint cycle or scheduled monthly maintenance window. |
| **LOW** | `0.1 - 3.9` | **Within 90 Days** | Evaluated during routine quarterly dependency upgrades. |

---

## 6. Continuous Security Scanning CLI Workflows

Security verification is integrated into local developer workflows and automated CI pipelines:

```bash
# 1. Scan filesystem source code for hardcoded secrets and known vulnerabilities
trivy fs --severity HIGH,CRITICAL --scanners vuln,secret,config .

# 2. Scan built container image before pushing to registry
trivy image --severity HIGH,CRITICAL ims-alarm-api:latest

# 3. Verify digital signature of release container via Cosign
cosign verify \
  --key cosign.pub \
  ghcr.io/pattanakorn025/ims-alarm-api:v2.4.0
```
