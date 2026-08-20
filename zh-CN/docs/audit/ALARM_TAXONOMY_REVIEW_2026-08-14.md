<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# Alarm Taxonomy Review — 2026-08-14

> 仅限文档的审查，针对实时的 `public.ldi_alarm_ms_code` 目录进行的只读数据库查询。未涉及任何运行时系统。这是一个分类/覆盖范围的审查，不是对
> `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` (2026-08-11) 的重新运行 -- 那个审计涵盖了模拟器的_行为_；这个审计涵盖了_目录数据_本身。有关重复的SOP链接发现，请参阅 `docs/operations/SOP_COMPLETION_REVIEW.md`，在此不再赘述。

## Catalog size and severity distribution

```sql
SELECT severity, count(*) FROM public.ldi_alarm_ms_code GROUP BY severity ORDER BY count(*) DESC;
```

| Severity | Count | % of 1,820 |
| -------- | ----- | ---------- |
| Major    | 1,431 | 78.6%      |
| Warning  | 201   | 11.0%      |
| Minor    | 145   | 8.0%       |
| Critical | 43    | 2.4%       |

真实的供应商衍生分布（根据合并的892行真实导出和早期的1,820个代码目录工作导入），而不是模拟器输出。
2.4%的Critical份额是源数据的真实分类属性，独立于之前保真度审计的发现，即
_模拟器_在阶段F添加 `RARE_CRITICAL_CODES` 之前无法达到Critical严重性 -- 那个发现是关于模拟器行为的，
不是目录组成；目录始终有真实的Critical代码，
模拟器只是在阶段F之前没有使用任何Critical代码。

## Structured-field coverage: real, but narrow by design

```sql
SELECT
 count(*) FILTER (WHERE cause IS NOT NULL AND cause <> '') AS has_cause,
 count(*) FILTER (WHERE sop_reference IS NOT NULL AND sop_reference <> '') AS has_sop
FROM public.ldi_alarm_ms_code;
-- has_cause=25, has_sop=0 (out of 1,820)
```

填充了 `cause`/`impact`/`recovery_action` 的25行
几乎完全是模拟器的活动代码集（每个 `alarm-sync-linter.js` 19-21个代码）加上少量精选的额外Critical代码。这是**故意的、有范围的覆盖** -- 另外1,795行是这个模拟器可能永远不会触发的真实供应商代码，
并且为所有1,820行编写结构化指导将把精力花费在没有操作路径能出现在 `ldi_alarm_log` 中的代码上。
这不是漏洞；这是一个合理的范围边界，值得明确说明，以免未来的审查员将25/1820误认为是疏忽。

**`sop_reference` 为 0/1820（包括25个策划的行）是
真正的漏洞** -- 在 `SOP_COMPLETION_REVIEW.md` 中涵盖，不在
这里重复。

## Alarm type coverage

```sql
SELECT count(*) FILTER (WHERE alarm_type IS NOT NULL AND alarm_type <> '') FROM public.ldi_alarm_ms_code;
-- 1820 / 1820
```

100% -- 每一行都有一个 `alarm_type` 分类。这里没有漏洞。

## Simulator-to-catalog sync

```text
$ node tests/lint/alarm-sync-linter.js
[+] Simulator (nodered_data/flows.json): Found 21 alarm codes
[+] Master (live DB, ldi_alarm_ms_code): Found 1820 alarm codes
```

Linter 报告了本次运行的21个模拟器代码（保真度审计的
2026-08-11 运行报告了19个 -- 这2个代码的差异是阶段F添加的
`RARE_CRITICAL_CODES`，`01180016`/`0C020014`，在
那次审计之后应用）。每个模拟器代码都在主目录中解析，0个
孤立代码 -- 分类的这部分是坚实的，并被实时重新确认，
而不是假设自旧的审计。

## What this review does not cover

- 那1,795个未策展代码的 `alarm_msg`/`alarm_detail` 文本本身对于真实的供应商来源是否准确 -- 那是导入
  过程的工作（892行合并，1,820代码目录构建），未在
  此重新验证。
- 报警_行为_（触发率、防抖有效性、相关性
  质量） -- 那是 `LDI_ALARM_FIDELITY_AUDIT.md` 的范围，其
  分数 (58/100) 根据 `BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md` 已知过时，
  不在此重新运行，因为本次审查仅针对目录数据。

## Summary

分类结构是健全的：严重性分布是真实的供应商
数据，报警类型分类是完整的，模拟器/主站同步是
干净的，有0个孤立代码。唯一真实的、可操作的差距是 `sop_reference`
-- 在 `SOP_COMPLETION_REVIEW.md` 中作为建议处理，不在
这里重复作为第二个未决项目。
