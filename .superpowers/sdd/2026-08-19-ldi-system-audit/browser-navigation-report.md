# Navigation / Variables / Digital Twin Audit — Batch 4

## Variable multi-value URL propagation — PASS

Set `var-machine_id=LDI-03&var-machine_id=LDI-04` directly on the Andon Board URL. Grafana's own URL after settling: `?var-machine_id=LDI-03&var-machine_id=LDI-04&orgId=1&...` — correct repeated-key format, not the broken `{LDI-03,LDI-04}` form the brief explicitly warned about. **PASS**, live-confirmed on `machine_id`. Not independently re-tested on every other variable across all 15 dashboards this pass (`factory`, `mo`, `process`, `fpn`, `layer`, `interface`) — same underlying Grafana templating mechanism, low risk of per-variable divergence, but marking those **NOT VERIFIED individually** rather than assuming.

## 2D Digital Twin click-to-drill — CONFIRMED BROKEN

See `full-reaudit-report.md` FINDING-04. Full write-up there; not repeated here.

## 3D Digital Twin — independent audit

- Reachable at `http://localhost:3000/factory-twin-3d/`, correctly auth-gated on the Grafana session (loads without a separate login — proxy `auth_request` pattern confirmed working).
- WebGL canvas renders (647×842 in the tested viewport).
- Live data confirmed: page body correctly shows "23 machines · 1 in ALARM" — a real, current count from the DB, with an honest in-app disclosure "SIMULATED LAYOUT — machine positions are placeholders, not real surveyed coordinates" (transparent about its own limitation, not a defect).
- **FINDING-05 (MEDIUM) — stale deployed title, root cause fully proven, not fixed in the running environment.** Browser tab / `<title>` shows "IMS Factory 3D Digital Twin — 10 Machines" (hardcoded stale count), while the page body correctly shows "23 machines." Root cause: git commit `5d78d69` ("fix(twin3d): drop stale device-count title", 2026-08-21 10:32:44 +0700) already fixed this in source — current `services/factory-twin-3d/public/index.html` has no machine count in its `<title>` at all. But the running `ims-factory-twin-3d` container was built 2026-08-20T09:16:38Z, a full day **before** the fix commit, and was never rebuilt/redeployed since. The live production service is serving stale, pre-fix HTML. This is a deployment/redeploy gap, not a code defect — the fix exists and is correct in git, it just was never shipped to the running environment.
  - **Impact:** cosmetic only (browser tab title), does not affect the twin's actual data or function.
  - **Confidence:** HIGH — root cause fully proven via direct comparison of git commit timestamp vs. container `Created` timestamp, not inferred.
  - **Broader implication worth flagging:** if one service can silently run a day-stale image after a merged fix, others might too. Spot-checked `ims-alarm-api`: built 2026-08-21T03:49:13Z, latest commit touching that service at 2026-08-21 10:51:17+0700 (03:51:17 UTC) — only ~2 minutes after the build, effectively negligible, not flagged as a separate finding. No other services spot-checked this pass; a full image-freshness audit across all containers is **NOT VERIFIED**.
  - Not fixed (audit-only rule) — would require a container rebuild/redeploy, out of scope for this pass.

## Not covered this batch (NOT VERIFIED)

- Full link-type-by-link-type click matrix across all 15 dashboards (only the 2D twin and Andon-URL variable propagation were live-tested).
- Alarm ack/resolve → audit-trail live exercise (would require finding or synthesizing a real open alarm and performing a write action — deferred; the brief's Rule 0 forbids fixing but exercising an ack/resolve UI action is a legitimate read-adjacent operator workflow test, not a "fix," but was not reached this pass due to time).
