<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页 (Home)</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引 (Docs Index)</b></a>
</div>
<br/>

# IMS — 主开发计划 (Master Development Plan)

> **已归档 — 历史快照，日期：2026-08-04。** 非活动文档；以下数字（仪表板数量、迁移数量、面板数量等）反映了系统在当天的状态，且已知相对于当前系统已经过时。根据 docs/archive/README.md 作为历史记录保留。获取当前信息，请参阅 docs/architecture/ARCHITECTURE.md 和 docs/architecture/DASHBOARD_INVENTORY.md。
> 涵盖所有领域的综合开发路线图 — 基于截至 2026-08-04 的实际项目数据。
> 通过 `/brainstorming` 技能 + 从 PRODUCT.md, TASKS.md, ARCHITECTURE.md, SECURITY.md, knowledge.md 中分析提取综合而成。

---

## 1. 执行摘要 (Executive Summary)

**IMS（工业监控系统，Industrial Monitoring System）** 充当 APEX Circuit 的企业级 NOC 监控基础架构 — 目前正处于 **第 12 阶段 (Apex SRE Optimization)** 运行，这标志着一个明确的 **生产就绪 / 稳定 (Production-ready / Stable)** 状态。

### 当前状态评估 (2026-08-04)

| 领域 (Domain)    | 详细信息 (Details)                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------- |
| **架构**         | SNMP v2c → Node-RED → PgBouncer → TimescaleDB → Grafana + Prometheus/Alertmanager         |
| **设备**         | 1000+ 台设备 (Linux 服务器、Juniper EX4000 交换机、LDI PCB 制造机)                        |
| **仪表板**       | 9 个仪表板 (NOC 概览、工程、容量、元监控、5× LDI 制造)                                    |
| **警报**         | Prometheus + Alertmanager → LINE Notify + MS Teams                                        |
| **AI 工具**      | 12 个 MCP 服务器、90 个技能、8 个插件 (MiMo Code + Claude Code + OpenCode + Copilot)      |
| **测试**         | 单元测试 (Unit tests)、K6 压力测试、Playwright 视觉回归、仪表板 linter                    |
| **CI/CD**        | 未实现 — `flows.json` 目前通过手动执行进行部署                                            |

---

## 2. 当前状态评估

### 2.1 已完成目标

| 类别           | 项目                                                                  | 状态 |
| -------------- | --------------------------------------------------------------------- | ---- |
| **管道 (Pipeline)** | 零泄漏管道 (4 线程并行 SNMP walker)                                   | 完成 |
| **管道 (Pipeline)** | 网络 64 位分析 (eth0/wlan0 Mbps)                                      | 完成 |
| **管道 (Pipeline)** | 状态解析器 v9 (每台设备的流上下文)                                    | 完成 |
| **管道 (Pipeline)** | 熔断器 (2 次失败 → HALF_OPEN 探测)                                    | 完成 |
| **管道 (Pipeline)** | 带有基于年龄的逐出重试队列 (Retry Queue with age-based eviction)      | 完成 |
| **存储**       | TimescaleDB V2 规范化架构 (sys_metrics, net_metrics, ldi_data)        | 完成 |
| **存储**       | 连续聚合 (Continuous Aggregates) (每小时 → 每天 → 每周)               | 完成 |
| **存储**       | 保留策略 (原始数据 14天，每小时 90天，每天 2年，每周 永久)            | 完成 |
| **存储**       | PgBouncer 事务池 (Transaction Pooling)                                | 完成 |
| **仪表板**     | NOC 概览 (车队包络线、健康分数)                                       | 完成 |
| **仪表板**     | 工程向下钻取 (每台机器诊断)                                           | 完成 |
| **仪表板**     | 容量规划 (预测、Z-Score)                                              | 完成 |
| **仪表板**     | 元监控 (管道健康)                                                     | 完成 |
| **仪表板**     | 5× LDI 制造 (分析、快照、操作员、数据就绪情况)                        | 完成 |
| **警报**       | Prometheus 警报规则 (14 条规则)                                       | 完成 |
| **警报**       | Alertmanager 抑制规则 (Inhibition Rules)                              | 完成 |
| **警报**       | LINE Notify + MS Teams Webhook                                        | 完成 |
| **LDI**        | LDI 生产架构 (ldi_data, ldi_alarm_log, SPC 引擎)                      | 完成 |
| **LDI**        | LDI 设备模拟器 + 警报模拟器                                           | 完成 |
| **安全**       | Gitleaks 扫描                                                         | 完成 |
| **安全**       | Docker 密钥管理 (Docker secrets management)                           | 完成 |
| **工具**       | 90 个技能 (26 个本地 + 41 个 mattpocock + 9 个 vercel + 14 个 superpowers)| 完成 |
| **工具**       | 12 个 MCP 服务器 (MiMo/Claude/OpenCode/Copilot)                       | 完成 |

