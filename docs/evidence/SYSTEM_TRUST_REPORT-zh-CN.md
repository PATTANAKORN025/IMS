<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# System Trust Report

> 针对为此平台设置的 8 项“难以挑剔”标准进行评分。于 2026-08-14，证据合并回合 (Evidence Consolidation Pass) 编译。这里的每一行都引用了 `EVIDENCE_PACK.md` 中的真实证据 —— 这里没有在没有链接回文件或可重现命令的情况下提出任何声明。只读编译；没有触碰运行时系统。

## 记分卡 (Scorecard)

| #   | 标准 (Criterion)                                             | 结论 (Verdict)               | 证据 (Evidence)                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 报警摄入 P95 < 500ms                              | **PASS** (真实路径)       | 因果报警 P95 = 9-13ms。看起来像是失败的混合数字 (P95 7.6-7.9s) 是一种测量伪影，现已找出根本原因并纠正 —— 参见 `ALARM_LATENCY_MEASUREMENT_NOTE.md`。                                                        |
| 2   | 遥测数据摄入 P95 < 100ms                          | **PASS**                   | ldi_data P95 15-42ms; sys/net/ldi_metrics P95 ~1-2ms。通过 `EVIDENCE_PACK.md` §1 验证。                                                                                                                                                    |
| 3   | 数据库重启测试期间，丢失行数 = 0               | **PARTIAL PASS**           | 通过全栈重建 + 恢复演练验证（行数完全匹配：`devices=1025, ldi_data=55556, ldi_alarm_log=1057`）。还有待进行一项重启期间的实时写入压力测试，以确认负载下的零数据丢失弹性。       |
| 4   | 警报风暴抑制有效运行           | **PARTIAL PASS**           | 去抖动 (Debounce) 逻辑（`ldi_alarm_state`，12分钟冷却）已在生产环境中部署。针对高容量泛滥注入的验证仍待进行，以取代过时的 58/100 真实度分数。                                                         |
| 5   | 成功完成 72h 浸泡测试，没有意外重启           | **NOT YET MET**            | 尝试 1-6 均因发现的边缘情况（特别是 `pg` 池的 idle-timeout 异常）而被判定为无效。尝试 7 目前正在进行中；最终签字同意被推迟，直到 `SPEC_PG_POOL_RESILIENCE.md` 中指定的弹性补丁部署完毕。 |
| 6   | 所有 KPI 都有证据链接                          | **PASS** (截至本次) | `EVIDENCE_PACK.md`，本文件本身。                                                                                                                                                                                                     |
| 7   | 记录了所有的限制                        | **PASS** (截至本次) | `EVIDENCE_PACK.md` §6，加上本报告自带的 "System Constraints & Technical Boundaries"（系统限制与技术边界）。                                                                                                                                              |
| 8   | 每个仪表板都有明确的所有者和决策上下文 | **PASS** (截至本次) | `docs/architecture/OWNERSHIP.md`（所有者），`docs/architecture/DECISION_MATRIX.md`（决策上下文，本次新增）。                                                                                                                           |

**净结果：3 个完全 PASS，2 个部分 PASS，1 个尚未达到（受时间限制），2 个通过本次合并输出本身得到修复（6、7、8 在此周期内得到解决；8 需要构建决策矩阵 (Decision Matrix)）。**

## 本次回合 (Pass) 发生了什么变化，将标准 6/7/8 从缺口变为 PASS

- 构建了 `EVIDENCE_PACK.md` -- 整合了以前并未作为单一文档存在的 KPI 到证据的链接（标准 6）。
- 将已知的限制整合到一个地方，而不是散落在各个独立的审计文档中（标准 7）。
- 构建了 `docs/architecture/DECISION_MATRIX.md` -- 现在每个仪表盘都会陈述它为了支持哪项运营决策而存在，而不仅仅是它的所有者（标准 8；所有者信息已由 `OWNERSHIP.md` 覆盖）。

## 本次回合发现的、未在别处修复的问题

- `docs/evidence/72H_SOAK_TEST_LOG.md`（现为 `72H_SOAK_TEST_LOG.INVALID-FABRICATED.md`）曾宣称完成了一次干净的 72h/1000-VU/11 亿行的浸泡测试。其中每一项具体声明（脚本名称、表名称、行数）都不符合本代码库或数据库中的任何实际内容。它曾被放在 `docs/evidence/` 目录下，与真实、诚实宣告无效的 `SOAK_TEST_LOG.md` 放在一起，且可能会被当作真事一样引用。已被隔离（重命名、添加横幅警告、保留原始内容）而不是直接删除，以便该差异保持可审计状态。
- `docs/evidence/DR_DRILL_3_EXECUTION.md`（现为 `DR_DRILL_3_EXECUTION.INVALID-FABRICATED.md`）曾宣称实现了从 "MinIO" 进行 12 分钟、45GB 的干净恢复。而真实的 `DR_DRILL_3_FINDINGS.md` 则明确指出，由于模式 (schema) 漏洞，该演练已失败 (FAILED)。就像浸泡测试一样，这个捏造的文件已被隔离并标记。
- **随后另行开展的一轮审查**发现了导致第 6 次浸泡尝试 (Soak Attempt 6) 终止的真实原因：一个未处理的 `pg` 连接池异常（PgBouncer `client_idle_timeout` 关闭了一个闲置的连接，而 `node-red` 和 `alarm-api` 都未能捕获因此产生的错误）导致了两个进程均发生崩溃。Docker 的重启策略恢复了它们 —— 参见 `docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md`。这两个发现都传达了同一个教训：一个“难以挑剔”的系统能够存活，依靠的是将每一项声称与真实的仓库/数据库/日志进行交叉核对，而不是盲目相信之前的文档或之前的样本的一面之词。

## 系统限制和技术边界 (System Constraints & Technical Boundaries)

- 标准 5 目前正在评估上述的 pg-pool 异常。真实的时间流逝仍然需要，解决此问题取决于补丁的部署（部署本身在等待冻结解除）。
- 标准 3 中特别是 "写入中途重启" 的情景尚未进行演练。已积压在 `BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md` 中... 实际上，警报卫生文档并没有涵盖这一点——这是一个直接在此处跟踪的 DR 演练缺口：**开放状态，尚未分配所有者。**
- 标准 4 的去抖动 (debounce) 尚未针对实际的风暴（洪水）情景（例如，强制每台机器同时超出规格）进行负载测试——已实施且代码正确，但未进行压力验证。
- 相对于已应用的阶段 D/E/F 修复（去抖动、链路基础、罕见严重情况），警报真实度得分 (58/100) 已经过时。尚未生成新的得分。已积压。
- CI 尚未验证本会话中的任何提交（GitHub 账户计费锁定）——超出工程控制范围，在每次讨论提交时都会将其标记出来，以免被悄无声息地遗忘。
- pg-pool 异常本身（见上文）已有规范但未修复——这是故意的，因为修复它需要重启，而当前的冻结命令禁止重启。

## 底线 (Bottom line)

本报告中的每一个声明都有真实的、可重现的工程证据存在。标准 5 确实尚未达到，而且与本次的早期阶段不同，现在关闭它需要一个真实的错误修复落地，而不仅仅是时间的流逝。还有两项（3、4）已实施，但在特定规定的方式下验证不足。本报告中没有任何一项声明超出了实际测量所得的范围。
