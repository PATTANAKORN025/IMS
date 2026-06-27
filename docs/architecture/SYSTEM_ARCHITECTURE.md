# 🏛️ System Architecture (Enterprise Blueprint)

This document describes the in-depth structure of the **APEX Circuit Real-Time Monitoring** system, designed for Senior Engineers and SREs (Site Reliability Engineers) to understand and further develop.

## 1. System Topology (4 Layers)
The system architecture is clearly divided into 4 layers for ease of scaling and maintenance:
* **Edge/OT Layer:** Equipment (YSPhotec LDI), Ethernet/Wi-Fi network. Supports SNMP v2c/v3 protocols.
* **Ingestion Layer (Node-RED):** Acts as a data gateway, retrieving data every 10 seconds via a dual-engine SNMP walker, cleansing and formatting the raw data.
* **Storage Layer (TimescaleDB + PgBouncer):** A high-performance time-series database with PgBouncer controlling connection limits to prevent the database from crashing when there are hundreds of thousands of requests.
* **Visualization & AIOps Layer (Grafana + Prometheus):** Displays graphics and analyzes data using statistical mathematics to detect anomalies.

## 2. The "Bulletproof" Node-RED Parser
The heart of the Ingestion Layer is the `sre_parser` function, designed to solve all types of bottlenecks and errors:
* **Two-Pass Parsing:** Loops through data the first time to map interface names and the second time to match metrics, preventing race conditions where data arrives at different times.
* **Smart Counter Wrap:** Supports both 32-bit (+4294967296) and 64-bit (+18446744073709551616) data overflow, preventing negative bandwidth graphs or jumps to Tbps levels.
* **Memory Cleanup:** Clears variables (`msg.payload = null`) immediately after data structure transformation, quickly reclaiming space for Node.js' Garbage Collector, preventing memory leaks.
* **Batch INSERT Mechanism:** Collects data in RAM (Array) and flushes the database when `BATCH_THRESHOLD = 50` rows are reached, reducing database transaction overhead by over 98%.

## 3. Database Schema Design (TimescaleDB)
Data is stored in a Hypertable format named `machine_telemetry` consisting of 28 columns covering:
* **Core Metrics:** CPU, RAM, Disk
* **Network Metrics:** Rx/Tx Bytes, Errors, Drops, Wi-Fi RSSI (dBm), Wi-Fi SNR (dB)
* **LDI Specific Metrics (.1.3.6.1.4.1.9999.x.x):** Throughput, PE (Position Error), JE (Judgment Error), Temperature, Humidity, Power, Vibration
* **Continuous Aggregates (caggs):** Automatically generates a summary view every 1 minute (`telemetry_minute_summary`) and 1 hour, allowing Grafana to load 30 days of historical data in less than 2 seconds.

## 4. High Availability & Chaos Tolerance
The system is designed under the concept of "Expect Failure":
* **Chaos Tested:** Passed K6 Load Test at **1,000 VUs**.
* **Zero Data Loss:** Chaos engineering was performed by suddenly shutting down the `pgbouncer` container (Simulated Outage). Node-RED was able to retain the data in a Batch Array and immediately backfill the database when it returned to normal operation.