### 2.2 待办任务清单 (Pending Backlog Items)

| 编号 | 项目                                                                         | 优先级 | 工作量 | 影响                                                                                                  |
| --- | ---------------------------------------------------------------------------- | ------ | ------ | ----------------------------------------------------------------------------------------------------- |
| 1   | **CI/CD 管道** — 用于自动部署 `flows.json` 的 GitHub Actions                   | P0     | 中等   | 严重                                                                                                  |
| 2   | **K6 压力测试** — 10,000 req/sec → 确定 PgBouncer 的吞吐量上限                 | P0     | 中等   | 严重                                                                                                  |
| 3   | **磁盘预测** — 容量规划中的预测性磁盘满载面板                                | P1     | 低     | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 中等     |
| 4   | **连接真实服务器** — 在 Node-RED 中替换模拟器 IP                             | P1     | 高     | 严重                                                                                                  |
| 5   | **Webhook 警报** — 配置合法的 LINE Notify / Slack webhooks                   | P1     | 低     | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 中等     |

### 2.3 已知问题 (来自 SECURITY.md)

| 编号 | 问题                                  | 严重性 | 状态              |
| --- | ------------------------------------- | ------ | ----------------- |
| 1   | PgBouncer 端口暴露在主机上            | 中等   | 已知              |
| 2   | Node-RED Admin UI 无身份验证          | 高     | 已知              |
| 3   | SNMP community string 以纯文本形式存在| 中等   | 已知              |
| 4   | PgBouncer 使用 AUTH_TYPE: plain       | 中等   | 已知 (权衡妥协)   |
| 5   | GitHub PAT 被硬编码在 mimocode.json 中| 高     | 已知              |

---

## 3. 主开发路线图

### 第 13 阶段：生产环境加固 (第 1-2 周)

**目标：** 将系统从开发就绪过渡到确切的生产就绪状态。

#### 3.1 CI/CD 管道 — GitHub Actions

**问题陈述：** `flows.json` 目前是手动部署的 (`make deploy-flows`)，缺乏自动化 → 极易受人为错误影响，回滚执行缓慢，且缺乏审计跟踪。

**实施计划：**

| 步骤 | 任务                                           | 目标文件    | 详细信息                                                        |
| ---- | ---------------------------------------------- | ----------- | --------------------------------------------------------------- |
| 1    | 构建 `.github/workflows/deploy-flows.yml`      | 新建        | 触发器：推送到 `main` 分支且修改了 `nodered_data/flows/*.json`  |
| 2    | 添加 `validate-flows` 任务                     | workflows   | 部署前执行 `make validate-flows`                                |
| 3    | 添加 `snapshot-flows` 任务                     | workflows   | 部署前备份 `flows.json` (`make snapshot-flows`)                 |
| 4    | 添加 `deploy-flows` 任务                       | workflows   | 通过 SSH 或 API 执行 `make deploy-flows`                        |
| 5    | 添加 `verify-pipeline` 任务                    | workflows   | 部署后执行 `make verify` → 失败 = 触发回滚                      |
| 6    | 添加 `rollback` 任务                           | workflows   | 验证失败时 → 自动从快照中恢复                                   |

