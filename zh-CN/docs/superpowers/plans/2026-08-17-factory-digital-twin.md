<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../../../../docs/README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS LDI — 工厂数字孪生 (2D Canvas) 实施计划

> **对于智能代理：** 必备子技能 (REQUIRED SUB-SKILL)：使用 superpowers:subagent-driven-development (推荐) 或 superpowers:executing-plans 逐项任务地执行此计划。步骤使用复选框 (`- [ ]`) 语法进行跟踪。

**目标：** 构建 `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`，这是一个新的 Grafana Canvas 面板仪表板，显示 10 台报告真实数据的 LDI 机器，并将它们分组在 5 个真实的区域中，具有实时状态/报警/生产/合规性数据，并可向下钻取到现有的机器快照 (Machine Snapshot) 仪表板。

**架构：** 一个新的仪表板 JSON 文件。顶部的统计面板条 (包含 4 个全车队范围内的数据指标，全部重用现有查询) 位于单个 Canvas 面板的上方，该面板包含 5 个静态的区域标签矩形和 10 个机器节点。每个节点都绑定到其自身的查询目标 (对 `v_ldi_machine_latest_full` 视图进行硬编码的 `eqp_id` `LIMIT 1` 查找，这是安灯 (Andon) 已经使用的相同视图)，外加每台机器的一个报警详细信息目标。没有新的数据库对象，没有新的视图，没有新的插件。

**技术栈：** Grafana 13.1.1 核心 Canvas 面板 (`type: canvas`，内部/无插件)，通过现有的 `timescaledb` 数据源连接的 PostgreSQL/TimescaleDB，现有的 `v_ldi_machine_latest_full` / `ldi_alarm_log` / `ldi_alarm_ms_code` / `ldi_alarm_lifecycle` / `v_ldi_alarm_category` 表/视图。

## 全局约束

- 请勿修改 `monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json`。
- 请勿修改 `monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json`。
- 无模拟/伪造数据 —— 每个查询都必须针对此代码库中已在其他地方验证过的真实表/视图。
- 仅使用真实数据源：`{"uid": "timescaledb"}`。
- `machine_id` 唯一性：依赖于 `devices.device_id` (真实的主键) —— 不需要新的唯一性逻辑。
- `board_id`：请勿捏造。在 100% 的真实数据行中，它都是空的 (验证于 2026-08-17：在 19,043 行中，非空值的数量为 0)。请改用 `log_id` (已验证 100% 非空，100% 唯一，19,119/19,119) 并将其标记为 "Event ID"，绝不能标记为 "Board ID"。
- `board_no`/`total_board`：仅在任务 4 中的验证查询确认 `board_no <= total_board` 成立后使用 (验证于 2026-08-17：19,053 行中没有违规情况)。
- 仅显示在过去 24 小时内确认报告了真实数据的 10 台机器：`LDI-01`..`LDI-10`。不要包含其他 13 台已注册但处于静默状态的 `device_id`。
- 每个原始 `ldi_data` 查询目标必须是 `LIMIT 1` / `DISTINCT ON` 最新值的形状 (查询分层契约，`GRAFANA_DESIGN_SYSTEM.md` §10) —— 不能针对原始 `ldi_data` 进行范围扫描。
- 实际上，每个查询目标的运行时间必须在 300 毫秒以内；如果达到 2000 毫秒，CI (持续集成) 会直接判定为失败 (`tests/smoke/query-budget-check.sh`)。
- 不使用注入了 `<style>`/CSS 的面板。所有视觉样式只能通过每个面板/元素的内置原生 JSON 配置来实现。
- 每个机器节点必须具有指向 `ims-ldi-machine-snapshot` 的下钻 (drill-down) 链接。
- 所有的填充颜色都必须映射到已记录的状态名称 (0/1/2/3 → NO_DATA/IDLE/OK/ALARM)，重用 `GRAFANA_DESIGN_SYSTEM.md` §2.1 中已经存在的相同令牌 (tokens) (`#64748B`/`#F59E0B`/`#22C55E`/`#EF4444`)。
- 除了 `docker-compose.yaml` 中由 `GF_INSTALL_PLUGINS` 安装的外部 Grafana 插件之外，不使用其他的外部插件 (canvas 面板属于核心/内部组件 —— 已通过 `GET /api/plugins`，`signature: internal` 确认 —— 无需添加)。

---

## 任务 1：验证真实的 Grafana Canvas 面板 JSON 模式（读后写模式）

Grafana 的 Canvas 面板 JSON 模式（元素类型，`root.elements[]` 形状，每个元素的数据绑定）在不同的 Grafana 版本中发生了变化。与其凭记忆手动编写元素 JSON 并冒着模式不匹配的风险，不如首先从这个确切的 Grafana 实例 (13.1.1) 中捕获真实的模式，这与本会话早些时候在处理渲染 API (render-API) kiosk 参数时使用的“针对实时系统进行验证，不要凭空假设”的严谨态度是一致的。

**文件：**

- 创建（临时，不提交）：通过 Grafana UI/API 创建一个一次性 (throwaway) 的仪表板，导出并检查，然后删除。此任务不会触及 `monitoring/grafana/dashboards/` 下的任何内容。

**接口：**

- 产生：一个经过验证的参考代码片段（保存到计划执行者的临时暂存区，而不是代码库中），显示真实的 `type: canvas` 面板 JSON —— 具体来说，是对于 `rectangle` 元素（背景颜色绑定到字段）和 `text`/`metric-value` 元素（文本绑定到字段）的 `options.root.elements[]` 数组形状，以及 Canvas 元素用于下钻的 `links[]` 结构。

- [ ] **步骤 1：通过 Grafana API 创建一个最基本的一次性 canvas 面板**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  -H "Content-Type: application/json" \
  -X POST "http://localhost:${GRAFANA_PORT:-3000}/api/dashboards/db" \
  -d '{
    "dashboard": {
      "title": "TEMP schema probe - delete me",
      "panels": [{
        "id": 1, "type": "canvas", "title": "probe",
        "gridPos": {"x":0,"y":0,"w":12,"h":8},
        "datasource": {"uid": "timescaledb"},
        "targets": [{"refId":"A","datasource":{"uid":"timescaledb"},
          "rawSql":"SELECT '"'"'LDI-01'"'"' AS eqp_id, 2 AS node_state","format":"table"}],
        "options": {"root": {"elements": []}}
      }],
      "schemaVersion": 39
    },
    "overwrite": true
  }' | tee "$SCRATCHPAD/schema_probe_create.json"
