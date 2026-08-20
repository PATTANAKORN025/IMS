<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# TV-Wall Field Validation Report

> **证据 (Evidence)：** 证明在工厂车间电视墙设置上投影时 UI 的可用性和稳定性。

## 验证参数 (Validation Parameters)

- **位置 (Location)：** YSPhotec LDI 生产区，A 区
- **硬件 (Hardware)：** 85 英寸 4K LED 显示屏，迷你 PC 客户端
- **距离 (Distance)：** 距操作员站 5-10 米
- **测试的仪表板 (Dashboard Tested)：** `ims-ldi-operator-andon.json` (LDI Operator Andon)

## 验证清单 (Validation Checklist)

| 检查项 (Item)                 | 状态 (Status)                                                                                     | 备注 (Notes)                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **4K 分辨率缩放 (4K Resolution Scaling)**    | <img src="../../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | Grafana 面板缩放完美，没有像素化现象。文本保持清晰。                                                                         |
| **对比度与能见度 (Contrast & Visibility)**    | <img src="../../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | 极暗主题 `#0b0c0e` 搭配霓虹绿 `#00FF87` 和红色 `#FF003C` 的点缀，在明亮的工厂灯光下，从 10 米外也能清晰辨认。 |
| **自动刷新稳定性 (Auto-Refresh Stability)**   | <img src="../../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | 测试了 48 小时的 30 秒刷新循环。未在迷你 PC 上观察到内存泄漏或浏览器崩溃。                                        |
| **色盲辅助功能 (Colorblind Accessibility)** | <img src="../../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | 状态指示同时依赖颜色和图标（例如，三角形表示警告，十字表示严重），正如 `GRAFANA_DESIGN_SYSTEM.md` 中所规定的那样。         |
| **Kiosk 模式 (Kiosk Mode)**               | <img src="../../../docs/assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | 成功使用 `&kiosk=tv` URL 参数隐藏了 Grafana UI 元素（侧边栏、时间选择器）。                                                |

## 操作员反馈（摘录） (Operator Feedback)

> “警报数字足够大，在房间另一头也能看清。当 Cpk 下降时，颜色的闪烁让人不可能错过。” —— 倒班主管（A 区）

## 结论 (Conclusion)

Grafana 可视化层满足工厂车间部署的所有人体工程学和技术要求。UI 不需要为 4K 电视的使用提供任何额外的 CSS 覆盖。
