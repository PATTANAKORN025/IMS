---
name: node-red-pipeline-engineering
description: Industrial-grade Node-RED pipeline engineering. Use when modifying flow files, parsing telemetry, or handling high-throughput ingestion pipelines.
---

# Node-RED Pipeline Engineering

## Overview
High-performance Javascript engineering for Node-RED flows. Merges concepts of strict memory management (V8 engine) and functional safety for IoT data streams.

## Core Directives

1. **Strict O(N) Processing**
   - Telemetry arrays must be processed in a single pass (`O(N)`).
   - Avoid nested loops (`O(N^2)`) when parsing device data. 

2. **Garbage Collection (Memory Leak Prevention)**
   - V8 engine will hold onto large telemetry buffers if not explicitly released.
   - Always nullify payloads at the end of heavy function nodes: `msg.payload = null;`
   - Truncate processing arrays: `flatData.length = 0;`

3. **Stateless Operations**
   - Node-RED function nodes should be pure functions where possible.
   - For state, use `global.get('cache')` sparingly.
   - `require()` is sandboxed. Use `global.get('snmp')`, `global.get('pg')`, etc.

4. **Deep Cloning**
   - Do NOT use `msg.payload = msg.payload` directly if mutating. 
   - `structuredClone` is unavailable in this Node-RED sandbox version.
   - Use `JSON.parse(JSON.stringify(obj))` for deep copies to prevent reference contamination across parallel wires.
