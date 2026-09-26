# FT-24 — Executive Command Center (Factory Twin)

A single, prominent, modal view over the existing SPC/predictive/decision
contracts. **No new statistics, no new query shape beyond what Phase 3
required, no competing Cpk/EWMA/CUSUM/Nelson logic.** Reuses:
`/api/predictive/executive-summary` (FT-23), the fleet-scan math in
`runFleetRiskScan` (FT-22/23, only extended with two already-real display
fields), and the existing device-history/SPC panel (FT-17/21/22/23) for
every bit of action continuity.

## Why a modal, not a bigger panel

The objective's own instruction — "decision compression, not dashboard
density," a senior user must understand the picture "within seconds" —
called for something more prominent than another collapsed `<details>`
row three levels deep in the drawer (FT-23's own `#exec-summary-panel`,
which still exists and is unchanged). A native `<dialog>` (`showModal()`)
gives real top-layer stacking, a built-in focus trap, and Escape/backdrop
dismissal the browser itself enforces — not a hand-rolled overlay this
codebase would have to get right on its own.

## Phase 1 — information architecture

Rendered top to bottom, in this order, with **decreasing visual weight**
(Phase 1's own "primary signals must dominate"):

1. **PLANT STATE** — a one-line pill row, reusing `lastStateRows` (the
   existing `/api/state` poll — no new fetch) and the SAME
   `STATUS_ORDER`/`statusForMachineState`/`OPERATIONAL_STATUS` vocabulary
   the topbar's own `#status-strip` already renders from. No new status
   words.
2. **RISK PRIORITY** — the single top risk, rendered as the visually
   dominant `.cc-top-risk` block (19px device name, a full-size risk
   badge) — everything else in the dialog is deliberately smaller.
3. **CAPABILITY / TREND** — the fleet's `capability_direction` counts
   (declining/improving/stable/unknown), one compact line.
4. **EVIDENCE** — the top risk's own `evidence` array, shown as a bullet
   list directly under it (never hidden behind another click).
5. **ACTION** — an "Inspect →" button per risk card.

## Phase 2 — no duplicated calculation

Every number in the dialog traces to an existing contract:

- Plant state: `lastStateRows` (existing `/api/state` poll).
- Risk/trend/evidence: `/api/predictive/executive-summary` (FT-23,
  unchanged shape, two fields added — see Phase 3 below).
- Action: hands off to `selectDeviceForHistory()` + the existing SPC panel
  (`renderSpc()`, FT-21/22/23) — the SAME Machine Snapshot link
  (`telemetry.buildDrillDownUrl`) and the SAME alarm correlation
  (`queryAlarmHistory`) already built and verified in FT-23. Command
  Center itself contains zero drill-down/URL-building code.

## Phase 3 — risk presentation, extended fields

`runFleetRiskScan`'s ranking entries (consumed by both
`/api/predictive/risk-ranking` and `/api/predictive/executive-summary`)
gained four real, already-derivable fields so the Command Center's risk
cards can show "machine / process / sample quality / next action" without
a second per-risk fetch:

- `factory`, `process` — the device's most recent factory/process, from a
  new, separate, deliberately tiny query (see Phase 8 below — the FIRST
  attempt put these on every row of the main scan and that was a real,
  measured performance regression, reverted).
- `sample_quality` — `cpk.quality`, already computed.
- `next_action` — `predictive.buildNextActionText(cpk.state, risk.level)`,
  a new small helper (see below), not a new recommendation engine.
- `mixed_baseline_detected` — `mixedBaseline.heterogeneity_detected`,
  already computed.

### A real inconsistency found and fixed: `buildNextActionText`

`OCAP_NEXT_ACTION` is keyed on Cpk state alone. A device with a `CAPABLE`
Cpk but an elevated `risk.level` (from a declining trajectory, sustained
drift, or a mixed-baseline flag — none of which `OCAP_NEXT_ACTION` knows
about) rendered "No action needed" directly next to a `MEDIUM`/`HIGH` risk
badge — a real, visible contradiction, found on real production data
(LDI-04/JE) during this phase's own testing. Fixed with
`predictive.buildNextActionText(cpkState, riskLevel)`: still the exact
same OCAP text, with one real, disclosed qualifier appended only when
`cpkState === CAPABLE && riskLevel !== NONE`:

> "No action needed -- process is within capability. Risk is elevated by
> trajectory/drift/mixed-baseline evidence above, not by Cpk itself --
> review that evidence before treating 'no action' as final."

No new recommendation is invented — the qualifier only ever points back to
evidence already shown in the same response. Both `buildDecisionSummary`
(FT-23's per-device panel) and `runFleetRiskScan` (Command Center) now call
this one function — a single authoritative source, not two next-action
texts that could disagree.

## Phase 4 — mixed baseline, never read as equipment failure

The Command Center's compact risk cards never expand the full
why/window/safe-interpretation text (that stays FT-23's own detailed
banner, reached via Inspect) — they only ever show a single, careful line:

> "Mixed baseline suspected (not necessarily equipment failure) -- see
> Inspect for full detail."

This is deliberate compression, not suppression: the underlying Nelson/Cpk
signals are never hidden (they are already in `evidence`), and clicking
Inspect reaches the exact same, unmodified FT-23 banner with the full
explanation.

## Phase 5 — action continuity

"Inspect" calls `selectDeviceForHistory(deviceId, { renderSpcAfter: false })`
then opens `#spc-panel` — the SAME code path FT-17/21/22/23 already built
and verified, so `machine_id`/`factory`/`process`/`timestamp`/`log_id`/
`from`/`to` are preserved exactly as `DECISION_UX_SPEC.md` already
documents; Command Center adds no second implementation of any of it.

### A real over-fetch bug found and fixed

The first Inspect implementation fired **3** `/api/predictive` requests
per click: setting `spcPanelEl.open = true` before `selectDeviceForHistory`
fired one render (with the WRONG device, since it ran before the device
was set); `selectDeviceForHistory`'s own already-open check fired a
second; an explicit trailing `renderSpc()` call fired a third. Fixed by
(1) setting device/metric first, (2) `renderSpcAfter: false` on that call
so it never renders on its own, and (3) one transition-aware branch that
renders exactly once regardless of whether the panel was already open
(`.open` only fires a native `toggle` event on an actual false→true
transition, so the two cases need different handling, not the same code
path). Re-verified via real Playwright request-count instrumentation: 1
`/api/predictive` request per Inspect click, all 4 viewports.

## Files

- `services/factory-twin-3d/lib/predictive.js` — `buildNextActionText`.
- `services/factory-twin-3d/server.js` — `runFleetRiskScan` extended
  (factory/process/sample_quality/next_action/mixed_baseline_detected),
  its own small `DISTINCT ON` query for factory/process.
- `services/factory-twin-3d/public/index.html`/`app.js` — the
  `<dialog id="command-center-dialog">`, its topbar button, and
  `selectDeviceForHistory`'s extraction/`renderSpcAfter` parameter.
- `tests/unit/factory-twin-predictive.test.js` — 4 new tests (43 total).
