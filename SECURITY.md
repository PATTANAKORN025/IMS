# 🔒 Security Policy

> **นโยบายความปลอดภัยของ IMS (Infrastructure Monitoring System)**
> ทราบข้อจำกัดและแผนแก้ไขก่อน deploy ไปยัง Production

---

<div align="center">

![Security](https://img.shields.io/badge/Security-Policy-red)
![Status](https://img.shields.io/badge/Status-Staging-yellow)
![Updated](https://img.shields.io/badge/Updated-2026--06--29-blue)

</div>

---

## 📋 Known Limitations

| # | Issue | Severity | Status | Fix Plan |
|---|---|---|---|---|
| 1 | PgBouncer port exposed on host | ⚠️ Medium | Known | Bind localhost-only or use reverse proxy |
| 2 | Node-RED Admin UI has no auth | 🔴 High | Known | Add `adminAuth` in settings.js before production |
| 3 | SNMP community string in plain text | ⚠️ Medium | Known | Move to environment variable |
| 4 | PgBouncer uses AUTH_TYPE: plain | ⚠️ Medium | Known (trade-off) | Consider password hashing at source |

---

## ✅ Production Hardening Checklist

### Before Granting Network Access

- [ ] Remove PgBouncer host port binding (already done in prod compose)
- [ ] Enable Node-RED adminAuth (generate bcrypt hash)
- [ ] Bind Grafana to localhost only (already done in prod compose)
- [ ] Review all Docker secrets in `secrets/` directory
- [ ] Enable SNMPv3 for production devices (replacing v2c)

### Before Connecting to Real Machines

- [ ] Verify SNMPv3 authentication and encryption
- [ ] Test community string rotation procedure
- [ ] Audit all OID access permissions
- [ ] Enable audit logging on target devices

### Ongoing Security Practices

- [ ] Rotate Docker secrets quarterly
- [ ] Monitor for CVE updates in base images
- [ ] Review Gitleaks scanning results weekly
- [ ] Audit Prometheus/Alertmanager access logs

---

## 🛡️ Security Controls

### Network Security

| Control | Implementation |
|---|---|
| **Container Isolation** | Docker bridge network — services communicate via DNS |
| **No Host Port Exposure** | Internal services only accessible within Docker network |
| **SNMP Community** | File-based community string (not hardcoded in flows) |
| **Secrets Management** | Docker secrets in `secrets/` directory (gitignored) |

### Application Security

| Control | Implementation |
|---|---|
| **SQL Injection Prevention** | `safeStr()` escaping on all user inputs |
| **Credential Rotation** | Manual rotation required for stale `flows_cred.json` |
| **CI/CD Security** | Gitleaks scanning, stub secrets for validation |
| **Plugin Policy** | Only open-source plugins/MCP (MIT/ISC/BSD/Apache-2.0) |

### Data Security

| Control | Implementation |
|---|---|
| **Database Access** | PgBouncer connection pooling with authentication |
| **Backup Encryption** | Database dumps should be encrypted before storage |
| **Log Sanitization** | No secrets logged in Docker container logs |

---

## 🚨 Reporting Vulnerabilities

If you discover a security vulnerability:

1. **Do NOT** open a public GitHub Issue
2. Email the security team directly or use GitHub's private vulnerability reporting
3. Include: description, steps to reproduce, potential impact
4. Allow 48 hours for initial response

---

## 📚 References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/auth.html)
- [SNMPv3 Security](https://datatracker.ietf.org/doc/html/rfc3411)
- [Grafana Security](https://grafana.com/docs/grafana/latest/setup-grafana/security/)

---

<div align="center">

**IMS Security Policy — Version 1.0**

*Review before every production deployment*

</div>