```

- [ ] **步骤 2：在 Grafana 的 UI（非 headless 模式）中打开测试 (probe) 仪表板，添加一个背景颜色绑定到 `node_state` 字段的矩形 (rectangle) 元素，以及一个文本绑定到 `eqp_id` 的文本元素，并在矩形上添加一个数据链接 (URL)，然后保存。**

- [ ] **步骤 3：导出已保存的仪表板 JSON 并提取 `options.root.elements` 数组**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  "http://localhost:${GRAFANA_PORT:-3000}/api/dashboards/uid/<probe-uid>" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['dashboard']['panels'][0]['options'], indent=2))" \
  > "$SCRATCHPAD/canvas_schema_reference.json"
```

- [ ] **步骤 4：读取 `canvas_schema_reference.json`。确认它至少包含矩形上绑定到字段的 `background.color.field`（或等效项）以及元素上的 `links[]` 数组。如果真实的模式与下面任务 5/6 假设的模式不同，请在编写这些任务的 JSON 之前对其进行更新 —— 决不能默不作声地带着猜测的模式继续执行。**

- [ ] **步骤 5：删除一次性的探测 (probe) 仪表板**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  -X DELETE "http://localhost:${GRAFANA_PORT:-3000}/api/dashboards/uid/<probe-uid>"
```

无需提交 —— 此任务仅触及实时的 Grafana 状态（最后会被删除）和一个临时文件，绝不会触及代码库中的文件。

---

## 任务 2：搭建仪表板文件骨架 —— 元数据、模板变量、样式面板

**文件：**

- 创建：`monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**接口：**

- 产生：仪表板 `uid: "ims-ldi-factory-digital-twin"`，模板变量 `$factory` 和 `$mo` (隐藏的，`hide: 2`，与安灯 (Andon) 仪表板的查询形状相同)，一个位于顶部的文本面板 (id 9999) 用于提供卡片边框样式，**不使用** 安灯面板中使用的未记录的 `<style>` CSS 注入技巧 —— 请改用面板自己的 `fieldConfig`/`options` 来设置背景，或者完全省略装饰性样式。这从结构上直接满足了“不得使用未记录的 CSS”的要求，而不是通过申请豁免。

- [ ] **步骤 1：编写仪表板外壳 (shell)**

```json
{
  "description": "Factory Digital Twin: 2D canvas view of the 10 real reporting LDI machines across their 5 real zones. Production state, alarm state, and compliance status are all live queries against the same tables/views already proven on IMS LDI - Operator Andon Board and IMS LDI - Manufacturing Command Center -- no new queries invented beyond what's documented in docs/superpowers/specs/2026-08-17-factory-digital-twin-design.md. board_id is not used (empty in 100% of real rows) -- log_id is the real per-event traceability key. Does not modify ims-ldi-manufacturing.json or ims-ldi-operator-andon.json.",
  "schemaVersion": 39,
  "liveNow": true,
  "style": "dark",
  "templating": {
    "list": [
      {
        "name": "factory",
        "label": "Factory",
        "type": "query",
        "datasource": { "uid": "timescaledb" },
        "query": "SELECT DISTINCT factory AS __text, factory AS __value FROM public.ldi_data ORDER BY factory",
        "definition": "SELECT DISTINCT factory AS __text, factory AS __value FROM public.ldi_data ORDER BY factory",
        "current": { "selected": true, "text": "All", "value": "$__all" },
        "multi": true,
        "includeAll": true,
        "options": [],
        "refresh": 1,
        "sort": 1,
        "hide": 2,
        "regex": "",
        "skipUrlSync": false
      },
      {
        "name": "mo",
        "label": "MO",
        "type": "query",
        "datasource": { "uid": "timescaledb" },
        "query": "SELECT DISTINCT mo AS __text, mo AS __value FROM public.ldi_data WHERE factory IN (${factory:sqlstring}) ORDER BY mo",
        "definition": "SELECT DISTINCT mo AS __text, mo AS __value FROM public.ldi_data WHERE factory IN (${factory:sqlstring}) ORDER BY mo",
        "current": { "selected": true, "text": "All", "value": "$__all" },
        "multi": true,
        "includeAll": true,
        "options": [],
        "refresh": 1,
        "sort": 1,
        "hide": 2,
        "regex": "",
        "skipUrlSync": false
      }
    ]
  },
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": { "type": "grafana", "uid": "-- Grafana --" },
        "enable": true,
        "hide": false,
        "iconColor": "rgba(255, 96, 96, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "panels": [],
  "fiscalYearStartMonth": 0,
  "links": [],
  "id": null,
  "uid": "ims-ldi-factory-digital-twin",
  "title": "IMS LDI - Factory Digital Twin",
  "version": 1,
  "time": { "from": "now-2h", "to": "now" },
  "timezone": "UTC",
  "refresh": "5s",
  "tags": [
    "IMS",
    "LDI",
    "set-2",
    "real-data",
    "current-database",
    "manufacturing",
    "digital-twin"
  ]
}
```

注意：没有 `machine_id` 变量 —— 此仪表板具有 10 个固定的节点位置，而不是模板化的重复面板，因此按机器过滤的方式不适用于此仪表板，这与它在 安灯 (Andon) / 制造 (Manufacturing) 仪表板上的应用方式不同。

- [ ] **步骤 2：验证 JSON 语法**

```bash
python3 -c "import json; json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8')); print('valid json')"
```

期望输出：`valid json`

- [ ] **步骤 3：提交 (Commit)**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): scaffold Factory Digital Twin dashboard shell"
```

---

## 任务 3：顶部条带 —— 4 个供 C 级别 (C-Level) 高管查看的统计面板（仅使用重用的查询）

**文件：**

- 修改：`monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**接口：**

