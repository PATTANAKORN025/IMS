<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Documentation Quality Report

> IMS Enterprise Documentation Program — 最终报告, 2026-08-10.
>
> 范围：`docs/**`、`README.md`、`CONTRIBUTING.md`、`.github/**`（排除 `.github/skills/impeccable/`，这是一个供应商第三方工具包，不属于 IMS 文档），与 `database/migrations/**`、`monitoring/grafana/dashboards/**` 和 `nodered_data/flows/**` 进行了交叉验证。本次审计未修改任何运行时代码、数据库、Docker 或 Node-RED 逻辑——需要更新代码/架构的发现已记录在 System Constraints & Technical Boundaries 中。

---

## Files audited

在 `docs/` 下的 **43 个 markdown 文件**（其中 9 个现已移至 `docs/archive/`），加上 `README.md`、`CONTRIBUTING.md`、`.github/CODEOWNERS`、2 个 issue 模板、1 个 PR 模板和 4 个 GitHub Actions 工作流——**共计 51 个文件**。每一项技术声明都与以下内容之一进行了核对：生产数据库 (`docker exec ims-timescaledb psql`)、实际的迁移文件、实际的仪表板 JSON、实际的 Node-RED flow JSON 或实际的测试/lint 运行——而不是基于之前的文档进行假设。

## Files rewritten (9)

