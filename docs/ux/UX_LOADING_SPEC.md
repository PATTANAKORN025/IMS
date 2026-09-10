# FT-19 — Loading / Progressive Render Spec (Factory Twin)

Real audit of every loading/transition moment, grounded in code. No
skeletons exist anywhere in this app and none are added here — this
records why, and fixes the one real motion inconsistency found.

## Boot sequence

1. `#data-quality` shows `Loading floor evidence…` (plain text, no
   spinner) from first paint.
2. Four independent fetches run concurrently (`Promise.all`, FT-18) —
   geometry, physical-overlay, alarm-rca, build.
3. On geometry success, `#data-quality` is overwritten once with the
   final real evidence string — one jump, not a progressive count-up.
   **On geometry failure, it is now also overwritten once**, with the
   error state (FT-19, see `UX_ERROR_RECOVERY.md`) — closing what was
   previously an indefinite hang on step 1.
4. `renderStatusStrip([])` renders all 8 states at zero before the first
   `/api/state` poll resolves, then `applyState()` overwrites every count
   once real data arrives.

**Why no skeleton/spinner is used, confirmed as a deliberate and correct
choice, not a gap:** every loading surface in this app is short static
text describing exactly what is being waited for and, since this phase,
exactly what to do if it never arrives. A decorative skeleton would
imply a shape or a duration this data does not have (unlike a paginated
list, there is no "roughly this many items" to skeleton toward). Kept
as-is.

## Layout shift

Checked each of the three real content-arrival moments for shift:

- **Geometry arrival:** the WebGL canvas is a fixed `position: absolute;
  inset: 0` element (`#scene`) — geometry populates INSIDE it, the
  canvas's own box never resizes on data arrival. No shift.
- **Status-strip population:** 8 cells always render (backed or not),
  same 8 slots, same order, before and after data arrives — only the
  count/label text inside each cell changes. No shift.
- **Data-quality text swap:** `#data-quality` sits in a flex topbar row
  with `flex: 1 1 260px` and `overflow: hidden; text-overflow: ellipsis`
  — a longer string truncates rather than wrapping the topbar to a
  second line. **Exception, found and fixed this phase:** the new error
  state needs a visible Retry button, so `.quality-error` explicitly
  lifts the `nowrap`/`ellipsis` constraint (`white-space: normal;
  overflow: visible`) for that state only. This DOES shift topbar height
  when it fires (a wrapped error message can be taller than one line).
  Accepted rather than hidden: a silently truncated error message with
  an invisible Retry button would be worse than an honest few-pixel
  height change on a state that, by definition, is already telling the
  user something is wrong.

## Drawer movement

`#app`'s `grid-template-columns` transitions over 140ms
(`index.html:69`), already gated by `@media (prefers-reduced-motion:
reduce) { #app { transition: none; } }` — confirmed existing, not
touched. The drawer's own resize dispatches `twin-pane-resize`, which
`requestRender()`s a fresh WebGL frame at the new canvas size — checked,
no stale-sized frame is visible mid-transition (render-on-demand redraws
every damped/transition step via the existing `requestRender` wiring,
not this phase's addition).

## Number/label pop-in

Numeric values use `font-variant-numeric: tabular-nums` throughout
(status-strip counts, factory-status cells, evidence-summary) — a
changing digit count never reflows its neighbors. Confirmed via
`IMS_DESIGN_SYSTEM.md`'s own token audit; unchanged this phase.

## WebGL initialization flash

None observed: the renderer is constructed, sized, and appended to
`#scene` before `boot()` ever runs, and the scene starts genuinely empty
(no floor drawn) until real geometry arrives — there is no placeholder
box or default machine model that would flash and then be replaced. The
correct empty state (nothing drawn yet) is not a flash, it is an honest
absence.

## Reduced-motion audit — one real inconsistency found and fixed

`prefersReducedMotion` is computed once at module load
(`window.matchMedia('(prefers-reduced-motion: reduce)')`) and already
gated `OrbitControls`' damping. **Found this phase:** `openDeviceListFor`
(FT-18's own status-strip fix) called
`details.scrollIntoView({behavior:'smooth', ...})` unconditionally — a
second, independent motion decision that forgot the flag the file
already computes. **Fixed:** `behavior: prefersReducedMotion ? 'auto' :
'smooth'`. Verified via Playwright with `page.emulateMedia({
reducedMotion: 'reduce' })`: activation still opens the drawer and
scrolls to the device list correctly, motion preference honored.

## API completion ordering

The four boot fetches are order-independent by design (FT-18) — each
updates only its own DOM region (`buildFloor`/evidence summary for
geometry; the overlay/alarm lookups are read later, on click/inspect,
not rendered eagerly) so no visible flicker exists from one resolving
before another. Confirmed: none of the four writes to a DOM node another
of the four also writes to.
