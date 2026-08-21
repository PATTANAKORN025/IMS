# 安全策略 (Security Policy)

> **IMS (基础设施监控系统) 安全策略**
> 在部署到生产环境之前，请了解系统限制并制定修复计划

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Security:** Policy
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Staging
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Updated:** 2026-08-04

</div>

---

## 已知限制 (Known Limitations)

| #   | 问题 (Issue)                                                | 严重程度 (Severity) | 状态 (Status)    | 修复计划 (Fix Plan)                                                          |
| --- | ----------------------------------------------------------- | ------------------- | ---------------- | ---------------------------------------------------------------------------- |
| 1   | PgBouncer 端口在主机上暴露                                  | ️ 中 (Medium)        | 已知 (Known)     | 仅绑定 localhost 或使用反向代理                                              |
| 2   | Node-RED 管理界面没有身份验证                               | 高 (High)           | 已知 (Known)     | 在投入生产环境前，在 settings.js 中添加 `adminAuth`                          |
| 3   | SNMP 团体字符串 (community string) 采用明文                 | ️ 中 (Medium)        | 已知 (Known)     | 移动到环境变量中                                                             |
| 4   | PgBouncer 使用 AUTH_TYPE: plain                             | ️ 中 (Medium)        | 已知 (trade-off) | 考虑在源头进行密码哈希处理                                                   |
| 5   | GitHub PAT 硬编码在 `.mimocode/mimocode.json` (AI 工具配置) | 高 (High)           | 已知 (Known)     | 在 GitHub 上撤销令牌；替换为环境变量占位符 `${GITHUB_PERSONAL_ACCESS_TOKEN}` |

---

## 生产环境加固清单 (Production Hardening Checklist)

### 在授予网络访问权限之前

- [x] PgBouncer 没有主机端口绑定 — 从未在基础 `docker-compose.yaml` 中公开，这不是 prod-overlay 的更改
- [ ] 启用 Node-RED adminAuth (生成 bcrypt 哈希)
- [x] Grafana 无法从主机直接访问 — `docker-compose.yaml` 没有为其分配任何主机端口；`proxy` 服务 (nginx) 是唯一公开的入口点 (3000)，它位于 Grafana 和 `alarm-api` 的前端，并通过针对 Grafana 自身会话的 `auth_request` 检查来限制对后者的访问 (参见 `docs/architecture/SECURITY_MODEL.md`)
- [ ] 审查 `secrets/` 目录中的所有 Docker secrets
- [ ] 为生产设备启用 SNMPv3 (替换 v2c)

### 在连接到真实机器之前

- [ ] 验证 SNMPv3 的身份验证和加密
- [ ] 测试 community string 轮换流程
- [ ] 审计所有 OID 的访问权限
- [ ] 在目标设备上启用审计日志

### 持续的安全实践

- [ ] 每季度轮换 Docker secrets
- [ ] 监控基础镜像 (base images) 中的 CVE 更新
- [ ] 每周审查 Gitleaks 扫描结果
- [ ] 审计 Prometheus/Alertmanager 的访问日志

---

## ️ 安全控制 (Security Controls)

### 网络安全

| 控制措施 (Control)                 | 实施 (Implementation)                                 |
| ---------------------------------- | ----------------------------------------------------- |
| **容器隔离 (Container Isolation)** | Docker 桥接网络 — 服务通过 DNS 进行通信               |
| **无主机端口暴露**                 | 内部服务只能在 Docker 网络内访问                      |
| **SNMP Community**                 | 基于文件的 community string (不硬编码在 flows 中)     |
| **机密管理 (Secrets Management)**  | `secrets/` 目录中的 Docker secrets (已加入 gitignore) |

### 应用程序安全

| 控制措施 (Control)           | 实施 (Implementation)                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| **防范 SQL 注入**            | 对所有用户输入进行 `safeStr()` 转义处理                                               |
| **凭证轮换**                 | 对过期的 `flows_cred.json` 需要手动轮换                                               |
| **CI/CD 安全**               | Gitleaks 扫描，使用 stub secrets 进行验证                                             |
| **插件策略 (Plugin Policy)** | 仅使用开源的 plugins/MCP/skills (MIT/ISC/BSD/Apache-2.0) — 针对以下当前清单进行了验证 |