| File                                                             | What was wrong                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONTRIBUTING.md`                                                | 倒退的 Node-RED 真实来源指南（路径错误，告诉贡献者永远不要编辑实际的源文件）；不存在的 `safeStr()` 函数（真实名称：`sanitize()`）；过时的仪表板路径。                                                            |
| `docs/operations/ALARM_PLAYBOOK.md`                              | 完全虚构的警报代码（`SYS-001`、`NET-002`、`LDI-001`），在此系统中从未存在过。已替换为模拟器中实际激活的 19 个代码和真实的警报规则名称。                                                                                    |
| `docs/architecture/ARCHITECTURE.md`                              | 自相矛盾（文字描述称“9 个仪表板”，而其自身的图表显示为“10 个”）；两个过时的硬编码 RCA Lift 数据；多余的“Slack”提及，而该系统只列出过 LINE/Teams 的凭据。                                                                       |
| `docs/architecture/ARCHITECTURE_DIAGRAM.md`                      | 使用“LINE Notify”（已停用的 API）而非 LINE Messaging API；声称 10 秒计时器，而实际为 30 秒。                                                                                                                                                                |
| `docs/business/BUSINESS_VALUE_ROI.md`                            | 仪表板数量（4→10）、容器数量（8→10）、警报规则数量，与实际 k6 脚本定义的故障预算相比，存在虚假的“0% 故障”负载测试声明。财务/ROI 数据作为原始业务输入保留——超出了本次审查可以独立验证的范围。 |
| `docs/product/PRODUCT.md`                                        | 遗漏了整个 LDI 制造/SPC/RCA 功能；仪表板数量错误；警报通道错误（Slack，实际上从未接入）；过时的颜色令牌。                                                                                                          |
| `docs/product/CONTEXT.md`                                        | 引用了此代码库中不存在的 5 个文件；错误的 Node-RED 路径；错误的警报通道。（注意：此文件被 gitignore——修复仅在本地进行，不属于被跟踪的代码库的一部分。）                                                                                 |
| `README.md`                                                      | 文档表缺少平台手册和 8 个新指南；3 个过时的“LINE Notify”/“Slack”提及；过时的仪表板数量和保留期数据，与过时的迁移值匹配，而不是生产数据库。                                                      |
| `docs/user/USER_MANUAL.md`, `docs/operations/TROUBLESHOOTING.md` | “LINE Notify”术语；一个 Node-RED 恢复命令引用了不存在的路径，如果遵循该命令，将会主动导致 `flows.json` 进一步损坏。                                                                                                      |

## Files added (10)

`docs/architecture/LDI_SPC_GUIDE.md`、`LDI_RCA_GUIDE.md`、`ALARM_SEVERITY_GUIDE.md`、`DATA_FLOW.md`、`DATA_RETENTION.md`、`SECURITY_MODEL.md`、`IMS_PLATFORM_BOOK.md`；`docs/operations/INCIDENT_RESPONSE.md`、`BACKUP_RESTORE.md`；`docs/archive/README.md`。每一个公式、图表和图解都基于实时查询、实际迁移或实际测试运行——而不是源自早期（部分虚构）的文档。

## Files archived (8)

移至一个新的、由 git 跟踪的 `docs/archive/`（不是代码库中现有的 `ARCHIVES/`，后者被 gitignore 并且会导致它们从共享代码库中被有效删除）：4 份有日期的审计报告、2 份第二阶段基准测试报告、1 份开发计划快照以及实习回顾。每一份都带有横幅，注明其日期并说明其数据是历史数据，而非当前数据。

## Broken links & references fixed

- 在所有 36 个未归档的文档文件中，发现了 0 个损坏的相对 markdown 链接（以编程方式检查了 131 个链接）。
- 1 个功能性损坏的恢复命令（`TROUBLESHOOTING.md`，引用了不存在的路径以及完全错误的恢复操作）。
- 在 `CONTEXT.md` 中修正了 5 个对不存在文件的引用（`CLAUDE.md`、`GLOBAL-INSTRUCTIONS.md`、`TASKS.md`、`MEMORY.md`、`checkpoint.md`）。

## Terminology corrections

| Wrong                                                                          | Correct                                           | Occurrences fixed    |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------- |
| `node-red/flows/`                                                              | `nodered_data/flows/`                             | 3 files              |
| `safeStr()`                                                                    | `sanitize()`                                      | 1 file (2 mentions)  |
| LINE Notify (discontinued 2025)                                                | LINE Messaging API                                | 4 files              |
| Slack (never actually integrated)                                              | LINE Messaging API + MS Teams                     | 4 files              |
| "12 Grafana dashboards" / "4 dashboards" / "4 infrastructure, 8 manufacturing" | 14 dashboards, 6 infrastructure + 8 manufacturing | 6 files              |
| Fictional alarm codes (`SYS-001` etc.)                                         | Real numeric codes from `ldi_alarm_ms_code`       | 1 file, full rewrite |

标准术语表（IMS、LDI、EAP、SPC、RCA、Andon、CAGG、Cpk、Lift）现在位于 `docs/architecture/IMS_PLATFORM_BOOK.md` 中。

## System Constraints & Technical Boundaries discovered (docs-only scope)

验证新指南的声明时发现了 2 个技术约束，均已记录在 `ARCHITECTURE.md` 的 System Constraints & Technical Boundaries 中：

1. **SPC test-coverage constraint:** 黄金数据集回归套件（`tests/e2e/golden-dataset-spc.js`）无法实际验证 `v_machine_spc_fleet` 的 Cpk 公式，因为迁移 064 将其转换为物化视图——测试的事务范围综合插入对物化视图是不可见的。7 个断言中有 5 个仍然通过（非物化实现）；2 个返回解析垃圾数据，而不是已确认的公式错误。
2. **Retention-policy drift:** `postgres/init/`（全新部署引导）和 `database/migrations/016`（增量路径）为同一表设置了不同的保留值（30天 vs. 14天）。生产数据库与 `postgres/init/` 匹配，这意味着迁移 016 可能从未应用于此特定部署。

## Remaining items

- `docs/operations/SCALING_PLAN.md`，`docs/product/ONBOARDING_SCRIPT.md` — 进行了抽查，未发现已确认的错误，但未逐行进行深入重新验证。建议进行后续审查。
- `.github/workflows/ci.yml` 和 `ci-flows.yml` 都使用显示名称 `CI` — 令人困惑，但并不真正多余（它们检查不同的内容）。未修复；这将需要在文档范围之外编辑工作流文件。
- DR 测试发现的容器重启策略漏洞和 Node-RED 看门狗对该故障模式的不可靠触发仍然是未解决的工程问题（记录在 `ARCHITECTURE.md`、`INCIDENT_RESPONSE.md`、`BACKUP_RESTORE.md` 中）——真正的修复需要进行超出本次审查范围的代码更改。
- `IMS_MANUFACTURING_PLATFORM_V2.md` 的浸透测试（Soak Test）阶段仍在通过计划任务收集真实样本；必须经过实际的运行时间才能得出结论并关闭。
- 考虑到 Drill 2 中发现的关于恢复可靠性的问题，DR Drill 3（完全破坏性的堆栈重建）尚未运行，等待明确确认。

## Quality bar assessment

本次审查中创建或大幅重写的每份文档都带有出处声明（在什么日期，针对什么，验证了什么）——这与本会话为 `LDI_VALIDATION_PROTOCOL.md` 和 DR/浸透测试证据建立的证据标准相同。预计会随时间推移而改变的数字（RCA Lift 数据、实时保留策略）被明确标记为带有所需重新验证查询的时间点快照，而不是作为永久事实呈现。这是未来建议用于此代码库中任何新操作文档的标准。
