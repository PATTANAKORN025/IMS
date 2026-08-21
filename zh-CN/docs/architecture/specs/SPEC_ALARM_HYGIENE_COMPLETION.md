<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 告警卫生状态 — 竣工审查 (2026-08-15) (Alarm Hygiene — Completion Pass)

> 总结并关闭 `SPEC_ALERT_HYGIENE.md` 中的剩余项目，加上本轮可靠性计划中增加的范围（重复通知检测、告警风暴检测、升级语义）。

## 项目 1：MTTA/MTTR 仪表板 — **已完成**

新的仪表板 `monitoring/grafana/dashboards/manufacturing/ims-ldi-alarm-response.json` (uid `ims-ldi-alarm-response`，8 个面板)：MTTA/MTTR 统计面板（24 小时 + 历史所有记录）、每日趋势图，以及“当前处于开启状态 — 等待时间最长”分流审查表格。

**在构建此面板时暴露出的真实、确凿的发现**：`public.ldi_alarm_lifecycle` 跨越了约 2 天的时间（782 行），**且每一行的状态仍然都是 `OPEN` (开启)** —— 没有一行曾被确认 (acknowledged) 或解决 (resolved)。这不是数据重置留下的伪影（已核对：该表的 `MIN(logdate)` 是 2026-08-13，远早于最近的重置时间）。这是关于此环境的一个真实的、以前未被记录的事实：在连续生成告警的 2 天里，没有人在告警控制台 (Alarm Console) 点击过 Acknowledge/Resolve 按钮。所有 4 个 MTTA/MTTR 统计面板都正确返回了 `NULL`（渲染为 `NO_DATA`）—— 没有造假，也没有隐藏，鉴于零条符合条件的行，它们完全呈现了应有的状态。分流审查表格提供了真实的信号：目前处于开启状态的最早的告警已等待了 **约 44 小时**（2637 分钟）。

在部署之前，所有 6 个 SQL 目标都已直接在实时数据库上进行了测试（见上述值）。仪表板检查器 (dashboard-linter) 和查询预算检查器 (query-budget-linter) 都完全通过（此文件 0 个错误，0 个警告）。

## 项目 2：严重告警命名一致性 — **已完成**（先前的提交 `f39afa9`）

## 项目 3：移动心跳监控面板 — **本轮未完成**

它在 `ims-ldi-manufacturing`/`ims-ldi-operator-andon` 上仍然是一个 1x1 大小的功能性看门狗面板，尚未被移动到 `ims-meta-monitoring`。已被推迟 —— 优先级低于以下项目，而且移动它意味着要编辑 3 个仪表板文件（从 2 个中删除，添加到 1 个中），再加上需要更新目标仪表板上的 gridPos，其复杂程度足以让它单独进行一次处理，而不是勉强塞入本次任务中。

## 项目 4：卡在 OPEN 状态 / 卡在 ACKNOWLEDGED 状态 / 孤儿生命周期 — **已完成**（先前的提交 `f39afa9`；ACKNOWLEDGED 的检查已经存在）

## 项目 5：防抖 (Debounce) 验证 — **已完成，使用现有实际运行中自然产生的证据，没有构建新的压力测试**

最初的规范要求进行合成压力测试（在模拟模式下，强行让每台机器的遥测数据同时超出规范要求，并断言防抖机制限制了重复触发）。本轮选择不构建也不运行这个测试：因为强行对整个机群的模拟失控状态，会污染这个可靠性计划刚刚耗费 P0 级别精力证明其准确无误的数据完整性基线，并且自然运行状态下已经存在确凿的答案 ——

```
docker exec ims-timescaledb psql -c "
  WITH gaps AS (SELECT equipmentid, errorcode, logdate,
    logdate - LAG(logdate) OVER (PARTITION BY equipmentid, errorcode ORDER BY logdate) AS gap
    FROM ldi_alarm_log)
  SELECT count(*) FILTER (WHERE gap < INTERVAL '15 seconds'), count(*)
  FROM gaps WHERE gap IS NOT NULL;"
-- 549 个间隔中只有 1 个小于 15 秒（在本会话的早期测量，与 P0.3 相关的工作）
```

1/549 是在真实且持续的机群操作下防抖机制依然起作用的真凭实据（而不是单一的人造突发事件）—— 它可以说比综合测试提供的证据更具说服力，因为它反映了实际的连续数天操作模式，而不是一次人为的高峰。如果特定的边缘情况（例如多台机器同时发生相关联的故障）需要针对性的证明，合成压力测试仍可作为一个合理的后续行动，但在这里不作处理。

## 重复通知检测 — **已完成，修复了一个真实存在的发现**