- 消费 (Consumes)：任务 2 中的 `$factory`，`$mo`。
- 产生 (Produces)：面板 id 为 1 (车队可用性, Fleet Availability)，2 (活动的严重/主要报警, Active Critical/Major Alarms)，3 (未生产, Not-Producing)，4 (环境合规性, Environmental Compliance)，所有面板都在 `y:1, h:3` 处，类型均为 `type: stat`，`x` 位置为 `0/6/14/19`，与安灯面板顶行精确的布局完全匹配 (`w:6/8/5/5` = 24)。

- [ ] **步骤 1：添加车队可用性 (id 1) —— 字节级完全相同的查询，与安灯面板 1 完全一致，因为它是跨所有已注册并启用的 LDI 设备的全车队范围的数据，而不是局限于包含 10 个节点的 canvas 面板**

```json
{
  "id": 1,
  "title": "◉ Fleet Availability",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 0, "y": 1, "w": 6, "h": 3 },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "#EF4444", "value": null },
          { "color": "#22C55E", "value": 100 }
        ]
      },
      "color": { "mode": "fixed", "fixedColor": "#00F2FE" },
      "unit": "percent",
      "decimals": 0,
      "min": 0,
      "max": 100,
      "custom": {
        "gradientMode": "opacity",
        "lineInterpolation": "smooth",
        "fillOpacity": 15,
        "lineWidth": 2
      },
      "mappings": [
        {
          "type": "special",
          "options": {
            "match": "null+nan",
            "result": { "color": "#64748B", "text": "NO_DATA", "index": 0 }
          }
        }
      ]
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "reduceOptions": { "calcs": ["lastNotNull"], "values": false },
    "text": { "valueSize": 56, "titleSize": 16 },
    "noValue": "NO_DATA",
    "textMode": "value",
    "tooltip": { "mode": "single", "sort": "none" }
  },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "WITH machines AS (\n  SELECT device_id AS eqp_id FROM public.devices WHERE device_type='ldi' AND enabled\n)\nSELECT ROUND((COUNT(*) FILTER (WHERE l.state = true) * 100.0 / NULLIF(COUNT(*), 0))::NUMERIC, 0) AS value\nFROM machines m\nLEFT JOIN LATERAL (\n  SELECT state FROM public.ldi_data d\n  WHERE d.eqp_id = m.eqp_id AND $__timeFilter(d.time) AND d.factory IN (${factory:sqlstring}) AND d.mo IN (${mo:sqlstring})\n  ORDER BY d.time DESC LIMIT 1\n) l ON true"
    }
  ],
  "description": "目前处于正常 (OK) 状态的完整已注册且启用的 LDI 车队 (已注册 23 台，实际报告数据的有 10 台) 的百分比。与 IMS LDI - Operator Andon Board 面板 1 的查询完全相同 —— 重用，不重新发明。"
}
```

- [ ] **步骤 2：添加活动的严重/主要报警 (id 2) —— 与安灯面板 2 查询完全相同**

```json
{
  "id": 2,
  "title": "◉ Active Critical/Major Alarms",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 6, "y": 1, "w": 8, "h": 3 },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "#22C55E", "value": null },
          { "color": "#EF4444", "value": 1 }
        ]
      },
      "color": { "mode": "thresholds" },
      "unit": "short",
      "custom": {
        "gradientMode": "opacity",
        "lineInterpolation": "smooth",
        "fillOpacity": 15,
        "lineWidth": 2
      },
      "mappings": [
        {
          "type": "special",
          "options": {
            "match": "null+nan",
            "result": { "color": "#64748B", "text": "NO_DATA", "index": 0 }
          }
        }
      ]
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "reduceOptions": { "calcs": ["lastNotNull"], "values": false },
    "text": { "valueSize": 56, "titleSize": 16 },
    "noValue": "NO_DATA",
    "textMode": "value",
    "tooltip": { "mode": "single", "sort": "none" }
  },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "SELECT COUNT(*)::NUMERIC AS value\nFROM public.ldi_alarm_log a\nJOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT\nLEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid\nWHERE m.severity IN ('Critical', 'Major')\n  AND l.status IS DISTINCT FROM 'RESOLVED';"
    }
  ],
  "description": "车队范围内活动的 (状态不为 RESOLVED) 严重/主要报警数量，数据来源于 public.ldi_alarm_lifecycle。与 Andon 面板 2 的查询结构相同。"
}
```

- [ ] **步骤 3：添加未生产数量统计 (id 3) —— 使用了新的查询语句，但重用了已经在安灯每个机器的状态瓷砖图中使用的相同的 0/1/2/3 状态分类，将 10 个真实节点的数据聚合起来**

```json
{
  "id": 3,
  "title": "◉ Not-Producing (of 10)",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 14, "y": 1, "w": 5, "h": 3 },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "#22C55E", "value": null },
          { "color": "#F59E0B", "value": 1 },
          { "color": "#EF4444", "value": 3 }
        ]
      },
      "color": { "mode": "thresholds" },
      "unit": "short",
      "decimals": 0,
      "custom": {
        "gradientMode": "opacity",
        "lineInterpolation": "smooth",
        "fillOpacity": 15,
        "lineWidth": 2
      },
      "mappings": [
        {
          "type": "special",
          "options": {
            "match": "null+nan",
            "result": { "color": "#64748B", "text": "NO_DATA", "index": 0 }
          }
        }
      ]
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "reduceOptions": { "calcs": ["lastNotNull"], "values": false },
    "text": { "valueSize": 56, "titleSize": 16 },
    "noValue": "NO_DATA",
    "textMode": "value",
    "tooltip": { "mode": "single", "sort": "none" }
  },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "SELECT COUNT(*) FILTER (WHERE\n  NOT v.has_data OR v.is_stale OR NOT v.state OR EXISTS (\n    SELECT 1 FROM public.ldi_alarm_log a\n    JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT\n    WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major')\n      AND a.logdate > NOW() - INTERVAL '5 minutes'\n  )\n) AS value\nFROM public.v_ldi_machine_latest_full v\nWHERE v.eqp_id IN ('LDI-01','LDI-02','LDI-03','LDI-04','LDI-05','LDI-06','LDI-07','LDI-08','LDI-09','LDI-10')"
    }
  ],
  "description": "在 10 台报告真实数据的机器中，当前未在生产 (无数据、过时、空闲或处于活跃警报状态) 的数量。与每个画布节点状态的分类逻辑相同，进行聚合统计。旨在为 C 级别高管提供生产影响的替代指标 —— 它不是收入或电路板产量的估算，因为该系统没有数据支持那些计算。"
}
```

