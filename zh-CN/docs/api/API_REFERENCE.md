# IMS API 参考手册

本文档概述了用于将外部机器和服务与 IMS 平台集成的 HTTP 端点。

## 1. 遥测数据接入 API
接收来自 LDI 机器的时间序列数据。

**POST** `/ldi-telemetry`
- **主机**: `node-red-internal:1880` (或反向代理)
- **标头 (Headers)**:
  - `Content-Type: application/json`
  - `X-API-Key: <SECRET>`
- **主体 (Body)**: 请参见 [遥测数据字典](../data/TELEMETRY_ONTOLOGY.md)。
- **响应 (Responses)**:
  - `202 Accepted`: 有效载荷已排队等待处理。
  - `400 Bad Request`: 无效的 JSON 架构。
  - `401 Unauthorized`: 缺少或无效的 API 密钥。

## 2. 警报 Webhook API
接收外部警报触发器，以通过 Alertmanager 路由。

**POST** `/alert-webhook`
- **主机**: `alertmanager:9093`
- **主体 (Body)**: 标准 Prometheus Alertmanager webhook 有效载荷。
- **响应 (Responses)**:
  - `200 OK`: 已接收并路由警报。

## 3. 通用指标接入
接收非 LDI 设备的通用指标。

**POST** `/inject`
**POST** `/metrics`
- **主机**: `node-red-internal:1880`
- **主体 (Body)**: 遥测数据的 JSON 键值对。