**架构：**

```text
push to main (flows/*.json changed)
  → validate-flows (make validate-flows)
  → snapshot-flows (make snapshot-flows)
  → deploy-flows (make deploy-flows)
  → verify-pipeline (make verify)
  → [if fail] rollback (restore snapshot)
```

**成功标准：**

- 每次符合条件的推送都能自主部署 `flows.json`。
- 在最终部署前成功执行验证、快照生成和核对。
- 验证失败时自动执行回滚。
- 部署历史在 GitHub Actions 内留下不可变的审计跟踪。

---

#### 3.2 Node-RED 管理员身份验证

**问题陈述：** Node-RED Editor UI 缺乏身份验证 → 完全暴露在 1880 端口。

**实施计划：**

| 步骤 | 任务                                             | 目标文件                   | 详细信息                                                                         |
| ---- | ------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------- |
| 1    | 生成 bcrypt 哈希                                 | shell                      | 执行 `docker run --rm nodered/node-red npx node-red-admin hash-pw <password>`    |
| 2    | 配置 `NODE_RED_ADMIN_USER=admin`                 | `.env`                     | 注入用户名                                                                       |
| 3    | 配置 `NODE_RED_ADMIN_PASSWORD_HASH=$2b$...`      | `.env`                     | 注入 bcrypt 哈希                                                                 |
| 4    | 重构 `settings.js`                               | `nodered_data/settings.js` | 嵌入引用环境变量的 `adminAuth` 配置块                                            |
| 5    | 重启 Node-RED                                    | `make restart`             | 验证身份验证提示                                                                 |

**成功标准：**

- Node-RED Editor 在访问前严格要求身份验证。
- 仅通过内部 Docker 网络保留未经身份验证的访问（使管道免于身份验证）。

---

### 第 14 阶段：生产就绪 (第 3-4 周)

**目标：** 验证实际工作负载下的性能，并准备将其实时集成到生产服务器。

#### 3.3 K6 压力测试 — 10,000 req/sec

**问题陈述：** PgBouncer 吞吐量上限仍不明确 → 系统负载能力限制完全是理论上的。

**实施计划：**

| 步骤 | 任务                               | 目标文件                        | 详细信息                                             |
| ---- | ---------------------------------- | ------------------------------- | ---------------------------------------------------- |
| 1    | 开发针对 10K VUs 的 K6 脚本        | `tests/k6/throughput-stress.js` | 爬升序列：50 → 200 → 1000 → 5000 → 10000 VUs         |
| 2    | 测量核心遥测数据                   | —                               | p95 延迟，错误率，总吞吐量 (rows/sec)                |
| 3    | 优化 PgBouncer 配置                | `docker-compose.yaml`           | 设置 MAX_CLIENT_CONN=500, DEFAULT_POOL_SIZE=50       |
| 4    | 优化 TimescaleDB 配置              | `database/migrations/`          | 设置 shared_buffers=2GB, work_mem=256MB              |
| 5    | 调优后重新执行压力测试             | `tests/k6/throughput-stress.js` | 量化性能增量                                         |
| 6    | 记录经验结果                       | `docs/PERFORMANCE.md`           | 记录基线指标与优化后的指标                           |

**成功标准：**

- 成功维持 10,000 req/sec 的吞吐量，且未超过 0.1% 的错误率阈值。
- p95 延迟维持在 < 500ms。
- 防止 PgBouncer 连接池溢出情况。

---

#### 3.4 连接真实服务器

**问题陈述：** 目前依赖 SNMP 模拟器 → 缺乏针对物理服务器的经验证。

**实施计划：**

