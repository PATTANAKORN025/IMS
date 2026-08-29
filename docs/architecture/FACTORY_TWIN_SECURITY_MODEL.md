<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Security Model

What this service is defending, from whom, and where each control is actually
enforced.

Companion to **[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)** and
**[Reconstruction Methodology](FACTORY_TWIN_RECONSTRUCTION.md)**.

---

## 1. What is being protected

The twin is unusual in that **the data is more sensitive than the service**.

| Asset | Sensitivity |
|---|---|
| The source engineering drawing | Confidential. Lives outside the repository entirely. |
| Derived private geometry (envelope, footprint, grid, columns, slot positions, zone boundaries) | Confidential. Gitignored, host-only, never in an image layer. |
| Process and area names | Confidential, with one deliberate exception: servable on the authenticated geometry route because the floor view is unreadable without them. Never logged, never in diagnostics, never in an error response. See [Area names](#area-names). |
| Live telemetry | Internal. Already governed by the platform's existing controls. |
| The code | Public. The repository is public and must run standalone on synthetic data. |

The primary threat is therefore **disclosure through the service**, not
compromise of the service.

---

## 2. Trust boundaries

| Boundary | Control |
|---|---|
| Internet / operator to platform | The proxy. The twin publishes no host port and is unreachable except through it. |
| Unauthenticated to authenticated | nginx `auth_request` against Grafana's own session. A request without a valid session gets 401 before the twin is reached. |
| Private files to HTTP response | Server-side reads plus a serving allowlist. `private/` is **not** a static mount. |
| Repository to image | Dockerfile allowlist `COPY`. `private/` is never copied. |
| Working tree to git history | `.gitignore` plus a leak scanner in the pre-commit suite. |

### The 401 requirement

Every twin route sits behind the gate, including `/api/*`. **An
unauthenticated request must receive 401 and no body content**, and the
regression suite asserts exactly that against the proxy.

> [!WARNING]
> **Never publish a host port on the twin container to make a test easier.**
> The container has no host port by design; reaching it directly bypasses the
> authentication gate the twin's entire disclosure model depends on.

A direct-to-container mode exists in the regression suite for scene assertions
only. It states in its own header, startup log and final banner that it
exercises no auth gate and **proves nothing about access control**. Scene
results obtained that way are never reported as evidence of authentication.

---

## 3. Why authentication must not be weakened

The admin credential currently available in this environment returns 401
against Grafana. That blocks the authenticated half of the regression suite
(see [Visual QA](FACTORY_TWIN_VISUAL_QA.md)).

It is worth being explicit about why that stays blocked:

- The gate is the **only** thing standing between an unauthenticated request
  and derived geometry from a confidential drawing.
- Weakening it to obtain a green test run would trade a real control for a
  cosmetic result, in the exact system where the control matters most.
- A test that passes because the gate was removed has not tested the gate. It
  has removed the thing under test.

So the blocker is recorded as an **external, pre-existing verification
blocker** and is resolved by supplying a working credential, not by changing
the middleware, the credential handling, or the login flow.

**Diagnosed cause**, established without touching any credential: the Grafana
admin row was created at first database initialisation and updated
twenty-five minutes later. `GF_SECURITY_ADMIN_PASSWORD` seeds the admin
password *only* at that first initialisation, so a password changed inside
Grafana afterwards no longer matches the environment value. The environment
value and the container's value were confirmed identical by hash, and Grafana
still answers "Invalid username or password". Nothing is misconfigured; the
stored password is simply one that only its owner knows.

Two consequences worth stating plainly:

- It is a **workstation** blocker, not a CI one. CI starts from
  `.env.example` against a fresh database, so the authenticated path genuinely
  runs there.
- The fix is to supply the current credential, or to reset it through
  Grafana's own tooling as a deliberate administrative act. Neither is
  something an automated run should do on someone's behalf.

---

## 4. Response shaping

Two endpoints could plausibly leak the private documents, and both are shaped
rather than trusted.

### Geometry

The geometry route names every field it serves, and `lib/wire.js` does the same
one level down for each slot, column, zone box, envelope, functional zone and
conflict. Both levels matter: an audit found the top-level allowlist in place
while each slot was still being spread individually, which meant a field added
to a private slot record would have been published the moment it was written.

The projection can only emit finite numbers, pattern-checked tokens and fixed
enums. That shape is chosen so that **free text fails**, rather than so that
known-bad text fails — a note, a filesystem path or a process name cannot
satisfy a token guard. Values that cannot be projected are withheld rather than
coerced.

Three classes of value were being served with no consumer at all and are no
longer served: a functional zone's process type, its printed and calculated
areas, and free-text validation and conflict-resolution notes. Publishing
values read from a confidential drawing that no client reads is disclosure with
no purpose.

### Area names

An area name is a process name, and this document classified process names as
never served. That classification was changed deliberately, not eroded: a floor
plan whose areas are all called `zone-07` cannot answer "what area is this",
which is the question the view exists to answer.

The exception is narrow, and the narrowness is the control:

| Where | Area names |
|---|---|
| Authenticated geometry route | **Served.** The one place a name is needed to render the floor. |
| Diagnostics | **Never.** That response is pasted into tickets and logs; a process name there has left the boundary the geometry route keeps. |
| Logs and error responses | **Never.** Error bodies are fixed strings carrying nothing from the request. |
| Filesystem disclosure | **Never.** No name reaches a path, and no path reaches a response. |
| Arbitrary serialization | **Never.** The name is one named field in the projection, not a passthrough. |

The guard is shaped rather than listed. A name must match an **uppercase-only**
pattern of letters, digits, spaces and hyphens, at most 32 characters. Every
area label on the drawing is set in caps; every note, path and sentence that
must not travel contains lowercase. So prose fails by shape, the way the token
guard works elsewhere, instead of by a blocklist someone has to keep current.
A name that does not match is withheld, never rewritten into one that does, and
a bad label costs the label and never the geometry it belongs to.

The approved vocabulary is deliberately **not** in this repository. Enforcing a
hardcoded list of real area names in public code would publish exactly the
thing being protected. The code enforces shape; the private data supplies the
values.

### Identifier lookups

A mapping is looked up by own property, and only for an identifier that is
itself a safe token. On a plain object `mapping['constructor']` answers with a
function and `mapping['__proto__']` can answer with a value `JSON.parse` placed
there — either would have served the slot as `IMS_CONNECTED`. A CONFIRMED
mapping conjured from a property lookup is the worst defect available in this
system, so the lookup is constrained rather than trusted.

### Deferred: a full content security policy

The response carries `frame-ancestors 'none'`, which is the directive that
matters for a page that is never embedded. A full `script-src 'self'` policy is
**not** applied: `index.html` carries an inline importmap, so locking
`script-src` would need either `'unsafe-inline'`, which defeats the purpose, or
a hash that silently breaks the page the next time the importmap changes. The
page loads no third-party origin -- Three.js is vendored -- so the exposure a
script CSP would close is small and the failure mode of getting it wrong is a
blank screen. Recorded as deferred rather than done badly.

### Error responses

Express's stock 404 echoes the requested path back into the body, which quotes
a private filename to whoever guessed it, and its stock error handler emits a
stack trace unless `NODE_ENV` happens to be production. An environment variable
being set correctly is not a control. Both are replaced with fixed JSON that
carries nothing from the request, and the framework banner header is disabled.

### Diagnostics

`lib/diagnostics.js` is **allowlist-by-construction**: it builds the response
field by field and can only emit counts, booleans and fixed enums. It cannot
emit a coordinate, an identifier, a filesystem path, a process name or a vendor
name, because it has no code path that produces a free-form string from input.

Two design points:

- **Categories are never summed.** A single "objects" figure would assert that
  observed positions and monitored devices are the same kind of claim, which is
  precisely what this system exists to keep apart.
- **Counters carry no request detail.** Aggregate totals only: no path, no URL,
  no identifier, no client detail. Anything richer would make the diagnostics
  endpoint a log of who asked for what.

Its unit tests feed deliberately poisoned input (unexpected fields, hostile
keys, prototype-pollution shapes) and assert that the emitted object contains
only the allowlisted keys.

### Diagnostics disclosure classification

Every field the diagnostics endpoint emits, and what it may reveal. The point
of writing it out is that adding a field becomes a decision someone has to
classify, rather than a convenience.

| Field | Class | Reveals |
|---|---|---|
| `data.geometry_loaded`, `envelope_present` | Presence | Whether a private file is deployed. Not its content. |
| `data.geometry_schema_version` | Version | Matched against a strict semver pattern, never echoed. |
| `data.footprint_vertices`, `grid_x_lines`, `grid_z_lines` | Count | How many vertices or grid lines exist. No coordinate. |
| `data.column_count`, `slot_count`, `zone_count_*` | Count | Census sizes, already published by the geometry route. |
| `evidence.*` counts | Count | How many objects hold each evidence state. |
| `evidence.*_confidence` tallies | Fixed enum → count | Tier distribution. An unrecognised tier is counted under `other`, never echoed as a key. |
| `conflicts[].ids` | Anonymous id | Zone ids matching `zone-NN`, which name no real place. Anything else becomes `zone-unknown`. |
| `conflicts[].status` | Fixed enum | `CONFLICT` or `UNKNOWN`. The author's resolution note is not carried. |
| `runtime.requests_total`, `requests_failed` | Count | Service load and error volume. No path, URL, identifier or client detail. |
| `runtime.latency_buckets` | Fixed-edge histogram | Whether the service is slow. Fixed bucket names, so a caller cannot introduce an output field, and no individual request is described. |
| `runtime.geometry_load_ms_last`, `geometry_parse_failures`, `uptime_seconds` | Count | Load health. |

Deliberately absent, and to stay absent: coordinates, machine and device
identifiers, filesystem paths, process, vendor or operator names, evidence
notes, and any per-request timing list. A list of timings is an ordered record
of individual requests, which is a step back towards logging who asked for
what.

### Evidence registry serialization

`lib/evidence.js` follows the same discipline: counts and enum values only, ids
only when they match a safe pattern, provenance text never echoed, and sources
marked `PRIVATE` counted but never named.

---

## 5. Private geometry handling

| Rule | Enforcement |
|---|---|
| Real geometry is never committed | `.gitignore` rule for `private/`, plus a repository leak scanner run in the pre-commit suite. |
| Real geometry is never baked into an image | Dockerfile allowlist `COPY`; `private/` is created empty in the image. |
| Real geometry is never statically served | No static mount for `private/`. It was mounted once; that route exposed every file in it at a guessable URL to any authenticated user, and was removed. |
| Real geometry reaches the browser only through shaped API responses | The serving allowlists above. |
| A public clone still runs | Every loader returns an empty-but-valid shape for a missing or malformed private file. Absence is the expected default state, not an error condition. |

The last row is a security property, not a convenience: because the public code
path must work with **no** private data, no code can quietly come to depend on
private data being present.

---

## 6. Input handling

The service takes no user-supplied path, and its private loaders resolve fixed
filenames under a fixed directory rather than composing a path from input. The
traversal class of attack has no input to travel on. The regression suite still
probes it, including encoded and mixed-encoding forms, because the useful
assertion is that the surface stays absent.

Malformed private files are treated as absent rather than as errors, so a
corrupt file degrades to the empty-but-valid shape instead of producing a stack
trace, and error responses are fixed strings that never echo an exception
message or a path.

---

## 7. Standing rules

- Never weaken the auth gate to obtain a passing test.
- Never publish a host port for the twin container.
- Never serve `private/` statically.
- Never spread a private document into a response, at any level of nesting.
- Never let an identifier reach a property lookup without an own-property and
  token check.
- Never add a diagnostics field that carries a free-form string from input, and
  classify every new field in the table above before adding it.
- Never commit private geometry, `.env`, or a credential; the pre-commit leak
  scan is a net, not a substitute for the rule.
