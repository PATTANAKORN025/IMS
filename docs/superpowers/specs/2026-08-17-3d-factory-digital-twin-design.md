<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 3D Factory Digital Twin — Architecture & Design Spec

> Status: DESIGN ONLY. Not approved for implementation. No code, no new dashboard, no new service has been created for this. This document exists to be reviewed and either approved, revised, or rejected before any Task 4.x work starts.
>
> This directly supersedes the 2D twin plan's Task 13 placeholder ("Future: 3D Digital Twin migration path"), which deliberately left this undesigned until real coordinates existed. The user has now asked for the design itself to be produced ahead of real coordinates, with all placement data explicitly marked simulated until a real factory layout is supplied. This document honors that request while being explicit, throughout, about what is real today and what is not.

## 0. Non-negotiables carried over from the 2D twin work

These held for every task in the 2D build and hold here unchanged:

- No mock data presented as real. Where this design uses placeholder coordinates, every one of them is labeled SIMULATED, never asserted as a real machine position.
- No external Grafana plugins. Confirmed this session: Grafana 13.1.1 core has no 3D-capable panel type (`canvas` is 2D only). This is the reason §1 below concludes a 3D twin cannot live inside Grafana.
- Real machine state/alarm/production data only, sourced from the same tables/views already proven this session (`v_ldi_machine_latest_full`, `ldi_alarm_log`, `ldi_alarm_ms_code`, `ldi_alarm_lifecycle`).
- `board_id` is not used (empty in 100% of real rows). `log_id` is the real per-event identifier.
- Existing dashboards (`ims-ldi-manufacturing.json`, `ims-ldi-operator-andon.json`, and the just-built `ims-ldi-factory-digital-twin.json`) are not modified by anything in this document.

---

## 1. Grafana 2D Digital Twin vs. separate Web 3D application

**Decision: separate Web 3D application, linked/embedded from Grafana, not built inside Grafana.**

Real constraint, not a preference: Grafana's only spatial panel is `canvas` (confirmed core/internal this session via `GET /api/plugins`), and Canvas is a 2D absolute-positioning system — it has no 3D scene graph, no camera, no depth, no lighting. There is no Grafana core panel type capable of 3D rendering. The only way to get 3D _inside_ Grafana would be an external community panel plugin, which the standing constraint ("no external plugins") forbids outright — this isn't a workaround-able limitation, it's a closed door by design.

**Real precedent already in this repo for "separate service, same-origin, session-authenticated":** `services/alarm-api` — an Express + `pg` service, proxied through `proxy/nginx.conf` at `/alarm-api/`, gated by `auth_request` against Grafana's own `/api/user` session check (`proxy/nginx.conf` lines ~20-30). No new auth system, reuses the login the operator already did. The 3D twin should follow this exact pattern: `services/factory-twin-3d/`, proxied at `/factory-twin-3d/` (or similar path), same `auth_request` gate. This is not a new architectural idea — it's the one pattern this repo has already built, tested, and proven once.

The 2D Canvas twin remains the primary operator/C-Level status board (fast, always-on, zero-scroll kiosk). The 3D twin is a secondary, opt-in, richer view — reached via a link/button from the 2D twin (or the Grafana nav), not a replacement.

---

## 2. Rendering technology

**Recommendation: Three.js (WebGL), vanilla or with a minimal bundler (Vite).**

Reasoning, not asserted as fact beyond what's checkable: Three.js is the de facto standard for browser-based 3D visualization, has no server-side rendering requirement (fits the "separate lightweight service" model in §1), and — critically for §12 (performance at scale) — supports `InstancedMesh` for rendering hundreds of identical machine geometries in a single draw call, which directly matters once this scales past 10 machines.

This repo has zero existing frontend framework precedent (`package.json` at the repo root has no frontend deps; no `src/`, no React/Vue/Svelte anywhere). This is a genuinely new piece of the stack, not a variant of something already here — flagged plainly, not minimized. `services/alarm-api`'s `package.json` (Express + `pg` only) is the closest precedent, for the _backend_ half only.