| 步骤 | 任务                                | 目标文件                                                                | 详细信息                                                                |
| ---- | ----------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | 构建 `.env.production`              | 新建                                                                    | 嵌入 SNMP_COMMUNITY 字符串和合法的设备 IP                               |
| 2    | 重构 `docker-compose.prod.yaml`     | `docker-compose.prod.yaml`                                              | 源化 (Source) 生产环境变量                                              |
| 3    | 重构设备注册表                      | `database/migrations/`                                                  | 针对物理服务器参数执行 INSERT 语句                                      |
| 4    | 验证 SNMP 连通性                    | `scripts/snmp-discover.js`                                              | 确认 SNMP v2c 与物理硬件的兼容性                                        |
| 5    | 执行金丝雀部署 (canary deployment)  | —                                                                       | 针对 5 台孤立的机器启动 → 验证 → 随后全面铺开                           |
| 6    | 监控管道遥测数据                    | `monitoring/grafana/dashboards/infrastructure/ims-meta-monitoring.json` | 严密观察摄取率和错误率                                                  |

**成功标准：**

- 针对物理硬件成功执行稳定的 SNMP 轮询操作。
- 在整个过渡阶段保持绝对的零数据丢失。
- 熔断器机制在物理服务器端点下运行正常。

---

### 第 15 阶段：高级功能 (第 2 个月)

**目标：** 增强预测分析能力并完善警报框架。

#### 3.5 磁盘预测面板

**问题陈述：** 缺乏预测性磁盘满载面板 → 无法提前预见存储饱和时间表。

**实施计划：**

| 步骤 | 任务                                        | 目标文件                                                                  | 详细信息                                                       |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1    | 制定用于线性回归的 SQL 查询                 | `monitoring/grafana/dashboards/infrastructure/ims-capacity-planning.json` | 计算跨度为 7 天历史窗口的斜率 + 截距                           |
| 2    | 构建“距离满载天数”面板                      | —                                                                         | 预测完成磁盘饱和的具体时间范围                                 |
| 3    | 实施阈值警报                                | —                                                                         | 分配 <7 天 = 警告，<3 天 = 关键 (Critical)                     |
| 4    | 构建“磁盘使用量预测图”面板                  | —                                                                         | 可视化具有预测向量的趋势线                                     |
| 5    | 对抗合成数据进行验证                        | —                                                                         | 制造模拟即将发生磁盘饱和的合成有效负载                         |

**成功标准：**

- 面板能够准确计算并呈现“距离满载天数”。
- 当预测跌破 <7 天阈值时，精确触发警报。
- 描绘出清晰的预测趋势线图形。

---

#### 3.6 真实的 Webhook 警报

**问题陈述：** LINE Notify / Slack 配置仅作为占位符 → 没有分发真正的警报。

**实施计划：**

| 步骤 | 任务                                  | 目标文件                 | 详细信息                                       |
| ---- | ------------------------------------- | ------------------------ | ---------------------------------------------- |
| 1    | 供应 (Provision) 真实的 LINE Notify 令牌| LINE Developers Platform | 配置渠道 + 访问令牌                            |
| 2    | 配置 `ALERT_WEBHOOK_TOKEN`            | `.env`                   | 注入真实的令牌                                 |
| 3    | 供应真实的 Slack webhook              | Slack App Directory      | 生成传入 Webhook (Incoming Webhook)            |
| 4    | 配置 `TEAMS_WEBHOOK_URL`              | `.env`                   | 注入真实的 URL                                 |
| 5    | 执行警报验证                          | `scripts/test-alert.sh`  | 通过 webhook 架构分发测试负载                  |
| 6    | 验证通知送达                          | LINE/Slack 应用程序      | 确认收到了所分发的通知                         |

**成功标准：**

- 成功向 LINE Notify 发送警报。
- 成功向 Slack 发送警报。
- 嵌入的 Runbook 链接完美运行。

---