- [ ] **步骤 4：添加环境合规性 (id 4) —— 与安灯面板 3 的查询相同**

```json
{
  "id": 4,
  "title": "◉ Environmental Compliance",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 19, "y": 1, "w": 5, "h": 3 },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "#EF4444", "value": null },
          { "color": "#F59E0B", "value": 80 },
          { "color": "#22C55E", "value": 95 }
        ]
      },
      "color": { "mode": "fixed", "fixedColor": "#00F2FE" },
      "unit": "percent",
      "decimals": 0,
      "min": 0,
      "max": 100,
      "custom": {
        "gradientMode": "opacity",
        "lineInterpolation": "smooth",
        "fillOpacity": 15,
        "lineWidth": 2
      },
      "mappings": [
        {
          "type": "special",
          "options": {
            "match": "null+nan",
            "result": { "color": "#64748B", "text": "NO_DATA", "index": 0 }
          }
        }
      ]
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "reduceOptions": { "calcs": ["lastNotNull"], "values": false },
    "text": { "valueSize": 56, "titleSize": 16 },
    "noValue": "NO_DATA",
    "textMode": "value",
    "tooltip": { "mode": "single", "sort": "none" }
  },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "SELECT ROUND((COUNT(DISTINCT eqp_id) FILTER (WHERE temperature BETWEEN 20 AND 24 AND humidity BETWEEN 50 AND 60) * 100.0 / NULLIF(COUNT(DISTINCT eqp_id), 0))::NUMERIC, 0) AS value FROM public.ldi_data WHERE factory IN (${factory:sqlstring}) AND mo IN (${mo:sqlstring}) AND $__timeFilter(time) AND temperature IS NOT NULL AND humidity IS NOT NULL"
    }
  ],
  "description": "环境合规性：处于安全温度和湿度范围内的机器百分比。与安灯面板 3 的查询完全相同。"
}
```

- [ ] **步骤 5：验证 JSON，并确认一行中所有面板的宽度 (`w`) 总和为 24**

```bash
python3 -c "
import json
d = json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8'))
row = [p for p in d['panels'] if p['gridPos']['y'] == 1]
print('width:', sum(p['gridPos']['w'] for p in row))
"
```

期望输出：`width: 24`

- [ ] **步骤 6：直接对真实数据库运行每个查询，以确认其数据形状和延迟，在让 Grafana 渲染之前先获得信心**

```bash
docker compose exec -T timescaledb psql -U ims_admin -d ims -c "\timing on" -c "
SELECT COUNT(*) FILTER (WHERE
  NOT v.has_data OR v.is_stale OR NOT v.state OR EXISTS (
    SELECT 1 FROM public.ldi_alarm_log a
    JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
    WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major')
      AND a.logdate > NOW() - INTERVAL '5 minutes'
  )
) AS value
FROM public.v_ldi_machine_latest_full v
WHERE v.eqp_id IN ('LDI-01','LDI-02','LDI-03','LDI-04','LDI-05','LDI-06','LDI-07','LDI-08','LDI-09','LDI-10');
"
```

期望输出：单行的数字结果，`Time: <300ms`。

- [ ] **步骤 7：提交 (Commit)**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): add Factory Digital Twin top stat strip"
```

---

## 任务 4：验证并完成 10 个每台机器节点的查询（在连接到 Canvas 面板之前，首先验证查询）

采用 TDD 风格：在将查询放入面板之前，先编写针对真实数据库的查询并运行它，按照本会话的纪律，用证据说话 (查询必须满足分层原则且预算应小于 300 毫秒，这一事实在将查询嵌入面板之前必须是明确成立的，而不是在事后发现问题)。

**文件：**

- 暂无 (仅为验证，其输出供任务 5 使用)。

**接口：**

- 产生：10 个经过验证的“状态”查询（每个 `eqp_id` 一个）和 10 个经过验证的“报警详细信息”查询，确认为 `LIMIT 1`/聚合的形状，确认时间小于 300 毫秒，已准备好粘贴为任务 5 中的 Canvas 元素查询目标。

- [ ] **步骤 1：编写每个机器规范的“状态”查询 (`LDI-01` 实例) —— 重用 `v_ldi_machine_latest_full` 视图，这与安灯面板使用的列相同 (`mo`, `board_no`, `total_board`, `log_id`, `has_data`, `is_stale`, `state`)，也与安灯面板 1000 相同的 0/1/2/3 分类方式**

```sql
SELECT
  'LDI-01' AS eqp_id,
  v.mo,
  v.board_no,
  v.total_board,
  v.log_id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.ldi_alarm_log a
      JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
      WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major')
        AND a.logdate > NOW() - INTERVAL '5 minutes'
    ) THEN 3
    WHEN NOT v.has_data OR v.is_stale THEN 0
    WHEN v.state THEN 2
    ELSE 1
  END AS node_state
FROM public.v_ldi_machine_latest_full v
WHERE v.eqp_id = 'LDI-01';
```

- [ ] **步骤 2：运行并为其计时**

```bash
docker compose exec -T timescaledb psql -U ims_admin -d ims -c "\timing on" -c "
SELECT 'LDI-01' AS eqp_id, v.mo, v.board_no, v.total_board, v.log_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.ldi_alarm_log a JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major') AND a.logdate > NOW() - INTERVAL '5 minutes') THEN 3
    WHEN NOT v.has_data OR v.is_stale THEN 0
    WHEN v.state THEN 2
    ELSE 1
  END AS node_state
