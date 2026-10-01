# UI 视觉与布局回归基准 (Visual Baseline)

`tests/playwright/ui-visual-regression.js` 的固化基准数据集（对应审计项 **F-8**）。

## 目录结构说明

`<page>.<viewport>.<state>.layout.json` —— **可直接 Diff 比对的回归基准契约**：针对捕获的每种状态，记录解析后的 `:root` 设计 Token，以及一组固定 chrome 选择器的计算样式（computed style）与客户端矩形坐标（client rect），包含水平溢出标志。结果完全确定且与宿主机环境解耦。CSS 重构时变更的正是该文件，门禁检查负责对此进行断言校验。

PNG 图片产物（`<tag>.chrome.png` 非 canvas UI 截取、`<tag>.full.png` 全屏帧）保存在 `tests/playwright/screenshots/ui-visual/` 下，已被 **gitignored 忽略**——图片受宿主机 GPU 栅格化影响且体积较大。chrome 截取图会在每个颜色通道软容差内进行像素级对比；全屏帧仅用于人工审查。

## 捕获矩阵 (Capture matrix)

| 维度 | 参数 |
|---|---|
| 浏览器 | Chromium (Playwright 内置), headless, `deviceScaleFactor: 1` |
| 视口尺寸 (Viewports) | 1366×768, 1920×1080, 2560×1440, 3840×2160 |
| EAP 状态 | `production` (模拟器关，REAL/UNAVAILABLE), `demo` (模拟器开——按 `cell_id` 确定性渲染，无时钟依赖), `selected` (选中首个绘制单元), `drawer` (首个区域抽屉打开), `webgl-lost` (模拟 WebGL 上下文丢失) |
| 数字孪生状态 | `default`, `drawer` (通过 `#drawer-toggle`，等待超过 140ms 网格过渡), `webgl-lost` |

## 动态排除区域 (从 JSON 契约中剔除)

- 所有 `<canvas>` 元素——绝不计入 chrome 截取，不对 WebGL 像素做硬性断言。
- 孪生界面中的 `#status-strip`、`.ss-cell`、`#factory-status`、`.fs-cell`——**忽略 rect 坐标** (`"rect": "live-data"`)；其尺寸随实时遥测数字位数和设备行动态变化，但其计算样式 (*style*) 仍会断言校验。
- `body` / `#stage` 的 rect 坐标——由视口衍生，予以忽略。

## 使用方法 (Usage)

```bash
# 针对通过 :4199 端口提供工作区 public/ 资源的 factory-twin-3d 容器执行校验
EAP_URL=http://127.0.0.1:4199/ TWIN_DIRECT_URL=http://127.0.0.1:4199/ \
  node tests/playwright/ui-visual-regression.js            # 对比校验，发现偏差返回退出码 1
EAP_URL=... TWIN_DIRECT_URL=... \
  node tests/playwright/ui-visual-regression.js --update    # 重写更新此基准文件

# 未设置上述两个 URL 时：SKIP 跳过测试，返回退出码 0
```

**仅在**刻意变更 UI 视觉设计时才更新此基准文件，且必须在对应的 git commit 说明中显式记录。
