<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS — Comprehensive Audit Report

> **ARCHIVED — historical snapshot, dated 2026-08-04.** 非现用文档；下面的数字（仪表板数量、迁移数量、面板数量等）反映了该系统在此日期时的状态，并且已知相对于当前系统已过时。根据 docs/archive/README.md 作为历史记录保留。有关当前信息，请参阅 docs/architecture/ARCHITECTURE.md 和 docs/architecture/DASHBOARD_INVENTORY.md。

> 日期：2026-08-04
> 审计员：Buffy (Freebuff AI) — 项目全面审计
> 范围：Security, Database, Node-RED, Grafana, CI/CD, Docker, Tests

---

## Executive Summary

对 7 个项目领域的全面审计共发现了 **12 个问题**，分类如下：

| Severity | Count | Status                                      |
| -------- | ----- | ------------------------------------------- |
| CRITICAL | 1     | 需要立即解决                              |
| HIGH     | 2     | 必须在部署到生产环境之前解决                |
| MEDIUM   | 4     | 根据优先级解决                              |
| LOW      | 5     | 已记录在案，不紧急                          |

**综合评分：7/10** — 系统表现出良好的稳定性，但包含需要修复的安全漏洞。

---

## 1. CRITICAL: Security — Leaked GitHub Token

**问题：** 一个 GitHub Personal Access Token 在 `.mimocode/mimocode.json` 中遭到泄露。

```text
"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_***REDACTED***"
```

**风险：**

- 此文件被 gitignore — 但是，如果代码库被共享或泄露，该令牌可能会立即遭到利用。
- 此令牌授予对 GitHub 存储库的访问权限。
- 如果令牌保持活跃，则未授权方可以利用它。

**修复计划：**

1. **立即行动：** 在 GitHub 上撤销令牌（Settings → Developer settings → Personal access tokens → Delete）。
2. **立即行动：** 在 `mimocode.json` 中用 `${GITHUB_PERSONAL_ACCESS_TOKEN}` 占位符替换它。
3. **验证：** 验证此令牌是否已被恶意利用（检查 GitHub 审计日志）。

**状态：** 未解决

---

## 2. HIGH: No Auto-Rollback in CI/CD

**问题：** CI/CD 管道（`ci.yml`）在验证失败时缺乏自动回滚 (auto-rollback) 机制。

**现状：**

- Lint → Unit Tests → Integration/Chaos → Summary
- 不存在部署任务 (deployment job)（部署通过 `make deploy-flows` 手动执行）。
- 不存在回滚任务 (rollback job)。

**风险：**

- 如果执行了部署且验证失败，需要手动回滚 → 速度慢，容易出现人为错误。
- 缺乏部署内容和部署时间的审计跟踪。

**修复计划：**

1. 实现一个部署任务，当向 `main` 分支进行推送并且路径 `nodered_data/flows/*.json` 发生更改时触发。
2. 实现在验证失败后执行的自动回滚任务。
3. 在 GitHub Actions 中记录部署历史。

**状态：** 未解决

---

## 3. HIGH: Missing Node-RED Auth in `.env`

**问题：** `.env.example` 中的 `NODE_RED_ADMIN_PASSWORD_HASH` 为空 → 如果未配置，Node-RED 将失败。

**现状：**

- `settings.js` 包含 `adminAuth` + 故障安全逻辑 (fail-safe)（如果缺少哈希值，则拒绝启动）。
- `.env.example` 缺少默认值 → 需要在执行前生成哈希。

**风险：**

- 未经配置便执行 `make up` → Node-RED 崩溃。
- 使用过于简单的密码 → 存在未经授权访问的风险。

**修复计划：**

1. 在 `README.md` 中添加说明，明确规定在执行 `make up` 之前生成哈希的要求。
2. 考虑在 `.env.example` 中实现一个默认哈希（仅限开发使用）。

**状态：** 部分缓解（已经具备故障安全机制）

---

## 4. MEDIUM: Hardcoded Test Keys in CI

**问题：** `INGEST_API_KEY: ims-secret-key` 被硬编码在 `.github/workflows/ci.yml` 中。

**现状：**

