# FT-19 — Error & Recovery UX (Factory Twin)

Every user-facing failure state in `/factory-twin-3d/`, answered against the
same four questions: what happened, what data may be stale, what can the
user do, did recovery succeed. Grounded in real code reads and real
Playwright-driven fault injection against a disposable container and real
production (`localhost:3000/factory-twin-3d/`) — not asserted.

## API unavailable / fetch throws (boot-time geometry)

**Before this phase (real, confirmed defect):** `#data-quality` initializes
to `Loading floor evidence…` and was updated ONLY inside the geometry
fetch's success branch. A thrown error or a non-ok HTTP status left it
reading "Loading…" forever — an infinite false-loading state. Nothing told
the user the floor would never draw; the only console signal was
`console.warn`, invisible to a real operator.

**Fixed:** `loadFloorGeometry()` is now a named, retryable function.
Failure calls `showGeometryLoadError(reason)`:
1. What happened? `Floor geometry unavailable (<HTTP status or error
   message>).` — the real reason, not "Something went wrong."
2. What may be stale? Nothing was ever drawn yet at boot, so nothing is
   stale — this is a load failure, not a staleness case (see below for
   the poll-time distinction).
3. What can the user do? A real `Retry` button, calling the exact same
   `loadFloorGeometry()` a fresh page load uses — not a second, divergent
   implementation.
4. Did recovery succeed? Retry re-runs the real fetch; on success
   `updateEvidenceSummary` overwrites the error text with the real
   evidence string, verified live (fault-injected via Playwright route
   abort, then unblocked and retried — `data-quality` went from "Floor
   geometry unavailable (Failed to fetch). Retry" back to the real CAD
   evidence line).

## API failure during polling (`/api/state`, every 5s)

**Already correct before this phase, kept:** `pollState()`'s catch sets
`#status-line` to `State fetch failed: <real message>` with a `.error`
style — a real message, not a generic one, and the last successful
render (device list, status strip, factory roll-up) stays on screen
rather than being blanked, which is itself the honest "what may be
stale" answer: everything currently shown is exactly what it was as of
the last successful poll.

**Fixed this phase (small, high-value):** the text now ends `-- retrying
automatically`, since `setInterval` already retries every 5 seconds with
no code path change needed — the gap was that this was never stated, so
a user reading it could not tell "broken and staying broken" from
"about to fix itself." Recovery confirmation is unchanged and already
correct: the next successful poll's `applyState()` overwrites the text
and clears `.error`.

## Partial API failure (boot-time overlay/alarm-rca/build)

Unaffected by this phase's fixes — already correct. Each has its own
`try/catch`, fails silently to console only, and the feature it feeds
(physical overlay, RCA context, build fingerprint) is optional context
around the primary floor render, not the floor itself. Not surfaced to
the user because losing one of these degrades a secondary panel, not
the operator's core "what does the floor look like" question. Recorded
as a deliberate severity distinction from the geometry fetch above, not
an oversight.

## WebGL initialization / context loss

**Before this phase (real, confirmed defect):** zero
`webglcontextlost`/`webglcontextrestored` handling existed anywhere in
`app.js`. A real GPU context loss (driver reset, the machine sleeping
and waking, memory pressure) would leave the canvas frozen or black with
no on-screen explanation and no way to recover short of an operator
manually refreshing the page, unprompted.

**Fixed:**
1. What happened? `#webgl-lost` banner (`role="alert"`, so it interrupts
   rather than waits to be read): "3D rendering lost the GPU context.
   This can happen after the computer sleeps, a graphics driver reset, or
   memory pressure."
2. What may be stale? The banner states explicitly: "The panel on the
   left keeps reporting live data -- only the 3D view is affected" — true,
   because the HUD polls `/api/state` independently of WebGL and is
   unaffected by a lost GPU context.
3. What can the user do? A real `Reload to recover` button.
4. Did recovery succeed? On `webglcontextrestored`, the page reloads
   automatically rather than attempting an in-place scene rebuild —
   three.js does not automatically re-upload GPU resources after a
   restore, and a partial rebuild risks silently missing one on a floor
   plan whose whole job is to be believed. This mirrors the app's own
   existing precedent (`setUpFloorSelector`'s floor switch already
   reloads rather than tearing down in place, for the identical reason).
   Verified via `WEBGL_lose_context.loseContext()` fault injection, real
   disposable container AND real production: banner appears within one
   frame of context loss in both.

## Authentication failure

Out of this service's own surface — Factory Twin is served behind
Grafana's own reverse-proxy auth (confirmed: an unauthenticated request
to `/factory-twin-3d/` returns Grafana's own `401 Authorization
Required` page, not a Factory Twin page). Grafana's login/session/error
handling is Grafana's, not something this service renders or should
duplicate. Not touched, per this engagement's standing rule against
unrelated Grafana changes.

## Transient network failure / retry — summary

Every fetch site in this file now falls into one of two deliberate
categories, and every category has an honest recovery path:

| Category | Example | User-visible on failure | Retry |
|---|---|---|---|
| Primary render, one-time | floor-geometry | Explicit reason + Retry button | Manual, same code path as boot |
| Primary render, polled | `/api/state` | Explicit reason, retrying stated | Automatic, every 5s |
| Secondary context, one-time | overlay/alarm-rca/build | Silent (console only) | Manual page reload only |
| GPU/rendering | context loss | Explicit banner + Reload button | Manual, or automatic on restore event |
| User-triggered fetch | device-history | Explicit reason in-panel | Manual, re-trigger via existing controls |

No category answers "what happened" with a generic message — every
real failure text in this file states the real HTTP status or the real
`Error.message`.
