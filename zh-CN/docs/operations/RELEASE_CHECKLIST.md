<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Release Checklist

> 在标记生产环境发布（即在触发 `semantic-release` 的情况下合并到 `main` 之前，或在手动打 tag 之前）请执行此操作。这是定期发生的“此提交是否安全发布”的关卡 — 对于首次一次性的生产环境推出，请参阅 [`DEPLOYMENT_READINESS.md`](DEPLOYMENT_READINESS.md) 的 Go-Live 清单。

---

## 1. 测试和代码检查 (Tests and lints) 全绿

```bash
node tests/lint/dashboard-linter.js
node tests/lint/orphan-object-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/alarm-sync-linter.js
node tests/unit/parser.test.js
node tests/unit/v2-parser.test.js
node tests/unit/counter-wraparound.test.js
node tests/unit/boundary-validation.test.js
```

或者直接推送/打开一个 PR — `.github/workflows/ci.yml` 会自动运行所有这些测试（加上 schema-drift 检查、orphan-object 检查、golden-dataset SPC 验证、chaos 压力测试以及 LDI 视觉/布局回归任务）。**如果 CI 运行呈红色，切勿给发布打 tag。**

- [ ] 要发布的提交的 CI 状态为全绿

## 2. 治理文档符合实际（无无声漂移）

```bash
node scripts/generate-dashboard-inventory.js --check # 无需数据库
node scripts/generate-schema-inventory.js --check  # 需要启动并迁移好 timescaledb
```

这两者都在 CI 中运行（分别在 `lint` 和 `integration-chaos` 任务中）— 红色的 CI 运行已经涵盖了这一点，但如果你出于任何原因从跳过了 CI 的分支进行发布，请先在本地运行它们。如果任何一个报告了漂移（drift），请重新生成（去掉 `--check`）并在打 tag _之前_（而不是之后）提交结果。

- [ ] 仪表板清单 (`docs/architecture/DASHBOARD_INVENTORY.md`) 为最新
- [ ] 数据库架构清单 (`docs/architecture/DATABASE_SCHEMA.md`) 为最新

## 3. 数据库迁移已完全应用且具有幂等性

```bash
bash scripts/migrate.sh
# 预期：Pending: 0 Applied: 0 Failed: 0
```

如果报告 `Pending: N > 0`，则说明迁移尚未应用到您刚才检查的那个数据库，或者添加了新的迁移文件但尚未运行 — 请在打 tag 之前解决。每个迁移都应该已经是幂等的（使用 `CREATE ... IF NOT EXISTS` 风格的保护）；如果你写了一个不具备幂等性的迁移，请立即修复，而不是在打上 tag 后别人重新运行时再去修复。

- [ ] `scripts/migrate.sh` 报告目标数据库上的 pending/failed 数量为零

## 4. 交付的内容中没有敏感信息（secrets），没有默认凭证

```bash
docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest \
 detect --source=/repo --no-git --redact --verbose --config=/repo/.gitleaks.toml
```

这也会在 CI 的 `lint` 任务中运行。如果这是一个生产标签（而不仅仅是 dev/staging 构建），请单独确认目标环境的 `.env` 中具有 `INGEST_API_KEY`、`POSTGRES_PASSWORD` 和 `GRAFANA_ADMIN_PASSWORD` 的真实值 — 参见 `docs/admin/ADMIN_MANUAL.md` 的生产前安全清单。此仓库不能交付真实的凭证；该验证必须针对实际的部署目标发生，而不是仓库。

- [ ] Gitleaks 扫描无异常
- [ ] （仅限生产）目标环境的默认凭证已轮换

## 5. 版本和变更日志与实际标记的内容一致

`package.json` 的 `version` 和 `CHANGELOG.md` 都是手动维护的；`semantic-release`（在 `package.json` 中配置）将根据 `main` 上的 conventional-commit 消息自动升级版本/打标签，但它**不会**追溯性地去协调已经与实际发布内容产生漂移的 `CHANGELOG.md`。在打 tag 之前：

- [ ] `CHANGELOG.md` 最新条目的版本和日期与即将被 tag 的内容相符（而不是之前发布的陈旧条目）
- [ ] 自上一个 tag 以来的提交消息是准确的 conventional-commit 类型（`feat`/`fix`/`perf`/`docs`/`chore`） — `semantic-release` 的版本升级直接源自这些消息

## 6. （如果本次发布改变了面向用户或管理员的任何内容）手册应反映出这些变化

`docs/user/USER_MANUAL.md` 和 `docs/admin/ADMIN_MANUAL.md` 都是手动维护的散文体，不是生成的 — 它们不会像两个清单文档那样自我修正。如果此版本添加/删除了仪表板、更改了容器/服务、更改了设备注册流程或更改了警报名称，请在同一版本中（而不是“稍后”）更新手册中的相关部分。

- [ ] 已根据此版本中的仪表板更改对照检查了 USER_MANUAL.md
- [ ] 已根据此版本中的 docker-compose/migration 更改对照检查了 ADMIN_MANUAL.md

## 7. （可选，但推荐针对主要/生产里程碑）浸泡测试 (Soak test)

`scripts/soak-test-report.sh` 记录随着时间推移的摄取失败、缓冲区溢出、容器重启和触发警报； `--summarize` 会在日志涵盖您关注的时间段时给出通过/失败的判定。不是每个发布都必须运行，但值得在生产里程碑 tag 之前运行（不仅是在最初的 go-live 之前）。

- [ ] （仅限主要/生产里程碑）已运行浸泡测试，并判定为无异常

---

## 打标签后

- [ ] 确认已使用预期版本创建了 GitHub Release / 标签
- [ ] 确认针对已打上标签的提交（而不仅仅是其之前的分支末端）成功运行（或重新运行）了 CI
- [ ] 如果是生产环境部署，则根据 `DEPLOYMENT_READINESS.md` 的 Go-Live 清单向利益相关者宣布