### 数据安全

| 控制措施 (Control)          | 实施 (Implementation)                  |
| --------------------------- | -------------------------------------- |
| **数据库访问**              | 带有身份验证的 PgBouncer 连接池        |
| **备份加密**                | 数据库转储在存储前应进行加密           |
| **日志清理 (Sanitization)** | 不在 Docker 容器日志中记录任何机密信息 |

---

## AI 工具安全 (MCP / Skills / Plugins)

### 智能体供应链清单

所有的 AI 工具均为开源 (MIT / Apache-2.0)，符合插件策略。安装位置：`.agents/skills/` (通用), `.mimocode/` (MiMo Code), `.claude/skills/` + `.github/skills/` (Claude Code / Copilot 符号链接)。

| 项目 (Item)          | 清单 (Inventory)                                                                                                                                                                                                                  | 来源 (Sources)                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **MCP servers (12)** | context7, playwright, puppeteer, github, filesystem, everything, sequential-thinking, memory, fetch, postgres, git, time — mirrored in `.mimocode/mimocode.json`, `.mcp.json`, `.opencode/opencode.json`, `.vscode/settings.json` | modelcontextprotocol/servers, PyPI (`mcp-server-fetch/time/git`), npm (`@modelcontextprotocol/server-*`) |
| **Skills (90)**      | 26 个本地 (IMS 专用) + 41 个 mattpocock/skills + 9 个 vercel-labs/agent-skills + 14 个 obra/superpowers                                                                                                                           | github.com/mattpocock/skills, vercel-labs/agent-skills, obra/superpowers (均为 MIT)                      |
| **Plugins (8)**      | `.mimocode/mimocode.json` 中的 `superpowers@git+…` 条目 (obra, mattpocock, vercel-labs, garrytan/gstack, addyosmani, wshobson/agents, affaan-m/ECC, pcvelz)                                                                       | 均为 MIT, 开源                                                                                           |

### AI 工具配置中的机密信息

- `.mimocode/mimocode.json` 和 `.vscode/settings.json` **已加入 gitignore** — 本地令牌可能保存在这里，但仍需将其视为机密，如若共享则需要进行轮换。
- `.mcp.json` 和 `.opencode/opencode.json` **由 git 追踪** — 必须使用 `${VAR}` 占位符 (例如 `${GITHUB_PERSONAL_ACCESS_TOKEN}`, `${POSTGRES_PASSWORD}`)，切勿使用字面量凭据。
- MCP Python 服务器需要在启动参数中 **锁定 `mcp==X.Y.Z` SDK 版本** (参见 `knowledge.md`) — 锁定版本可防止供应链偏移破坏或劫持工具链。

### ️ Typosquat (域名抢注/误植) / Canary (金丝雀) 软件包 — 切勿安装

npm 软件包 `mcp-server-fetch` 和 `mcp-server-git` 是伪装成真实 MCP 服务器的 **安全研究金丝雀 (security-research canaries)** (`node-canaries` / `npx-canary`)。在任何情况下都 **不要** 安装它们 — 请改用官方的 PyPI (`uvx mcp-server-*`) 或 `@modelcontextprotocol/server-*` npm 软件包。在将任何软件包添加到 AI 配置之前，始终要验证其维护者和代码库。

---

## 报告漏洞 (Reporting Vulnerabilities)

如果您发现了安全漏洞：

1. **切勿** 开启公开的 GitHub Issue
2. 请直接向安全团队发送电子邮件，或使用 GitHub 的私密漏洞报告功能
3. 报告需包含：漏洞描述、重现步骤以及潜在影响
4. 请预留 48 小时以便我们进行初步回复

---

## 参考资料 (References)

- [Docker 安全最佳实践](https://docs.docker.com/engine/security/)
- [PostgreSQL 安全](https://www.postgresql.org/docs/current/auth.html)
- [SNMPv3 安全](https://datatracker.ietf.org/doc/html/rfc3411)
- [Grafana 安全](https://grafana.com/docs/grafana/latest/setup-grafana/security/)

---

<div align="center">

**IMS 安全策略 — 版本 1.0**

_每次部署到生产环境之前请进行审查_

</div>