### 第 16 阶段：可观测性与文档 (第 3 个月)

**目标：** 将系统演变为能够进行全面自我监控并自我建立文档的实体。

#### 3.7 管道自我监控仪表板

**实施计划：**

| 步骤 | 任务                                | 详细信息                                                      |
| ---- | ----------------------------------- | ------------------------------------------------------------- |
| 1    | 暴露 Node-RED metrics 端点          | 配置 `/metrics` 端点以供 Prometheus 消费                      |
| 2    | 配置 Prometheus 抓取 (scrape) 逻辑  | 针对 Node-RED 定义 10 秒的轮询间隔                            |
| 3    | 构建管道健康仪表板                  | 可视化摄取率、错误率及延迟指标                                |
| 4    | 实施死人开关 (deadman switch) 警报  | 如果在 3 分钟窗口期内未摄取任何数据，则触发警报               |

#### 3.8 文档彻底改革 (Overhaul)

**实施计划：**

| 步骤 | 任务                     | 详细信息                                                |
| ---- | ------------------------ | ------------------------------------------------------- |
| 1    | 彻底改革 ARCHITECTURE.md | 准确反映当前的运行拓扑                                  |
| 2    | 构建 RUNBOOK.md          | 详细说明针对常见故障状态的修复程序                      |
| 3    | 构建 ONBOARDING.md       | 为新聘工程师量身定制文档                                |
| 4    | 构建 API.md              | 全面记录 Node-RED webhook 端点                          |

---

## 4. 风险评估

### 4.1 技术风险

| 风险                                               | 可能性 | 影响   | 缓解措施 (Mitigation)                                              |
| -------------------------------------------------- | ------ | ------ | ------------------------------------------------------------------ |
| 10K+ req/sec 下的 PgBouncer 瓶颈                   | 中等   | 高     | 通过阶段 14 的压力测试和严格的调优进行缓解                         |
| SNMP v2c 缺乏生产级安全性                          | 高     | 中等   | 在阶段 17 执行到 SNMPv3 的迁移                                     |
| Node-RED 存在单点故障风险                          | 低     | 高     | 通过 Docker 重启策略和健康检查进行缓解                             |
| TimescaleDB 存储增长规模过大                       | 中等   | 中等   | 通过严格的保留策略和连续压缩进行缓解                               |
| Grafana 仪表板通过 CAGG 查询混淆数据               | 低     | 中等   | 强制所有查询在部署前必须进行同行评审 (peer review)                 |

### 4.2 运营风险

| 风险                                                 | 可能性 | 影响     | 缓解措施                                                                         |
| ---------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------- |
| 错误的 `flow.json` 部署 → 管道崩溃                   | 中等   | 高       | 通过 CI/CD、快照生成及自动回滚进行缓解                                           |
| 源自 `.env` 的密码泄露                               | 低     | 关键     | 通过 Gitleaks、严格的 `.gitignore` 策略以及持续审计进行缓解                      |
| 缺乏真正的警报 → 出现静默故障状态                    | 高     | 关键     | 执行阶段 14：全面的 Webhook 配置                                                 |
| 断断续续的服务器连接稳定性                           | 中等   | 中等     | 通过熔断器和具弹性的重试队列进行缓解                                             |

---

## 5. 成功指标

### 5.1 系统性能

| 指标 (Metric)        | 当前状态      | 目标 (第 14 阶段) | 目标 (第 16 阶段) |
| -------------------- | ------------- | ----------------- | ----------------- |
| 被监控设备数量       | 1000+ (模拟)  | 1000+ (真实)      | 5000+             |
| 轮询间隔             | 30s           | 30s               | 10s               |
| 摄取吞吐量           | ~330 行/分钟  | ~3300 行/分钟     | ~16500 行/分钟    |
| p95 查询延迟         | 未知          | <500ms            | <200ms            |
| 仪表板刷新           | 10s           | 10s               | 5s                |
| 警报响应时间         | 未知          | <30s              | <15s              |

