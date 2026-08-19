# START — 会话初始化命令

> 触发器：在会话开始时说 **"run START"**（或 "/start"）。
> Claude 将执行以下步骤。

## 启动序列

1. 读取 `CONTEXT.md`，然后是 `CLAUDE.md`、`ABOUT-ME.md`、`GLOBAL-INSTRUCTIONS.md`。
2. 读取 `TASKS.md`（活动 + 待办事项）和 `checkpoint.md` 中的最新条目。
3. 运行快速的只读状态扫描（无任何更改）：

- `git -C . log --oneline -5` 和 `git status -s` — 最近的提交 + 未提交的文件
- `docker compose ps` — 服务健康状况（如果 Docker 可达）
- 列出 `INPUTS/` 中的任何新内容

1. 生成一份 **<10 行的简报**：

- 项目 + 阶段 + 状态（一行）
- 服务健康状况摘要（或“Docker not reachable”）
- 未提交的更改（如果有）
- `TASKS.md` 中的前 3 个待办事项
- 一个建议的下一步操作

1. 询问：**"What are we doing today?"** — 然后等待。

## START 期间的规则

- 仅限只读。不进行任何编辑，不进行任何提交，不进行任何重启。
- 始终遵守铁律 (Ironclad Rules) 和安全默认设置。
- 保持简短 — 这是一个情况介绍，而不是一份报告。

## 我可能会使用的快速别名

- `run START` → 此序列
- `daily briefing` → `TEMPLATES/daily-ops-briefing.md`
- `incident <desc>` → `TEMPLATES/incident-response.md`
- `status report` → `TEMPLATES/weekly-status-report.md`
- `checkpoint` → 在 `checkpoint.md` 中附加一个新的带日期的条目（先询问）