FROM public.v_ldi_machine_latest_full v WHERE v.eqp_id = 'LDI-01';
"
```

期望输出：1 行数据，`node_state` 在 `{0,1,2,3}` 集合中，`board_no <= total_board`，`Time: <300ms`。

- [ ] **步骤 3：为其余 9 个机器 ID 重复步骤 1/2 —— 分别替换 SELECT 列表和 WHERE 子句中的字面量 `eqp_id`。已在过去 24 小时 (2026-08-17) 内验证报告了数据的 10 个真实 ID 为：`LDI-01, LDI-02, LDI-03, LDI-04, LDI-05, LDI-06, LDI-07, LDI-08, LDI-09, LDI-10`。**

```bash
for id in LDI-02 LDI-03 LDI-04 LDI-05 LDI-06 LDI-07 LDI-08 LDI-09 LDI-10; do
  echo "=== $id ==="
  docker compose exec -T timescaledb psql -U ims_admin -d ims -c "\timing on" -c "
  SELECT '$id' AS eqp_id, v.mo, v.board_no, v.total_board, v.log_id,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.ldi_alarm_log a JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major') AND a.logdate > NOW() - INTERVAL '5 minutes') THEN 3
      WHEN NOT v.has_data OR v.is_stale THEN 0
      WHEN v.state THEN 2
      ELSE 1
    END AS node_state
  FROM public.v_ldi_machine_latest_full v WHERE v.eqp_id = '$id';
  "
done
```

期望输出：另外 9 个单行结果，全部 `Time: <300ms`。

- [ ] **步骤 4：编写每台机器规范的“报警详细信息”查询 (`LDI-01` 实例) —— 精确重用安灯的行动队列 (Action Queue) 表中使用的 负责人 (Owner) 类别→团队的映射，以及 经过时间 (Elapsed) 计算逻辑**

```sql
SELECT
  COUNT(*) AS alarm_count,
  MAX(CASE
    WHEN NOW() - a.logdate < INTERVAL '1 hour'
      THEN GREATEST(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT, 0)::TEXT || 'm'
    ELSE EXTRACT(HOUR FROM (NOW() - a.logdate))::INT || 'h' || LPAD(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT::TEXT, 2, '0') || 'm'
  END) AS elapsed,
  MAX(CASE COALESCE(c.category, 'UNCLASSIFIED')
    WHEN 'VACUUM' THEN 'Maintenance' WHEN 'CAMERA' THEN 'Maintenance'
    WHEN 'MOTION' THEN 'Maintenance' WHEN 'MOTOR' THEN 'Maintenance'
    WHEN 'ENVIRONMENT' THEN 'Facility' WHEN 'NETWORK' THEN 'Automation'
    WHEN 'PLC' THEN 'Automation' WHEN 'COMMUNICATION' THEN 'Automation'
    WHEN 'DATABASE' THEN 'IT' WHEN 'ALIGNMENT' THEN 'Process Engineering'
    WHEN 'CALIBRATION' THEN 'Process Engineering' WHEN 'REGISTRATION' THEN 'Process Engineering'
    WHEN 'PROCESS' THEN 'Process Engineering' ELSE 'Maintenance'
  END) AS owner
FROM public.ldi_alarm_log a
JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
LEFT JOIN public.v_ldi_alarm_category c ON c.alarm_code = a.errorcode::TEXT
LEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid
WHERE a.equipmentid = 'LDI-01'
  AND m.severity IN ('Critical', 'Major')
  AND l.status IS DISTINCT FROM 'RESOLVED';
```

- [ ] **步骤 5：运行并为其计时，然后按照与步骤 3 相同的方法对其他 9 个机器 ID 重复此操作**

```bash
docker compose exec -T timescaledb psql -U ims_admin -d ims -c "\timing on" -c "
SELECT COUNT(*) AS alarm_count,
  MAX(CASE WHEN NOW() - a.logdate < INTERVAL '1 hour' THEN GREATEST(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT, 0)::TEXT || 'm' ELSE EXTRACT(HOUR FROM (NOW() - a.logdate))::INT || 'h' || LPAD(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT::TEXT, 2, '0') || 'm' END) AS elapsed,
  MAX(CASE COALESCE(c.category, 'UNCLASSIFIED') WHEN 'VACUUM' THEN 'Maintenance' WHEN 'CAMERA' THEN 'Maintenance' WHEN 'MOTION' THEN 'Maintenance' WHEN 'MOTOR' THEN 'Maintenance' WHEN 'ENVIRONMENT' THEN 'Facility' WHEN 'NETWORK' THEN 'Automation' WHEN 'PLC' THEN 'Automation' WHEN 'COMMUNICATION' THEN 'Automation' WHEN 'DATABASE' THEN 'IT' WHEN 'ALIGNMENT' THEN 'Process Engineering' WHEN 'CALIBRATION' THEN 'Process Engineering' WHEN 'REGISTRATION' THEN 'Process Engineering' WHEN 'PROCESS' THEN 'Process Engineering' ELSE 'Maintenance' END) AS owner
FROM public.ldi_alarm_log a
JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
LEFT JOIN public.v_ldi_alarm_category c ON c.alarm_code = a.errorcode::TEXT
LEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid
WHERE a.equipmentid = 'LDI-01' AND m.severity IN ('Critical', 'Major') AND l.status IS DISTINCT FROM 'RESOLVED';
"
```

期望输出：1 行数据（如果是 0 行聚合，则 `alarm_count=0, elapsed=NULL, owner=NULL` —— 在元素的文本绑定中将 NULL 处理为 "无活动报警"，这与此代码库中其他所有地方使用的 `noValue` 约定相同），`Time: <300ms`。

无需提交 —— 此任务仅用于查询验证，其输出将供任务 5 消耗。

---

## 任务 5：Canvas 面板 —— 5 个区域块 (zone blocks) + 10 个机器节点

**文件：**

- 修改：`monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**接口：**

- 消费 (Consumes)：任务 1 中经过验证的 JSON 模式，任务 4 中经过验证的 20 个查询目标（10 个状态 + 10 个报警详情）。
- 产生 (Produces)：面板 id 100 (`type: canvas`)，`gridPos {x:0, y:4, w:24, h:16}`，其中包含 `options.root.elements` = 5 个区域标签矩形 + 10 个机器节点组（每个节点组包含一个矩形 + 文本，根据任务 1 验证的模式进行绑定）。

