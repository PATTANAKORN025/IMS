<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 告警延迟测量记录 (Alarm Latency Measurement Note)

## 发现 (2026-08-14)

最初的告警路径延迟证据（`ldi_alarm_log`，所有行）显示
P50=4654ms，P95=7875ms，P99=8027ms —— 远高于遥测数据表
（`ldi_data`、`sys_metrics`、`net_metrics`、`ldi_metrics`），后者均在 ~1ms 左右。

这**不是真正的延迟问题**。这是一种测量假象，
由模拟器如何为后台的噪波代码告警 (noise-code alarms) 分配 `logdate` 所引起。

## 根本原因 (Root cause)

`nodered_data/flows.json`，节点 `almsim_gen`，函数 `generate()`：

```js
rows.push(
  newRow(
    eq,
    code,
    new Date(now - Math.floor(Math.random() * 9000)),
    null,
    "nearest",
  ),
);
```

后台噪波代码告警（`link_basis = 'nearest'`）的 `logdate` 会被
随机回溯 0-9000ms，以模拟“告警条件在被记录之前稍早发生”的情况。而条件驱动型告警
（`link_basis = 'causal'`）在相关的遥测查询解析完成的瞬间使用 `logdate = new Date()` —— 不进行回溯。

因此，根据 `link_basis` 的不同，`ingest_ts - logdate` 实际上测量了两种不同的内容：

| link_basis | logdate 含义 | (ingest_ts - logdate) 测量内容 |
| ---------- | --------------------------------- | --------------------------------------- |
| `causal`   | 真实检测时间 | 真实的流水线延迟 |
| `nearest`  | 检测时间减去随机(0,9秒) | 模拟延迟 + 真实的流水线延迟 |

## 正确拆分后的证据

```text
$ node tests/e2e/ingestion-latency-check.js
ldi_alarm_log (causal)   n=5  P50= 3.6ms P95= 9.0ms P99= 13.2ms <- 真实的流水线延迟
ldi_alarm_log (nearest)  n=15 P50=5883ms  P95=7811ms P99=8065ms <- 包含模拟延迟，并非流水线延迟
```

`causal` 延迟与遥测数据表相匹配（个位数毫秒）。告警数据
摄取流水线并不慢；噪波代码模拟器为了真实性而故意回溯了时间戳。

## 为修复测量所做的更改（并非修复流水线，也非修复模拟器）

- `tests/e2e/ingestion-latency-check.js`：将 `ldi_alarm_log` 拆分为
  两行报告（`causal` / `nearest`），而不是一个混合数值。
- `monitoring/grafana/dashboards/infrastructure/ims-ingestion-latency.json`：
  将单个 "ldi_alarm_log" 统计面板拆分为 "ldi_alarm_log
  (causal)"（真实阈值，与遥测一样的绿/黄/红指示）和
  "ldi_alarm_log (nearest)"（无通过/失败阈值 —— 仅供参考，
  工具提示 (tooltip) 中说明包含模拟延迟）。

此次修复没有触及或重启任何写入路径、模拟器代码或正在运行的容器 —— 仪表板 JSON 根据
`monitoring/grafana/provisioning/dashboards/dashboards.yml` 在 30 秒内进行热重载 (hot-reloads)。
不影响浸泡测试尝试 6 (Soak Attempt 6)。

## 已推迟，未在此处完成 (Deferred)

直接从 `almsim_gen` 中移除人为的时间回溯（使得 `nearest` 路径的告警也能携带真实、未回溯的 `logdate`），属于
模拟器真实性 (simulator-realism) 范畴的更改。这超出了当前的范围，将推迟到本代码库
已经计划的浸泡/真实性测试阶段之后再处理。
