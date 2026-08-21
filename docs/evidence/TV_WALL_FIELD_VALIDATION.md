<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# TV-Wall Field Validation Report

> **Evidence:** Proof of UI usability and stability when projected on the factory floor TV-Wall setup.

## Validation Parameters

- **Location:** YSPhotec LDI Production Area, Zone A
- **Hardware:** 85-inch 4K LED Display, Mini-PC Client
- **Distance:** 5-10 meters from operator stations
- **Dashboard Tested:** `ims-ldi-operator-andon.json` (LDI Operator Andon)

## Validation Checklist

| Item                         | Status                                                                                            | Notes                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **4K Resolution Scaling**    | <img src="../assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | Grafana panels scale perfectly without pixelation. Texts remain sharp.                                                                         |
| **Contrast & Visibility**    | <img src="../assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | Deep dark theme `#0b0c0e` with neon green `#00FF87` and red `#FF003C` accents is clearly legible from 10 meters under bright factory lighting. |
| **Auto-Refresh Stability**   | <img src="../assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | 30-second refresh loop tested for 48 hours. No memory leaks or browser crashes observed on the Mini-PC.                                        |
| **Colorblind Accessibility** | <img src="../assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | Status states rely on both color and icon (e.g., Triangle for Warning, Cross for Critical) as specified in `GRAFANA_DESIGN_SYSTEM.md`.         |
| **Kiosk Mode**               | <img src="../assets/icons/circle-check.svg" width="16" height="16" align="center" /> PASS | Grafana UI elements (sidebar, time picker) successfully hidden using `&kiosk=tv` URL parameter.                                                |

## Operator Feedback (Excerpt)

> "The alarm numbers are big enough to see from across the room. The color flashing when Cpk drops makes it impossible to miss." — Shift Supervisor (Zone A)

## Conclusion

The Grafana visualization layer meets all ergonomic and technical requirements for factory floor deployment. The UI does not require any additional CSS overrides for 4K TV usage.
