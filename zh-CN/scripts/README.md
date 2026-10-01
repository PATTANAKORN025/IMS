# scripts/ (运维与构建脚本)

运维与构建脚本目录。所有脚本均需从仓库根目录执行。大部分脚本均已封装为 `make` 目标（参见 `make help`）；其余脚本可直接运行。

仅用于修复某一次历史临时问题的脚本不得存放在此：执行完毕后应立即删除，由 git 历史保留记录。

## 容器栈生命周期管理 (Stack lifecycle)

| 脚本 | 用途说明 | 执行入口 (Entry point) |
| --- | --- | --- |
| `check-env.js` | 当缺少 `docker-compose.yaml` 必需的环境变量时拒绝启动；`--strict` 还会拒绝示例配置中的公开密码 | `make up`, `make up-prod`, `make check-env` |
| `migrate-entrypoint.sh` | 规范的唯一数据库迁移运行器，由一次性 `db-migrate` 容器执行 | `docker compose up` |
| `migrate.sh` | 手动重新执行 `db-migrate` | 直接执行 |
| `verify-deployment.sh` / `.ps1` | 全栈健康检查：容器、数据库、流水线与告警 | `make verify` |
| `verify-db-health.sh` / `.ps1` | 数据库完整性与连接健康检查 | 直接执行 |
| `container-watchdog.sh` | 重启 Docker Desktop 重启策略遗漏的已退出容器 | 直接执行 / 定时任务 |
| `observability-archiver.sh` | 在 `observability-archiver` 服务内部执行的归档脚本 | compose |
| `switch-data-mode.sh` | 在真实数据与模拟生成数据之间无缝切换 | 直接执行 |
| `import-real-data.sh` | 导入真实 LDI 遥测数据与告警切流 | 直接执行 |

## 备份与灾难恢复 (Backup and disaster recovery)

| 脚本 | 用途说明 | 执行入口 (Entry point) |
| --- | --- | --- |
| `backup-db.sh` / `.ps1` | 在容器内执行 `pg_dump -Z` 并通过 `docker cp` 复制导出 | `make backup` |
| `restore-db.sh` | 将 `.sql.gz` 备份文件恢复至运行中的数据库 | `make restore FILE=…` |
| `dr-test.sh`, `dr-verify-restore.sh`, `dr-restore-table-data.py` | 灾难恢复演练与恢复校验脚本 | 直接执行 |

详细说明参见 [备份与恢复操作手册](../docs/operations/BACKUP_RESTORE.md)。

## 构建与部署 (Build and deploy)

| 脚本 | 用途说明 | 执行入口 (Entry point) |
| --- | --- | --- |
| `make-help.js` | 格式化输出 Makefile 所有目标及其 `## ` 注释说明 | `make`, `make help` |
| `build-flows.js` | 将 `nodered_data/flows/*.json` 合并为 `flows.json` | `make build-flows` |
| `provision-library-panels.sh` | 通过 HTTP API 管理 Grafana 共享库面板 | 直接执行 |
| `grafana-folder-permissions.js` | 配置预置仪表板文件夹的访问权限 | 直接执行 |
| `create-playlist.sh` | 创建 NOC 大屏轮播播放列表 | 直接执行 |
| `snmp-discover.js` | 为新设备发现与探测 SNMP OID | 直接执行 |
| `unwrap-pgadmin-export.py` | 解包 pgAdmin "Copy with SQL INSERT" 导出文件 | 直接执行 |

## 质量门禁与生产保障 (Quality gates and assurance)

| 脚本 | 用途说明 | 执行入口 (Entry point) |
| --- | --- | --- |
| `pre-commit.js` | 单元测试、代码检查器、仪表板及 Flow JSON 门禁检查 | husky hook, CI, `make check` |
| `run-alarm-api-tests.js` | 使用 alarm-api 自身依赖执行单元测试 | `make test-unit` |
| `production-assurance.js`, `assurance-schema.js`, `gate.js` | 执行生产保障画像扫描并判定质量门禁 | 直接执行 |
| `production-readiness-render.js`, `failure-detection-matrix-render.js` | 根据保障扫描输出渲染证据文档 | 直接执行 |
| `kiosk-load-test.sh`, `soak-test-report.sh`, `soak-test-report-hidden.vbs` | 负载与耐受力测试（`.vbs` 在任务计划程序中无窗口运行） | 直接执行 |
| `find-broken-links.js` | 扫描所有 Markdown 文档的相对链接断链 | 直接执行 |

## 文档与资产自动生成器 (Generators)

| 脚本 | 生成成果 | 执行入口 (Entry point) |
| --- | --- | --- |
| `generate-dashboard-inventory.js` | 仪表板清单资产清单（CI 中使用 `--check`） | 直接执行 |
| `generate-schema-inventory.js` | 数据库表与视图结构清单 | 直接执行 |
| `generate-docs-readme-index.js` | 各文档目录 README 中的目录映射图（`--check`） | 直接执行 |
| `generate-showcase.sh` | README 仪表板实时截图生成 | 直接执行 |
| `generate-banner-gif.py`, `icon-engine.mjs` | README 横幅与图标素材生成 | 直接执行 |

## 一楼数字孪生 (需要外部私有 CAD 数据，不在 git 跟踪内)

| 脚本 | 用途说明 |
| --- | --- |
| `extract-floor1-cad.js`, `extract-floor1-raw-cad.js`, `extract-floor1-equipment.js` | 从私有 CAD 导出文件中提取三维几何数据 |
| `apply-floor1-canonical-frame.js`, `recover-floor1-outside-envelope-equipment.js` | 规范化并修复提取的模型数据 |
| `twin-direct-container.sh` / `.ps1` | 启动临时 Factory Twin 容器用于场景渲染比对 |

## 共享代码 (Shared code)

- `lib/`: 上述脚本共享的通用工具函数。
- `mock/`: 生产合成数据模拟生成器 (`docs/data/MOCK_DATA.md`)。
