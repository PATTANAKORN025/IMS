# IMS — AI Agent Operating Instructions

> **常设规则:** 本文件是所有在 IMS 存储库上工作的 AI 代理（Claude、Antigravity、Cursor 等）的技术权威指南。在每次会话开始时必须阅读此文件。

## 1. 系统上下文 (System Context)

**IMS (工业监控系统)** 是一个遥测监控系统。

- **数据源:** 轮询的 SNMP 设备（Linux 服务器、Juniper 交换机）和 HTTP（LDI PCB 制造机）。
- **数据管道:** Node-RED (数据接入) → PgBouncer → TimescaleDB (存储) → Grafana (仪表板)。
- **告警:** Prometheus + Alertmanager → LINE / MS Teams。

## 2. 代理输出与语气 (Agent Output & Tone)

- **穴居人模式 (Caveman Mode):** 像聪明的穴居人一样简短作答。保留所有技术实质，去掉所有废话。省略冠词 (a/an/the)、填充词 (just/really/basically)、客套话和模糊语言。可以使用不完整的句子。
- *模式:* `[事物] [动作] [原因]. [下一步].`
- *正确示例:* "Bug in auth middleware. Fix:"
- *自动清晰度 (Auto-Clarity):* 在遇到安全警告、不可逆操作或用户感到困惑时，停止使用穴居人模式，并在之后恢复。
- **边界:** 代码/提交(commits)/PR 必须按正常方式编写。
- **格式:** 使用 Markdown。使用 GitHub 风格警告（如 `> [!WARNING]` 等）来标注关键信息。

## 3. 铁律架构规则 (Ironclad Architectural Rules) (绝对不可违反)

- **数据库 Schema:** 仅使用 `public` schema。绝不使用 `ims.*`。
- **Node-RED 沙盒 (Sandbox):** 函数节点中无法使用 `require()`。请使用 `global.get('snmp')`、`global.get('pg')`、`global.get('fs')`。无法使用 `structuredClone`，请改用 `JSON.parse(JSON.stringify(obj))`。
- **Node-RED 解析 (Parsing):** O(N) 单次遍历 (single-pass)。需要显式的垃圾回收 (GC)：`flatData.length = 0` + `msg.payload = null`。
- **Node-RED Flows:** `nodered_data/flows/*.json` (拆分文件) 是单一事实来源 (source of truth)。在部署时，它们通过 `make deploy-flows` 拼接到 `flows.json`。PowerShell 会在 flow JSON 中将 `\n` 替换为 `\\n` — 请使用 Python 脚本进行复杂的多文件编辑。
- **数据库插入 (Inserts):** INSERT 列数必须等于 VALUES 占位符数。当在 VALUES 中使用 `NOW()` 时，`"time"` 列必须保留在 INSERT 列表中。
- **PgBouncer:** `AUTH_TYPE: plain`，事务池化 (transaction pooling)，不使用预处理语句 (prepared statements)。

## 4. Grafana 与仪表板规则 (Grafana & Dashboard Rules)

- **24 网格纪律 (Grid-24 Discipline):** 每一行的列数总和必须精确为 24。下一个 Y = 前一个 Y + 前一个 H。
- **设计系统 (Design System):** 仅使用规范颜色标记 (Canonical Color Tokens)（例如，`#00F2FE` 青色，`#00FF87` 绿色，`#FF003C` 红色）。绝不使用默认的 Grafana 颜色。
- **TimescaleDB 查询:** 尽可能在原始表之上使用连续聚合 (continuous aggregates)。
- **列命名 (Column Naming):** 原始表使用 `time`。CAGG 使用 `bucket`。Grafana 在查询中将别名设为 `bucket AS time`。
- **防止 SQL 注入:**
  - 非重复面板 (Non-repeated panels): `machine_id IN (${machine_id:singlequote})`
  - 重复面板 (Repeated panels): `eqp_id = ${machine_id:singlequote}`
  - **绝不** 在没有引号的情况下使用 `${machine_id}`。
- **PostgreSQL ROUND:** 必须转换为 numeric 类型: `ROUND(value::NUMERIC, N)`。
- **状态时间线 (State Timeline):** 用于颜色编码的值映射 (0=红色/CRIT，1=琥珀色/WARN，2=绿色/OK)。

## 5. 开发工作流与命令 (Development Workflow & Commands)

- `make up` — 启动开发栈 (SNMP 模拟器配置文件)
- `make up-prod` — 启动生产覆盖层 (production overlay)
- `make restart` — 重启 Node-RED、Grafana、Alertmanager、Prometheus
- `make verify` — 全面健康检查 (容器、DB、管道、告警)
- `make deploy-flows` — 拼接拆分 flow → flows.json → POST 到 Node-RED
- `make test-unit` / `make test-load` / `make test-visual` — 测试套件。优先进行最小范围的测试。

## 6. 安全与保密 (Safety & Security)

- **机密信息 (Secrets):** 绝不朗读、打印、记录日志或提交 `.env` 文件。仅通过名称引用。
- **必需的环境变量 (Required Env Vars):** 在 compose 中对于必需的 secrets 使用 `:?err` 语法（例如，`${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`）。
- **默认设置:** 在执行破坏性操作（数据库 schema 更改、`git push --force`、覆盖非输出文件）之前必须询问。

## 7. 可用技能 (Available Skills)

通过 MCP 和 `.agents/skills/` 可使用 90 多项技能。使用 `/skill-name` 来调用。
关键的本地技能包括：`verify-database-state`、`update-aiops-parser`、`modify-grafana-dashboard`、`batch-dashboard-edit`。
