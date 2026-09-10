# FT-18 — Design System (Factory Twin)

Real tokens extracted from `services/factory-twin-3d/public/index.html` `:root`
and rule set. Not invented — this documents what already exists, normalizes
naming, and flags the one real hack fixed this phase. Scope: Factory Twin
only (see `UX_SURFACE_INVENTORY.md` for why Grafana isn't re-normalized here).

## Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b1017` | page background |
| `--panel` | `#111a26` | drawer/topbar surface |
| `--panel-2` | (referenced, `fs-cell`/`.seg` bg) | nested surface, one level up from panel |
| `--line` | `#1e2c3d` | borders, hover fill (`ss-cell:hover`) |
| `--text` | `#dbe6f3` | primary text |
| `--text-dim` | `#8ba0b8` | secondary/label text — confirmed WCAG AA compliant at full opacity (axe-core) |
| `--text-faint` | `#5f7387` | tertiary/hint text |
| `--accent` | `#38bdf8` | focus ring, active/selected |
| `--warn` | `#f59e0b` | warning semantic |
| `--crit` | `#ef4444` | critical semantic |
| `--ok` | `#22c55e` | healthy/running semantic |

Semantic colors (`warn`/`crit`/`ok`) are never the sole carrier of state —
every status cell pairs color with a text label (`ss-label`) and a glyph;
confirmed by axe-core's `color-contrast`/`link-in-text-block` sweep finding
no color-only violations.

## Typography

No named type scale existed before this phase; real sizes in use, now
recorded as the scale (px, this app's own accumulated values — not
invented):

`9.5 / 10 / 10.5 / 11 / 11.5 / 12 / 13 / 14 / 19`

Two weights only: `400` (default) and `600` (labels, values, emphasis) —
confirmed by grep, no `700`/`bold` anywhere in this file. Letter-spacing
`.02em`–`.1em` used exclusively on uppercase/small-caps labels (legend
headers, `fs-label`, `seg` text), never on body copy — consistent pattern,
kept as-is.

**Numeric typography:** every live numeric value (`ss-value`, `fs-value`,
`evidence-summary .n`) uses `font-variant-numeric: tabular-nums` — digits
stay fixed-width so a changing count never reflows its neighbors. Already
consistent across all three; no fix needed.

## Spacing

No 4px/8px grid was ever declared explicitly, but the real values used
(`padding`/`gap`: 1px, 1.5px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px,
12px, 14px, 24px) cluster tightly around a **2px base unit**. Recorded as
the working scale rather than forcing a rewrite onto an 8px grid that
doesn't match this density-first industrial UI's real usage.

## Radius

`--radius: 6px` (controls: buttons, segmented control, panels). Smaller
elements use fixed values that are NOT tokenized: `3px` (badges, small
tags), `4px` (nav buttons), `5px` (fieldset, fs-cell). Recorded honestly as
an inconsistency — not fixed this phase (cosmetic, P3, no user-facing
confusion: smaller controls read as visually "tighter," which is the
correct direction for their size, not an error).

## Borders / Elevation

Single-pixel borders (`1px solid var(--line)`) throughout; no shadow/
elevation system exists — this UI is flat by design (dark industrial
console, not a layered card UI). Not a gap: no screen in this app implies
stacking that would need a shadow to read correctly.

## Status/State Visual Language

- **Backed state** (`RUN`/`DOWN`/`IDLE`/`UNDEFINED`): full-opacity glyph,
  label, and value.
- **Unbacked state** (`OFF`/`INITIAL`/`PM`/`STOP`, `.ss-off`): glyph and
  value (the dash) dimmed to `opacity: .42`; label stays full contrast.
  **Fixed this phase** — previously the whole cell dimmed, crushing label
  contrast to 2.21:1 (axe-core, real measured violation). See `UX_AUDIT.md`
  P1-2.
- **Selection/focus:** global `:focus-visible { outline: 2px solid
  var(--accent); outline-offset: 1px; }` — already existed, now also
  covers the status-strip cells since they're real focusable elements
  (`tabindex="0"`) as of this phase.
- **Hover:** `.ss-cell:hover { background: var(--line); }` — **added this
  phase** as part of making the cells real activation targets (was
  previously purely decorative, `title`-only).

## Hard rule respected this phase

No fragile Grafana DOM selector was added or touched. No undocumented CSS
hack introduced — the one hack found (`.ss-off` opacity on the whole cell)
was documented and fixed, not left silent.
