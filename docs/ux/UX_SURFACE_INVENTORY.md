# FT-18 — UX Surface Inventory

Real inventory, grounded in the current repository (16 Grafana dashboards
under `monitoring/grafana/dashboards/`, `services/factory-twin-3d`'s own
routes). Depth is deliberately uneven: Factory Twin gets full per-state
detail (it is this engagement's own surface, safe to remediate); the 16
Grafana dashboards get screen-level detail plus a pointer to their own
extensive prior audit history (P15–P29, `docs/evidence/GRAFANA_*`) rather
than re-deriving what those audits already established — re-auditing them
from zero would duplicate real, existing evidence, not add to it.

## Factory Twin (`services/factory-twin-3d/`) — full detail

| Route | Purpose | Primary user | Primary decision |
|---|---|---|---|
| `/` (`index.html`) | Physical Floor 1, 433 CAD assets, device list, device-history, alarm markers | Floor engineer / facilities | "Where is this asset, is anything unmapped, what's a device doing" |
| `/eap.html` | 210-cell EAP operational map, secondary/linked | Process engineer | "What's registered where, spatial evidence level" |

**Data dependencies:** `/api/floor-geometry`, `/api/physical-overlay`,
`/api/alarm-rca`, `/api/state`, `/api/telemetry-history`, `/api/eap-map`,
`/api/diagnostics`, `/api/build`.

**Interaction model:** raycast click-to-inspect (CAD equipment), drawer
toggle, layer checkboxes, view-preset buttons (2D Plan/3D/Fit floor),
device-history button-per-row + metric/range controls.

**Loading state:** `#status-line`/`#data-quality` text ("Loading floor
evidence…"), no skeleton/spinner — text-only, matches this app's
"honest evidence" convention rather than a decorative spinner.

**Empty state:** `#data-quality` and topbar summary both say "0 confirmed
IMS mappings" plainly when true (today's real state) — never hidden,
never a blank panel.

**Stale state:** `Freshness.STALE` (device-history panel, `lib/telemetry.js`)
— shown via the freshness word itself in the summary text, not a color
alone.

**Unavailable state:** `Quality.UNAVAILABLE` for extended stats beyond the
6h tier boundary (device-history), `RCA_EVENT_UNRESOLVED` for alarm
correlation misses — both surfaced as explicit text, not silently omitted.

**Error state:** every fetch site in `app.js` has a `try/catch` logging
`console.warn(...'(non-fatal)'...)` and leaving the prior render intact —
no error toast/banner exists (a real gap, see UX_AUDIT.md P2-2).

**Responsive behavior:** tested at all 4 target viewports repeatedly
across FT-12–17.6 (real screenshots on file); topbar wraps, drawer is a
fixed-width aside, canvas fills remaining space. No dedicated mobile/
narrow layout (industrial floor-display context, not a stated
requirement).

**Performance characteristics:** see UX_PERFORMANCE_BASELINE.md.

## Grafana dashboards — screen-level inventory

| Dashboard | Purpose | Primary user | Prior audit reference |
|---|---|---|---|
| Operator Andon Board | Real-time fleet alarm/status wall display | Floor operator | P15-R, P16–P18 (`docs/evidence/GRAFANA_FRONTEND_*`) |
| Machine Snapshot | Single-machine drill-down, exact-event context | Process/maintenance engineer | Verified this session (FT-16/17.6) — real panels, real drill-down |
| Alarm Console | Active Critical/Major alarm list, action routing | Floor operator / maintenance | Query shape reused by `lib/alarm.js` this session |
| Alarm Dictionary | Static alarm code reference | Engineer (lookup) | Not audited this phase |
| Alarm Response (MTTA/MTTR) | Response-time KPIs | Shift lead / manager | Not audited this phase |
| Engineering Analytics & SPC | Process capability, trend analysis | Process engineer | Not audited this phase |
| Factory Digital Twin (Grafana panel version) | 5-zone/2-machine schematic — **legacy**, superseded for Floor 1 by the real `/factory-twin-3d/` twin | — | Superseded; not the canonical twin (see `server.js`'s own root-route comment) |
| Manufacturing Command Center | Fleet-wide production overview | Plant manager | Referenced in FT-13.5 hard rules (do not touch without proven dependency) |
| Fleet at a Glance | Glance-level KPI summary | Any role, hallway display | Not audited this phase |
| Sandbox — OMNI-MATRIX | Experimental high-density dashboard | Engineering (internal) | Explicitly excluded from doc-overclaim counts (`doc-overclaim-linter.js`) |
| LDI Data Readiness | Data-integration gap tracker | Data/integration engineer | Not audited this phase |
| AIOps & Capacity Forecast | Infra capacity planning | SRE | Not audited this phase |
| Engineering Drill-Down | Infra-level drill-down | SRE | Not audited this phase |
| Ingestion Latency | Pipeline latency monitor | SRE | Not audited this phase |
| Pipeline Health & Meta-Monitoring | Meta-observability of the monitoring stack itself | SRE | Not audited this phase |
| NOC Overview | Network operations glance | NOC | Not audited this phase |

**Why the 16 dashboards are not re-audited screen-by-screen this phase:**
this repository already carries an extensive, real, evidence-based audit
history for the Andon/Grafana surface (P15 through P29, all in
`docs/evidence/`), and this engagement's own standing hard rule (repeated
across FT-13 through FT-17.6) is "do not touch Operator Andon/Grafana
without a proven direct dependency." Re-deriving those dashboards' UX
findings from scratch here would either (a) duplicate real, existing
evidence, or (b) invite exactly the kind of opinion-based redesign this
phase's own instructions forbid. **Phase 9 remediation in this phase is
scoped to Factory Twin only** — the one surface this engagement owns,
tests, and can safely change. See UX_AUDIT.md for the reasoning applied
per-phase.
