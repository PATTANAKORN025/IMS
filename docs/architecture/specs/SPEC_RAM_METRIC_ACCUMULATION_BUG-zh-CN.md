<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# RAM 指标累积错误 — 根本原因与修复设计

**状态：已修复并于 2026-08-15 部署（可靠性测试套件的 P0.1）。** 请参阅底部的结果部分。

**优先级：** 高 — 目前正在导致所有显示 Fleet Health Score 或 RAM % 的基础设施仪表板上，针对所有设备，主动产生一个错误的“一切处于严重状态”信号。

## 证据链（3个层级）

**层级 3 (UI)：** `ims-capacity` 仪表板的 "Fleet Health Score" 面板显示红色的 `0%`。截图：`.playwright-mcp\page-2026-08-15T02-24-50-863Z.png`。

**层级 2 (运行时/数据库)：** 截至 2026-08-15T02:2x UTC，`public.sys_metrics` 中的每个设备的 `ram_used_mb` 都完全等于 `ram_total_mb`，并且完全等于 `1048576`：

```
     device_id      | ram_used_mb | ram_total_mb
--------------------+-------------+--------------
  ERP-MASTER-UBUNTU  |     1048576 |      1048576
  ERP-MASTER-WINDOWS |     1048576 |      1048576
  LDI-A01      |     1048576 |      1048576
  LDI-A02     |     1048576 |      1048576
```

相同行的 `disk_used_gb`/`disk_total_gb` 并没有卡住（12500/12500，116415.32/186264.51，476.84/500，476.84/500）——值各不相同且合理。只有 RAM 卡住了，并且所有设备都被固定在完全相同的数字上，这就是线索。

**层级 1 (代码)：** `nodered_data/lib/parser.js`，函数 `parseAll`：

- 第 15 行：`let ramTotalMb = state.ram_total || 0, ramUsedMb = state.ram_used || 0, ...` —— RAM 累加器是**从上一个轮询周期的状态作为种子（seed）初始化的**，而不是清零。
- 第 31 行（在 `if (type === 'storage')` 内）：`ramTotalMb += bytesTotal / 1048576; ramUsedMb += bytesUsed / 1048576;` —— 每一个轮询周期都会将本周期中归类为 RAM 的存储表字节数**累加**到前面所有周期累加的结果之上。相比之下，磁盘在两行之后进行的是直接替换 (`diskTotalGb = largestDiskBytes / 1073741824`)，而不是使用 `+=` —— 这种不对称正是磁盘没有卡住而 RAM 卡住的原因。
- 同行，后半部分：`ramTotalMb = Math.min(ramTotalMb, 1048576);` —— 1TB 的合理性上限，显然是作为防止无效 SNMP 数据的防御性钳位（clamp）而添加的。由于 `ramTotalMb` 在每次轮询中无限制地增长（从不重置），最终它会超过此上限并被钳位在精确的 `1048576`。
- 第 33 行（返回语句）：`ramUsedMb: Math.max(0, Math.min(ramTotalMb, ...ramUsedMb...))` —— 针对*已经被钳位*的 `ramTotalMb` 重新钳位 `ramUsedMb`。一旦 `ramTotalMb` 饱和达到 `1048576`，（与其同步按比例增长的）`ramUsedMb` 在同一行也会被向下钳位于 `1048576`。这两个值落在了相同的数字上 —— 自我强化的过程，因为下一个周期它会读出 `1048576` 的 `state.ram_total` 并在其上累加，然后立即再次重新钳位到 `1048576`。一旦一台设备触碰到了上限，它将永久卡在那里，直到 Node-RED 重启且 `state` 被重置。

这完全解释了观测到的数据：每个轮询时间足够长的设备都在 100% “RAM 占用”上饱和了，这就是为什么 `Fleet Health Score` 的 `CASE WHEN ... ram_pct > 95 ... THEN 0` 分支每次都针对每个设备触发，从而将机队得分推向永久性的 `0%`。

## 修复方案（尚未部署）

有两个独立的问题，都需要修复：

