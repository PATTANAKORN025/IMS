# 💻 User Operations Manual (Grafana User Manual)

Manual for Operators and Maintenance Engineers to use the Dashboard to monitor and analyze the status of YSPhotec machinery.

## 1. NOC Overview (System Overview)
The first window is the Command Center window.
* **Traffic Light Indicators:** Machine status lights
  * 🟢 **Green:** Normal operation
  * 🟡 **Yellow:** Approaching the limit (Warning)
  * 🔴 **Red:** Error or uptime reduced from 99.99%

`[Insert Screenshot Here: NOC Overview Dashboard]`

## 2. Symmetrical Network Graph
The graph is designed in a "butterfly wing" shape to show traffic density at a glance:
* 🟦 **Top graph (blue/purple):** Shows **Download (RX)** values for LAN and Wi-Fi
* 🟧 **Bottom graph (light blue/red):** Shows **Upload (TX)** values (negative values for downward symmetry)
* **Automatic unit adjustment:** The system will automatically set the units. If the data exceeds 1,000 Mbps, the graph will automatically display in Gbps (Gigabit).

## 3. LDI Quality Scatter Plot & Tolerance Box
The graph shows the accuracy of laser alignment (LDI Alignment):
* **X-axis:** Judgment Error (JE)
* **Y-axis:** Position Error (PE)
* 🟥 **Tolerance Box (red frame):** This is the threshold limit of ±10 microns.
* **How to view:** If a "data point" falls outside the red frame, this means the machine is drifting. Prepare to send a technician to calibrate the machine in advance.

`[Insert Screenshot Here: LDI Scatter Plot]`

## 4. Incident Response (Steps upon receiving an alert)
When the AIOps system detects an abnormality, it will send an alert to LINE or Microsoft Teams (with Emoji 🚨, ⚠️). The steps to handle are:

1. **Acknowledge:** Open your phone and check the `Machine_ID` and `Detail` of the problem.
2. **Drill-Down:** Open Grafana and select the machine experiencing the problem in the dropdown menu above.
3. **Analyze:** Review the graph for the past 15-30 minutes regarding that problem (e.g., temperature spike, Wi-Fi drop) to find the root cause. Notify the on-site technician.