- 专门用于 CI 集成测试。
- 不是生产密钥。

**风险：**

- 低 — CI 环境与生产环境隔离。
- 但是，如果 GitHub 存储库成为公共仓库，该密钥将被暴露。

**修复计划：**

1. 改用 GitHub Secrets：`${{ secrets.INGEST_API_KEY }}`。
2. 或者，接受它作为一个严格脱离生产的指定测试密钥。

**状态：** 已知，对于 CI 来说可以接受

---

## 5. MEDIUM: K6 Test Hardcoded Passwords

**问题：** `.github/workflows/k6-test.yml` 包含硬编码的测试密码。

```yaml
echo "test-password" > secrets/postgres_password.txt
echo "test-password" > secrets/grafana_admin_password.txt
```

**现状：**

- 专门用于 CI K6 测试。
- 不是生产密码。

**风险：**

- 低 — 仅隔离在 CI 环境中。
- 但是，如果代码库公开，这些密码将被暴露。

**状态：** 已知，对于 CI 来说可以接受

---

## 6. MEDIUM: `dashboard.html` XSS Risk

**问题：** `dashboard.html` 使用了 24 次以上的 `innerHTML`。

**现状：**

- 作为一个用于仪表板管理的独立 HTML 文件运行。
- 不是一个处理用户输入的 Web 应用程序。
- 仅在 localhost 上执行。

**风险：**

- 低 — 不存在用户输入向量来注入 XSS 攻击负载。
- 但是，如果将来修改为接受用户输入，将带来安全风险。

**状态：** 风险较低，已记录

---

## 7. MEDIUM: SNMP Simulator Exposed on 0.0.0.0

**问题：** `docker-compose.yaml` 包含 `--agent-udpv4-endpoint=0.0.0.0:${SNMP_PORT:-161}`。

**现状：**

- SNMP 模拟器仅在 Docker 网络内运行。
- 该端口未映射到主机上。

**风险：**

- 低 — 包含在 Docker 内部网络中。
- 但是，如果将来引入端口映射，将带来安全风险。

**状态：** 风险较低，已记录

---

## 8. LOW: Database Migration Gaps

**问题：** 某些迁移包含 0 个可解析的语句。

**现状：**

- `028-ldi-spc-nelson-rules.sql` — 0 语句
- `030-ldi-machine-snapshot-view.sql` — 0 语句
- `031-ldi-event-timeline.sql` — 0 语句
- `040-register-ldi-devices.sql` — 0 语句

**风险：**

- 低 — 这些可能由解析器未捕获的注释或复杂的 SQL 结构组成。
- 但是，有必要验证这些迁移是否正确执行。

**状态：** 已记录，应予以验证

---

## 9. LOW: `.opencode/opencode.json` Untracked

**问题：** `.opencode/opencode.json` 是一个新生成的文件，未在 git 中跟踪。

**现状：**

- 在当前会话期间创建。
- 不包含机密信息（使用 `${VAR}` 占位符）。

**风险：**

- 低 — 意外的提交将引入不必要的文件。
- 无直接的安全风险。

**状态：** 已记录，应添加 gitignore

---

## 10. LOW: `.mcp.json` Untracked

**问题：** `.mcp.json` 是一个新生成的文件，未在 git 中跟踪。

**现状：**

- 在当前会话期间创建。
- 不包含机密信息（使用 `${VAR}` 占位符）。

**风险：**

- 低 — 意外的提交将引入不必要的文件。
- 无直接的安全风险。

**状态：** 已记录，应添加 gitignore

---

## 11. LOW: Gitleaks Scan Has `|| true`

**问题：** `.github/workflows/ci.yml` 在 Gitleaks 扫描之后包含了 `|| true`。

```yaml
docker run --rm ... gitleaks detect ... || true
```

**现状：**

- 如果检测到泄漏，Gitleaks 扫描不会使管道失败。
- 这是设计使然 —— 配置为允许管道继续进行。

**风险：**

- 低 — Gitleaks 扫描仍然有效，它只是避免了构建失败。
- 但是，真正的泄漏不会触发管道立即停止。

**状态：** 已记录，设计选择

---