1. **不要从之前的状态获取种子。** RAM 累加器应该在针对 storage 类型的 SNMP 查询时，在每次轮询周期一开始将其初始为 `0`，就像磁盘的 `largestDiskBytes` 一样（`let largestDiskBytes = 0` 在当前周期是局部的）。第 15 行 `state.ram_total || 0` / `state.ram_used || 0` 种子的存在是为了让这些值能够在那些*没有*包含 storage 查询的轮询之间存活下来（当 `walkerType === 'storage'` 时，如果是 `isEmpty` 查询分支，已经刻意将这些值清零了 —— 参阅上面的一行 `if (walkerType === 'storage') { state.ram_total = 0; ... }`）。错误在于，*有数据的*路径（即该错误所在的路径）在 storage 查询成功时使用了 `+=` 而不是 `=`，所以它是复利的而不是替换。

   修复：将 `ramTotalMb += bytesTotal / 1048576; ramUsedMb += bytesUsed / 1048576;` 改为 `ramTotalMb = bytesTotal / 1048576; ramUsedMb = bytesUsed / 1048576;`（丢弃特意针对这两个变量的状态种子读取，或者在 storage 循环之前将它们重置为 `0`，而不是从 `state.ram_total`/`state.ram_used` 播种）。

2. **1TB 的钳位是掩盖症状的东西，而不是修复。** 一旦 (1) 得到修复，合法的 RAM 总数在正常操作中将不再超过 1TB，因此钳位变成了惰性的（保留作为防御性后备没有坏处）—— 这里并不严格需要更改，但值得用注释指出这现在是一个最后的合理性边界，而不是一个正常的代码路径。

## 推出计划

通过 `docker compose restart node-red` 于 2026-08-15T04:13:49Z 部署（单一服务，与阶段 A1 相同的窄影响范围模式）。`nodered_data/lib/parser.js` 由 `nodered_data/settings.js` 在进程启动时被 `require()` 加载到 `functionGlobalContext.parser` 中一次。在部署之前，通过直接读取 `settings.js` 第 31 行证实了这点 —— 重启对于生效修复来说既是必要的也是充分的。

## 结果

修复前基线（在重启前片刻捕获）：`ERP-MASTER-WINDOWS`，`LDI-A01`，`LDI-A02` 均固定在 `ram_used_mb = ram_total_mb = 1048576`。`ERP-MASTER-UBUNTU` 正处于攀升中，数值为 `637440/679936` (93.7%) —— 这本身就是累积理论的确凿证据，因为自从 A1 重启将所有设备的 `flow` 上下文重置为零后，它还没来得及再次饱和达到上限。

修复后，在 3 个连续的轮询周期内测量（04:15:03 → 04:16:03Z，间隔 30 秒）：

| 设备             | 已用/总 RAM | %      | 3 个周期内是否稳定？      |
| ------------------ | -------------- | ------ | ---------------------------- |
| ERP-MASTER-UBUNTU  | 7680/8192 MB   | 93.75% | 是，3 个样本完全相同 |
| ERP-MASTER-WINDOWS | 15360/32768 MB | 46.9%  | 是                          |
| LDI-A01     | 15360/16384 MB | 93.75% | 是                          |
| LDI-A02    | 15360/16384 MB | 93.75% | 是                          |

不再有设备显示 `1048576`。不再有设备数值在攀升。不同设备之间的值有意义上的差异（46.9%-93.75%），而不是崩溃合并成一个共同的数字 —— 这证实现在这是每个设备真实的快照，而不是累积的产物。

**CPU/磁盘/温度不受影响，通过与相同行的直接比较证实**：`cpu_load_percent`（50 / 88.25 / 83.75 / 83.75）和 `temp_c`（65 / 95 / 92 / 92）与本次会话早期修复前的基线完全一致。`disk_total_gb`/`disk_used_gb` 也未改变 —— `ERP-MASTER-UBUNTU` 仍显示独立已诊断出的 `12500/12500` (100%) 磁盘错误（`READ_ONLY_AUDIT_2026-08-15.md` §3c，作为 P0.2 单独修复）—— 证明此 RAM 修复只触及了它应该触及的内容。

在编辑后、部署前重新运行了单元测试：`tests/unit/parser.test.js` (22/22) 和 `tests/unit/v2-parser.test.js` (27/27) 均通过，包括现有的“RAM 总量限制为 1TB”和“已用 RAM 从不超过 RAM 总量”边界测试 —— 证实了防御性钳位（保留而未被移除 —— 见上面第 2 点）仍然运作正常，且此次修复没有引入回退。

## 范围备注（已解决）

在此处被标记为“未调查”范围备注的 `ERP-MASTER-UBUNTU` 的 `disk_used_gb == disk_total_gb` —— 其根本原因已在 `READ_ONLY_AUDIT_2026-08-15.md` §3c（一个 `.snmprec` 配置错误，与此 RAM 累积问题无关）中被单独找出，并作为 P0.2 得到修复。