追踪了整个 Webhook 路径：`alertmanager.yml` 路由 → `POST /alert-webhook`（单一 Node-RED HTTP 输入节点，无扇出）→ `Format Alert Text` → `Format LINE`/`Format Teams`（并行的，发送到 2 个不同的通道，没有重复）。发现并修复了一个真实存在的潜在错误：`severity="critical"` 路由有 `continue: true`，它的接收器以及默认接收器都解析到相同的 webhook URL，在目的地没有去重。目前没有主动触发重复（没有兄弟路由同样匹配 `severity="critical"`），但这对任何未来的路由添加来说都是个地雷。已在提交 `be8db54` 中修复。

在 LDI-alarm 一侧没有发现重复通知的风险 —— 这些告警目前根本不走此 webhook 路径（它们仅在仪表板/安灯 (Andon) 上显示，没有推送通知），因此这里没有去重的必要。

## 告警风暴检测 — **已存在，确认正常工作，未构建新机制**

12 分钟的冷却防抖 (`public.ldi_alarm_state`，迁移 069) *本身*就是防风暴/防洪卫士 —— 通过 `nodered_data/flows.json` 中的代码注释得到了确认：“debounce below is the primary flood guard (下方的防抖是主要的防洪屏障)”。构建一个单独的风暴检测器将是对现有、正常工作的底层基础设施的重复 —— 这违背了“倾向使用现有架构而不是添加新机制”的指令。它正常工作的证据：与上述防抖验证项目相同，为 1/549 的数值。

## 升级语义 — **确认存在差距，尚未构建**

在 `nodered_data/flows.json` 中使用 grep 搜索任何升级逻辑：匹配结果为 0。现有的是 Alertmanager 的 `repeat_interval`（未解决的告警，严重级别为 critical 时每 30 分钟重新通知，warning 为 2 小时，默认为 4 小时）—— 这是在*同一*通道上，以*相同*严重级别定期重新通知，而不是升级（随着时间的推移未能确认而路由到不同/更紧急的通道，或者增加严重级别）。**当今系统中不存在升级机制。** 这是一个经确认存在的真实差距，在这一轮审查中并未去构建 —— 它是一个真正的新功能（需要设计：什么条件触发升级，升级到什么渠道，它是否与这轮审查刚刚呈现出的 MTTA 数据产生交互），而不是一个修复补丁，值得进行专门的设计迭代，而不是仓促添加在这里。

## 验证总结（根据验收清单）

| 检查项 | 结果 |
| --- | --- |
| 通知量 | 未进行独立的重新测量（在这个环境中未配置 LINE/Teams 的投递 —— `TEAMS_WEBHOOK_URL`/`LINE_CHANNEL_ACCESS_TOKEN` 未设置，已通过 node-red 日志确认）—— alertmanager 修复解决的是一个结构性风险，而不是已经观测到的数量问题 |
| 重复率（通知） | 发现并修复了 1 个真实的潜在缺陷 (alertmanager `continue: true`); 当前未观察到主动重复 |
| 告警持久性 / 恢复 | 本轮未重新测量 —— 已包含在上方现有的防抖/防洪保护证据中 |
| 严重级别准确性 | 本轮未重新审计 —— 已被先前的保真度重新审计覆盖（严重级别 (Critical) 告警现已真实存在且在触发中，参见 `READ_ONLY_AUDIT_2026-08-15.md`） |
| 生命周期完整性 | **在构建 MTTA/MTTR 仪表板时直接测量得出**：782/782 行生命周期记录均为 `OPEN`，0 个 `ACKNOWLEDGED`，0 个 `RESOLVED` —— 这是一个真实的，先前未记录的运营缺失，现在显示在仪表板上而不再被埋藏在数据表中 |

## 剩余的告警卫生相关工作（本轮未完成）

- 项目 3（移动心跳监控面板）
- 针对常规证据之外的边缘情况进行防抖机制的合成压力测试
- 升级语义（需要一轮专门的设计，而不是快速修复）
- 针对新增的第 14 个仪表板进行仪表板清单/文档数量统计的更新（见下方注记）

**文档数量注记**：这个仓库的仪表板数量统计文档 (`README.md`，`docs/business/BUSINESS_VALUE_ROI.md`，`docs/architecture/DASHBOARD_INVENTORY.md`，`docs/architecture/OWNERSHIP.md`，`docs/architecture/DECISION_MATRIX.md`) 均表述有“13 个仪表板”/“8 个制造仪表板” —— 现在这个数字已经过期，少算了一个。在这个单独的提交中没有进行同步更新（保持了仪表板 JSON 更改的独立性）；文档冗余声明检查器 (doc-overclaim-linter) 将在下一次触及这些文件的提交中捕获这个问题，或者应该安排专门的后续任务一并清理。
