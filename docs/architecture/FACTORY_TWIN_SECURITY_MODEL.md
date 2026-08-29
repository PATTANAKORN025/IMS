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
| Process and area names | Confidential. Never served, never logged, never in diagnostics. |
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

---

## 4. Response shaping

Two endpoints could plausibly leak the private documents, and both are shaped
rather than trusted.

### Geometry

The geometry route names every field it serves. Spreading a private document
into a response means any field ever added to that document is published the
moment it is written, including one that carries a source path, a real name or
an internal note. Under an allowlist, publishing a new field is a decision
someone makes in code review.

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
- Never spread a private document into a response.
- Never add a diagnostics field that carries a free-form string from input.
- Never commit private geometry, `.env`, or a credential; the pre-commit leak
  scan is a net, not a substitute for the rule.
