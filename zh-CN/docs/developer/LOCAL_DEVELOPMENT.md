# 本地开发与贡献指南

欢迎来到 IMS 核心团队。本指南将帮助您在几分钟内在本地运行完整的遥测技术栈。

## 1. 先决条件 (Prerequisites)
- Docker & Docker Compose (v2)
- GNU Make
- Node.js (用于 linting/tests)

## 2. 环境设置 (Environment Setup)
1. 克隆存储库。
2. 复制环境文件: `cp .env.example .env` (根据需要填充 Secrets)。
3. 启动开发栈:
   ```bash
   make up
   ```
   *(这将启动 Node-RED, TimescaleDB, Grafana 和本地模拟器)*

## 3. 开发工作流 (Development Workflow)
- **Node-RED**: 访问 `http://localhost:1880`。UI 中的编辑是暂时的！您必须将流程导出到 `nodered_data/flows/*.json`。
- **Grafana**: 访问 `http://localhost:3000` (admin / change-me-please)。编辑仪表板后，将 JSON 模型保存回 `monitoring/grafana/dashboards/`。
- **验证 (Validation)**: 提交前运行 `make verify`。

## 4. Git 约定 (Git Conventions)
- 分支: `feat/*`, `fix/*`, `perf/*`, `docs/*`
- 提交: Conventional Commits (例如: `feat(ldi): add spindle metric`)
