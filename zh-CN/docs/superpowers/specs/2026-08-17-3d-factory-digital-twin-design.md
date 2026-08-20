<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../../../../docs/README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 3D工厂数字孪生 — 架构与设计规范

> 状态：仅供设计。未获准实施。没有为此创建任何代码、新仪表板或新服务。本文档旨在供审查并在开始任何任务 4.x 工作之前获得批准、修改或拒绝。
>
> 这直接取代了2D孪生计划的任务 13（“未来：3D数字孪生迁移路径”）的占位符，该占位符在产生真实的坐标之前故意未进行设计。用户现在已要求在获得真实坐标之前先制作设计本身，并在提供真实的工厂布局之前，将所有放置数据明确标记为模拟。本文档遵循该请求，同时在始终明确区分目前哪些是真实的，哪些不是。

## 0. 从2D孪生工作中沿用的不可协商条款

这些适用于2D构建中的每一项任务，并在此处保持不变：

- 不得将模拟数据呈现为真实数据。凡是在此设计中使用占位符坐标的地方，每一个都会被标记为“模拟（SIMULATED）”，绝不声称是真实的机器位置。
- 不得使用外部Grafana插件。在本会话中已确认：Grafana 13.1.1 核心版本没有支持3D的面板类型（`canvas` 仅限2D）。这也是下面§1中得出3D孪生不能位于Grafana内部的原因。
- 仅使用真实的机器状态/报警/生产数据，其来源与本会话中已验证的相同表/视图（`v_ldi_machine_latest_full`、`ldi_alarm_log`、`ldi_alarm_ms_code`、`ldi_alarm_lifecycle`）。
- 不使用 `board_id`（在真实数据行中 100% 为空）。`log_id` 是每个事件的真实标识符。
- 现有的仪表板（`ims-ldi-manufacturing.json`、`ims-ldi-operator-andon.json` 和刚刚构建的 `ims-ldi-factory-digital-twin.json`）不受本文档中任何内容的修改。

---

## 1. Grafana 2D数字孪生与独立的Web 3D应用程序

**决定：独立的Web 3D应用程序，通过Grafana链接/嵌入，而不是在Grafana内部构建。**

这是一个真实的限制，而不是个人偏好：Grafana唯一的空间面板是 `canvas`（已在本次会话中通过 `GET /api/plugins` 确认为核心/内部面板），并且 Canvas 是一种 2D 绝对定位系统——它没有 3D 场景图、没有摄像机、没有深度，也没有光照。没有支持 3D 渲染的 Grafana 核心面板类型。在 Grafana *内部* 获得 3D 的唯一方法是使用外部社区面板插件，而这正是不可协商条款（“无外部插件”）所严令禁止的——这不是一个可以绕过的限制，而是设计上的一扇紧闭的门。

**在此仓库中已经存在的“独立服务，同源，会话身份验证”的真实先例：** `services/alarm-api` — 一个 Express + `pg` 服务，通过 `proxy/nginx.conf` 在 `/alarm-api/` 代理，并受到Grafana本身的 `/api/user` 会话检查的 `auth_request` 保护（`proxy/nginx.conf` 第 ~20-30 行）。无需新的身份验证系统，重用操作员已登录的身份。3D孪生应完全遵循此模式：`services/factory-twin-3d/`，在 `/factory-twin-3d/`（或类似路径）代理，使用相同的 `auth_request` 门禁。这不是一个新的架构理念，而是本仓库已经构建、测试并证明过一次的模式。

2D Canvas孪生仍然是主要的操作员/C级别状态板（快速，始终开启，零滚动信息亭）。3D孪生是一个辅助的、可选择进入的、更丰富的视图——通过来自 2D 孪生（或 Grafana 导航）的链接/按钮访问，而不是作为替代品。

---

## 2. 渲染技术

**推荐：Three.js (WebGL)，使用原生或搭配轻量级打包工具 (Vite)。**

这是有理由的，并非随口断言，而是可验证的：Three.js 是基于浏览器的 3D 可视化的事实标准，没有服务器端渲染的要求（符合 §1 中的“独立的轻量级服务”模型），而且——对于 §12（大规模性能）至关重要的是——支持 `InstancedMesh` 以在一次绘制调用 (draw call) 中渲染数百个相同的机器几何体，这在规模超过 10 台机器时具有直接的意义。

