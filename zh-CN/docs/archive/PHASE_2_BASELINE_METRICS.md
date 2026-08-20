<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 第 2 阶段基准（重新设计前），捕获于 2026-08-04

> **已归档 — 历史快照，日期为 2026-08-04。** 并非动态文档；以下数字（仪表板数量、迁移数量、面板数量等）反映了该日期的系统状态，并且相对于当前系统已知是过时的。根据 docs/archive/README.md 保留为历史记录。有关当前信息，请参阅 docs/architecture/ARCHITECTURE.md 和 docs/architecture/DASHBOARD_INVENTORY.md。

## 查询执行时间（服务器端，真实的模板变量过滤器，“全部”选择）

| 面板                                                    | 查询时间 |
| ------------------------------------------------------- | -------- |
| RCA Truth Test（完整数据集）                            | 179 ms   |
| RCA Fleet Summary (24h)                                 | 108 ms   |
| PE Capability Snapshot（单事件）                        | 103 ms   |
| Worst Cpk Fleet (v_machine_spc_fleet)                   | 53 ms    |
| Machine Capability Ranking (CROSS JOIN LATERAL unpivot) | 39 ms    |
| Temp/Humidity trend (ldi_data_1m CAGG)                  | 32 ms    |
| PE StdDev by Machine (CROSS JOIN LATERAL unpivot)       | 27 ms    |
| Scan Speed trend (ldi_data_1m CAGG)                     | 23 ms    |

所有 8 个采样的面板在服务器端的查询时间已经低于 300 毫秒。最高的是完整数据集的 RCA Truth Test（按设计没有时间过滤器）。此处未测量：Grafana 自身在查询之上的渲染/绘制时间（React 面板挂载，网络往返）—— 需要浏览器端检测（Playwright + CDP 网络计时）才能获得真正的端到端 P95；此表仅显示查询时间。

## 视口适配（来自先前的审核，Kiosk 模式，完整内容）

| 仪表板                | 1280x720                                | 3840x2160                                           |
| --------------------- | --------------------------------------- | --------------------------------------------------- |
| Operator Andon        | 需要滚动（scrollHeight 1168 vs 720）    | 完全适合（2160=2160）                               |
| Manufacturing         | 需要滚动（scrollHeight 3191）           | 需要滚动（3151）—— 预期情况，需滚动的仪表板         |
| Engineering Analytics | 需要滚动（scrollHeight 4512）           | 需要滚动（4472）—— 预期情况                         |
| Machine Snapshot      | 需要滚动（scrollHeight 2802）           | 需要滚动（2762）—— 预期情况                         |

## RCA 警报类别覆盖率（扩展前）

14/20 个警报代码已分类（70%）。类别：VACUUM、REGISTRATION、ALIGNMENT、ENVIRONMENT、CALIBRATION、MOTION、OPTICS、DATA_QUALITY。RCA 仪表板仅显示其中 3 个（VACUUM、REGISTRATION+ALIGNMENT、ENVIRONMENT），因为只有这 3 个在 v_ldi_alarm_context 中定义了规范外标志。
