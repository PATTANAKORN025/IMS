<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Runtime Architecture

The shape of the running service: what talks to what, which module owns which
decision, and where the boundaries the rest of the twin's documentation relies
on are actually enforced.

Companion to **[Reconstruction Methodology](FACTORY_TWIN_RECONSTRUCTION.md)**
(how the geometry was produced), **[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)**
(what is defended and how) and **[Operator Guide](FACTORY_TWIN_OPERATOR_GUIDE.md)**
(how to read the result).

> [!NOTE]
> No geometry, dimension or coordinate appears in this document. It describes
> the plumbing, not the payload.

---

## 1. Request path

```
browser
  └─ proxy  (nginx)
       ├─ location = /auth-check      internal; validates against Grafana /api/user
       └─ location /factory-twin-3d/  auth_request /auth-check
            └─ factory-twin-3d  (express, :4100, no host port)
                 ├─ static  public/ + vendored three.js
                 ├─ /api/*  shaped JSON
                 ├─ pg pool  ->  pgbouncer  ->  TimescaleDB   (read-only role)
                 └─ private/  read server-side only, never mounted static
```

Three properties of that path are load-bearing:

- **The twin publishes no host port.** It exists on the compose network only.
  The single route in is the proxy's `/factory-twin-3d/` location.
- **That location is `auth_request`-gated** against Grafana's own session
  cookie. There is no second auth system to keep in sync: an operator logged
  into the dashboard is logged into the twin, and one who is not gets a 401
  before the twin is reached at all.
- **Three.js is vendored, not fetched from a CDN.** A container behind an auth
  gate must not depend on a third-party origin at render time.

---

## 2. Module map

| File | Owns |
|---|---|
| `server.js` | Routes, the pg pool, device refresh, the private-file loaders, and the serving allowlists. |
| `lib/contracts.js` | The machine-state vocabulary and its theme. One definition, shared by API and renderer. |
| `lib/diagnostics.js` | Diagnostics serialization, allowlist-by-construction. |
| `lib/wire.js` | Wire projection for private geometry: rebuilds every served slot, column, zone and envelope field by field. |
| `lib/mapping.js` | The physical-to-device mapping contract, including its refusals. |
| `lib/mes-import.js` | The import boundary for external manufacturing data. |
| `lib/evidence.js` | The evidence-source registry and promotion contract. |
| `public/app.js` | Scene construction, layer/view system, picking, inspector. |
| `public/index.html` | HUD, controls, evidence legend, styling. |

`lib/evidence.js` is a **contract, not an inventory**. It holds no machine
records and duplicates nothing that lives in the database; it decides what a
future source is allowed to assert. Its rules are documented under
[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md).

---

## 3. HTTP surface

| Route | Returns | Notes |
|---|---|---|
| `GET /api/state` | Live machine state per monitored device | The only route that touches the database. Read-only role. |
| `GET /api/placement` | Floor descriptor plus **synthetic** machine placements | Positions here are simulated, and labelled as such downstream. |
| `GET /api/floor-geometry` | Envelope, columns, anonymous zone boxes, slots, validated functional zones | Serves an empty-but-valid shape when no private geometry is present, which is the default for a fresh clone and not an error. |
| `GET /api/diagnostics` | Counts, booleans and fixed enums only | Never a coordinate, identifier, path, process or vendor name. |
| `GET /healthz` | Liveness, including a database round-trip | |

### Serving is an allowlist, never a spread

The private documents are the sensitive artefact. Publishing them by spreading
means **any field ever added to a private file is served the moment it is
written**, including one carrying a source path, a real name or an internal
note.

The allowlist therefore holds at **both** levels. The route names its top-level
fields, and `lib/wire.js` rebuilds each slot, column, zone box, envelope,
functional zone and conflict field by field. Only finite numbers,
pattern-checked tokens and fixed enums can be emitted, so free text has no path
out — a note, a path or a process name fails the token guard rather than being
sanitised and echoed. A new field must be added to the projection deliberately
before it can reach the wire.

Anything that cannot be projected is **withheld rather than coerced**: a slot
with no usable position is not served at a fallback coordinate, because
inventing a location is worse than showing nothing.

Two rules the routes enforce rather than merely document:

- **Unvalidated geometry cannot render.** The API re-derives the renderable
  filter instead of trusting the private file's own flag, and the renderer
  applies the same guard again.
- **No mapping is ever inferred.** A slot is `UNMAPPED` unless an authoritative
  record says otherwise. Position, numbering and count coincidence never
  produce one.

---

## 4. Rendering model

### Layers and sub-layers

Objects group by the kind of claim they make. Four top-level layers
(`structural`, `functional`, `operational`, `telemetry`) each hold nested
sub-layer groups, so a control can toggle either a whole claim class or one
member of it:

| Top-level layer | Sub-layers |
|---|---|
| `structural` | `shell` (floor plate, orientation grid, measured envelope outline), `columns` |
| `operational` | `machines`, `slots` |
| `functional` | none; single class |
| `telemetry` | none; single class |

Visibility resolution accepts either level, so the six operator toggles map
onto the same tree without a parallel lookup table.

### Camera and view semantics

Three presets (operator, building, overview) are **framing only**. Switching a
view sets camera position, target and depth range; it never touches an object
transform. The regression suite proves this rather than asserting it: a
fixed-precision snapshot of every rendered coordinate is taken before the first
switch and compared byte-for-byte after switching through all three views and
resetting.

Two details worth knowing before editing the fit code:

- **`camera.fov` is vertical.** The horizontal half-angle is
  `tan(fov / 2) * aspect`, so a fit dividing both axes by the same quantity is
  wrong on one of them. Each axis needs its own divisor.
- **Overview frames a union of bounds, not a registration.** The measured
  building extent and the synthetic machine extent are separate coordinate
  systems; the union puts both in frame and implies no correspondence between
  them. See the warning in the [Operator Guide](FACTORY_TWIN_OPERATOR_GUIDE.md).

Framing is recomputed on load, on geometry arrival and on resize through one
path, so a viewport change cannot leave two views fitted from different inputs.
A preset whose inputs have not arrived stays disabled rather than silently
falling back to another framing.

### Resource reuse

Geometries and materials are cached and shared across meshes rather than
constructed per object; resize work is coalesced and rendering is throttled to
animation frames. Current measured composition, and the reason instancing has
**not** been adopted, are in
**[Visual QA](FACTORY_TWIN_VISUAL_QA.md)**.

---

## 5. Deployment shape

- The image is built from an **allowlist `COPY`** (`server.js`, `lib`,
  `public`). `private/` is never copied into a layer.
- `private/` is bind-mounted **read-only** at runtime. A production host drops
  real files at that path with no code change and no rebuild.
- **Application code is baked into the image.** A change under `public/` or
  `lib/` requires a rebuild and recreate of this service before it is visible;
  only `private/` is live-mounted. This surprises people, reliably.
- nginx resolves upstream hostnames at start-up, so after recreating this
  container the proxy needs one reload.

Exact commands and failure symptoms live in
**[Operations Runbook](../operations-runbook.md)**.
