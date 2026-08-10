# 📖 IMS Alarm Playbook & Troubleshooting Guide

> **Objective:** First-responder resolution steps for all standardized IMS Alarm Codes. 
> Map the code from Alertmanager / Grafana directly to this document.

---

## 💻 System Alarms (SYS)

### `SYS-001` : High CPU Utilization
*   **Trigger:** CPU usage > 90% for 5 minutes.
*   **Severity:** 🟡 Warning
*   **Investigation:**
    1. Open [Engineering Drill-Down](http://localhost:3000/d/ims-engineering-drilldown).
    2. Check the **CPU Steal Time** metric. If Steal Time is high, the hypervisor (VMware/Proxmox) is overloaded, not the guest VM.
*   **Resolution:** SSH into the machine, run `top -c`, and identify the heavy process. Restart if it's a memory-leaking zombie process.

### `SYS-005` : Disk Nearing Capacity
*   **Trigger:** Disk usage > 85% OR Days Until Full < 7.
*   **Severity:** 🔴 Critical
*   **Investigation:**
    1. Open [Capacity Planning](http://localhost:3000/d/ims-capacity-planning).
    2. Check the Linear Regression slope. Is the spike sudden (log spam) or gradual (natural growth)?
*   **Resolution:** Clear `/var/log/`, `docker system prune`, or extend the LVM volume.

---

## 🌐 Network Alarms (NET)

### `NET-002` : High Interface Drop Rate
*   **Trigger:** Packet drops > 1% of total traffic.
*   **Severity:** 🟡 Warning
*   **Investigation:**
    1. Check if the switch port is half-duplex.
    2. Correlate with CPU spikes on the switch (control plane policing).
*   **Resolution:** Check physical cabling (SFP+ optics) or adjust QoS queues on the Juniper switch.

### `NET-010` : Node Offline (Ping/SNMP Timeout)
*   **Trigger:** Circuit Breaker trips after 2 failed SNMP walks.
*   **Severity:** 🔴 Critical
*   **Investigation:**
    1. Ping the IP directly.
    2. Open [Meta-Monitoring](http://localhost:3000/d/ims-meta-monitoring) and verify if the Circuit Breaker is in `OPEN` or `HALF_OPEN` state.
*   **Resolution:** Check physical power to the node. If the node is alive but SNMP fails, verify the SNMP service (`systemctl status snmpd`).

---

## 🏭 Manufacturing Alarms (LDI)

### `LDI-001` : Target Yield Deviation (Anomaly)
*   **Trigger:** Z-Score deviation > 3σ from the 24-hour baseline.
*   **Severity:** 🔴 Critical (Line Stop)
*   **Investigation:**
    1. Open [LDI Engineering Analytics](http://localhost:3000/d/ims-ldi-engineering-analytics).
    2. Check correlation matrices. Did the laser temperature spike at the exact moment the yield dropped?
*   **Resolution:** Operator must halt the physical machine. Engineering must recalibrate the laser optics.

### `LDI-005` : Stale Telemetry
*   **Trigger:** No data points received for a specific `eqp_id` in 60 seconds.
*   **Severity:** 🟡 Warning
*   **Investigation:**
    1. Open [Data Readiness](http://localhost:3000/d/ldi-data-readiness).
    2. Verify if it's a single machine issue or if the entire parser fleet is down.
*   **Resolution:** Check the machine's local agent. If the machine was intentionally shut down for maintenance, acknowledge and silence the alert in Alertmanager.

---

## ⚙️ IMS Internal Alarms (META)

### `META-001` : PgBouncer Pool Exhaustion
*   **Trigger:** Active connections hit the pool limit.
*   **Severity:** 🔴 Critical
*   **Investigation:**
    1. Check Node-RED logs for `timeout` errors during INSERTs.
*   **Resolution:** Temporarily scale `pool_size` in `pgbouncer.ini` and run `make restart`. Investigate slow queries locking the database.

---
*Version: 1.0.0 | Maintainer: SRE Team*