此仓库没有任何现有的前端框架先例（仓库根目录下的 `package.json` 没有前端依赖项；没有 `src/`，任何地方都没有 React/Vue/Svelte）。这确实是技术栈的一个新部分，而不是现有内容的变体——在这里明确标出，不予淡化。`services/alarm-api` 的 `package.json`（仅限 Express + `pg`）是最接近的先例，且仅针对*后端*部分。

本阶段已考虑并拒绝的替代方案：完整的游戏引擎导出（Unity WebGL，Unreal Pixel Streaming）——对于一个不需要游戏引擎级渲染的工厂状态可视化而言，其操作成本（构建管道，用于 Pixel Streaming 的 GPU 支持流服务器）太高了。Three.js 是解决此问题的合适选择。

---

## 3. 工厂 → 建筑 → 楼层 → 区域 → 机器 层级结构

**目前的真实数据：** `public.devices.location` 是一个单一的平面文本列，具有 5 个真实值（`Factory 2 - DF INNER`、`Factory 2 - DF OUTER`、`Factory 2 - SM`、`Factory 3 - DF INNER`、`Factory 3 - SM`）——本会话中已确认。模式(schema)的任何地方都没有 `building`、`floor` 或 `zone` 列。“Factory 2” / “Factory 3” 和后缀（`DF INNER`/`DF OUTER`/`SM`）都被编码在一个字符串中，没有被分解。

**拟议的层级模型**（新模型，不修改 `devices` 或任何遥测表）：

```sql
-- NEW TABLE, proposed, not created by this document
CREATE TABLE public.factory_layout_hierarchy (
  hierarchy_id   SERIAL PRIMARY KEY,
  factory_code   TEXT NOT NULL,        -- 例如 '2', '3' -- 匹配真实的 ldi_data.factory 值
  building_name  TEXT,                 -- 真实的建筑名称，一旦知晓 -- 在那之前可为空 (nullable)
  floor_name     TEXT,                 -- 真实的楼层标识符，一旦知晓 -- 在那之前可为空
  zone_name      TEXT NOT NULL,        -- 映射到目前真实的 devices.location 字符串
  UNIQUE (factory_code, building_name, floor_name, zone_name)
);
```

在真实建筑/楼层数据可用之前，`building_name`/`floor_name` 保持为 `NULL`，层级结构实际上是 `工厂 → 区域 → 机器`（与目前的实际情况相符），而不是用户要求支持的完整 4 层树结构——该模式支持更深的树结构，而不要求在知晓数据之前就强制填充。这与 §4 中坐标表使用的“结构已就绪，数据随后跟上”的方法相同。

---

## 4. 真实坐标模型 — x/y/z，旋转，缩放，朝向

**拟议的新表**（独立于 `devices`，独立于 `factory_layout_hierarchy`，通过 `device_id` 连接——这种分离正是 §5 中“在不重写遥测数据的情况下进行交换”成为可能的原因）：