- [ ] **步骤 1：添加包含所有 20 个查询目标的 canvas 面板外壳 (shell)（10 个状态，refIds A–J；10 个报警详细信息，refIds K–T），每个真实的机器 ID 一个**

```json
{
  "id": 100,
  "title": "◈ Factory Floor",
  "type": "canvas",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 0, "y": 4, "w": 24, "h": 16 },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "SELECT 'LDI-01' AS eqp_id, v.mo, v.board_no, v.total_board, v.log_id, CASE WHEN EXISTS (SELECT 1 FROM public.ldi_alarm_log a JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major') AND a.logdate > NOW() - INTERVAL '5 minutes') THEN 3 WHEN NOT v.has_data OR v.is_stale THEN 0 WHEN v.state THEN 2 ELSE 1 END AS node_state FROM public.v_ldi_machine_latest_full v WHERE v.eqp_id = 'LDI-01'"
    }
  ],
  "options": { "root": { "elements": [] } },
  "description": "工厂数字孪生 (Factory Digital Twin) 画布：5 个真实区域 (public.devices.location)，10 台报告真实数据的机器。节点填充颜色代表状态 (0/1/2/3 -> 无数据/空闲/正常/报警 (NO_DATA/IDLE/OK/ALARM))，这与 IMS LDI - 操作员安灯看板 (Operator Andon Board) 的状态分类和颜色代号相同。不显示 board_id (在 100% 的真实数据行中为空) —— log_id 才是实现可追溯性的真正键值。没有模拟数据；所有字段均可溯源至 public.ldi_data / public.ldi_alarm_log / public.v_ldi_machine_latest_full。"
}
```

注意：步骤 1 仅完整显示了目标 A；对于 B–J，重复完全相同的形状，替换从任务 4 步骤 3 中获得的其余 9 个真实的字面量 `eqp_id`，而对于 K–T，则根据任务 4 步骤 4 的要求，替换每台机器的报警详情查询。

- [ ] **步骤 2：添加 5 个区域标签的背景矩形 —— 真实的区域字符串来源于 `public.devices.location`，验证于 2026-08-17：`Factory 2 - DF INNER`、`Factory 2 - DF OUTER`、`Factory 2 - SM`、`Factory 3 - DF INNER`、`Factory 3 - SM`**

对于每个区域，根据任务 1 中验证的模式添加一个 `rectangle` 元素：采用固定的 (而非绑定到字段的) 背景颜色 `#1E293B` (中性色，不是语义状态颜色之一 —— 这是一个静态分组标签，而不是状态指示)，采用固定边框 `#334155`，以及一个包含区域名称的 `text` 子元素。它们被定位成能在视觉上包围分配给该区域的机器 (在 Factory-2 的每一侧分配 5 台机器：`LDI-01/02/05/06/07/08`... 确切的放置网格坐标是根据任务 1 中获取的真实坐标系统来确定的，不能凭空猜测)。

- [ ] **步骤 3：添加 10 个机器节点元素 —— 每台机器对应一个矩形 (通过任务 1 的实际绑定机制将填充颜色绑定到 `node_state` 字段，使用下面定义的精确颜色代码) + 一个文本元素 (绑定到 `eqp_id`+`mo`) + 一个文本元素 (绑定到 `board_no`/`total_board`)，将它们定位在步骤 2 中其对应真实区域的矩形内**

颜色代码表 (匹配 `GRAFANA_DESIGN_SYSTEM.md` §2.1，与安灯 (Andon) 完全相同)：

| `node_state` | 颜色 (Color)     | 含义 (Meaning) |
| ------------ | --------- | ------- |
| 0            | `#64748B` | 无数据 (NO_DATA) |
| 1            | `#F59E0B` | 空闲 (IDLE)    |
| 2            | `#22C55E` | 正常 (OK)      |
| 3            | `#EF4444` | 报警 (ALARM)   |

- [ ] **步骤 4：验证 JSON**

```bash
python3 -c "import json; json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8')); print('valid json')"
```

- [ ] **步骤 5：提交 (Commit)**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): add Factory Digital Twin canvas with 5 zones and 10 machine nodes"
```

---

## 任务 6：每个节点的下钻 (Drill-down) 链接

**文件：**

- 修改：`monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**接口：**

- 消费 (Consumes)：任务 1 中经过验证的 `links[]` 模式，任务 5 中的 10 个机器节点元素。
- 产生 (Produces)：所有 10 个机器节点的矩形元素，每个元素都有且仅有一个指向机器快照 (Machine Snapshot) 的链接。

- [ ] **步骤 1：向每个机器节点矩形元素添加一个数据链接，其 URL 参数模式应与安灯的 Action Queue 表和制造 (Manufacturing) 仪表板的下钻链接所用的模式完全相同**

```json
{
  "title": "Open Machine Snapshot for LDI-01",
  "url": "/d/ims-ldi-machine-snapshot/set2-machine-snapshot?var-machine_id=LDI-01&var-factory=${factory}&var-mo=${__data.fields.mo}&var-event_time_ms=${__data.fields.log_id}&from=${__from}&to=${__to}",
  "targetBlank": false
}
```

对其他 9 个节点重复此操作，并替换在标题 (title) 和 `var-machine_id` 参数中的字面量 `eqp_id`。

- [ ] **步骤 2：验证 JSON，然后确认所有 10 个节点都恰好有一个链接**

```bash
python3 -c "
import json
d = json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8'))
canvas = next(p for p in d['panels'] if p['id'] == 100)
elements = canvas['options']['root']['elements']
linked = [e for e in elements if e.get('links')]
print('elements with links:', len(linked))
"
```

期望输出：`elements with links: 10`

- [ ] **步骤 3：提交 (Commit)**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): add drill-down links to Factory Digital Twin nodes"
```

---

## 任务 7：工具提示 (Tooltips) (负责人 / 已耗时 / 事件 ID) + 颜色图例

**文件：**

- 修改：`monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**接口：**

