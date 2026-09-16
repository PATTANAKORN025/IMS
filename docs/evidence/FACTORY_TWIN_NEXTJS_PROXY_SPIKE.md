# Factory Twin 3D — Next.js Reverse-Proxy / basePath Compatibility Spike

**Date:** 2026-09-11. **Scope:** Migration Plan Step 4 (the previously "unresolved, unspiked"
risk from `FACTORY_TWIN_ARCHITECTURE_GAP_AUDIT.md`). **Nothing in this document required
touching `proxy/nginx.conf`, `services/factory-twin-3d/`, Grafana, or any production
container.** Every artifact lives in `spikes/factory-twin-nextjs/` (disposable, deletable,
never referenced by any Dockerfile, `docker-compose.yaml`, or CI workflow) plus one throwaway
`nginx:alpine` container (`ims-nextjs-spike-proxy`, removed after the spike — not part of
`docker-compose.yaml`).

## Question

Does the real `proxy/nginx.conf` `location /factory-twin-3d/` block's exact shape —
`auth_request` gate + `proxy_pass http://factory-twin-3d:4100/;` (trailing slash strips the
matched prefix) — work once the upstream is a Next.js app with `basePath: '/factory-twin-3d'`
instead of today's prefix-unaware Express static server?

## Method

1. Built a minimal, real Next.js 16.3.4 app (`spikes/factory-twin-nextjs/`) with
   `basePath: '/factory-twin-3d'` and `output: 'standalone'` — one route (`app/page.tsx`), one
   client component (`webgl-placeholder.tsx`, real `canvas.getContext('webgl2')`, **not**
   Three.js/R3F — irrelevant to a proxy-routing question and risks confusion with production
   R3F code), one static asset (`public/spike-badge.svg`), and the `_next/static` JS chunks
   the build produces on its own.
2. Ran the real production build (`next build`) and started it (`next start -p 4300`) on the
   host — confirmed the routes manifest bakes in `"basePath": "/factory-twin-3d"` and that
   Next's own HTML emits asset URLs already prefixed (`/factory-twin-3d/_next/static/...`).
3. Wrote `nginx-spike.conf` — three throwaway `server` blocks on three ports, each reproducing
   only the two directives that matter (`auth_request` against a stubbed `return 200;`
   upstream instead of live Grafana — orthogonal to this question, and confirmed as such
   below; `proxy_pass` to the host's `:4300`):
   - **`:8081`** — today's real shape, unmodified (`proxy_pass ...:4300/;`, trailing slash).
   - **`:8082`** — the naive one-line fix (drop the trailing slash) and nothing else.
   - **`:8083`** — the naive fix **plus** one additional exact-match location for the
     no-trailing-slash form.
4. Ran a disposable `nginx:alpine` container (`ims-nextjs-spike-proxy`) mounting that config,
   proxying to the host Next.js process via `host.docker.internal`. Removed after.

## Result — measured, not assumed

| Port | Config | `GET /factory-twin-3d/` | Follow redirects | `_next/static` chunk | Static asset |
|---|---|---:|---:|---:|---:|
| 8081 | today's real shape (strip prefix) | `404` | `404` (never leaves 404) | — | — |
| 8082 | naive fix (pass-through, no helper) | `308` → `/factory-twin-3d` | **redirect loop** (curl gives up after its redirect limit, still bouncing) | — | — |
| 8083 | pass-through + exact-match helper | `308` → `/factory-twin-3d` | **`200`** | **`200`** | **`200`** |

### Why each result happens

- **Next.js's own canonical URL for its basePath root is `/factory-twin-3d`, not
  `/factory-twin-3d/`** — it issues a 308 from the trailing-slash form to the bare form. This
  is Next's own behavior, not a proxy artifact (confirmed directly against the host process on
  `:4300` before any proxy was involved).
- **`:8081` (today's real config) 404s immediately.** `proxy_pass http://...:4300/;`'s
  trailing slash strips `/factory-twin-3d` before forwarding, so Next.js (which expects to
  *see* its own basePath in the request) never recognizes the request as its root route.
- **`:8082` loops.** Removing only the trailing slash is not sufficient: nginx's
  `location /factory-twin-3d/ { }` is a **prefix** match, which requires the trailing slash to
  be present in the *request URI* to match at all. Next's 308 sends the browser to the
  no-trailing-slash form, which this location block does not match — nginx has no other rule
  for `/factory-twin-3d` bare, the browser is bounced back, and the cycle repeats.
- **`:8083` works end-to-end** because of one added exact-match block
  (`location = /factory-twin-3d { ... }`) that catches exactly the bare form Next's redirect
  produces. With it: the page, a real `_next/static/*.js` chunk, and the static
  `spike-badge.svg` (served from `public/`) all resolve `200`.

## Conclusion

**Real, load-bearing finding, not theoretical:** a future cutover of `/factory-twin-3d/` to
Next.js cannot reuse `proxy/nginx.conf`'s current `location` block unmodified. It needs, at
minimum, two changes at the eventual cutover point (**not made in this spike, and not made to
the real file now** — this is a finding for Migration Plan Step 4, not an action taken today):

1. Drop the trailing slash on `proxy_pass` (stop stripping the prefix — Next.js needs to see
   its own basePath).
2. Add one exact-match `location = /factory-twin-3d { }` block alongside the existing prefix
   block, to catch Next's own canonical no-trailing-slash redirect target.

`auth_request` itself needed **zero changes** — it is orthogonal to the basePath question, and
the stubbed `return 200;` upstream proved that by construction (the real Grafana-cookie check
in production only decides pass/fail on the *same* request path either way).

## What this spike did not test

- `next/image`'s own `/factory-twin-3d/_next/image` optimizer proxy path — the spike page
  deliberately uses a plain `<img>` to isolate the static-asset question; `next/image` adds a
  second, different proxied route this spike did not exercise. Flagged as untested, not
  assumed safe.
- Any interaction with a *live* Grafana `auth_request` upstream (only a stub was used) — no
  reason to expect a difference, since the gate is evaluated identically regardless of what
  sits behind it, but not literally proven against the real service.
- WebSocket/HMR behavior in `next dev` mode through the proxy — the spike tested the
  **production** `next build` + `next start` path only, since that is what would actually run
  behind `proxy/nginx.conf` in a real deployment.

## Cleanup

`docker rm -f ims-nextjs-spike-proxy` run; the container no longer exists. The Next.js host
process on `:4300` was stopped. `spikes/factory-twin-nextjs/` remains on disk as the
reference spike (its own `package.json` documents itself as disposable and deletable); nothing
in `docker-compose.yaml`, any `Dockerfile`, or CI references it.