Alternative considered and rejected for this phase: a full game-engine export (Unity WebGL, Unreal Pixel Streaming) — far higher operational cost (build pipeline, GPU-backed streaming servers for Pixel Streaming) for a factory-status visualization that doesn't need game-engine-grade rendering. Three.js is the right size for this problem.

---

## 3. Factory → Building → Floor → Zone → Machine hierarchy

**Real data today:** `public.devices.location` is a single flat text column with 5 real values (`Site A - Zone 1`, `Site A - Zone 2`, `Site A - Zone 3`, `Site B - Zone 1`, `Site B - Zone 2`) — confirmed this session. There is no `building`, `floor`, or `zone` column anywhere in the schema. "Factory 2" / "Factory 3" and the suffix (`DF INNER`/`DF OUTER`/`SM`) are both encoded inside one string, not decomposed.

**Proposed hierarchy model** (new, does not touch `devices` or any telemetry table):

```sql
-- NEW TABLE, proposed, not created by this document
CREATE TABLE public.factory_layout_hierarchy (
  hierarchy_id   SERIAL PRIMARY KEY,
  factory_code   TEXT NOT NULL,        -- e.g. '2', '3' -- matches real ldi_data.factory values
  building_name  TEXT,                 -- real building name, once known -- nullable until then
  floor_name     TEXT,                 -- real floor identifier, once known -- nullable until then
  zone_name      TEXT NOT NULL,        -- maps to the real devices.location string for now
  UNIQUE (factory_code, building_name, floor_name, zone_name)
);
```

