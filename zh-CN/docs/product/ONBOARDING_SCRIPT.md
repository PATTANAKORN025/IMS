<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS 入门：视频演练与 GIF 脚本

> **目标：** 本文档作为创建官方 IMS 视频演练和 UI GIF 的故事板和脚本。由于 UI 采用了赛博朋克风格的 HUD，因此动效和动画是核心卖点。

---

## 工具推荐

录制入门资产时，建议使用以下工具：

1. **屏幕录制（视频）：** OBS Studio（1080p，60fps），以确保 Grafana 动画流畅。
2. **GIF 录制：** [Kap](https://getkap.co/) (macOS) 或 ScreenToGif (Windows)。以 24fps 导出，保证 UI 过渡平滑。
3. **浏览器状态：** 以 Kiosk 模式运行 Chrome `http://localhost:3000/d/ims-noc-overview?kiosk=tv`，隐藏 URL 栏和操作系统边框（OS chrome）。

---

## 场景 1：NOC 概览（“惊艳”时刻）

**资产类型：** 15 秒循环 GIF (`hero-noc.gif`)
**目标位置：** `README.md` 顶部（如果需要，可替换静态横幅）。

**动作脚本：**

1. 打开 [NOC 概览](http://localhost:3000/d/ims-noc-overview)。
2. 将 Grafana 自动刷新设置为 `5s`，以便图表在录制期间保持动态更新。
3. 平滑地将鼠标悬停在 **节点健康评分 (Fleet Health Score)** 仪表盘上，触发工具提示 (tooltip)。
4. 向下移动鼠标，悬停在正在动态重新排序的 **前 10 个关键节点 (Top 10 Critical Nodes)** 列表上。
5. 停止录制。

---

## 场景 2：下钻分析工作流（故障排查）

**资产类型：** 45 秒带有配音 / 叠加文字的视频 (`drilldown-tutorial.mp4`)
**目标位置：** `docs/product/ONBOARDING.md`

**动作脚本：**

1. 从 NOC 概览开始。注意到 **网络带宽 (Network Bandwidth)** 图表上的红色异常。
2. **点击** 该异常。（这将触发 Grafana 数据链接）。
3. 屏幕平滑过渡到 **工程下钻 (Engineering Drill-Down)** 仪表板。
4. 打开左上角的 `$machine_id` 下拉菜单，输入 `SRV-901`。
5. 整个仪表板迅速重新渲染（由 TimescaleDB CAGG 提供支持）。
6. 将鼠标悬停在 **Z 分数异常 (Z-Score Anomaly)** 图表上，显示 CPU 飙升的确切时刻。
7. 结束场景。

---

## 场景 3：预测性容量规划 (AIOps)

**资产类型：** 10 秒 GIF (`predictive-aiops.gif`)
**目标位置：** `README.md` 的功能 (Features) 部分。

**动作脚本：**

1. 打开 [容量规划](http://localhost:3000/d/ims-capacity)。
2. 将录制框严格聚焦于 **剩余可用天数 (Days Until Full)** 仪表盘和 **线性回归预测 (Linear Regression Forecast)** 图表上。
3. 将鼠标悬停在趋势线达到 100% 的交点处。工具提示应清晰显示“预计满载日期：2026年10月12日 (Estimated Full Date: Oct 12, 2026)”。

---

## 场景 4：操作员安灯看板 (工厂车间)

**资产类型：** 5 秒 GIF (`andon-board.gif`)
**目标位置：** `SOP_OPERATOR.md`

**动作脚本：**

1. 打开 [LDI 操作员安灯](http://localhost:3000/d/ims-ldi-operator-andon)。
2. 使用数据库脚本 `make test-load` 注入一个模拟错误。
3. 录制仪表板从绿色闪烁变为红色的精确瞬间。
4. 这展示了 Node-RED 摄取管道的超低延迟（< 2秒）。
