# FT-EAP-UX — SCADA UX Spec

Real defects found and fixed this phase, evaluated against the reference
image (`Apex3Layout/01 LayoutApex3-F1.jpg`) and this phase's own explicit
Phase 2-5 requirements. **No P0/P1 was found** (see
`EAP_SCADA_VISUAL_AUDIT.md`), so remediation this phase is scoped to the
one real P2 that was low-risk and directly addressable
(legend completeness) — per this phase's own "fix only confirmed P0/P1
issues first... do not redesign the whole app blindly," a P2 with a safe,
additive, one-line fix was still worth taking, while the positional P2s
(Bonding/Oxide/Laser-Drilling relative offsets) were left for a future
phase since correcting them means touching real, previously-registered
`EAP_LAYOUT_FRAME` footprint coordinates — exactly the kind of change
this phase's own "do not fabricate positions" / "reference wins for
relative arrangement, but never claim survey-grade" discipline says
should not be done casually.

## Phase 2 — SCADA information hierarchy (3-second test)

Real verification, disposable container: opening `/eap.html` and reading
the `#headline` immediately shows `"210 cells · 40 on the real floor, 170
spatially unresolved · 171 machine units"` — factory-wide state in one
line, in under 1 second (network-timing measured separately, see
`EAP_SCADA_VALIDATION.md`). The legend is one click/scroll away in the
aside, always visible on the page (not a modal). "Next action" for this
page is inherently limited by what it can honestly show: since **no
authoritative IMS mapping exists for any cell today**, the page's own
honest answer to "what should I do next" is "open a zone drawer or click
a cell to see its identity/spatial evidence" — there is no fabricated
"go fix machine X" prompt, because this page cannot know that yet. This
is the correct, honest behavior given the data available, not a
usability gap to paper over with an invented recommendation.

No dashboard clutter was added: the only change this phase made to the
UI is one additional legend row.

## Phase 3 — Legend (real fix)

**Before**: 6 of 7 canonical states shown (Off absent).
**After**: all 7 shown, in `operational-status.js`'s own colours/glyphs
(no new vocabulary invented), each with its own colour AND its own glyph
(never colour alone):

| State | Colour | Glyph |
|---|---|---|
| Off | `#475569` | ■ (dimmed chip only, real text unabridged) |
| Run | `#22c55e` | ● |
| Idle | `#f59e0b` | ▲ |
| Down | `#ef4444` | ◆ |
| Initial | `#38bdf8` | ◙ |
| PM | `#3b82f6` | ◇ |
| Stop | `#a855f7` | ▬ |
| Undefined | `#94a3b8` | ? |
| *Unmapped (not a machine state)* | `#64748b` | ○ |

Hover/focus/selection behavior on cells/zones was already built (FT-24.6's
own audit) and is unchanged this phase — clicking a cell/zone populates
`#inspector`; hovering repaints via `paintStates()`. Neither this phase
nor FT-24.6 found a need to change that behavior; both confirmed it works
via real click/hover tests.

## Phase 4 — interaction (real re-verification, no code change needed)

Every listed interaction was tested for real this phase, disposable
container:

| Interaction | Result |
|---|---|
| Floor selection | Shared `lib/floors.js` catalogue; hidden with <2 floors (unchanged, correct — a single-option selector implies choices that don't exist) |
| Zone selection | Real click on a zone region resolves and populates the inspector (verified: clicking near a zone's label area, `pickZoneAt()`) |
| Equipment/cell selection | Real click resolved a real cell (`EAP-F1-0041`) with full field dump |
| Hover | `pointermove` repaints on a real hover-target change, throttled to one `requestAnimationFrame` tick |
| Focus | `<aside>` now keyboard-focusable (FT-24.6's own fix, re-verified still present); mode/view buttons are real `<button>` elements, natively focusable and Tab-reachable (re-verified: `Tab` reaches `#modeAuto`) |
| Keyboard | Buttons operable via `Enter`/`Space` (native button semantics); the WebGL canvas's own cell-picking remains mouse/touch-only — a real, disclosed gap (FT-24.6's own finding, not re-opened here since no new evidence changed its scope) |
| Zoom | Real wheel-zoom confirmed to change the rendered scene (screenshot diff) |
| Pan | Real right-button drag (`OrbitControls`'s actual pan button) confirmed to change the rendered scene AND correctly trigger a label redraw (FT-24.6's `labelsDirty` fix, re-verified) |
| Camera movement / reset | `resetCamera()`/"Fit floor" button confirmed working |
| Drill-down | Zone drawer (`openDrawer()`) opens on a zone click, closes on the `×` button or `closeDrawer()` |

**No element looks interactive without being interactive** (this phase's
own explicit check): every button in the header has a real click handler
(verified in `eap.js`'s own event-listener block, all wired at module
load); the aside's scrollability now has a matching keyboard affordance
(FT-24.6). The one remaining gap (canvas cell-picking has no keyboard
path) is the INVERSE case — a real interaction exists with no keyboard
equivalent, not a fake-looking control — and is disclosed, not hidden.

## Phase 5 — data separation (re-confirmed, unchanged)

Re-verified this phase via the same grep/regression approach FT-24.6
used: zero LDI/telemetry/alarm/SPC/predictive references in
`eap.html`/`eap.js`/`lib/eap-map.js`; `tests/playwright/eap-canonical-route-regression.js`
(re-run, 0 failures) still confirms `window.__eap`/`window.__twin` never
coexist. No `ldi_machine_id` or any machine identity beyond the model's
own opaque `machine_unit_id` exists anywhere in the wire payload
(`tests/unit/eap-map-wire.test.js`'s "no machine node ids in the map
payload" assertion, re-run, still passing). The EAP map's own two
fetches (`api/eap-map`, `api/floor-geometry`) never touch `/api/state`,
`/api/spc`, `/api/predictive*`, or `/api/alarm-rca` — confirmed
functional without LDI, not merely by absence of imports.

## Deliberately not done this phase

- **Bonding/PP vertical-offset correction, Oxide/Laser-Drilling label
  de-crowding** (both real P2 findings): would require adjusting real
  `EAP_LAYOUT_FRAME` `x`/`z`/`width`/`depth` values in the private
  `floor1-eap-node-model.json`, which is itself the product of the prior
  reconciliation phases' own careful, disclosed extraction work. Changing
  those coordinates without the same rigor (re-measuring against the
  reference image with the same precision the original reconciliation
  used) risks introducing a NEW, less-careful fabrication in place of an
  old, disclosed approximation — worse, not better. Recorded as a real,
  scoped follow-up for a phase whose own objective is that specific
  re-registration, not bundled into this visual-audit pass.
- **Canvas keyboard-picking**: same reasoning as FT-24.6's own disclosure
  — a real UI feature addition (a searchable cell/zone list), not a
  one-line fix, and this phase's own instruction was not to redesign the
  app.
