# 安全策略

> **IMS（工业监控系统）安全策略**
> 部署到生产环境之前，请先阅读已知限制及其修复计划。

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **文档：** 安全策略
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **状态：** 投产前（Pre-production）
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **更新日期：** 2026-09-28（已对照 `main` 核实）

</div>

---

## 报告漏洞

如果发现安全漏洞：

1. **不要**在 GitHub 上公开提交 issue、pull request 或 discussion。
2. 通过仓库的 **Security** 选项卡私下报告（GitHub private vulnerability reporting），或直接联系维护者。
3. 请提供描述、复现步骤、受影响组件及潜在影响。报告中切勿包含真实凭据或生产数据。
4. 首次答复预计在 48 小时内。

只有 `main` 分支会获得安全修复。

---

## 本仓库为公开仓库

提交到这里的一切——包括完整的 git 历史以及所有已推送的分支——都是公开的，并且可能已被缓存或复刻。事后删除并不能使其重新变为私有。切勿提交：

- `.env` 或任何真实的凭据、令牌、密钥或密码（一旦进入提交，必须立即轮换）；
- 生产数据：数据库转储、CSV 导出、含真实数值的仪表板导出（已通过 .gitignore 拦截：`*.csv`、`*.parquet`、`*.dump`、`/vcp/`）；
- 一楼 CAD 文件或由其衍生的任何内容：尺寸、坐标、面积、图层名称、标注文字；
- 真实的设备或产线编号、批号或作业号、内部主机名、内部 IP 地址；
- 个人数据（姓名、电子邮件地址、电话号码）。

CI 中的私有数据扫描器（`tests/lint/private-data-leak-scanner.js`）**仅匹配文件路径**，因此推送前请逐一审阅 diff，排查上述内容。

---

## 已知限制