Until real building/floor data exists, `building_name`/`floor_name` stay `NULL` and the hierarchy is effectively `Factory → Zone → Machine` (matching what's real today) rather than the full 4-level tree the user asked to support — the schema supports the deeper tree without requiring it to be populated before it's known. This is the same "structure exists, data catches up later" approach used for the coordinate table in §4.

---

## 4. Real coordinate model — x/y/z, rotation, scale, orientation

**Proposed new table** (separate from `devices`, separate from `factory_layout_hierarchy`, joined by `device_id` — this separation is what makes §5's "swap without rewriting telemetry" possible):

```sql
-- NEW TABLE, proposed, not created by this document
CREATE TABLE public.device_3d_placement (
  device_id     TEXT PRIMARY KEY REFERENCES public.devices(device_id) ON DELETE CASCADE,
  hierarchy_id  INTEGER REFERENCES public.factory_layout_hierarchy(hierarchy_id),
  pos_x         DOUBLE PRECISION NOT NULL,
  pos_y         DOUBLE PRECISION NOT NULL,
  pos_z         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rot_x         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rot_y         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rot_z         DOUBLE PRECISION NOT NULL DEFAULT 0,
  scale         DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  is_simulated  BOOLEAN NOT NULL DEFAULT TRUE,   -- TRUE until a real survey/CAD import sets it FALSE
  source        TEXT NOT NULL DEFAULT 'simulated_grid',  -- 'simulated_grid' | 'cad_import' | 'manual_survey'
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`is_simulated`/`source` are not decorative — every consumer of this table (the 3D renderer, any future report) can and must branch on `is_simulated` to visually distinguish real from placeholder placement (e.g., a "SIMULATED LAYOUT" banner in the 3D view whenever any visible machine has `is_simulated = TRUE`), satisfying §18/§19 structurally instead of by convention alone.

**Simulated seed data for Task 4.1/4.2** (POC and 10-machine phases): a deterministic grid layout — e.g. `pos_x = (zone_index * 10)`, `pos_y = (machine_index_in_zone * 5)`, `pos_z = 0` — same zone grouping as the proven 2D twin (5 zones, 2 machines each), just given fake but stable 3D coordinates. Deterministic (not random) so re-running the seed doesn't reshuffle the layout between sessions.

---

## 5. Simulated → real coordinate migration, without rewriting telemetry/query logic

This is the entire reason §3/§4 are separate tables from `devices`/`ldi_data`/`v_ldi_machine_latest_full`. The 3D renderer's data flow is two independent queries:

1. **Placement** (rare-changing): `SELECT device_id, pos_x, pos_y, pos_z, rot_x, rot_y, rot_z, scale, is_simulated FROM device_3d_placement` — this is the ONLY query that changes when real coordinates arrive.
2. **State/telemetry** (frequently-changing): the exact same `v_ldi_machine_latest_full` + alarm-table queries already proven in the 2D twin — untouched.

The renderer joins these two result sets client-side (or via a thin API endpoint doing the join) by `device_id`. Migrating from simulated to real coordinates is a `data_generators`-style import script that `UPDATE`s `device_3d_placement` rows (setting `is_simulated = FALSE`, `source = 'cad_import'` or `'manual_survey'`) — it never touches `devices`, `ldi_data`, or any query in the 2D twin, the alarm pipeline, or any existing dashboard. This is the concrete mechanism behind the "Waiting for actual Factory Layout → Change from simulated placement → real placement" step in the user's flow diagram.

---

## 6. Multi-factory / hundreds-of-machines support

The `factory_layout_hierarchy`/`device_3d_placement` schema in §3/§4 has no hardcoded assumption of 2 factories or 10 machines — `factory_code`/`hierarchy_id` are free text/FK, and `device_3d_placement` is one row per `device_id` regardless of count. Scaling to more factories/machines is a data-population question (§5's migration path), not a schema change.

**Real, already-measured ceiling to design against:** `docs/evidence/SCALE_TEST_2026-08-15.md` (from this repo's earlier reliability work) found 100% success through 250 devices, a P95 latency inflection between 100-250 devices, and real failures starting at 500 devices — bottlenecked on Node-RED CPU (118-135%), not the database. This 3D twin adds read-only query load on top of that same TimescaleDB, so its query patterns (§13) must stay in the same latest-value/`LIMIT 1` shape already proven cheap, and must not be blamed for capacity the ingestion pipeline already consumes — these are two separate CPU budgets (ingestion vs. dashboard reads).

---

## 7. Real-time machine state, alarms, production progress, board_no/total_board, MO, compliance

All of this is **already real and already proven** — no new query design needed, only a new transport (§13) to get the same data into a Three.js scene instead of a Canvas panel:

- State (0/1/2/3 NO_DATA/IDLE/OK/ALARM): same CASE logic as Andon panel 1000 and the 2D twin, unchanged.
- Board progress: `board_no`/`total_board` from `v_ldi_machine_latest_full`, unchanged.
- MO: same view, unchanged.
- Alarm context (count/owner/elapsed): same query shape as the 2D twin's `alarm_raw`/`alarm_ctx` CTEs, unchanged.
- Compliance: same Environmental Compliance query already proven on Andon/2D-twin (temp 20-24°C AND humidity 50-60%RH), unchanged.

---

## 8. Machine selection and drill-down to existing IMS dashboards

Reuse the exact mechanism proven in the 2D twin (Task 3, independently re-verified): clicking a machine in the 3D scene opens `/d/ims-ldi-machine-snapshot/set2-machine-snapshot?var-machine_id=<real-id>&var-factory=<real-factory>`, omitting `var-mo`/`var-event_time_ms` (verified this session that Machine Snapshot's own variable defaults resolve to "latest event, all MOs" when those are omitted — avoids the staleness problem structurally). Three.js click-to-object-picking (raycasting against the scene) is a standard, well-supported capability — unlike Grafana Canvas's `links[]`, this can actually be functionally tested in a browser without the "no browser tool available" limitation that blocked click-verification throughout the 2D twin work, since the 3D app is a normal web page, not a Grafana-rendered panel screenshot.

---

## 9. VCP / LDI machine 3D representation

**Recommendation for this phase: simple parametric placeholder geometry (a labeled box or a slightly-shaped box-with-a-lid, per machine type), not a fabricated "realistic" 3D model of an actual LDI/VCP machine.**

No CAD file, photo-derived model, or vendor spec for real machine geometry exists anywhere in this repo or has been supplied. Building a "realistic-looking" 3D model without a real reference would be exactly the kind of fabrication this whole session has avoided — a box that's clearly a placeholder, colored/iconed by real state (same 4-token color system as the 2D twin, reused not reinvented), is honest about what it is. If/when real machine dimensions or CAD models are supplied, swapping the placeholder geometry for a real one is a rendering-layer change only — it doesn't touch §4's coordinate schema or §7's data queries.

---

## 10. Machine-to-machine / process connections

**No real data exists to support this today.** There is no table or view in this schema describing process flow, material routing, or line sequencing between machines — `ldi_data`/`ldi_alarm_log`/`devices` describe individual machines' own telemetry and alarms, not relationships between them. Rendering connection lines between machines in the 3D scene would require either (a) real process-routing data that doesn't exist yet, or (b) fabricating a plausible-looking flow, which is explicitly out of bounds per this document's own non-negotiables in §0.

**Recommendation:** omit machine-to-machine connections from the initial 3D build entirely. If/when real routing data becomes available (e.g. a future `process_routing` table), this becomes a straightforward addition (draw a line/tube between two `device_3d_placement` positions) — but it is not designed further here because designing it now would mean inventing a data model for data that doesn't exist, which is worse than leaving it undesigned.

---

## 11. Camera / navigation UX for C-Level, NOC, and operators

Three audiences, three different real needs (same segmentation the 2D twin already used for its "C-Level first glance vs. operator drill-down" design):

- **C-Level / kiosk / NOC wall**: a fixed, auto-rotating or static overview camera (top-down or 3/4 isometric angle over the whole factory), zero interaction required — mirrors the 2D twin's "zero interaction" Andon-style kiosk mode. No navigation controls shown.
- **Operator / engineer, interactive session**: standard orbit controls (Three.js `OrbitControls` — drag to rotate, scroll to zoom, right-drag to pan), plus a "reset view" and a per-zone "fly to" shortcut (click a zone label to snap the camera to that zone, avoiding a large factory becoming disorienting to navigate manually).
- Both modes read the exact same underlying scene/data — camera mode is a UI toggle, not a different data path.

---

## 12. Performance strategy for 10, 100, 500+ machines

- **10 machines** (current real reporting fleet): no special handling needed — even naive per-machine `Mesh` objects render trivially at this scale.
- **100+ machines**: switch machine geometry rendering to `THREE.InstancedMesh` (one draw call for all instances of the same placeholder geometry, per-instance color/transform via instance attributes) — this is the standard Three.js technique for "many copies of the same simple shape," directly applicable since §9 recommends simple parametric geometry.
- **500+ machines**: per §6, this is already past the point where the _ingestion pipeline_ (not this twin) starts dropping/timing out per the real scale-test evidence — the 3D twin's own rendering cost at 500 instanced meshes is not the bottleneck at that scale, the upstream data pipeline is. Frustum culling (Three.js does this by default) and, if needed, level-of-detail (LOD) swapping for off-screen/distant zones are the next lever if profiling shows otherwise — not designed further here since there's no real 500-machine scenario to profile against yet (only the real 10).
- Query-side: every state/alarm/production query stays in the same `LIMIT 1`/`DISTINCT ON` latest-value shape already proven in the 2D twin (§7) — this is what keeps query cost flat regardless of scene complexity.

---

## 13. Data / query architecture and Grafana integration

**New service: `services/factory-twin-3d/`** (naming to match `services/alarm-api`'s convention), following the exact same shape:

- Backend: Express (or equivalent minimal Node HTTP server) + `pg`, serving (a) the static Three.js frontend bundle, and (b) a small read-only JSON API: `GET /api/placement` (device_3d_placement + hierarchy join), `GET /api/state` (the same latest-value state/alarm/production queries as §7, returning JSON instead of a Grafana panel's `table` format).
- No write endpoints in this service — unlike `alarm-api` (which has a real write path for ack/resolve), this twin is read-only. Any future "acknowledge from the 3D view" feature would be a call _into_ the existing `alarm-api`, not a new write path here — reuse, not duplicate.
- Proxied through `proxy/nginx.conf` at a new `location /factory-twin-3d/ { auth_request /auth-check; proxy_pass http://factory-twin-3d:<port>/; ... }` block, copying `alarm-api`'s existing block verbatim in shape.
- Polling or a lightweight WebSocket/SSE push for state updates — given the 2D twin's proven `refresh: "5s"` cadence is already adequate for this data's real update frequency (simulator writes continuously but not sub-second), a simple `setInterval` poll of `/api/state` every 5s is sufficient and matches existing dashboard refresh conventions; a push mechanism is not justified by any real requirement gathered so far.

---

## 14. Security and access control

Reuse `proxy/nginx.conf`'s existing `auth_request` pattern exactly (§1, §13) — the 3D twin sits behind the same Grafana session cookie check `alarm-api` already uses, no new login system, no new credential store. `GF_SECURITY_COOKIE_SECURE`/`GF_SECURITY_STRICT_TRANSPORT_SECURITY` are currently `"false"` in `docker-compose.yaml` (confirmed, local/dev posture) — this is an existing repo-wide condition, not something this design changes or should change unilaterally; flagged for whoever owns production hardening, same as it would be for any other service here.

---

## 15. Windows App vs. Web Application responsibilities

**Recommendation: Web application only, for this phase.** Three.js is browser/WebGL-native — a Windows desktop app would mean either (a) wrapping the same web app in Electron (extra packaging/update/distribution burden for zero new capability, since it'd still just be Chromium+Three.js), or (b) a genuinely separate native 3D engine (Unity/Unreal/DirectX) — a much larger, separate technology commitment with no precedent anywhere in this repo and no real requirement identified yet (the user's own acceptance-criteria list doesn't name a specific Windows-only capability, like local GPU access beyond what a browser provides, that would justify it). If a specific real requirement for a native Windows app emerges later (e.g. a dedicated always-on kiosk PC where a native app measurably outperforms a browser), that's a targeted follow-up decision, not a default to design around now.

---

## 16. Accessibility and responsive display strategy

Honest limitation, not glossed over: a 3D WebGL scene is inherently harder to make screen-reader-accessible than the 2D twin's Canvas panel (which at least has real DOM-adjacent text elements Grafana can expose). Concrete mitigations, not a claim of full accessibility parity:

- Every machine's real state/label/alarm data is ALSO available as a plain HTML sidebar/list view (same data, non-3D rendering) toggleable alongside the 3D scene — this is the actual accessibility fallback, not an afterthought bolted onto the 3D view itself.
- Color is never the only signal (same rule the 2D twin already follows: state color + icon shape together, not color alone) — carries into the 3D view as color + label text + (optionally) icon sprite.
- Responsive: below a real usability threshold width (e.g. mobile), fall back entirely to the plain list/sidebar view rather than trying to render a usable 3D scene on a small touch screen — a 3D factory scene is not a realistic phone-UI target, don't pretend otherwise.

---

## 17. How the future real factory layout will be imported/maintained

Three real sourcing paths, in order of realism given nothing exists yet:

1. **Manual survey entry**: a simple admin form/spreadsheet import writing directly into `device_3d_placement` (§4) — lowest effort, most likely first real path, doesn't require any CAD tooling.
2. **CAD/floor-plan import**: if a real architectural CAD file (DWG/DXF/IFC) becomes available, a one-time conversion script extracts real x/y coordinates per machine (matched by a real asset tag/`device_id` cross-reference the facilities team would need to provide) into the same `device_3d_placement` table — same schema, different `source` value.
3. **Ongoing maintenance**: `updated_at` + `source` columns (§4) mean re-surveys/corrections are just `UPDATE`s, with the existing row's history not retained unless a future requirement asks for placement history (not designed here, no real need identified yet — YAGNI).

No path here is designed as automatic/self-discovering (e.g. no BLE/UWB real-time positioning) — nothing in this repo's real infrastructure suggests that exists or is planned, and inventing that capability would be exactly the kind of speculative feature this document's own non-negotiables (§0) rule out.

---

## 18. What is real data, simulated data, and future data — explicit

| Data                                   | Status now                                          | Source                                                             |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Machine state (0/1/2/3)                | **Real**                                            | `v_ldi_machine_latest_full` + alarm tables, unchanged from 2D twin |
| `board_no`/`total_board`               | **Real**                                            | Same view                                                          |
| Current MO                             | **Real**                                            | Same view                                                          |
| Alarm count/owner/elapsed              | **Real**                                            | Same query shape as 2D twin                                        |
| Environmental compliance               | **Real**                                            | Same query as Andon/2D twin                                        |
| Which 10 machines exist, which 5 zones | **Real**                                            | `devices`, confirmed reporting machines only                       |
| Machine x/y/z position                 | **Simulated** (deterministic grid, §4)              | `device_3d_placement.is_simulated = TRUE` until real data arrives  |
| Building/floor names                   | **Not yet populated** (schema supports it, no data) | `factory_layout_hierarchy`, nullable until known                   |
| Machine-to-machine connections         | **Not modeled** (§10)                               | No real data exists; not fabricated                                |
| 3D machine geometry (shape/size)       | **Placeholder** (§9)                                | Simple parametric box, not a real CAD/photo-derived model          |
| Everything else (§7)                   | **Real**                                            | Identical queries to the proven 2D twin                            |

---

## 19. No fabricated physical coordinates — binding rule for this phase

Restated plainly since it's load-bearing: nothing built under this design may present simulated coordinates as if they were real. Every rendering surface that shows `device_3d_placement` data must check `is_simulated` and visibly indicate simulated layout (a banner, a label, a distinct render style) whenever it's true. This is a testable acceptance criterion (§20), not a good-faith intention.

---

## 20. Acceptance criteria and migration plan

**Acceptance criteria for Task 4.1 (1-machine 3D POC):**

- [ ] One real machine (its real state/board_no/mo/alarm data, live-queried) renders in a Three.js scene at a simulated position, clearly marked simulated.
- [ ] Clicking the machine opens the real Machine Snapshot drill-down with correct `var-machine_id`/`var-factory` (browser-verifiable this time, unlike Canvas — see §8).
- [ ] `services/factory-twin-3d/` exists, proxied through nginx with the same `auth_request` gate as `alarm-api`.
- [ ] No existing dashboard/service modified.

**Acceptance criteria for Task 4.2 (10-machine 3D twin):**

- [ ] All 10 real machines, in their real 5 zones (per `factory_layout_hierarchy` seeded from real `devices.location`), simulated positions within each zone.
- [ ] State/alarm/production data matches the same live-query standard as the 2D twin (real-time correctness, independently re-verifiable).
- [ ] Simulated-layout banner visible per §19.

**Acceptance criteria for Task 4.3 (performance test):**

- [ ] Real render/frame-time measurement at 10 machines (already-real fleet) plus a synthetic scale test at 100/500 simulated machines (following §12's `InstancedMesh` strategy) — measured, not assumed.
- [ ] Query latency for `/api/state` measured against the same 300ms budget used throughout this session's work.

**Acceptance criteria for Task 4.4 (drill-down integration):**

- [ ] Click-to-Machine-Snapshot verified in an actual browser session for all 10 machines (this is achievable here in a way it wasn't for Grafana Canvas — flag prominently if a browser tool still isn't available when this task runs, and fall back to the same structural-only verification the 2D twin used).

**Migration plan (the STOP → "waiting for real layout" step in the user's flow):**

1. Tasks 4.1-4.4 ship with `device_3d_placement.is_simulated = TRUE` for all rows, deterministic grid per §4.
2. Work stops. No further 3D tasks proceed until a real factory layout source (§17) is actually supplied.
3. When real coordinates arrive: run the §17 import path, `UPDATE device_3d_placement SET is_simulated = FALSE, source = '<real source>'` per row. Zero changes to telemetry queries (§5), zero changes to the rendering/interaction code built in 4.1-4.4 — only the data changes, and the simulated-layout banner (§19) disappears once every visible row is real.

---

## Explicitly out of scope for this design

- Any implementation — this is a design document only, per the user's explicit instruction.
- Machine-to-machine process connections (§10) — no real data exists.
- Automatic/self-discovering positioning (§17) — no real infrastructure for it.
- Native Windows app (§15) — no identified real requirement yet.
- Full accessibility parity with the 2D twin (§16) — 3D scenes have inherent limitations, mitigated not eliminated.
- Any change to `ims-ldi-manufacturing.json`, `ims-ldi-operator-andon.json`, or `ims-ldi-factory-digital-twin.json`.