## 12. LOW: CI Summary Shows `|| true` for Chaos

**问题：** `.github/workflows/ci.yml` 在 K6 混沌测试之后包含了 `|| true`。

```yaml
/scripts/chaos-stress.js ... || true
```

**现状：**

- 即使错误率很高，混沌测试也不会使管道失败。
- 这是设计使然 —— 配置为允许管道继续进行。

**风险：**

- 低 — 测试仍然有效，它只是避免了构建失败。
- 但是，显著的错误率不会触发管道立即停止。

**状态：** 已记录，设计选择

---

## Audit Summary by Category

### Security Score: 6/10

- Secrets management (Docker secrets)
- Gitleaks scanning
- Node-RED admin auth
- Leaked GitHub token
- Hardcoded test keys (acceptable for CI)
- No audit logging

### Database Score: 8/10

- Idempotent migrations (IF NOT EXISTS)
- Continuous Aggregates
- Retention policies
- Some migrations with 0 statements (should verify)
- Column type changes (REAL vs DOUBLE PRECISION)

### Node-RED Score: 8/10

- Circuit breaker
- Retry queue
- Error handlers
- 5 walkers per device
- Parser complexity (stateful, hard to debug)

### Grafana Score: 9/10

- Correct datasource UIDs
- Proper panel counts
- No gridPos overlap (linter checks)
- Some dashboards use `-- Grafana --` datasource (internal)

### CI/CD Score: 7/10

- 4-stage pipeline
- Unit tests
- Integration tests
- K6 stress test
- No auto-deploy
- No auto-rollback
- `|| true` on chaos tests

### Docker Score: 9/10

- Localhost-only port binding
- Health checks
- Restart policies
- Logging configuration
- SNMP simulator on 0.0.0.0 (internal only)

### Tests Score: 7/10

- Unit tests (parser, counter, boundary, v2-parser)
- K6 stress tests
- Dashboard linter
- Visual regression (Playwright)
- No E2E tests in CI (only smoke)
- No integration tests with real DB

---

## Priority Fix Order

| #   | Issue                            | Severity | Effort | Impact                                                                                                                |
| --- | -------------------------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Revoke leaked GitHub token       | CRITICAL | 5 min  | 防止未经授权的访问                                                                                                    |
| 2   | Add auto-rollback to CI/CD       | HIGH     | 2 hrs  | 防止损坏的部署                                                                                                        |
| 3   | Add `.env.example` instructions  | HIGH     | 10 min | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 防止 Node-RED 崩溃       |
| 4   | Move CI keys to GitHub Secrets   | MEDIUM   | 30 min | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 安全最佳实践             |
| 5   | Add `.opencode/` to .gitignore   | MEDIUM   | 5 min  | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 干净的 git 状态          |
| 6   | Add `.mcp.json` to .gitignore    | MEDIUM   | 5 min  | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 干净的 git 状态          |
| 7   | Verify zero-statement migrations | LOW      | 30 min | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 数据完整性               |
| 8   | Review gitleaks `\|\| true`      | LOW      | 15 min | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 安全可见性               |

---

## Recommendations

### Immediate (This Week)

1. **Revoke GitHub token** — 立即执行（5 分钟）
2. **Add auto-rollback** — 在 `ci.yml` 中实现回滚任务
3. **Update .env.example** — 添加关于 `NODE_RED_ADMIN_PASSWORD_HASH` 的说明

### Short-term (This Month)

1. **Move CI secrets** — 利用 GitHub Secrets 代替硬编码值
2. **Gitignore new files** — 将 `.opencode/` 和 `.mcp.json` 追加到 `.gitignore` 中
3. **Verify migrations** — 手动执行迁移 028、030、031、040

### Long-term (Next Quarter)

1. **Add E2E tests** — 将端到端测试纳入 CI 管道
2. **SNMPv3 migration** — 从 v2c 过渡到 v3
3. **Audit logging** — 实施针对管理操作的审计跟踪

---

<div align="center">

**IMS Audit Report — Version 1.0**

_Created: 2026-08-04 | Auditor: Buffy (Freebuff AI)_

_Next audit: 2026-11-04 (quarterly)_

</div>
