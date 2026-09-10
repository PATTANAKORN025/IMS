# Data Governance & Compliance Policy

## 1. Data Classification
- **Public**: System architecture docs, generic schemas.
- **Internal**: Machine configurations, standard telemetry.
- **Confidential (PII)**: Operator IDs, employee shift logs, internal IP addresses.

## 2. PII Masking & Privacy (PDPA/ISO 27001)
- Operator IDs injected into alerts must be masked or pseudonymized in long-term storage.
- Raw telemetry data logs must automatically expire after 90 days. Continuous aggregates (which scrub PII automatically) are retained for 3 years.

## 3. Access Control (RBAC)
- **NOC Operators**: Read-only Grafana access.
- **Engineers**: Dashboard edit rights, No raw DB access.
- **Admins**: Direct DB access (audited via PgBouncer logs).
