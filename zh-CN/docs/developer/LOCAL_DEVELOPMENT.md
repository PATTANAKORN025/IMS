<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 本地开发与工程实践指南 (Local Development & Engineering Guide)</h1>
  <p><b>全套环境本地编排、数据流水线工程、数据库迁移与全栈测试验证工作流</b></p>
  <p>
    <a href="../../../docs/developer/LOCAL_DEVELOPMENT.md">English</a> |
    <a href="../../../th/docs/developer/LOCAL_DEVELOPMENT.md">ไทย</a> |
    <a href="LOCAL_DEVELOPMENT.md">简体中文</a>
  </p>
</div>

---

## 1. 快速入门与环境拉起 (5 分钟上手)

在几分钟内在您的本地工作站上完整启动工业监控系统 (IMS) 遥测全技术栈：

```bash
# 1. 克隆代码仓库
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# 2. 从模板初始化本地环境变量文件
cp .env.example .env

# 3. 校验本地开发工具链就绪情况
make doctor

# 4. 构建拆分流程并启动全套开发容器栈
make up

# 5. 执行全系统 14 个容器健康检查
make verify
```

启动完成后，通过浏览器访问本地主要服务：
- **统一入口网关 (Grafana UI 与各服务 API)**: `http://localhost:3000` (默认管理员: `admin` / 密码见 `.env`)
- **Node-RED 可视化流水线编排器**: `http://localhost:1880`
- **Prometheus 指标监控控制台**: `http://localhost:9090`
- **Alertmanager 告警分发管理台**: `http://localhost:9093`
- **PgAdmin 4 数据库管理平台**: `http://localhost:5050` (可选)

---

## 2. 工具链要求与版本矩阵 (Prerequisites)

| 工具名称 | 最低支持版本 | 推荐版本 | 用途说明 |
|:---------|:-------------|:---------|:---------|
| **Docker Engine** | 24.0+ | 26.0+ | 容器化底层运行时环境 |
| **Docker Compose** | v2.20+ | v2.27+ | 多容器拓扑编排与管理 |
| **GNU Make** | 3.81+ | 4.4+ | 统一构建、部署与测试自动化命令集 |
| **Node.js** | 18.0.0 LTS | 20.x / 22.x LTS | 运行代码审查工具、单元测试脚本及 Mock 生成器 |
| **npm** | 9.0+ | 10.0+ | 依赖包及脚本管理工具 |
| **Git** | 2.30+ | 2.45+ | 代码版本控制与分支协作 |
| **k6** *(可选)* | 0.45+ | 最新稳定版 | 数据流水线高并发压力测试 |
| **psql** *(可选)* | 15.0+ | 16.0+ | 终端直接执行 PostgreSQL 查询与脚本 |

### 跨平台开发环境注意事项