- 消费 (Consumes)：任务 4 中报警详细信息查询的字段 (`owner`, `elapsed`)，任务 5 的 `log_id` 字段。
- 产生 (Produces)：每个机器节点的工具提示 (tooltip) 配置都绑定到 `owner`/`elapsed`/`log_id`；画布上的一个静态图例元素。

- [ ] **步骤 1：绑定每个节点的工具提示 (根据任务 1 中经过验证的元素工具提示模式) 以显示 `Owner: {owner}`，`Elapsed: {elapsed}` (必须明确标记为 "Elapsed (已耗时)"，不能是 "SLA" —— 此系统中不存在任何 SLA 目标)，`Event ID: {log_id}` (必须明确标记为 "Event ID"，不能是 "Board ID" —— 真实的 `board_id` 在 100% 的数据行中为空)**

- [ ] **步骤 2：添加一个静态的文本/图例元素，列出 4 种状态的颜色及其名称 (NO_DATA/IDLE/OK/ALARM)，该元素应使用任务 5 中的颜色代码表里的精确十六进制值 —— 此举可直接在画布上满足“必须有明确的文件记录每种颜色的语义”的要求，而不仅仅是在 JSON 的 `description` 字段中说明**

- [ ] **步骤 3：验证 JSON**

```bash
python3 -c "import json; json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8')); print('valid json')"
```

- [ ] **步骤 4：提交 (Commit)**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): add tooltips and color legend to Factory Digital Twin"
```

---

## 任务 8：确认 Manufacturing 和 Andon 仪表板文件未被修改

**文件：**

- 未修改任何文件 —— 仅用于验证。

- [ ] **步骤 1：对这两个受保护的文件，与 `origin/main` 进行比较**

```bash
git diff origin/main -- monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json
```

期望输出：空输出 (无差异)。

无需提交 —— 这只是一个用来确认未发生修改的验证步骤。

---

## 任务 9：代码检查 (Lint) 和查询预算验证

**文件：**

- 未修改任何文件 —— 仅用于验证。

- [ ] **步骤 1：运行仪表板代码检查器 (linter)**

```bash
node tests/lint/dashboard-linter.js
```

期望输出：报告 `ims-ldi-factory-digital-twin.json` 有 0 个错误。如果发现存在任何 Token 违规或超过高度上限的错误，请修复它们并重新运行测试 (这与本会话早些时候为 Andon 所使用的修复模式相同：重命名面板以避免触发 linter 的误报，或者调整面板尺寸以满足 kiosk 高度上限的要求 —— 检查 20 网格单位的高度上限检查规则是否适用于该仪表板的 `tags`/命名约定；如果适用，`y:4 + h:16 = 20` 已经精确地满足了它)。

- [ ] **步骤 2：运行查询预算代码检查器 (静态形态检查)**

```bash
node tests/lint/query-budget-linter.js
```

期望输出：对于该文件报告 0 个警告 —— 每一个目标都是 `LIMIT 1` 或是对于被建立索引的 `equipmentid`/`eqp_id` 过滤器的聚合，而并没有包含进行范围扫描的 `time_bucket`。

- [ ] **步骤 3：查询预算冒烟检查 (真实的计时)**

```bash
bash tests/smoke/query-budget-check.sh
```

期望输出：`PASS — all sampled queries within budget` (预期目标是 300 毫秒，硬限制为 2000 毫秒)。

- [ ] **步骤 4：运行文档过度声明代码检查器**

```bash
node tests/lint/doc-overclaim-linter.js
```

期望输出：`DOC OVER-CLAIM CHECK PASSED`。

无需提交 —— 仅用于验证，失败的错误将在引入它们的任务中得到修复，而不是在此处提交。

---

## 任务 10：重新生成仪表板清单 (inventory)

**文件：**

- 修改：`docs/architecture/DASHBOARD_INVENTORY.md` (自动生成，非手工编辑)

- [ ] **步骤 1：重新生成**

```bash
node scripts/generate-dashboard-inventory.js
```

期望输出：`Wrote docs\architecture\DASHBOARD_INVENTORY.md`，为 `ims-ldi-factory-digital-twin` 增加了新行，仪表板总数从 14 变为 15。

- [ ] **步骤 2：验证 CI 的检查模式与之相符**

```bash
node scripts/generate-dashboard-inventory.js --check
```

期望输出：退出码为 0 (exit 0) (即磁盘上的文件与生成器产生的文件内容完全一致)。

- [ ] **步骤 3：提交 (Commit)**

```bash
git add docs/architecture/DASHBOARD_INVENTORY.md
git commit -m "docs: regenerate dashboard inventory for Factory Digital Twin"
```

---

## 任务 11：渲染/屏幕截图验证（基于真实证据，而非基于网格的算术运算）

这使用了在本会话中发现 Andon Board 工具栏高度和 `autofitpanels` 问题时完全相同的方法 —— 仅仅依靠网格单位计算出的结果并不足以作为“页面能够完整显示而无需滚动”的充分证据。

**文件：**

- 未修改任何文件 —— 仅用于验证。

- [ ] **步骤 1：等待基于文件的配置器获取新的仪表板 (轮询间隔为 30 秒，`monitoring/grafana/provisioning/dashboards/dashboards.yml`)**

```bash
sleep 32
```

- [ ] **步骤 2：确认实时仪表板与文件相符**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  "http://localhost:${GRAFANA_PORT:-3000}/api/dashboards/uid/ims-ldi-factory-digital-twin" \
  -o "$SCRATCHPAD/twin_live.json"
python3 -c "
import json
d = json.load(open('$SCRATCHPAD/twin_live.json', encoding='utf-8'))
print('panel count:', len(d['dashboard']['panels']))
"
```

- [ ] **步骤 3：使用实际的生产 kiosk URL 参数进行渲染 (`kiosk=tv&autofitpanels`，分辨率为 1280x720) —— 此参数与 `scripts/create-playlist.sh` 中记录的完全一致**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  "http://localhost:${GRAFANA_PORT:-3000}/render/d/ims-ldi-factory-digital-twin/set2-factory-digital-twin?width=1280&height=720&tz=UTC&kiosk=tv&autofitpanels" \
  -o "$SCRATCHPAD/twin_render.png" \
  -w "HTTP %{http_code}, size %{size_download} bytes\n"
