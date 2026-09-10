# IMS API Reference

This document outlines the exposed HTTP endpoints for integrating external machines and services with the IMS platform.

## 1. Telemetry Ingestion API
Accepts time-series data from LDI machines.

**POST** `/ldi-telemetry`
- **Host**: `node-red-internal:1880` (or reverse proxy)
- **Headers**:
  - `Content-Type: application/json`
  - `X-API-Key: <SECRET>`
- **Body**: See [Telemetry Ontology](../data/TELEMETRY_ONTOLOGY.md).
- **Responses**:
  - `202 Accepted`: Payload queued for processing.
  - `400 Bad Request`: Invalid JSON schema.
  - `401 Unauthorized`: Missing or invalid API key.

## 2. Alarm Webhook API
Accepts external alarm triggers to route through Alertmanager.

**POST** `/alert-webhook`
- **Host**: `alertmanager:9093`
- **Body**: Standard Prometheus Alertmanager webhook payload.
- **Responses**:
  - `200 OK`: Alert received and routed.

## 3. General Metric Ingestion
Accepts generic metrics for non-LDI equipment.

**POST** `/inject`
**POST** `/metrics`
- **Host**: `node-red-internal:1880`
- **Body**: JSON key-value pairs of telemetry.
