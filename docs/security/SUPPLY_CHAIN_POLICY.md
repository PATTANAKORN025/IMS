# Software Supply Chain & Dependency Policy

This document defines the security standards for all third-party libraries, base images, and plugins used in the IMS platform.

## 1. SBOM (Software Bill of Materials)
- IMS uses **CycloneDX** standard for SBOM generation.
- SBOMs are generated automatically on every build in CI/CD.

## 2. License Compliance
- **Permitted**: MIT, Apache 2.0, BSD (2-Clause/3-Clause), ISC.
- **Banned**: GPLv3, AGPL (unless isolated via strictly separated network APIs).

## 3. Vulnerability Management (SLA)
- **CRITICAL**: Patch within 24 hours.
- **HIGH**: Patch within 7 days.
- **MEDIUM/LOW**: Review during monthly maintenance windows.
