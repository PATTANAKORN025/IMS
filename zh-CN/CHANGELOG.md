# Changelog

> **IMS（工业监控系统）变更日志**
> 格式参考 [Keep a Changelog](https://keepachangelog.com/)

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Version:** 1.0.1
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Release:** Production
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Date:** 2026-08-21

</div>

---

## [Unreleased] — 截至 2026-09-28 的 `main`

### 新增（2026-09-10 至 2026-09-28 合并到 `main`）
- **PR #20** — EAP SCADA 一楼：运行地图默认显示 REAL/UNAVAILABLE，而非模拟状态，并附完整审计。
- **PR #21** — CSS/UI/UX：设计 token、排版、响应式布局、动效以及已提交的可视化回归基线；token 一致性与状态颜色漂移检查在 pre-commit 与 CI 中运行。
- **PR #22** — `integration/andon-layout-safe` → `main`：将 Factory Twin 3D 与 EAP 相关工作合并到 `main`（解决 13 处冲突，保留仅存在于 main 的提交）；Operator Andon 看板在 1920×1080 与 3840×2160 下无需滚动，并声明不支持 1280×720。
- **PR #23** — Factory Twin 3D 运行时深度审计（渲染循环、WebGL 生命周期、实测性能），并缓存私有几何/映射/区域文件的读取。
- **钻孔与 VCP 电镀** — 两个新 Grafana 文件夹（01 钻孔、04 VCP）中的 7 个仪表板、7 条 VCP 告警规则、用于 `eap_backup` 数据库的数据源 `drilling-timescaledb`，以及迁移 083–086：
  - 083：数据库防护；
  - 084–086：钻孔视图、索引，以及按领域划分的 schema 与数据目录。只使用视图，不重命名任何对象。

  四个 Grafana 文件夹现已统一编号为 01–04。

  没有工厂数据时，合成数据生成器会构建 `eap_backup`（`docs/data/MOCK_DATA.md`），覆盖它的单元测试在 pre-commit 与 CI 中运行。

  运行时防护：
  - TimescaleDB 设置 `jit=off`，并配置工作进程、超时与慢查询日志；
  - pgAdmin 绑定到 `127.0.0.1`；
  - 新增 nginx 路径，用于 Grafana 健康检查与 Grafana Live WebSocket；
  - 两条 LDI Cpk 告警规则暂停，待 `v_machine_spc_ranking` 修复后恢复。

### 安全与正确性修复
- **alarm-api 角色检查：**
  - 原先从 Grafana `/api/user` 读取角色，但该接口不含 `orgRole`，导致所有确认/解决请求都返回 403，连 Admin 也不例外。现改为从 `/api/user/orgs` 读取会话当前组织中的角色。
  - Viewer 仍返回 403；Grafana 服务器管理员可以写入。
  - 已通过 nginx 对 Grafana 13.1.2 做端到端验证，测试已接入 pre-commit 与 CI（`scripts/run-alarm-api-tests.js`）。
- **nginx 响应头：**
  - 按现行建议设置 `X-XSS-Protection: 0`。
  - 新增 `Permissions-Policy`。
  - 隐藏 Grafana 重复发送的 `X-Frame-Options` / `X-XSS-Protection` / `X-Content-Type-Options`，使每个头只到达浏览器一次。
- **固定镜像版本：** `grafana-image-renderer` 改为 `v5.11.1`，`pgadmin4` 改为 `9.18`（原先都是 `:latest`），均为运行环境中已验证的版本。
- **Dependabot：**
  - 现已覆盖 `nodered_data`、`pgbouncer`、`services/*` 中的 Dockerfile 以及 `docker-compose.yaml` 中的镜像；原先 `/` 下的 `docker` 条目没有覆盖任何内容。
  - minor/patch 更新合并为一组。
- **npm 依赖：** 在允许的版本范围内修复了 `express`、`qs`、`body-parser`、`fast-uri`、`js-yaml` 和 `svgo`；根目录、`alarm-api` 与 `factory-twin-3d` 的 `npm audit` 现均为 0。
- **文档更正（en/th/zh-CN）：**
  - 修复 18 个文件中因转义错误变成 TAB/换页符的 LaTeX 公式。
  - 按实际脚本、角色、生效的保留策略和已导出的指标重写 `BACKUP_RESTORE`、`DATA_GOVERNANCE` 和 `SLO_DEFINITIONS`。原文描述了并不存在的 AES-256 备份、`factory_telemetry` 数据库、角色和 PromQL 指标，以及从未获得认证的合规性。
  - 更正 alarm-api 参考：操作人来自会话、存在 401/403、无主机端口。
  - 更正 EAP 安全边界：目前为明文 HTTP。

### 审计修复（2026-09-29）
- **从公开代码树中移除工厂数据：**
  - 模拟器配方值已取整（dosage、scan speed、温度、湿度、真空、PE/JE）。
  - 真实机台名称替换为 `LDI-nn`，Machine Snapshot 的 `log_id` 默认值已清空。
  - 厂商告警文本已改写（保留代码），README 中两张截图已做像素化处理。
  - 钻孔模拟数据 ID 改为 `MOCK-DRL-nnn`。
  - Git 历史中仍保留旧值。
- **Fleet Availability：** 分母改为正在上报数据的机台，而不是所有已启用的设备行；遗留设备行不再拉低该值。
- **曾在失效时仍能通过的防护检查：**
  - `repo-hygiene-linter` 在 Linux 上崩溃（`%(objectsize)` 未加引号）。
  - `panel-data-check` 曾把 SQL 错误计为"0 行"。现在遇错即停，每个仪表板在其自身的数据库上运行，解析模板变量与重复面板，严格模式下跳过即视为失败。
  - `orphan-object-linter` 在 CI 中无法连接数据库时判定失败。
- **迁移：** 运行器在第一个失败文件处停止。需要 `eap_backup` 但未找到它的迁移会报告为 deferred，并在下次启动时重新运行，而不是被记录为已应用。
- **CI：** 在面板检查前构建合成的 `eap_backup`；此前既不在 pre-commit 也不在 CI 中运行的测试现在两处都会运行；`promtool` 与运行时 Prometheus 版本一致。
- **VCP 告警规则：** `execErrState: KeepLast`，缺少 `eap_backup` 时不会从第一天起就触发告警。
- **LDI 数据接入：**
  - `"0"` 保持为 0，缺失的 `state` 为 NULL 而非"运行中"。
  - 缺少 `eqp_id`/`log_id` 的行会连同其索引被拒绝，超过 1,000 行的批次返回 413。
  - 卡住的数据库连接池会被替换，而不是让 Node-RED 退出。
- **LDI 模拟器：**
  - 告警携带其机台的 process 与 factory。
  - 背景噪声减少，真空/对位故障更频繁，使由条件触发的告警占主导。
  - 环境波动与 profile 中的标准差一致。
  - 模拟告警由 actor `simulator` 确认并解决（`LDI_SIM_AUTO_LIFECYCLE`）。
  - 有 24 小时回放测试覆盖。
- **仪表板：** SPC 移动平均趋势按机台分为独立序列；Engineering Drill-Down 中扫描速度与判定误差面板的标题和单位已更正。
- **部署：** 只要 `.env` 中任一密钥仍等于 `.env.example` 中的公开值，`make verify` 即失败（只打印名称）。
- **工具：**
  - `make doctor`、`deploy-flows` 与 `test-unit` 可在任意 make shell 下运行，`test-unit` 会运行全部单元测试。
  - 不再安装未使用的 Grafana 插件。
  - 初始化脚本不再硬编码数据库名与所有者名。

### Grafana 配置（2026-09-30）
- **`monitoring/grafana/grafana.ini`** 成为唯一配置来源，compose 只传入密钥和各部署不同的值。此前有 3 个键被 Grafana 静默忽略（`[security]` 下的 `hide_version` 与 `disable_sanitize_html`，以及 `hide_new_plugins`），首页仪表板路径也指向不存在的文件。
- **关闭暴露面：** 未登录时 `/api/health` 不再显示版本和 commit；nginx 拒绝 `/metrics`；关闭外部快照（`snapshots.raintank.io`）与公开仪表板。
- **浏览器加固：** 启用带每请求 nonce 和 `frame-ancestors 'self'` 的 Content-Security-Policy；不再访问 gravatar、grafana.com 新闻、analytics 与更新检查。
- **账户：** 新密码和修改后的密码必须符合 Grafana 密码策略；禁止创建组织；会话时长显式配置。
- **插件：** 启动前通过 `preinstall_sync` 按固定版本安装，关闭 UI 插件管理，并禁用未使用的默认插件，启动时除这两个固定面板外无需联网。
- **Provisioning：** 无法再从 UI 删除已 provision 的仪表板；移除从未获得连接参数的 Mentor LDI 数据源。renderer 回调使用 Grafana 容器端口而非主机端口。

### 安全加固（2026-09-29 第三轮）
- **PgBouncer：** 客户端改用 `scram-sha-256` 认证取代 `plain`，密码不再以明文在 Docker 网络中传输。密码错误时返回 `SASL authentication failed`。
- **容器：** 除 pgAdmin 外的所有服务都以 `no-new-privileges` 运行。pgAdmin 可能需要文件能力来绑定 80 端口，因此未包含。
- **`docker-compose.prod.yaml`：** 不再设置 `GF_SECURITY_COOKIE_SECURE`、HSTS 和 HTML 清理。在明文 HTTP 统一入口上，Secure cookie 会导致其他机器无法登录，HTML 清理会使 Business Text 仪表板失效。该叠加文件现在只按文档所述设置资源限制和日志级别。
- **密钥扫描：** gitleaks 固定为 v8.28.0，并开始扫描 flow、文档和 README。`scripts/pre-commit.js` 拒绝提交任何 `.env` 文件（之前只是跳过）。
- **`SECURITY.md`：** 已知限制表与实际运行配置一致。

### 安全加固（2026-09-29 第二轮）
- **告警 webhook 认证：** `/alert-webhook` 要求 `Authorization: Bearer <ALERT_WEBHOOK_TOKEN>`（否则返回 401，未设置令牌时返回 503）。Alertmanager 通过 compose secret 发送，Grafana 联络点同样发送。`ALERT_WEBHOOK_TOKEN` 现为必填。
- **最小权限数据库角色（迁移 087）：** Node-RED 以 `nodered_writer` 写入，observability archiver 以 `observability_archiver` 写入，各自只拥有所用表的权限，均不再是超级用户。新增必填 `.env` 键：`NODERED_DB_PASSWORD`、`ARCHIVER_DB_PASSWORD`。
- **Docker socket：** archiver 不再挂载 `/var/run/docker.sock`，改为在内部网络上通过只允许读取接口（拒绝 POST）的 `docker-socket-proxy` 读取容器事件；所需工具构建进其自有镜像，不再每次启动时安装。
- **仪表板脚本注入：** Alarm Console 的确认/解决按钮和钻孔机群的机器链接不再把数据库值放进 `onclick` JavaScript，VCP 看板也不再把 URL 变量未转义地写入链接。`dashboard-linter` 会拒绝这两种写法。
- **Operator Andon：** 数据相对真实时钟超过 5 分钟未更新时，磁贴变为灰色 STALE，停止的管道不会让它一直显示绿色。`?var-clock=replay` 保留原来的回放行为。
- **每台 LDI 机器的最新状态（迁移 088）：** 由插入触发器维护在 `ldi_machine_last_state` 中；`v_ldi_machine_latest_full` 读取该表且列不变，查询成本不再随 `ldi_data` 增长。
- **Drilling Fleet Overview：** 每张卡片显示所属工厂（"F3 - DRL001-M"），来自新的 `machine_master` 登记表（迁移 089，仅建表结构），Factory 筛选现在作用于卡片和 KPI。登记表中缺失的机器仍会显示为 "F?"。水平滚动位置在自动刷新和页面重新加载后保持不变。
- **凭据轮换：** 文档中的步骤会先关闭本会话的语句日志，因为开启 DDL 日志时 `ALTER ROLE ... PASSWORD` 会写入服务器日志。

### 文档与仓库规范化治理 (Documentation & Repository Hygiene)
- 截至 2026-09-28 对照实时运行系统 (`main`) 在英、泰、简中三语下重新核实所有现行文档与系统清单。
- 同步全语言 README 版本徽标至 `v1.0.1`，并从 `.gitignore` 中移除核心规则文档 (`AGENTS.md`)。
- 重新生成并核实 `DASHBOARD_INVENTORY.md`（22 个仪表板，225 个面板）与 `DATABASE_SCHEMA.md`（61 项迁移，013–086），确保零漂移。
- 加固 `.gitignore`，增加全局压缩归档与临时备份文件忽略规则（`*.zip`、`*.tar.gz`、`*.tgz`）。
- 现行文档已对照 `main` 以英文、泰文与简体中文重新核实：README、`CLAUDE.md`、文档索引、管理员与用户手册、运维手册、架构、安全策略、贡献指南。
- 公开文档不再披露一楼建筑尺寸；删除真实服务器主机名以及被镜像的个人文件。
- 在全仓库 600 多个 Markdown 文件中统一标准化三语全局导航（`GLOBAL_NAV`），包含本地化文字与正确相对路径。
- 加固 `.gitignore` 规则，杜绝原始遥测与数据库转储泄露（`*.csv`、`*.parquet`、`*.dump`、`/vcp/`）。
- 在管理员手册、架构说明与安全策略中澄清了 TimescaleDB 仅限内部网络的端口配置（EN/TH/ZH-CN）。
- 为全部文档中的代码块补充完整语法高亮标签（100% 消除无标签代码块），符合 CommonMark/GFM 规范并提升可访问性。
- 完整补充 `CLAUDE.md` 针对泰语和简体中文的本地化指引文档。
- 带日期的证据与审计记录在 `th/` 与 `zh-CN/` 中使用指向英文原文的页面；所有相对链接与锚点均可解析。

### 对 1.0.1 的更正
- *"100% 安全合规……清理全部 Git 历史"*：该清理仅覆盖当时已知的内容，并非保证。请将整个历史视为公开，并轮换任何曾进入提交的密钥。
- *"所有文档均已完成英、泰、简中翻译"*：并非所有文档都已翻译；现行策略见 `docs/README.md`。

## [1.0.1] - 2026-08-21 (World-Class Open Source Edition)

### 亮点 (Highlights)
- **100% 安全合规 (Security Compliance)**：对外科手术般的 Git 历史清理（超过 1,100 次提交），彻底消除了所有真实的 IP、硬件标签和供应商错误代码。
- **V2 规范化架构 (V2 Normalized Architecture)**：将 Node-RED 摄取迁移到规范化的 JSON 结构和绑定 Schema 的 SQL 插入。
- **全面的 Pre-commit 检查 (Pre-commit Suite)**：添加了强大的 Husky 钩子，强制执行单元测试、E2E 测试、Dashboard Linter、安全例外和文档同步。
- **跨平台兼容 (Cross-Platform)**：解决了严重的 Windows/Linux CRLF 节点崩溃错误并规范了路径。
- **多语言卓越 (Multilingual Excellence)**：所有文档和 README 实现了英语、泰语和简体中文的全面同步和精美翻译。
- **赛博朋克 NOC UI (Cyberpunk NOC UI)**：将静态 UI 资产替换为动画 60 FPS 的赛博朋克扫描仪 GIF，用于 NOC 演示。

### 安全 (Security)
- **CVE 例外引擎 (CVE Exceptions Engine)**：为高严重性但不可达的漏洞（例如 Grafana Go stdlib DoS）创建了程序化的、严格过期的网关。
- **物理数据清理 (Physical Data Scrub)**：从本地机器中删除了所有旧的数据转储和日志，防止绕过 `.gitignore` 的泄漏。
- **Nginx 加固 (Nginx Hardening)**：在反向代理上实施了严格的速率限制（`limit_req_zone 100r/s`）和请求头大小上限（`large_client_header_buffers 4 16k`）。

### 修复 (Fixed)
- 修复了 `verify-deployment.ps1` 期间 Windows 上的 E2E IPv6 `localhost` 解析超时。
- 修复了 Grafana 仪表板布局网格重叠（强制执行 Grid-24 规则）。
- 修复了 AIOps 解析器内部的 Node-RED 屏障超时竞争条件。
- 修复了缺失的 `sys_hourly` 连续聚合刷新策略。
- 将孤立的 `as` 类型断言迁移到 `@total-typescript/shoehorn`。

## [1.0.0] — 2026-06-29 (Production Release)

### Highlights

- **5-Thread Parallel Walker** — CPU, Storage, Network, Temperature, LDI
- **Device Registry** — 数据库驱动的机器管理 (1-1000+ 台机器)
- **4 Grafana Dashboards** — NOC, System, Engineering, Capacity Planning
- **38 Alert Rules** — AIOps, Predictive, SRE 标准
- **K6 Load Test** — 1,000 VUs, 0% 故障率, p95 < 80ms
- **CI/CD Pipeline** — 包含安全扫描的 GitHub Actions

### Fixed

- LDI 企业级 OID 不匹配 (9999 vs 99999)
- `bypass_error` 节点连线未连接 (导致屏障超时)
- `walk_ldi` 缺失于 `catch_walker` 范围
- `ldiTemp` 已计算但未保存到数据库
- 64 位计数器的计数器循环启发式算法不正确
- 警报消息中的表情符号转义序列错误
- Docker 主机端口冲突 (snmpsim 1161, pgbouncer 6432)
- TimescaleDB 迁移事务不兼容
- `docker compose down -v` 后陈旧凭证文件的持久化问题

### Added

- **Device Registry Pattern** — `public.machines` 表与 SNMP walker 集成
- **LINE Notify / MS Teams Webhooks** — 真实警报通知
- **Database Migration System** — `database/migrations/` 带有幂等 SQL
- **23 Unit Tests** — 全部通过，覆盖解析逻辑
- **CI/CD Secret Stubs** — 无需真实凭证即可验证 Compose
- **Gitleaks Allowlist** — `.env`, `.playwright-mcp/`, `nodered_data/`
- **Backup/Restore Scripts** — `scripts/backup-db.sh`, `scripts/restore-db.sh`
- **SECURITY.md** — 已知限制和强化检查清单
- **CHANGELOG.md** — 本文件
- **CONTRIBUTING.md** — 开发指南
- **LICENSE** — MIT 许可证
- **Makefile** — 8 个目标 (up, down, restart, verify, backup, restore, logs, test)
- **docker-compose.override.yaml** — 开发覆盖 (snmpsim)
- **docker-compose.prod.yaml** — 生产覆盖
- **Incident Response Runbook** — `docs/runbooks/incident-response.md`
- **Deployment Readiness Assessment** — `docs/deployment-readiness.md`
- **Scaling Plan** — `docs/scaling-plan.md`
- **Prometheus Exporter** — Node-RED 自监控配置

### Changed

- 将 `docker-compose.yaml` 拆分为 base/dev/prod
- Flow 的真实数据源：`node-red/flows/ingestion.json` + `alerting.json`
- 所有 walkers 使用 `msg.host`/`msg.community` 而不是硬编码值
- `walk_storage` 升级为双引擎 (生产环境中为 subtree，开发环境中为 GET)
- 将 `sysUpTime` OID 添加到 `walk_net_get` 用于检测计数器循环
- LDI 列类型从 INT 更改为 DOUBLE PRECISION
- 架构升级为 5 线程并行 Walker
- 所有服务仅限内部使用 (无主机端口绑定)

### Security

- 取消对 `.mimocode/` 和 `.playwright-mcp/` 的 git 跟踪
- 从跟踪文件中删除了 GitHub PAT
- Node-RED adminAuth 配置就绪
- PgBouncer 端口不再暴露在主机上

---

## [0.9.0] — 2026-06-24 (Pre-Refactor Baseline)

### Added

- 5 线程防弹 AIOps 解析器 v7
- 双引擎 SNMP Walker (仅限网络)
- Alertmanager 抑制规则

---

<div align="center">

**IMS Changelog — Version 1.0**

_遵循 [Keep a Changelog](https://keepachangelog.com/) 格式_

</div>
