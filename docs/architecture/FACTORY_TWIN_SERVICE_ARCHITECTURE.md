<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Service Architecture

Which container serves the Factory Twin, which ones only look like they do,
and how to tell the difference from the outside.

Companion to **[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)** and
**[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)**.

---

## There is exactly one Factory Twin application

`/factory-twin-3d/` depends on **one** service. It has never depended on more
than one, and no operator has ever been offered a choice between them.

| | |
|---|---|
| Browser route | `http://localhost:3000/factory-twin-3d/` |
| Proxy route | `location /factory-twin-3d/` in `proxy/nginx.conf`, gated by `auth_request /auth-check` |
| Upstream | `http://factory-twin-3d:4100/` |
| Compose service | `factory-twin-3d` (`docker-compose.yaml`) |
| Container | `ims-factory-twin-3d` |
| Published host port | **none** |
| Depends on | `pgbouncer` (healthy), `db-migrate` (completed), `grafana` (indirectly, for the auth gate) |
| Network | `ims-internal` |

The service listens on 4100 **inside the network only**. The single way in from
a browser is the proxy route, and that route refuses anyone without a valid
Grafana session — `auth_request` forwards the request's cookies to Grafana's
`/api/user`, and a 401 there is a 401 here.

---

## Classification

| Container | Class | Managed by | Host port | Auth | Purpose |
|---|---|---|---|---|---|
| `ims-factory-twin-3d` | **PRODUCTION** | `docker-compose.yaml` | none | Grafana session via proxy | The canonical, user-facing Factory Twin |
| `ims-twin-verify` | **SCRATCH** | nothing — an ad-hoc `docker run` | `0.0.0.0:4199` | **none** | Direct-mode scene verification when the Grafana credential 401s |
| `ims-twin-nogeo` | **SCRATCH** | nothing — an ad-hoc `docker run` | `0.0.0.0:4198` | **none** | Same image with an empty `private/` mount, to prove the no-geometry path |

There is no LEGACY twin service. Nothing in `docker-compose.yaml`,
`docker-compose.dev.yaml`, `docker-compose.prod.yaml` or `proxy/nginx.conf`
mentions any twin container other than `factory-twin-3d`.

**The two SCRATCH containers are not part of the application.** They are not in
any compose file, so `docker compose up` will not create them and
`docker compose down` will not remove them; they carry
`com.docker.compose.project` labels inherited from the image, which makes them
*look* compose-managed in `docker ps` while being invisible to compose itself.
They survive a full stack restart until someone removes them by name.

---

## Why the scratch containers existed, and what was wrong with them

The authenticated regression is the default and correct path. It runs through
the proxy against a real Grafana session, so it exercises the auth gate as well
as the scene. When the workstation's Grafana credential began returning 401,
every scene assertion became unrunnable — not failing, simply never executed.

`TWIN_DIRECT_URL` exists for exactly that case: it points the *scene* checks at
the container directly, skips the login, and skips the entire
unauthenticated-boundary section rather than pretending to have passed it. It
needs a reachable port, and a container was started by hand to provide one.

Two things about how that was done were wrong:

1. **They published on `0.0.0.0`.** Anything on the same network could reach
   the twin on 4198/4199 with no credential at all, bypassing the proxy gate
   that is the service's only access control. `ims-twin-verify` additionally
   mounted the real `private/` directory, so the exposure was not merely of the
   application but of the confidential geometry it serves.
2. **They outlived their run.** With no `--rm` and no compose entry, a
   container started for one verification stays up indefinitely, and stale
   images inside them have twice produced false regression failures.

Neither is a flaw in the twin. Both are a flaw in how the test container was
launched, and both are fixed by launching it correctly.

---

## Running direct-mode verification safely

Use the helper rather than a hand-written `docker run`:

```bash
scripts/twin-direct-container.sh up          # 127.0.0.1:4199, real private/ mount
scripts/twin-direct-container.sh up --nogeo  # 127.0.0.1:4198, empty private/ mount
scripts/twin-direct-container.sh down        # removes both
```

```powershell
.\scripts\twin-direct-container.ps1 up
.\scripts\twin-direct-container.ps1 up -NoGeo
.\scripts\twin-direct-container.ps1 down
```

What the helper guarantees, and a hand-written `docker run` does not:

- **Binds to `127.0.0.1` only.** The port is reachable from the workstation
  running the test and from nowhere else.
- **Rebuilds from the current source** before starting, so a stale image cannot
  produce a false result.
- **Labels the container** `ims.role=scratch-test`, so scratch containers are
  greppable and `down` can find every one of them.
- **Is idempotent** — `up` replaces an existing container of the same name.

Then:

```bash
TWIN_DIRECT_URL=http://127.0.0.1:4199/ node tests/playwright/factory-twin-regression.js
```

Remove the containers when the run finishes. A direct run proves the scene is
correct and proves **nothing** about access control; it is never reported as an
authenticated pass.

---

## Request path, end to end

```
browser
  └─ GET http://localhost:3000/factory-twin-3d/
       └─ ims-proxy (nginx :80, published :3000)
            ├─ auth_request → http://grafana:3000/api/user
            │     200 → continue   401 → 401, request never reaches the twin
            └─ proxy_pass → http://factory-twin-3d:4100/
                 └─ ims-factory-twin-3d (express)
                      ├─ static  public/            (app.js, schematic.js, index.html)
                      ├─ GET /api/floor-geometry    ← private/floor1-geometry.json + floor1-zones.json
                      ├─ GET /api/floor-schematic   ← private/floor1-schematic.json
                      ├─ GET /api/state             ← pgbouncer → timescaledb (grafana_reader, read-only)
                      └─ GET /api/diagnostics       ← in-process counters, allowlisted
```

`private/` is a read-only bind mount from the host, never baked into the image
(`.dockerignore` excludes it) and never statically served. Every private field
reaching a browser passes through the allowlist projection in `lib/wire.js`.

---

## Operational note

After `docker compose up -d --build factory-twin-3d` — or any recreate of
`alarm-api`, `node-red` or `grafana` — run:

```bash
docker exec ims-proxy nginx -s reload
```

nginx resolves upstream names once at startup, so a recreated container gets a
new IP that the running proxy does not know about. This is deliberate: the
variable-indirection fix for it was tried and reverted, because it traded a
rare rebuild-time 502 for a frequent live 500 on every proxied route. See the
comment block in `proxy/nginx.conf`.