- **Windows 10/11**: 推荐使用 PowerShell 7+ 或 WSL2 (Ubuntu 22.04+)。使用原生 PowerShell 时，请确保执行策略允许脚本运行 (`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)。
- **Linux (Ubuntu/Debian)**: 安装标准编译构建工具集 (`sudo apt-get install build-essential docker-compose-plugin nodejs npm`)。
- **macOS (Apple Silicon / Intel)**: 安装 Docker Desktop 及 Xcode 命令行工具 (`xcode-select --install`)。

---

## 3. 环境配置与安全密钥管理 (Configuration & Secrets)

IMS 强制要求在代码仓库根目录下配置 `.env` 文件。严禁将 `.env` 或任何生产环境真实密钥提交至 Git 版本控制。

```bash
cp .env.example .env
```

### 核心环境变量速查表

| 变量名 | 必填 | 默认示例 | 说明 |
|:-------|:-----|:---------|:-----|
| `POSTGRES_USER` | 是 | `ims_admin` | TimescaleDB 主管理用户。 |
| `POSTGRES_PASSWORD` | 是 | *强安全密码* | TimescaleDB 数据库管理密码。 |
| `POSTGRES_DB` | 是 | `ims_telemetry` | 遥测数据主库名称。 |
| `GF_SECURITY_ADMIN_USER` | 是 | `admin` | Grafana 管理员账号。 |
| `GF_SECURITY_ADMIN_PASSWORD` | 是 | *Grafana密码* | Grafana 管理员密码。 |
| `INGEST_API_KEY` | 是 | *遥测写入密钥* | 调用 `POST /ldi-telemetry` 所需的授权令牌。 |
| `NODE_RED_CREDENTIAL_SECRET` | 是 | *流程加密密钥* | 用于加密 Node-RED 凭据的 AES 密钥。 |
| `ALERTMANAGER_LINE_TOKEN` | 选填 | *LineToken...* | 用于 LINE 通知分发的令牌。 |
| `ALERTMANAGER_TEAMS_WEBHOOK` | 选填 | `https://...` | Microsoft Teams 接收 Webhook URL。 |

> [!CAUTION]
> **绝对保密准则 (Strict Secret Security)**：在所有文档、提交记录及日常交流中，仅能通过环境变量名进行指代。所有 Compose 配置文件均采用 `${VARIABLE:?set VARIABLE in .env}` 语法对必要配置进行严格断言。

---

## 4. 系统生命周期管理命令清单 (Command Reference)

IMS 的 `Makefile` 封装了日常开发与测试所需的高频标准化命令：

```bash
# 容器启停控制
make up               # 编译拆分流程并在后台启动全量容器服务栈
make up-prod          # 使用生产叠加配置 (Production Overlay) 启动服务
make down             # 停止所有服务并清理内部容器网络
make restart          # 快速平滑重启 Node-RED、Grafana、Alertmanager 和 Prometheus

# 流水线与流程管理 (IaC: 基础设施即代码)
make build-flows      # 将拆分流程 (nodered_data/flows/*.json) 合并为 flows.json
make validate-flows   # 校验 flows.json 架构合法性并检查重复节点 ID
make deploy-flows     # 将合并后的流程直接推送到运行中的 Node-RED Admin API
make snapshot-flows   # 在 backups/ 目录下创建带时间戳的 flows.json 备份

# 健康检查与环境巡检
make verify           # 执行全链路跨服务健康巡检脚本 (Containers, DB, Alerts)
make doctor           # 检查本地工具链安装就绪状态 (Docker, Compose, Node)
make validate-dashboards # 扫描 Grafana 仪表板 JSON 模型中的损坏颜色代码
make logs             # 实时追踪输出 Node-RED 容器标准输出与日志

# 数据库备份与还原
make backup           # 将当前 TimescaleDB 遥测数据导出为带时间戳的 SQL 备份
make restore FILE=... # 从指定的备份文件恢复数据库数据

# 自动化测试与质量保障
make test-unit        # 执行单元测试 (边界验证、数据解析器、64 位计数器回绕)
make test-load        # 运行基于 k6 的高并发流水线压力测试
make test-visual      # 执行基于 Playwright 的仪表板视觉回归测试套件
make test-visual-ldi  # 执行基于 Playwright 的 LDI 移动响应式布局校验
```

---

## 5. Node-RED 遥测流水线工程 (Pipeline Engineering)

Node-RED 在系统中承担着高频遥测接入、数据清洗转换与入库前级缓冲的核心职责。

### 拆分流程架构 (Split Flow Architecture)

为避免多人协作时在单个庞大的 JSON 文件上产生 Git 代码合并冲突，Node-RED 的流程被严格解耦拆分在 `nodered_data/flows/` 目录下：

```
nodered_data/flows/
├── 01-snmp-poller.json       # SNMP 轮询采集及网络接口计数器提取
├── 02-ldi-ingest.json        # HTTP /ldi-telemetry 架构校验与数据解析
├── 03-alarm-engine.json      # 告警阈值计算及 Alertmanager 调度
└── 04-storage-writer.json    # PgBouncer 连接池聚合与批量数据库写入
```

1. **部署流程 (Deploy)**：
   ```bash
   make deploy-flows
   ```
   *将拆分文件拼接合并为 `nodered_data/flows.json`，并一键 POST 部署至运行中的 Node-RED。*
2. **快照备份 (Snapshot)**：
   ```bash
   make snapshot-flows
   ```
   *在进行重大逻辑修改前，生成 `backups/flows-YYYYMMDD-HHMMSS.json` 备份。*

### 沙箱运行时不可突破的铁律 (Ironclad Rules)

Node-RED 中的 Function 节点运行在受限的 VM 沙箱环境中：

- **严禁使用 `require()`**：动态模块引入已被禁用。必须通过 `global.get('snmp')`、`global.get('pg')` 或 `global.get('fs')` 访问全局预加载库。
- **严禁使用 `structuredClone`**：沙箱未注入该全局 API。深拷贝必须使用 `JSON.parse(JSON.stringify(obj))`。
- **强制显式垃圾回收 (Explicit GC)**：对高频海量遥测数组必须手动清理以避免 V8 堆内存溢出：
  ```javascript
  flatData.length = 0;
  msg.payload = null;
  ```
- **$O(N)$ 单趟解析算法**：数据转换处理必须在单次线性扫描中完成，禁止使用嵌套多重循环或无界正则。

---

## 6. TimescaleDB 与 PostgreSQL 数据库工作流

所有时序遥测数据均持久化在 TimescaleDB 中（基于 PostgreSQL 16）。

### 数据库架构设计规范

- **严格锁定在 `public` 模式**：所有超表 (Hypertables)、普通数据表、视图以及连续聚合 (CAGGs) 必须位于 `public` 模式。严禁创建或引用 `ims.*` 模式。
- **有序迁移机制**：数据结构变更必须作为带编号的 SQL 脚本存放在 `database/migrations/` 中（`001-*.sql` 至 `086-*.sql`）。
- **`INSERT` 语句字段与参数严格对应**：`INSERT INTO` 声明的字段数量必须与 `VALUES ()` 中的占位符完全一致。当使用 `NOW()` 时，`"time"` 必须保留在字段列表中。
- **PgBouncer 连接池使用规范**：
  - 连接模式：`transaction` 事务级池化。
  - 认证方式：`AUTH_TYPE: scram-sha-256`。
  - 预处理语句 (Prepared Statements)：**严格禁止**（PgBouncer 事务模式不支持）。

### 本地执行数据库迁移脚本

```bash
# 通过 docker exec 直接向 TimescaleDB 灌入新迁移脚本
docker exec -i ims-timescaledb psql -U ims_admin -d ims < database/migrations/086-add-custom-telemetry.sql
```

### 连续聚合视图 (CAGGs) 查询

仪表板的高频复杂统计查询应优先使用预聚合的 Continuous Aggregates（如 `public.ldi_data_15m`），以实现亚秒级响应：

```sql
SELECT
  bucket AS "time",
  machine_id,
  ROUND(avg_temperature::numeric, 2) AS temperature
FROM public.ldi_data_15m
WHERE machine_id = 'LDI-01'
  AND bucket > NOW() - INTERVAL '24 hours'
ORDER BY bucket ASC;
```

---

## 7. 钻孔与电镀合成模拟数据生成 (Drilling & VCP Mock Data)

为了在完全脱离工厂真实生产专有数据的前提下，全面测试 4 个 CNC 钻孔与 3 个 VCP 电镀仪表板，可使用合成模拟数据生成工具：

```bash
# 1. 生成过去 7 天 (168 小时) 的高仿真设备运行模拟数据
node scripts/mock/eap-mock-data.js --hours=168 --apply

# 2. 自动校验所有钻孔与 VCP 仪表板的查询与面板行数
node scripts/mock/verify-mock-dashboards.js --container=ims-timescaledb --psql-user=ims_admin
```

> [!NOTE]
> 模拟数据仅写入 `eap_backup` 隔离数据库中，严格遵循全部数据约束，使开发者能够在无真实生产数据依赖的情况下完整验证全部 22 个 Grafana 仪表板。

详细技术实现请参阅 [合成模拟数据框架说明](../data/MOCK_DATA.md)。

---

## 8. Grafana 仪表板开发准则与设计系统

所有仪表板以 JSON 形式纳入版本控制，归类于 `monitoring/grafana/dashboards/`：
- `infrastructure/` (5 个基础设施仪表板)
- `manufacturing/` (10 个制造执行仪表板)
- `drilling/` (4 个 CNC 钻孔仪表板)
- `vcp/` (3 个 VCP 垂直连续电镀仪表板)

### 仪表板工程规范

1. **Grid-24 栅格约束**：
   - 每一行的面板宽度之和必须严格等于 **24 列**。
   - 纵向坐标计算递推：$\text{Next Y} = \text{Prev Y} + \text{Prev H}$。
2. **严格使用标准设计系统颜色令牌 (Canonical Color Tokens)**：
   - 核心遥测指标与正常状态：`#00F2FE` (电光青 Cyan)
   - 成功与健康运行状态：`#00FF87` (春绿 Green)
   - 致命异常与关键阈值突破：`#FF003C` (深红 Red)
   - 预警与关注状态：`#FFB300` (琥珀黄 Amber)
   - 辅助曲线与统计分析：`#7928CA` (霓虹紫 Purple)
   - 严禁使用 Grafana 默认杂乱调色板。
3. **彻底防止 SQL 注入**：
   - 非重复面板：`machine_id IN (${machine_id:singlequote})`
   - 重复面板：`eqp_id = ${machine_id:singlequote}`
   - **绝不允许**使用未加引号的 `${machine_id}`。
4. **PostgreSQL ROUND 转换**：
   - 浮点数四舍五入必须显式转型为数值类型：`ROUND(value::NUMERIC, 2)`。

---

## 9. 自动化测试与质量保障体系 (QA Suite)

在提交代码或创建 Pull Request 之前，必须执行全套本地质量检测：

```bash
# 1. 运行 53 项严格的 Pre-commit 检查
node scripts/pre-commit.js

# 2. 审计全库 Markdown 链接与锚点完整性
node scripts/find-broken-links.js

# 3. 校验文档中声称的数据与代码清单完全匹配
node tests/lint/doc-overclaim-linter.js

# 4. 扫描代码仓库防止敏感信息或工厂专有数据泄露
node tests/lint/private-data-leak-scanner.js

# 5. 校验仪表板清单与数据库结构清单一致性
node scripts/generate-dashboard-inventory.js --check
node scripts/generate-schema-inventory.js --check
node scripts/generate-docs-readme-index.js --check
```

---

## 10. Git 协作准则与贡献工作流 (Git Conventions)

### 分支管理策略

- `feat/<功能名称>`: 新增功能、仪表板或新特性
- `fix/<缺陷名称>`: 生产问题修复或缺陷补丁
- `perf/<优化项>`: 性能调优、查询优化或流水线加速
- `docs/<主题>`: 文档完善、更新与多语言同步

### Conventional Commits 提交规范

Commit 消息必须严格遵循 Conventional Commits 格式：

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

*示例:*
- `feat(drilling): add spindle vibration anomaly detection panel`
- `fix(pipeline): prevent counter wraparound on 64-bit snmp octets`
- `docs(api): document alarm lifecycle ack and resolve endpoints`

### Pull Request 提交前清单 (PR Checklist)

- [ ] `node scripts/pre-commit.js` 全部 53 项检查均显示 `PASS` (0 failures)。
- [ ] 确保未引入任何真实 CAD 几何图纸、设备厂商专有名称或生产密钥。
- [ ] 所有文档修改均已对称同步至英文 (`docs/`)、泰文 (`th/`) 及简体中文 (`zh-CN/`)。
- [ ] 运行 `find-broken-links.js` 确保所有内链与锚点 100% 有效。