### 5.2 运营指标

| 指标 (Metric)            | 当前状态         | 目标                              |
| ------------------------ | ---------------- | --------------------------------- |
| CI/CD 管道               | 无               | GitHub Actions                    |
| 部署时间 (flows.json)    | ~5 分钟 (手动)   | <1 分钟 (自动)                    |
| 回滚时间                 | ~10 分钟 (手动)  | <30s (自动)                       |
| 警报渠道                 | 占位符           | LINE + Slack + Teams              |
| 文档覆盖率               | 部分             | 全面 (RUNBOOK + ONBOARDING + API) |

### 5.3 安全指标

| 指标 (Metric)     | 当前状态          | 目标             |
| ----------------- | ----------------- | ---------------- |
| Node-RED 验证     | 无                | bcrypt adminAuth |
| SNMP 版本         | v2c               | v3 (第 17 阶段)  |
| 密钥暴露情况      | GitHub PAT 被泄露 | 全部轮换         |
| CVE 响应时间      | 未知              | <24h             |

---

## 6. 实施优先级矩阵

```text
                        高影响 (HIGH IMPACT)
                             │
            ┌────────────────┼────────────────┐
            │  P0: CI/CD     │  P0: K6 压力   │
            │  P0: Node-RED  │  P1: 真实      │
            │    身份验证    │    服务器      │
    容易 ──┼────────────────┼────────────────┼── 困难
            │  P1: 磁盘      │  P2: 管道      │
            │    预测        │    自我监控    │
            │  P1: Webhook   │  P2: SNMPv3    │
            │    警报        │                │
            └────────────────┼────────────────┘
                             │
                        低影响 (LOW IMPACT)
```

---

## 7. 时间表

| 阶段         | 持续时间  | 核心举措                             | 交付成果                                                          |
| ------------ | --------- | ------------------------------------ | ----------------------------------------------------------------- |
| **第 13 阶段** | 第 1-2 周 | CI/CD + Node-RED 身份验证            | 功能完善的 GitHub Actions 工作流 + 经过安全保护的 Node-RED 访问   |
| **第 14 阶段** | 第 3-4 周 | K6 压力测试 + 真实服务器 + Webhooks  | 最终定稿的性能报告 + 实时的生产部署                               |
| **第 15 阶段** | 第 2 个月 | 磁盘预测 + 高级功能                  | 全面集成的预测面板 + 投入运行的实时警报                           |
| **第 16 阶段** | 第 3 个月 | 自我监控 + 文档                      | 运行正常的管道仪表板 + 全面的文档套件                             |

---

## 8. 下一步立即行动 (本周)

| 编号 | 动作                                           | 负责人   | 到期日    | 阻碍因素                                |
| --- | ---------------------------------------------- | -------- | --------- | --------------------------------------- |
| 1   | 构建 `.github/workflows/deploy-flows.yml`      | —        | 星期一    | GitHub 存储库访问权限                   |
| 2   | 生成用于 Node-RED 的 bcrypt 哈希               | —        | 星期一    | Docker 环境访问权限                     |
| 3   | 在 `.env` 中配置 `NODE_RED_ADMIN_*`            | —        | 星期二    | 等待动作 #2 中的 bcrypt 哈希            |
| 4   | 开发 K6 吞吐量压力脚本                         | —        | 星期三    | —                                       |
| 5   | 执行基线 K6 压力测试                           | —        | 星期四    | 等待动作 #4 中的脚本                    |
| 6   | 构建 `.env.production` 模板                    | —        | 星期五    | 等待分配合法的服务器 IP                 |

---

<div align="center">

**IMS 主开发计划 (Master Development Plan) — 1.0 版**

_创建于：2026-08-04 | 作者：Buffy (Freebuff AI)_

_审核通过：`/brainstorming` 技能 + 综合项目上下文分析_

</div>
