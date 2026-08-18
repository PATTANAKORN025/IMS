<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS Operator Standard Operating Procedure (SOP)

> **Audience:** Factory Floor Operators, NOC Level 1 Support.
> **Objective:** Daily operation, monitoring, and first-line response using the IMS Grafana HUD.
> **Provenance:** Validated against live production workflows on 2026-08-10.

---

## 1. Shift Handover & Initialization (08:00 / 20:00)

### 1.1 Pre-Flight Checklist

Before accepting the shift, the incoming operator must verify the baseline health of the platform:

1. **Login & Authenticate:** Open the [IMS NOC Overview](http://localhost:3000/d/ims-noc-overview) dashboard on the primary wall display.
2. **Verify Fleet Health Score** (Top Left panel):
   - `> 95%`: ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) **Nominal**. Accept shift.
   - `90% - 94%`: ![Warning](https://img.shields.io/badge/Status-Warning-yellow) **Warning**. Check the "Top 10 Critical Nodes" panel. Request verbal briefing from outgoing shift regarding these nodes.
   - `< 90%`: ![Critical](https://img.shields.io/badge/Status-Critical-red) **Critical**. Do not accept shift without L2 (Engineering) presence. Escalate immediately.
3. **Verify LDI Fleet Status:** Open the [LDI Manufacturing](http://localhost:3000/d/ims-ldi-manufacturing) dashboard. Ensure no machines are unexpectedly marked "OFFLINE" in red.

---

## 2. Routine Monitoring & Andon Response

The **Operator Andon Dashboard** operates on a strict Traffic Light protocol. Do not attempt to debug algorithms; react to the colors.

### ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) Green State (Nominal Operation)

- **Visuals:** All panels are green. No flashing.
- **Action:** Continue standard PCB loading/unloading operations. Maintain situational awareness.

### ![Warning](https://img.shields.io/badge/Status-Warning-yellow) Yellow State (Pre-emptive Warning)

- **Visuals:** A panel turns yellow (e.g., "Yield Drop Warning", "Temp Rising").
- **Action Workflow:**
  1. Click the yellow panel to immediately jump to the [LDI Machine Snapshot](http://localhost:3000/d/ims-ldi-machine-snapshot).
  2. Identify the specific metric excursion (e.g., "Laser Temp is 42°C, approaching 45°C limit").
  3. **Communication Script:** Notify the Line Supervisor via Walkie-Talkie or the designated Operations LINE Group:
     > _"Warning: Machine LDI-[ID] is showing [Metric] at [Value]. Monitoring closely."_

### ![Critical](https://img.shields.io/badge/Status-Critical-red) Red State (Critical Excursion / Stop Line)

- **Visuals:** Panel turns red and pulses. Background may flash.
- **Action Workflow:**
  1. **STOP THE LINE.** Halt loading PCBs into the affected LDI machine immediately.
  2. **Safety First:** Press the physical Emergency Stop (E-Stop) if there is any immediate safety or severe equipment damage risk.
  3. **Communication Script:** Announce immediately in the Operations LINE Group:
     > _"CRITICAL: LDI-[Machine-ID] DOWN. Error: [Metric/Alarm Code]. Line stopped."_
  4. Refer to the [ALARM PLAYBOOK](ALARM_PLAYBOOK.md) for the specific fault code displayed on the console.

---

## 3. Escalation Matrix (Time-To-Escalate SLAs)

When an issue occurs, adhere strictly to these Time-To-Escalate (TTE) limits. Do not attempt to "hero debug" beyond your authorized time window.

| Event Type                      | Initial Response (L1 Operator) | TTE to L2 (Line Supervisor) | TTE to L3 (SRE / Plant Engineer) |
| :------------------------------ | :----------------------------- | :-------------------------- | :------------------------------- |
| **Single Machine Yellow**       | Monitor & Document             | 15 Minutes                  | 60 Minutes (if unresolved)       |
| **Single Machine Red**          | Stop Line & Log Alarm          | Immediate (0 Min)           | 15 Minutes                       |
| **Multiple Machines Red**       | Stop Affected Lines            | Immediate (0 Min)           | Immediate (0 Min)                |
| **IMS HUD Unresponsive**        | Refresh Browser                | 5 Minutes                   | 15 Minutes                       |
| **Node-RED Ingestion 0 rows/s** | Ping IT                        | Immediate (0 Min)           | Immediate (0 Min)                |

---

## 4. End of Incident Recovery Checklist

When Engineering resolves a Red State, the Operator must formally clear the machine for production:

1. **Verify Dashboard:** Confirm the specific LDI machine panel on the Andon board has returned to Green.
2. **Acknowledge Resolution:** Open the `IMS LDI - Alarm Console` and mark the alarm as "Resolved".
3. **Communication Script:** Announce in the Operations LINE Group:
   > _"RECOVERY: LDI-[Machine-ID] cleared by [Engineer Name]. Resuming production."_
4. **Resume Loading:** Restart the standard loading sequence.

---

## 5. End of Shift (19:30 / 07:30)

### 5.1 Shift Closing Protocol

1. Open the [Capacity Planning](http://localhost:3000/d/ims-capacity) dashboard.
2. Record any machines showing **"Days Until Full < 7"** in the daily shift log.
3. Record the End-of-Shift Average Fleet Health Score.
4. Conduct verbal handover with the incoming operator, explicitly noting any unresolved Yellow states.

---

## Related Documents

- [INCIDENT RESPONSE](INCIDENT_RESPONSE.md) — Major incident procedures.
- [ALARM PLAYBOOK](ALARM_PLAYBOOK.md) — Specific machine error codes.

---

[⬅️ Back to IMS Platform Book](../architecture/IMS_PLATFORM_BOOK.md) | [🏠 Main Repository](../../README.md)
