# 🏭 APEX Circuit - Real-Time LDI & Machinery Monitoring System

![Status](https://img.shields.io/badge/Status-Production%20Ready-success)
![Scale](https://img.shields.io/badge/Scale-1000%2B%20Nodes-blue)
![License](https://img.shields.io/badge/License-Proprietary-red)

## 📌 Project Overview
**APEX Circuit IMS (Industrial Monitoring System)** is a system for monitoring and alerting the status of printed circuit board manufacturing machinery (PCB), specifically for **YSPhotec / LDI (Laser Direct Imaging)** machines. This system is designed to retrieve data in seconds via the **Out-of-Band SNMP** protocol, which is a read-only data retrieval, ensuring **100% security and zero operational interference**. The architecture is designed to be scalable (Scalability) for seamless monitoring of over 1,000 machines simultaneously.

## ✨ Key Features (Enterprise Level)
* 🚀 **Dual-Engine SNMP Walker:** Automatically switches between `GET` mode (for Development/Mock) and `SUBTREE Bulk Walk` (for Production), retrieving massive amounts of data in milliseconds.
* 🛡️ **Zero-Data Loss Architecture:** Node-RED Batch Buffer mechanism working with PgBouncer prevents data loss even if the Database Server is interrupted or restarted.
* 🧠 **True AIOps Alerting:** Abandoning static threshold alerts, using **Z-Score (3-Sigma)** statistics to detect data anomalies proactively before machine failure.
* 🧪 **K6 Chaos Tested:** Passed K6 Load Testing at 1,000 Concurrent VUs (Virtual Users), proving stability under extreme stress conditions.

## 🏗️ Architecture Stack
The system operates through 4 main layers (Edge -> Ingestion -> Storage -> Visualization):

```text
[ YSPhotec LDI Machines / SNMPSim ] --(SNMP v2c/v3)-->
        |
        v
[ Node-RED (Dual-Engine Walker + Bulletproof Parser) ] --(Batch INSERT)-->
        |
        v
[ PgBouncer (Connection Pooler) ] ----> [ TimescaleDB (Hypertable & Caggs) ]
        |
        v
[ Grafana (Symmetrical Dashboards) ] <---- [ Prometheus & Alertmanager ]
        |
        v
[ Webhook Alerts (LINE / MS Teams) ]
```

## ⚙️ CI/CD Pipeline
This project is quality controlled with GitHub Actions for every code push:
- **Syntax Check:** Verify the correctness of docker-compose.yaml and Dashboard JSON.
- **Linting:** Check the integrity of Prometheus Rules (`promtool check rules`).
- **Security Scan:** Detect leaked Secret Keys with Trivy Security Scan.

## 🚀 Getting Started
Start the system on the server with the following commands:

```bash
# 1. Clone repository
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# 2. Set Environment Variables (Create a .env file from .env.example)
cp .env.example .env
nano .env  # Enter Database password and various configurations

# 3. Start all services in Background mode
docker-compose up -d

# 4. Check the running status
docker-compose ps
```
