# 🏭 IMS Operator Standard Operating Procedure (SOP)

> **Role:** LDI Factory Floor Operator / NOC Level 1 Support
> **Objective:** Daily operation, monitoring, and first-line response using the IMS Grafana HUD.

---

## 1. 🌅 Beginning of Shift (08:00 / 20:00)

### 1.1 Shift Handover Checklist
1. **Login:** Open the [IMS NOC Overview](http://localhost:3000/d/ims-noc-overview) dashboard on the primary wall display.
2. **Health Check:** Look at the **Fleet Health Score** (Top Left).
   - `> 95%`: 🟢 Nominal. Proceed with normal duties.
   - `90% - 94%`: 🟡 Warning. Check the "Top 10 Critical Nodes" panel.
   - `< 90%`: 🔴 Critical. Escalate immediately to Level 2 (SRE/Engineering).
3. **Verify LDI Fleet:** Open the [LDI Manufacturing](http://localhost:3000/d/ims-ldi-manufacturing) dashboard. Ensure no machines are currently marked "OFFLINE" in red.

---

## 2. 🚨 Routine Monitoring & Andon Response

The **Operator Andon Dashboard** is your primary tool. It operates on a strict Traffic Light protocol.

### 🟢 Green State (Normal)
- **Visuals:** All panels are green. No flashing.
- **Action:** No action required. Continue physical machine loading/unloading operations.

### 🟡 Yellow State (Warning)
- **Visuals:** A panel turns yellow (e.g., "Yield Drop Warning", "Temp Rising").
- **Action:** 
  1. Click the yellow panel to open the [LDI Machine Snapshot](http://localhost:3000/d/ims-ldi-machine-snapshot).
  2. Verify the specific metric (e.g., Laser Temp is 42°C, limit is 45°C).
  3. Notify the Line Supervisor via Walkie-Talkie/LINE. Mention the Machine ID.

### 🔴 Red State (Critical / Stop Line)
- **Visuals:** Panel turns red and pulses. Background may flash.
- **Action:**
  1. **STOP THE LINE.** Halt loading PCBs into the affected LDI machine immediately.
  2. Press the physical Emergency Stop if there is a safety risk.
  3. Announce "LDI-[Machine-ID] DOWN" in the Operations LINE Group.
  4. Refer to the [ALARM PLAYBOOK](ALARM_PLAYBOOK.md) for the specific error code displayed on the screen.

---

## 3. 🔍 How to Find Specific Information

### Q: "A supervisor wants to know why Machine LDI-05 is slow."
1. Open the [Engineering Drill-Down](http://localhost:3000/d/ims-engineering-drilldown) dashboard.
2. In the top-left dropdown (Variable), select `LDI-05`.
3. Check the **CPU / RAM / Yield** timeseries panels for sudden drops (Z-Score anomalies).

### Q: "Is the monitoring system itself broken?"
1. Open the [Meta-Monitoring](http://localhost:3000/d/ims-meta-monitoring) dashboard.
2. Check the **Node-RED Ingestion Rate**. If it is exactly `0 rows/sec` for more than 1 minute, the monitoring pipeline is down. Call IT/DevOps.

---

## 4. 🌙 End of Shift (19:30 / 07:30)

### 4.1 Daily Reporting
1. Open the [Capacity Planning](http://localhost:3000/d/ims-capacity-planning) dashboard.
2. Note any machines showing **"Days Until Full < 7"**.
3. Record the Average Fleet Health Score for the shift in the shift-log book.
4. Pass on any persistent Yellow/Warning states to the incoming shift operator.

---
*Version: 1.0.0 | Last Updated: 2026-08-10*