```

期望输出：`HTTP 200`，生成一个真实的 PNG 图像文件（使用 `file` 命令应返回 `PNG image data, 1280 x 720`）。

- [ ] **步骤 4：对渲染出的图像进行视觉检查** —— 查看生成的 PNG 图像。确认：所有 5 个区域的标签都清晰易读，全部 10 个机器节点都在视图中且其状态颜色和标签清晰可读，没有任何节点在视觉上被裁剪/重叠，图例可见，顶部条带中的 4 个数字均可见。如果出现任何元素被截断或无法看清的情况，那代表发现了真正的问题 —— 此时应当回到任务 5 并重新调整元素的放置，而不要假装问题不存在。

无需提交 —— 这一步仅为了搜集证据。

---

## 任务 12：最后进行一次全套件检查

**文件：**

- 未修改任何文件 —— 仅用于验证。

- [ ] **步骤 1：将任务 8–9 的所有检查重新跑一遍，如果存在适用于仪表板的完整测试套件，则需一并运行**

```bash
git diff origin/main -- monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json
node tests/lint/dashboard-linter.js
node tests/lint/query-budget-linter.js
bash tests/smoke/query-budget-check.sh
node tests/lint/doc-overclaim-linter.js
node scripts/generate-dashboard-inventory.js --check
```

期望输出：全部通过，且针对受保护文件的差异检查显示为空。

无需提交 —— 这仅仅是功能完成前的最后一关。

---

## 任务 13：记录未来的 3D 数字孪生迁移路径 (仅修改文档，不涉及代码)

按照用户的明确排序，3D 是下一阶段的任务，而不是本阶段。本任务用来记录到底什么需要发生实质性改变，目的是确保在日后开展 3D 相关工作时，一切都始于真实的限制条件，而不是重新再去发现这些限制。

**文件：**

- 修改：`docs/superpowers/specs/2026-08-17-factory-digital-twin-design.md` (在末尾附加一个部分)

- [ ] **步骤 1：添加一个标题为“Future: 3D Digital Twin migration path (未来：3D 数字孪生迁移路径)”的章节，具体地指出以下内容，但不要凭空编造其计划：**
  - 在目前的 schema 中不存在机器真正的 X/Y/Z 坐标 (在本次会话中已确认 `devices.location` 的值只是 5 个区域标签) —— 一个 3D 数字孪生系统需要事先捕获真实的坐标信息。这可能通过在 `devices` 表中添加新列，或者引入外部配置文件来实现，但无论哪种方式，都将是一项单独的数据建模任务。
  - Grafana 核心并没有支持 3D 渲染的面板类型 (`canvas` 仅支持 2D) —— 若想实现 3D 渲染，需要引入外部 Grafana 插件（这违反了此仪表板“禁止使用外部插件”的约束，需申请特别批准），或者搭建独立于 Grafana 的渲染平台（例如，定制一个读取同一 `timescaledb` 数据源的 web 应用）—— 这是一个架构决策，而非纯粹的 Grafana 仪表板任务。
  - 在任务 1-12 中所构建的一切 (包括 10 台机器的状态模型，报警/生产/合规性查询，以及下钻目标) 都可以直接被复用为 3D 数字孪生的数据层 —— 我们只需更改渲染平面，而原有的真实数据契约无需改变。

- [ ] **步骤 2：提交 (Commit)**

```bash
git add docs/superpowers/specs/2026-08-17-factory-digital-twin-design.md
git commit -m "docs: record 3D Digital Twin migration constraints for future phase"
```

---

## 计划自查备忘录 (Plan self-review notes)

- **规范覆盖率 (Spec coverage)**：用户给出的 24 点列表中的每一个编号项均已映射到对应的任务中 —— 文件结构/配置 (任务 2)、机器状态模型 (任务 4)、重用真实数据的查询 (任务 3/4)、2D 画布架构 (任务 1/5)、5 个区域 (任务 5 步骤 2)、10 台机器 (任务 4/5)、状态机 (任务 4 步骤 1)、生产状态 (任务 5 board_no/total_board 绑定)、报警状态 (任务 4 步骤 4)、生产影响 (任务 3 步骤 3)、合规状态 (任务 3 步骤 4)、MO/board_no/total_board (任务 4/5)、log_id 可追溯性 (任务 4/6/7)、下钻 (任务 6)、C 级别/操作员/工程 UX 界面 (顶部统计条 + 工具提示 + 下钻链，并对照规范的验收条件表进行了交叉检查)、画布性能 (任务 4 之前的预先验证 + 任务 9)、查询预算验证 (任务 9)、渲染验证 (任务 11)、配置 (任务 11 步骤 1)、CI 验证 (任务 9 中提取自 `.github/workflows/ci.yml` 的精确 CI 验证命令)、回滚策略 (任务 8 + 下方的本章节)、3D 迁移路径 (任务 13)。
- **回滚策略 (Rollback strategy)**：自任务 2 起的每一项任务都只是对这唯一的新文件 (`ims-ldi-factory-digital-twin.json`) 以及系统生成的清单文档做添加或编辑。若需要在任何阶段执行回滚，只需对特定的 commit 执行 `git revert`，或者直接将这个新增的仪表板文件删除，然后再重新运行一次 `node scripts/generate-dashboard-inventory.js` 即可。由于制造 (Manufacturing) 和安灯 (Andon) 的文件从未被触及（该原则在每次变更时均由任务 8 的 diff 检查强制执行），因此跨仪表板的影响完全被隔离，不会产生连带的撤销风险。
- **标记了风险，并未将其隐藏 (Risks flagged, not hidden)**：设置任务 1 的目的正是因为 Canvas 面板的元素 JSON schema 目前仅基于官方文档或培训资料，尚未在这个正在运行的确切实例中得到证实。因此，在后续每个任务涉及到的元素 JSON 的地方，都会明确标记该内容需等待在任务 1 中获取到了真实的配置信息后方能校正。
