<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS Onboarding: Video Walkthrough & GIF Script

> **Objective:** This document serves as the storyboard and script for creating the official IMS Video Walkthrough and UI GIFs. Since the UI is a Cyberpunk HUD, motion and animation are key selling points.

---

## Tooling Recommendations

To record the onboarding assets, use the following tools:

1. **Screen Recording (Video):** OBS Studio (1080p, 60fps) for smooth Grafana animations.
2. **GIF Capture:** [Kap](https://getkap.co/) (macOS) or ScreenToGif (Windows). Export at 24fps for smooth UI transitions.
3. **Browser State:** Run Chrome in Kiosk mode `http://localhost:3000/d/ims-noc-overview?kiosk=tv` to hide the URL bar and OS chrome.

---

## Scene 1: The NOC Overview (The "Wow" Factor)

**Asset Type:** 15-second loopable GIF (`hero-noc.gif`)
**Target Location:** Top of `README.md` (replacing the static banner if desired).

**Action Script:**

1. Open [NOC Overview](http://localhost:3000/d/ims-noc-overview).
2. Set the Grafana auto-refresh to `5s` so charts actively move during the recording.
3. Hover your mouse smoothly over the **Fleet Health Score** gauge to trigger the tooltip.
4. Pan the mouse down to the **Top 10 Critical Nodes** list as it re-sorts dynamically.
5. Stop recording.

---

## Scene 2: The Drill-Down Workflow (Troubleshooting)

**Asset Type:** 45-second Video with Voiceover / Text overlays (`drilldown-tutorial.mp4`).
**Target Location:** `docs/product/ONBOARDING.md`

**Action Script:**

1. Start on the NOC Overview. Notice a red anomaly on the **Network Bandwidth** chart.
2. **Click** the anomaly. (This triggers a Grafana Data Link).
3. The screen transitions smoothly to the **Engineering Drill-Down** dashboard.
4. Open the top-left `$machine_id` dropdown and type `SRV-901`.
5. The entire dashboard re-renders rapidly (powered by TimescaleDB CAGGs).
6. Hover over the **Z-Score Anomaly** chart showing the exact moment the CPU spiked.
7. End scene.

---

## Scene 3: Predictive Capacity Planning (AIOps)

**Asset Type:** 10-second GIF (`predictive-aiops.gif`).
**Target Location:** Features section of `README.md`.

**Action Script:**

1. Open [Capacity Planning](http://localhost:3000/d/ims-capacity).
2. Focus the recording box strictly on the **Days Until Full** gauge and the **Linear Regression Forecast** graph.
3. Hover over the intersection point where the trend line hits 100%. The tooltip should clearly say "Estimated Full Date: Oct 12, 2026".

---

## Scene 4: Operator Andon Board (Factory Floor)

**Asset Type:** 5-second GIF (`andon-board.gif`).
**Target Location:** `SOP_OPERATOR.md`

**Action Script:**

1. Open [LDI Operator Andon](http://localhost:3000/d/ims-ldi-operator-andon).
2. Use the database script `make test-load` to inject a simulated error.
3. Record the exact moment the dashboard flashes from Green to Red.
4. This demonstrates the ultra-low latency (< 2s) of the Node-RED ingestion pipeline.
