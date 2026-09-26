# FT-19 — Interaction Language Spec (Factory Twin)

Standardized states across every real interactive control in
`/factory-twin-3d/`, grounded in the actual CSS/JS. No new visual
language invented — this documents what already exists consistently and
records the one real "looks clickable, isn't" gap this engagement has
now closed twice (FT-18's status strip, FT-19's h1 was NOT an
interaction defect — see Data Trust section instead).

## The control inventory

| Control | Hover | Focus | Selected | Disabled | Keyboard |
|---|---|---|---|---|---|
| `.seg button` / `.btn` (view controls, drawer toggle, view-reset) | `background:#172434` | global `:focus-visible` ring | `aria-pressed="true"` + distinct background | `opacity:.35`, `cursor:not-allowed`, real `title` stating why | native `<button>`, full tab/Enter/Space |
| Status-strip cells (FT-18) | `background: var(--line)` | global `:focus-visible` ring (now reachable — `tabindex=0`) | n/a (not a toggle) | n/a (always active) | `tabindex=0`, `role="button"`, Enter/Space → `openDeviceListFor` |
| History range buttons | inherited from `.history-ranges button` | global ring | `aria-pressed="true"` | none needed (always valid) | native `<button>` |
| Layer checkboxes | native | native | native `checked` | none | native `<input type="checkbox">` |
| Retry button (FT-19, `.btn-mini`) | inherited `.btn-mini` styling | global ring | n/a | `disabled` + `Retrying…` text while in flight | native `<button>` |
| Reload button (FT-19, `#webgl-reload`, `.btn`) | inherited `.btn` hover | global ring | n/a | none needed | native `<button>` |

Every disabled control in this app already states WHY via `title`
(`view-controls`' own `btn.title` logic: "Unavailable until the measured
building geometry loads") rather than just going inert — confirmed
existing, unchanged.

## "No element may look clickable if it is not; no clickable element may look inert"

Audited every element with a `title` attribute (the tell-tale sign of an
implied-interactive element) for a matching real handler:

- **Status-strip cells:** had `title` with no handler before FT-18 —
  fixed then, reconfirmed still correct this phase (regression-tested).
- **`#build-id`:** has a `title` (source-file count, start time) and NO
  click handler — audited and confirmed correct as a non-interactive
  tooltip-only element: it is inline `<code>`, not styled as a button, no
  `cursor:pointer`, no hover state. It reads as inspectable text with a
  tooltip, not as a control, and it is not one. Left as-is.
- **`.hint` spans** (layer-controls counts, reference-status): plain
  text, no `title`-implies-action pattern, no cursor style suggesting
  interactivity. Correct as static text.
- **`#data-quality` in its new error state:** contains a real `<button
  class="btn-mini">Retry</button>` — a genuine control, styled and
  behaving exactly like every other `.btn-mini` in this file (the
  device-history row's own History button uses the same class). No new
  visual vocabulary introduced.

No element was found this phase carrying `title`/hover styling with no
backing handler — the one instance of that pattern (status strip) was
already fixed in FT-18 and is reconfirmed intact here.

## Loading / success / error / recovery, as interaction states

These four are not separate widgets in this app — they are text-content
states of the SAME element, which is the correct pattern here (see
`UX_LOADING_SPEC.md` for why no skeleton exists):

- `#data-quality`: loading (`Loading floor evidence…`) to success (real
  evidence string, `.quality-measured` green) to error (FT-19,
  `.quality-error` red + Retry).
- `#status-line`: empty at boot to success (`Last updated HH:MM:SS`) to
  error (`.error` red, real message, now states "retrying automatically").
- `#history-summary`: `Select a device's History button above.` to
  `Loading…` to success (stats) to error (`Unavailable: <reason>` /
  `Fetch failed: <message>`).
- `#webgl-lost` (FT-19): hidden (success/normal) to shown (`role="alert"`,
  real explanation + Reload button) — the one state in this app that is
  a distinct element rather than a text swap, because it has to sit OVER
  the canvas the moment the canvas itself stops being trustworthy.

## Keyboard path completeness

Every real control above has a native or explicit keyboard path. The
one gap closed this phase is indirect: `openDeviceListFor`'s
`scrollIntoView` now respects `prefers-reduced-motion` (see
`UX_LOADING_SPEC.md`), which matters for keyboard users specifically —
a user tabbing through the status strip and pressing Enter should not
be surprised by an unrequested smooth-scroll animation if they have
asked the OS not to show them one.

## Not changed this phase (audited, found consistent already)

Selection state for view-controls (`aria-pressed`), device-history range
buttons (`aria-pressed`), and layer checkboxes (native `checked`) all
use the correct native/ARIA mechanism already — no divergent
"selected-looking" class exists anywhere that isn't backed by the real
attribute a screen reader would also see.
