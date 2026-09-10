# FT-18 — UX Audit (Factory Twin)

Scoped to `/factory-twin-3d/` — the one surface this phase remediates.
Grafana surfaces are inventoried (`UX_SURFACE_INVENTORY.md`) but not
re-audited from zero here; see that doc for why.

Apple-class principles (Clarity/Deference/Depth), translated for an
industrial operations surface: **Situation** (what's happening),
**Priority** (what matters most right now), **Evidence** (how do I know),
**Action** (what do I do next).

## Findings

### P1-1 — Status strip cells were not real interactive elements
**Situation:** the topbar's 8-state strip (`Down 2`, `Run 8`, …) is the
first thing a floor visitor reads, and looks clickable (has a `title`
tooltip, distinct styling). **Priority:** this is the primary "what's
wrong" signal on the whole page. **Evidence:** `grep` confirmed zero click
handlers and no `tabindex` on any cell before this audit — a mouse click
did nothing, keyboard users could not reach it at all. **Action:** none
existed; a user had to already know to click "Inspection," then expand
"IMS devices," then scroll, to get from the glance to the detail.
**Fixed:** cells are now real activation targets (click + Enter/Space),
`role="button"`, `aria-label` stating the count and meaning, opens the
drawer and the device list directly. Verified: keyboard-only activation
(focus + Enter) opens the drawer and scrolls to the device list, 0 console
errors, real browser (disposable container and real production, both).

### P1-2 — 4 status-strip labels failed WCAG AA contrast
**Situation:** the four "no source in this schema" states (Off/Initial/
PM/Stop) are deliberately dimmed to signal "not tracked." **Evidence:**
axe-core (real automated scan): `color-contrast`, serious, 4 nodes,
measured 2.21:1 against a required 4.5:1 (`#435060` on `#0e1621`).
**Root cause:** a flat `opacity: .42` on the whole cell crushed the label
TEXT contrast along with the decorative glyph. **Fixed:** dimming moved to
the glyph and the dash value only; the label (the actual disclosure text
naming the state) stays at full `--text-dim` contrast. Verified: axe-core
re-scan, 0 violations.

### P2-1 — No error banner/toast for a failed fetch
**Situation:** every boot-time fetch (`geo`/`overlay`/`alarm-rca`/`build`)
already fails soft (`try/catch`, `console.warn(...'non-fatal'...)`,
existing render kept) — correct behavior, but silent: a real backend
outage produces no on-screen signal beyond an unusually short/incomplete
device list. **Not fixed this phase** — a real UI affordance (banner,
retry) is a genuine feature addition, not a bounded bug fix, and this
audit's own instruction is "fix only evidence-backed P0/P1 issues first."
Logged as a real, disclosed P2 for a future phase.

### P3-1 — Device-history metric list is a fixed 4-item dropdown
`temperature/humidity/air_vacuum/scan_speed` out of 19 real `AVG_METRICS`
(`lib/analytics.js`). Cosmetic — the 4 shown are the ones the Alarm
Console/Machine Snapshot dashboards already treat as primary process
signals; not fixed (a real feature-completeness call, not a defect).

## 3-Second Test

| Screen | What's wrong | Where | Severity | Freshness | Next action | Verdict |
|---|---|---|---|---|---|---|
| Factory Twin (default view) | **PASS** — topbar counts, color+label | **FAIL** — no physical asset is placed on the floor by device state (0 confirmed mappings; correct, not a UI bug) | Partial — Down/Run counts, not Critical vs Major | **PASS** — "Last updated" timestamp | **FAIL → FIXED** (P1-1) | Now PASS for 5/6, "where on the floor" remains a data-evidence gap, not a UI defect |
| Machine Snapshot (real dashboard) | PASS | PASS (machine name, factory) | PASS (color-coded panels) | PASS (timestamp shown) | PASS (drill-down already works, FT-17.6) | **PASS** |

"Where on the floor" stays a real, honest gap: it is impossible to place
a live status marker on a specific piece of geometry without an
authoritative CAD→IMS mapping, and this engagement's standing rule is
never to fabricate one. This is the CORRECT trade-off, not a UX defect to
paper over.

## Non-findings (checked, not remediated because not defects)

- Empty/stale/unavailable states are already explicit text everywhere
  checked (`0 confirmed IMS mappings`, `RCA_EVENT_UNRESOLVED`, `Quality.
  UNAVAILABLE`) — never a blank panel, never a color-only signal.
- Loading state is text-only ("Loading floor evidence…"), consistent with
  this app's own "no decoration without evidence" convention — not
  changed to a spinner (would be opinion-based, not evidence-backed).