```sql
-- NEW TABLE, proposed, not created by this document
CREATE TABLE public.device_3d_placement (
  device_id     TEXT PRIMARY KEY REFERENCES public.devices(device_id) ON DELETE CASCADE,
  hierarchy_id  INTEGER REFERENCES public.factory_layout_hierarchy(hierarchy_id),
  pos_x         DOUBLE PRECISION NOT NULL,
  pos_y         DOUBLE PRECISION NOT NULL,
  pos_z         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rot_x         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rot_y         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rot_z         DOUBLE PRECISION NOT NULL DEFAULT 0,
  scale         DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  is_simulated  BOOLEAN NOT NULL DEFAULT TRUE,   -- 在真实勘测/CAD导入将其设置为FALSE之前为TRUE
  source        TEXT NOT NULL DEFAULT 'simulated_grid',  -- 'simulated_grid' | 'cad_import' | 'manual_survey'
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`is_simulated`/`source` 并非用于装饰——该表的每个使用者（3D 渲染器、任何未来的报告）都能够并且必须在 `is_simulated` 上分支，以在视觉上区分真实和占位符放置（例如，当任何可见机器具有 `is_simulated = TRUE` 时，在 3D 视图中显示“SIMULATED LAYOUT (模拟布局)”横幅），从而在结构上满足 §18/§19，而不是仅凭约定。

**任务 4.1/4.2 的模拟种子数据 (Seed data)**（POC 和 10 台机器阶段）：一种确定性的网格布局——例如 `pos_x = (zone_index * 10)`，`pos_y = (machine_index_in_zone * 5)`，`pos_z = 0`——与已验证的 2D 孪生结构分组相同（5 个区域，每个区域 2 台机器），只是赋予了虚假但稳定的 3D 坐标。确定性（非随机）确保在会话之间重新运行种子数据不会打乱布局。

---

## 5. 模拟 → 真实坐标迁移，无需重写遥测/查询逻辑

这就是为什么 §3/§4 中的表与 `devices`/`ldi_data`/`v_ldi_machine_latest_full` 完全分离的原因。3D 渲染器的数据流是两个独立的查询：

1. **放置**（极少变化）：`SELECT device_id, pos_x, pos_y, pos_z, rot_x, rot_y, rot_z, scale, is_simulated FROM device_3d_placement` ——这是真实坐标到达时唯一会改变的查询。
2. **状态/遥测**（频繁变化）：与 2D 孪生中已经验证过的完全相同的 `v_ldi_machine_latest_full` + 报警表查询——保持原样。

渲染器在客户端（或通过执行连接 (join) 细 API 端点）通过 `device_id` 将这两个结果集连接在一起。从模拟坐标迁移到真实坐标是一种类似 `data_generators` 的导入脚本，该脚本 `UPDATE` `device_3d_placement` 行（设置 `is_simulated = FALSE`，`source = 'cad_import'` 或 `'manual_survey'`）——它绝不会触碰 `devices`、`ldi_data`，或者 2D 孪生、报警管道、任何现有仪表板中的任何查询。这就是用户流程图中“等待实际工厂布局 → 从模拟布局更改 → 真实布局”步骤背后的具体机制。

---

## 6. 多工厂 / 数百台机器的支持

§3/§4 中的 `factory_layout_hierarchy`/`device_3d_placement` 模式没有关于 2 个工厂或 10 台机器的硬编码假设——`factory_code`/`hierarchy_id` 是自由文本/FK (外键)，并且无论数量多少，`device_3d_placement` 都是每个 `device_id` 一行。扩展到更多工厂/机器是数据填充问题（§5 的迁移路径），而不是模式变更。

**需要针对其进行设计的已经测量的真实上限：** `docs/evidence/SCALE_TEST_2026-08-15.md`（来自本仓库早期的可靠性工作）发现 250 台设备内 100% 成功，在 100-250 台设备之间出现 P95 延迟拐点，在 500 台设备时开始出现真正的故障——瓶颈在于 Node-RED CPU (118-135%)，而不是数据库。此 3D 孪生在同一 TimescaleDB 之上增加了只读查询负载，因此其查询模式（§13）必须保持已证明成本极低的最新值/`LIMIT 1` 形态，并且绝不能承担提取管道已经消耗的容量——这是两个独立的 CPU 预算（数据摄取 (ingestion) 与仪表板读取）。

---

## 7. 实时机器状态、报警、生产进度、board_no/total_board、MO、合规性

所有这些**已经真实存在且已被证实**——无需设计新的查询，只需一种新的传输方式（§13）即可将相同的数据放入 Three.js 场景而不是 Canvas 面板中：

- 状态（0/1/2/3 NO_DATA/IDLE/OK/ALARM）：与 Andon 面板 1000 和 2D 孪生相同的 CASE 逻辑，保持不变。
- 电路板进度：来自 `v_ldi_machine_latest_full` 的 `board_no`/`total_board`，保持不变。
- MO（工单）：同一个视图，保持不变。
- 报警上下文（数量/责任人/耗时）：与 2D 孪生的 `alarm_raw`/`alarm_ctx` CTE 查询形状相同，保持不变。
- 合规性：与已在 Andon/2D 孪生中证明过的环境合规性查询相同（温度 20-24°C 且湿度 50-60%RH），保持不变。

---

## 8. 机器选择与现有 IMS 仪表板的下钻 (drill-down) 链接

重用在 2D 孪生中已被证实（任务 3，独立重新验证）的完全相同机制：在 3D 场景中单击机器会打开 `/d/ims-ldi-machine-snapshot/set2-machine-snapshot?var-machine_id=<real-id>&var-factory=<real-factory>`，省略 `var-mo`/`var-event_time_ms`（本次会话已验证，当省略这些变量时，机器快照自身的变量默认值会解析为“最新事件，所有 MO”——从结构上避免了陈旧数据问题）。Three.js 对对象拾取的点击（对场景的光线投射）是一项标准且得到良好支持的功能——与 Grafana Canvas 的 `links[]` 不同，这实际上可以在浏览器中进行功能测试，而不存在阻碍 2D 孪生工作中点击验证的“无浏览器工具可用”限制，因为 3D 应用程序是一个正常的网页，而不是 Grafana 渲染的面板屏幕截图。

---

## 9. VCP / LDI 机器 3D 表现形式

**此阶段建议：使用简单的参数化占位符几何体（贴有标签的盒子或根据机器类型略带形状的带盖盒子），而不是凭空捏造一个实际 LDI/VCP 机器的“逼真” 3D 模型。**

本仓库中没有任何地方存在有关真实机器几何形状的 CAD 文件、由照片导出的模型或供应商规格，也没有提供过。在没有真实参考的情况下构建一个“看起来逼真”的 3D 模型，正是整个会话一直在避免的那种捏造行为——一个明显是占位符的盒子，通过真实状态来上色/添加图标（与 2D 孪生相同的 4 标记颜色系统，重用而不是重新发明），这种做法才符合其实际情况。如果/当提供真实的机器尺寸或 CAD 模型时，将占位符几何体替换为真实几何体仅仅是渲染层的更改——它不会触及 §4 的坐标模式或 §7 的数据查询。

---

## 10. 机器到机器 / 流程连接

**如今没有真实数据可以支持这一点。** 此模式中的任何表或视图都没有描述机器之间的工艺流程、物料路由或生产线顺序——`ldi_data`/`ldi_alarm_log`/`devices` 描述的是单个机器自身的遥测和报警数据，而不是它们之间的关系。在 3D 场景中渲染机器之间的连接线将需要 (a) 尚不存在的真实过程路由数据，或者 (b) 凭空捏造一个看起来合理的流程，根据本文档自身在 §0 中的不可协商条款，这显然是违规的。

**建议：** 从最初的 3D 构建中完全省略机器到机器的连接。如果/当真实的路由数据变得可用时（例如未来的 `process_routing` 表），这将是一个简单的附加功能（在两个 `device_3d_placement` 位置之间画一条线/管）——但在这里不进一步设计，因为现在设计它就意味着为不存在的数据发明一个数据模型，这比不设计它还要糟糕。

---

## 11. 针对 C 级别、NOC 和操作员的摄像头 / 导航 UX

三个受众，三种不同的真实需求（与 2D 孪生中对其“C 级别第一眼一瞥 vs. 操作员深度下钻”设计使用的细分相同）：

- **C 级别 / 展台 (Kiosk) / NOC 墙**：固定的、自动旋转或静态的概览摄像机（整个工厂的俯视或 3/4 等距视角），零交互要求——反映了 2D 孪生的“零交互” Andon 风格展台模式。不显示导航控件。
- **操作员 / 工程师，交互式会话**：标准轨道控制（Three.js `OrbitControls`——拖动以旋转，滚动以缩放，右键拖动以平移），加上一个“重置视图”和一个每个区域的“飞向”快捷方式（单击区域标签即可将相机捕捉到该区域，避免手动导航时大工厂变得令人迷失方向）。
- 两种模式都读取完全相同的底层场景/数据——相机模式是 UI 切换，而不是不同的数据路径。

---

## 12. 针对 10、100、500+ 台机器的性能策略

- **10 台机器**（当前真实的报告机队）：无需特殊处理——即使是简单粗暴的单机 `Mesh` 对象在这种规模下也能轻松渲染。
- **100+ 台机器**：将机器几何渲染切换到 `THREE.InstancedMesh`（对于相同占位符几何体的所有实例，只有一次绘制调用，通过实例属性进行每个实例的颜色/变换）——这是针对“相同简单形状的许多副本”的标准 Three.js 技术，并且非常适用，因为 §9 推荐了简单的参数化几何体。
- **500+ 台机器**：根据 §6，这已经超出了*提取管道 (ingestion pipeline)*（不是这个孪生应用）开始根据真实规模测试证据丢弃/超时的临界点——3D 孪生自身在 500 个实例化网格时的渲染成本在那个规模下并非瓶颈，上游数据管道才是。视锥体剔除（Three.js 默认执行此操作）以及如果需要的话，针对屏幕外/远距离区域的细节层次 (LOD) 交换是接下来的手段，如果性能分析显示有其它结果的话——在此未作进一步设计，因为目前还没有真实的 500 台机器的场景可供性能分析（只有真实的 10 台）。
- 查询端：每个状态/报警/生产查询都保持与 2D 孪生 (§7) 中已经证明的相同的 `LIMIT 1`/`DISTINCT ON` 最新值结构——这就是无论场景复杂性如何，都能保持查询成本不变的原因。

---

## 13. 数据 / 查询架构和 Grafana 集成

**新服务：`services/factory-twin-3d/`**（命名符合 `services/alarm-api` 的惯例），遵循完全相同的结构：

- 后端：Express（或等效的最小 Node HTTP 服务器）+ `pg`，提供 (a) 静态 Three.js 前端包，以及 (b) 一个小型的只读 JSON API：`GET /api/placement`（device_3d_placement + 层级结构关联查询），`GET /api/state`（与 §7 相同的最新值状态/报警/生产查询，返回 JSON 而不是 Grafana 面板的 `table` 格式）。
- 此服务中没有写入端点——与 `alarm-api`（它有一条真正的用于确认/解决的写入路径）不同，此孪生应用是只读的。任何未来的“从 3D 视图中确认”功能都将调用*现有的* `alarm-api`，而不是在这里创建一条新的写入路径——重用，而不是重复。
- 通过 `proxy/nginx.conf` 代理在一个新的 `location /factory-twin-3d/ { auth_request /auth-check; proxy_pass http://factory-twin-3d:<port>/; ... }` 块中，完全复制 `alarm-api` 现有的结构。
- 轮询或轻量级 WebSocket/SSE 推送状态更新——鉴于 2D 孪生已证明的 `refresh: "5s"` 节奏已经足以满足此数据的实际更新频率（模拟器持续写入，但不到亚秒级），每 5 秒对 `/api/state` 进行简单的 `setInterval` 轮询就足够了，并且符合现有的仪表板刷新惯例；到目前为止收集到的任何真实需求都不足以证明使用推送机制是合理的。

---

## 14. 安全与访问控制

完全重用 `proxy/nginx.conf` 现有的 `auth_request` 模式（§1，§13）——3D 孪生位于 `alarm-api` 已经使用的同一个 Grafana 会话 cookie 检查的背后，没有新的登录系统，没有新的凭据存储。`GF_SECURITY_COOKIE_SECURE`/`GF_SECURITY_STRICT_TRANSPORT_SECURITY` 目前在 `docker-compose.yaml` 中为 `"false"`（已确认，本地/开发状态）——这是仓库范围内存在的条件，并非此设计更改或应单方面更改的内容；与此处的任何其他服务一样，将此问题标记给负责生产安全加固的人员。

---

## 15. Windows 应用与 Web 应用的职责

**建议：在此阶段仅使用 Web 应用程序。** Three.js 原生支持浏览器/WebGL——如果是 Windows 桌面应用程序，则意味着 (a) 将相同的 Web 应用程序包装在 Electron 中（这增加了额外的打包/更新/分发负担，但没有带来任何新功能，因为它仍然只是 Chromium+Three.js），或者 (b) 一个真正独立的本机 3D 引擎 (Unity/Unreal/DirectX)——这需要更大的、独立的技术承诺，而且本仓库没有任何先例，并且尚未发现任何真正的需求（用户自身的验收标准列表也没有指定必须要本机应用程序来提供的仅限 Windows 的特定功能，例如提供超出浏览器本地 GPU 访问权限）。如果以后出现对本机 Windows 应用程序的具体真实需求（例如，一台专门的永远开启的信息亭 PC，在其中本机应用程序性能可以测量出明显优于浏览器），那将是一个针对性的后续决定，而不是现在要围绕其进行设计的默认值。

---

## 16. 无障碍和响应式显示策略

不加掩饰的如实说明局限性：3D WebGL 场景在屏幕阅读器可访问性方面天生比 2D 孪生的 Canvas 面板（至少具有 Grafana 可以公开的真实 DOM 相邻文本元素）更难实现。以下是具体的缓解措施，而不是声称拥有完全平等的无障碍功能：

- 每一台机器的真实状态/标签/警报数据**同时**以纯 HTML 侧边栏/列表视图的形式（相同的数据，非 3D 渲染）显示，可与 3D 场景一起切换——这是真正的无障碍辅助回退措施，而不是 3D 视图本身的事后补救。
- 颜色永远不是唯一的信号（与 2D 孪生遵循的规则相同：状态颜色 + 图标形状组合，而不仅仅是颜色）——将其带入 3D 视图中作为 颜色 + 标签文本 +（可选）图标精灵图。
- 响应式：低于实际可用宽度阈值（例如移动设备）时，完全回退到纯列表/侧边栏视图，而不是试图在小型触摸屏上渲染一个可用的 3D 场景——3D 工厂场景不是现实的手机 UI 目标，不要假装它可以做到。

---

## 17. 将来真实工厂布局的导入/维护方式

鉴于目前什么都没有，按照真实程度排序，有三种真实的来源路径：

1. **手动勘测输入**：一个简单的管理员表单/电子表格导入功能，直接写入 `device_3d_placement` (§4)——工作量最低，最有可能成为第一个真实的路径，不需要任何 CAD 工具。
2. **CAD/平面图导入**：如果有真实的架构 CAD 文件（DWG/DXF/IFC）可用，可以使用一次性转换脚本，根据每台机器真实的 X/Y 坐标（由设施团队提供的真实资产标签/`device_id` 交叉引用进行匹配）提取到同一个 `device_3d_placement` 表中——同样的模式，不同的 `source` 值。
3. **持续维护**：`updated_at` + `source` 列（§4）意味着重新勘测/纠正是直接 `UPDATE` 操作，不保留现有行的历史记录，除非未来的需求要求放置历史记录（此处未设计，尚未发现真正的需求——YAGNI (你不会需要它的)）。

这里的路径都没有被设计为自动/自发现的（例如，没有 BLE/UWB 实时定位）——本仓库中真正的基础设施中没有任何迹象表明已经存在或计划了该功能，而发明这种功能正是本文档自身的不可协商条款（§0）所排除的那种推测性功能。

---

## 18. 什么是真实数据，模拟数据以及未来数据——清晰明了

| 数据                                   | 当前状态                                            | 来源                                                               |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| 机器状态 (0/1/2/3)                     | **真实**                                            | `v_ldi_machine_latest_full` + 报警表，与 2D 孪生一致               |
| `board_no`/`total_board`               | **真实**                                            | 同一个视图                                                         |
| 当前 MO                                | **真实**                                            | 同一个视图                                                         |
| 报警数量/责任人/耗时                   | **真实**                                            | 与 2D 孪生相同的查询形状                                           |
| 环境合规性                             | **真实**                                            | 与 Andon/2D 孪生相同的查询                                         |
| 存在哪 10 台机器，哪 5 个区域          | **真实**                                            | `devices`，仅限确认报告的机器                                      |
| 机器 X/Y/Z 位置                        | **模拟**（确定性网格，§4）                          | `device_3d_placement.is_simulated = TRUE`，直到有真实数据到达      |
| 建筑/楼层名称                          | **尚未填充**（模式支持，无数据）                    | `factory_layout_hierarchy`，在知晓前可为空                         |
| 机器间连接                             | **未建模**（§10）                                   | 没有真实数据存在；不捏造                                           |
| 3D 机器几何体 (形状/大小)              | **占位符**（§9）                                    | 简单的参数化盒子，而不是真实的 CAD/照片衍生模型                    |
| 其他一切（§7）                         | **真实**                                            | 与经过验证的 2D 孪生结构完全相同的查询                             |

---

## 19. 没有捏造物理坐标——这一阶段的强制规则

重申得更直白一点，因为这是一个承重墙：在此设计下构建的任何东西，都不得将模拟坐标呈现得好像它们是真实的一样。显示 `device_3d_placement` 数据的每个渲染界面都必须检查 `is_simulated`，只要它为真，就必须明显地指示出这是模拟布局（使用横幅、标签或独特的渲染样式）。这是一个可测试的验收标准（§20），而不是单纯的善意意图。

---

## 20. 验收标准和迁移计划

**任务 4.1 的验收标准（1 台机器的 3D POC）：**

- [ ] 一台真实的机器（其实际状态/board_no/mo/报警数据，实时查询）在 Three.js 场景中以模拟位置渲染，并清楚地标记为模拟。
- [ ] 单击机器可打开真实的机器快照 (Machine Snapshot) 下钻页面，且 `var-machine_id`/`var-factory` 正确（这次可在浏览器中验证，不同于 Canvas——见 §8）。
- [ ] `services/factory-twin-3d/` 存在，通过 nginx 代理，具有与 `alarm-api` 相同的 `auth_request` 门禁。
- [ ] 现有仪表板/服务未被修改。

**任务 4.2 的验收标准（10 台机器的 3D 孪生）：**

- [ ] 所有 10 台真实的机器，在它们真实的 5 个区域（根据 `factory_layout_hierarchy` 初始化自真实的 `devices.location`）中，在每个区域内的模拟位置。
- [ ] 状态/报警/生产数据符合与 2D 孪生相同的实时查询标准（实时正确性，可独立重新验证）。
- [ ] 模拟布局横幅根据 §19 变为可见。

**任务 4.3 的验收标准（性能测试）：**

- [ ] 10 台机器（已经是真实的机队）下的真实渲染/帧时间测量，以及 100/500 台模拟机器的合成规模测试（遵循 §12 的 `InstancedMesh` 策略）——经测量的，而非假设的。
- [ ] 对 `/api/state` 的查询延迟对照本会话工作始终使用的相同 300 毫秒预算进行测量。

**任务 4.4 的验收标准（下钻集成）：**

- [ ] 所有 10 台机器的“单击转到机器快照”操作已在实际浏览器会话中得到验证（在这里这种方式是可以实现的，这与 Grafana Canvas 不同——如果在执行此任务时浏览器工具仍不可用，请突出标记，并退回到与 2D 孪生使用相同的仅结构化验证）。

**迁移计划（用户流程图中的“STOP → 等待真实布局”步骤）：**

1. 任务 4.1-4.4 发货时，所有行的 `device_3d_placement.is_simulated = TRUE`，并根据 §4 采用确定性网格。
2. 工作停止。在实际提供真实的工厂布局来源 (§17) 之前，不会进行后续的 3D 任务。
3. 当真实坐标到达时：运行 §17 的导入路径，逐行 `UPDATE device_3d_placement SET is_simulated = FALSE, source = '<real source>'`。遥测查询零改变（§5），4.1-4.4 中构建的渲染/交互代码零改变——只有数据发生变化，并且一旦每个可见行都是真实的，模拟布局横幅（§19）就会消失。

---

## 本设计明确排除在外的范围

- 任何实现——根据用户的明确指示，这仅是一份设计文档。
- 机器到机器的流程连接（§10）——不存在真实数据。
- 自动/自发现定位（§17）——没有为其提供真实基础设施。
- 原生 Windows 应用程序（§15）——尚未确定真实的业务需求。
- 与 2D 孪生完全相同的无障碍功能平衡（§16）——3D 场景具有固有的限制，这些限制只能减轻而不能消除。
- 对 `ims-ldi-manufacturing.json`、`ims-ldi-operator-andon.json` 或 `ims-ldi-factory-digital-twin.json` 的任何更改。