| # | 问题 | 严重级别 | 状态 | 修复计划 |
| --- | --- | --- | --- | --- |
| 1 | `.env.example` 中的每个值都是公开的 | 高 | 已知 | 任何真实部署之前，为每个密钥生成新值（见[管理员手册](docs/admin/ADMIN_MANUAL.md#投产前安全检查清单)） |
| 2 | nginx 统一入口使用明文 HTTP | 中 | 已知 | 在 `ims-proxy` 前方或内部终止 TLS，之后再开启 `GF_SECURITY_COOKIE_SECURE` 与 HSTS |
| 3 | SNMP v2c community string 以明文按设备存放在 `public.devices` 中 | 中 | 已知 | 将生产设备迁移到 SNMPv3（authPriv） |
| 4 | Grafana HTML 清理已关闭（`monitoring/grafana/grafana.ini` 中 `[panels] disable_sanitize_html = true`），因为 Business Text 仪表板需要运行 JavaScript | 中 | 已知 | 只把 Editor 角色授予可信人员。模板会转义所有数据值，`dashboard-linter` 拒绝 `{{{ }}}` 以及 `on*=` 处理器中的值 |
| 5 | `/ldi-telemetry` 与 `/inject` 可通过统一入口访问，仅由 Node-RED 中的 `x-api-key` 校验保护 | 中 | 已知 | 对 `INGEST_API_KEY` 保密并定期轮换；用防火墙限制端口 |
| 6 | CI 密钥扫描只检查工作区而非历史；历史中有一个旧 `.env`（凭据已轮换） | 低 | 已知 | 扫描会阻断构建且镜像版本已固定；`scripts/pre-commit.js` 拒绝提交任何 `.env` |
| — | TimescaleDB 端口暴露在主机上 | — | **已解决** | 基础 `docker-compose.yaml` 已注释 TimescaleDB 主机端口；数据库仅限内部网络 |
| — | PgBouncer 端口暴露在主机上 | — | **已解决** | 基础 `docker-compose.yaml` 从未发布 PgBouncer 端口 |
| — | Node-RED 编辑器无认证 | — | **已解决** | 未设置 `NODE_RED_ADMIN_PASSWORD_HASH` 时，`nodered_data/settings.js` 拒绝启动；编辑器端口绑定在 `127.0.0.1` |
| — | pgAdmin 发布在所有接口上，镜像为 `latest` | — | **已解决** | 绑定到 `127.0.0.1:5050`，镜像固定为 `9.18` |
| — | PgBouncer 使用 `auth_type = plain`（密码在 Docker 网络中明文传输） | — | **已解决** | `AUTH_TYPE: scram-sha-256` |
| — | `observability-archiver` 挂载了 `/var/run/docker.sock` | — | **已解决** | 通过内部网络上只允许读取接口的 `docker-socket-proxy` 访问 Docker |
| — | 各服务以超级用户连接数据库 | — | **已解决** | Node-RED 使用 `nodered_writer`，archiver 使用 `observability_archiver`，alarm-api 使用 `alarm_api_writer`，Grafana 使用 `grafana_reader`，各自仅有所需权限 |
| — | `/alert-webhook` 接受任何请求 | — | **已解决** | 要求 `Authorization: Bearer <ALERT_WEBHOOK_TOKEN>` |
| — | Grafana image renderer 镜像为 `latest` | — | **已解决** | 固定为 `v5.11.1` |
| — | 通过统一入口无需登录即可读取 Grafana `/metrics` 以及 `/api/health` 中的版本和 commit | — | **已解决** | nginx 对 `/metrics` 返回 404；设置 `[auth.anonymous] hide_version = true`（该键此前放错了 section） |
| — | 一键即可把仪表板快照发布到 `snapshots.raintank.io`，或无需登录公开分享仪表板 | — | **已解决** | `[snapshots] external_enabled = false`，`[public_dashboards] enabled = false` |
| — | 可从 UI 安装插件，且启动时插件会浮动到最新版本 | — | **已解决** | `plugin_admin_enabled = false`；`preinstall_sync` 固定所用的两个面板版本；未使用的默认插件已禁用 |
| — | 没有 Content-Security-Policy 和密码策略，并会访问 grafana.com 与 gravatar.com | — | **已解决** | 启用带每请求 nonce 的 CSP、`password_policy = true`，关闭 analytics、更新检查、news 与 gravatar |
| — | alarm-api 接受同站任意来源的 cookie 认证写请求、不限制输入，并在错误响应中带出堆栈（未设置 `NODE_ENV`） | — | **已解决** | 校验 Origin / `Sec-Fetch-Site`，请求体上限 8 kB，限制 `logid` 与备注长度，JSON 错误处理，`NODE_ENV=production`，nginx 对 `/alarm-api/` 限速 |
| — | Node-RED 可在运行时安装 npm 模块和 palette 节点，且无审计日志 | — | **已解决** | `functionExternalModules: false`，关闭 `externalModules` 安装，开启审计日志，强制要求凭据密钥 |
| — | Node-RED 镜像构建无 lockfile，各服务使用 `npm install` 构建 | — | **已解决** | 提交 `nodered_data/package-lock.json`，所有镜像使用 `npm ci`；移除两个未使用的 Node-RED 包 |
| — | 容器保留 Docker 默认的 Linux capabilities | — | **已解决** | 13 个服务 `cap_drop: ALL`（blackbox 保留 `NET_RAW`，snmpsim 保留 `NET_BIND_SERVICE`/`SETUID`/`SETGID`）；alarm-api 与 factory-twin-3d 以只读根文件系统运行 |
| — | CI 工作流使用默认令牌权限，action 通过可变标签引用 | — | **已解决** | `permissions: contents: read`；所有 action 固定到 commit SHA（由 Dependabot 更新） |

---

## 生产加固检查清单

### 开放网络访问之前

- [x] TimescaleDB 与 PgBouncer 没有绑定主机端口（仅限内部网络）
- [x] Node-RED 编辑器需要管理员密码哈希，并绑定在 `127.0.0.1`
- [x] Grafana 没有主机端口；`proxy` 服务（nginx）是端口 3000 上唯一的 UI 入口，前置 Grafana、`alarm-api`、Factory Twin 以及 LDI 接入端点，并让 `alarm-api` 与孪生服务先通过基于 Grafana 会话的 `auth_request` 检查（见 `docs/architecture/SECURITY_MODEL.md`）
- [ ] 用新生成的密钥替换从 `.env.example` 复制来的每一个值
- [x] pgAdmin（`5050`）仅绑定在 `127.0.0.1` 本地回环
- [ ] 在 nginx 统一入口前增加 TLS
- [ ] 为生产设备启用 SNMPv3（替代 v2c）

### 连接真实设备之前

- [ ] 验证 SNMPv3 认证与加密
- [ ] 测试 community string / 凭据轮换流程
- [ ] 审计所有 OID 访问权限
- [ ] 在目标设备上启用审计日志

### 持续安全实践

- [ ] 至少每季度轮换一次密钥，并在怀疑泄露时立即轮换
- [ ] 监控基础镜像的 CVE（`node scripts/production-assurance.js --profile=security`）
- [ ] 审阅每个 pull request 的密钥扫描结果
- [ ] 审计 Prometheus/Alertmanager 访问日志

---

## 安全控制措施

### 网络安全

| 控制措施 | 实现方式 |
| --- | --- |
| **容器隔离** | Docker bridge 网络（`ims-internal`、`ims-monitoring`）；服务之间通过 DNS 名称通信 |
| **最小化主机暴露** | 只有 nginx 统一入口（3000）监听外部接口；pgAdmin（5050）、Node-RED、Prometheus、Alertmanager 与 Blackbox 均绑定在 `127.0.0.1` 本地回环；TimescaleDB 与 PgBouncer 无主机端口暴露 |
| **接入认证** | `/ldi-telemetry` 与 `/inject` 要求请求头 `x-api-key` 与 `INGEST_API_KEY` 一致 |
| **密钥管理** | `.env`（已被 gitignore 忽略）通过 Docker Compose 的必填变量 `${VAR:?}` 注入；不会从 `secrets/` 目录读取任何内容 |

### 应用安全

| 控制措施 | 实现方式 |
| --- | --- |
| **防止 SQL 注入** | 服务中使用参数化查询；Node-RED function 节点中使用 `safeStr()` 转义 |
| **最小权限数据库角色** | Grafana 使用 `grafana_reader`（只读），`alarm-api` 使用 `alarm_api_writer`（仅对 `ldi_alarm_lifecycle` 有 `SELECT`+`UPDATE`） |
| **Node-RED 凭据** | `pg_config` 的用户名/密码字段使用环境变量类型；flow 凭据以 `NODE_RED_CREDENTIAL_SECRET` 加密 |
| **CI/CD 安全** | 私有数据路径扫描器、仓库卫生 linter、gitleaks（见限制 7）、用于 compose 校验的占位密钥 |
| **插件策略** | 只使用开源的插件、MCP 服务器与 skill（MIT/ISC/BSD/Apache-2.0） |

### 数据安全

| 控制措施 | 实现方式 |
| --- | --- |
| **数据库访问** | 经 PgBouncer 连接池并需认证；主机上未发布任何数据库端口 |
| **备份** | `scripts/backup-db.sh` 写入已被 gitignore 忽略的 `./backups/`；转储离开主机前必须加密 |
| **日志脱敏** | 容器日志中不含密钥；诊断认证问题时检查变量是否已设置，切勿打印其值 |

---

## AI 工具安全（MCP / Skills / Plugins）

### AI 工具配置的存放位置

| 位置 | 是否被 git 跟踪 | 规则 |
| --- | --- | --- |
| `.agents/skills/`、`.clinerules/`、`.cursor/`、`.windsurf/`、`.superpowers/`、`skills-lock.json`、`AGENTS.md`、`CLAUDE.md` | 是——公开 | 只能放说明性内容。切勿放入令牌、主机名、凭据、工厂数据或个人数据。 |
| `.mimocode/`、`.opencode/`、`.mcp.json`、`.claude/`、`.vscode/settings.json`、`ABOUT-ME.md`、`START.md`、`CONTEXT.md` | 否——已被 gitignore 忽略 | 本地令牌可以放在这里，但仍须视为密钥；切勿强制添加这些文件，并轮换任何曾被分享的令牌。 |

Python 编写的 MCP 服务器应以固定版本的 SDK（`mcp==X.Y.Z`）启动，避免供应链变化在不知情的情况下改变工具链。

### 仿冒 / Canary 软件包——切勿安装

npm 软件包 `mcp-server-fetch` 与 `mcp-server-git` 是冒充真实 MCP 服务器的**安全研究 canary**（`node-canaries` / `npx-canary`）。任何情况下都不要安装——请改用 PyPI 官方包（`uvx mcp-server-*`）或 npm 的 `@modelcontextprotocol/server-*` 软件包。在任何 AI 配置中添加软件包之前，务必核实其维护者与代码仓库。

---

## 参考资料

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [PostgreSQL Client Authentication](https://www.postgresql.org/docs/current/auth.html)
- [SNMPv3 Architecture (RFC 3411)](https://datatracker.ietf.org/doc/html/rfc3411)
- [Grafana Security](https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/)

---

<div align="center">

**IMS 安全策略 — 版本 1.1**

_每次生产部署前请复核_

</div>
