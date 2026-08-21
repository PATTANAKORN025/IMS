<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# SOP 完整性审查 (SOP Completion Review)

> 纯文档审查，2026-08-14，属于证据整合 (Evidence Consolidation)
> 轨道的一部分。未涉及任何运行时系统。范围：针对线上仪表板清单和
> 警报主目录，审查 `docs/operations/SOP_OPERATOR*.md`
> 和 `docs/operations/ALARM_PLAYBOOK.md`。

## 本次审查修复的内容：所有 3 个语言版本中的 2 个失效的仪表板链接

`SOP_OPERATOR.md`、`SOP_OPERATOR-th.md`、`SOP_OPERATOR-zh-CN.md` 均
链接到了两个不匹配实际仪表板 `uid` 的 URL
（已根据实际的 `.json` 文件验证，并非假设）：

| 链接文本               | 使用的失效 URL       | 真实的 uid        |
| ---------------------- | -------------------- | ----------------- |
| Engineering Drill-Down | `/d/ims-engineering` | `ims-engineering` |
| Capacity Planning      | `/d/ims-capacity`    | `ims-capacity`    |

在所有三个语言文件中，这两个错误完全相同——相同的错误
在翻译过程中传播，而不是三个独立的错误。
已在本次审查中修复（共修改了 6 个链接，每个文件 2 个）。`SOP_OPERATOR.md`
中的其他所有仪表板链接（NOC Overview、LDI Manufacturing、
Operator Andon（隐式）、Machine Snapshot、Meta-Monitoring）均已
针对真实的 `uid` 进行了验证，并且全部正确。

## 真实且未修复的缺失：`sop_reference` 字段的填充率为 0%

`public.ldi_alarm_ms_code.sop_reference`（根据此仓库自身历史
添加，任务“structured Cause/Impact/Recovery fields, SOP reference
field”）作为一个列存在，但在**全部 1,820 行中，非空值数量为零**
——已在线上环境验证：

```sql
SELECT count(*) FILTER (WHERE sop_reference IS NOT NULL AND sop_reference <> '')
FROM public.ldi_alarm_ms_code;
-- Result: 0
```

作为对比，同一目录中的 `cause`/`impact`/`recovery_action`
字段在 1,820 行中有 25 行被填充——而这 25 行恰好是
模拟器可触发的代码，外加少数人工筛选的额外
Critical 代码（已验证：这 25 个 ID 与 `alarm-sync-linter.js` 中
模拟器活动代码列表几乎完全匹配）。因此，_结构化指南_
字段得到了切实、明确范围的关注。而 _SOP 关联_
字段则没有得到任何关注。

这与“ALARM_PLAYBOOK.md 不完整”这一缺失不同——
`ALARM_PLAYBOOK.md` 已经涵盖了所有 19-21 个模拟器活动代码，
并包含真实的首次响应文本，已针对线上数据库和
警报规则文件进行验证（在此次审查的阅读中确认，内容
准确且最新）。缺失的范围更窄：`ldi_alarm_ms_code.sop_reference`
中没有任何内容按代码 _回指_ 到该手册（或
任何其他 SOP 文档），因此单独查询主目录
无法回答“哪个 SOP 涵盖此警报”。

## 建议（未实施，这是审查而非修复）

对于已经填充了 `cause`/`impact`/`recovery_action` 的
约 19-25 个运营相关的代码，添加一个 `sop_reference`
值，指向相关的 `ALARM_PLAYBOOK.md` 章节锚点
（例如 `ALARM_PLAYBOOK.md#1-ldi-machine-alarm-codes`），
如果手册重新构建，则指向未来针对每个代码的锚点。这是一个小型的、
机械式的迁移（`UPDATE ldi_alarm_ms_code SET sop_reference =
... WHERE alarm_id IN (...)`），其低风险形态与之前发生的
`cause`/`impact`/`recovery_action` 填充相同——
此处并未划分范围或执行，因为这涉及数据库写入操作，
而本次审查在冻结期间故意保持只读状态。

## 本次未审查的内容

- `ALARM_PLAYBOOK.md` 的内容准确性（超出通读范围）——
  抽查了线上模拟器代码列表并发现其
  保持一致，但没有像该文档自身头部所声明的那样
  （最初于 2026-08-10），与当前警报规则 YAML 文件逐行重新验证。
- `docs/product/ONBOARDING_SCRIPT.md`（也符合 SOP grep 匹配）——
  超出范围，这是一个入职文档，而不是操作员 SOP。
