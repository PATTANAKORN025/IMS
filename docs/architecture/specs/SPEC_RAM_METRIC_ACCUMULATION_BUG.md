# RAM Metric Accumulation Bug — Root Cause + Fix Design

**Status:** Root-caused, NOT deployed. Requires a Node-RED redeploy/restart to take effect, which the standing soak-test freeze blocks. Do not deploy until the freeze lifts.

**Priority:** High — actively producing a wrong "everything is critical" signal on every infrastructure dashboard that shows Fleet Health Score or RAM %, right now, for every device.

## Evidence chain (3 layers)

**Layer 3 (UI):** `ims-capacity` dashboard's "Fleet Health Score" panel renders `0%` in red. Screenshot: `.playwright-mcp\page-2026-08-15T02-24-50-863Z.png`.

**Layer 2 (runtime/DB):** every device in `public.sys_metrics`, as of 2026-08-15T02:2x UTC, has `ram_used_mb` exactly equal to `ram_total_mb` exactly equal to `1048576`:

```
     device_id      | ram_used_mb | ram_total_mb
--------------------+-------------+--------------
 ERP-MASTER-UBUNTU  |     1048576 |      1048576
 ERP-MASTER-WINDOWS |     1048576 |      1048576
 EXPOSURE LDI-2      |     1048576 |      1048576
 EXPOSURE LDI-2B     |     1048576 |      1048576
```

`disk_used_gb`/`disk_total_gb` for the same rows are NOT stuck (12500/12500, 116415.32/186264.51, 476.84/500, 476.84/500) -- varied, plausible values. Only RAM is pinned, and pinned at the exact same number for every device, which is the tell.

**Layer 1 (code):** `nodered_data/lib/parser.js`, function `parseAll`:

- Line 15: `let ramTotalMb = state.ram_total || 0, ramUsedMb = state.ram_used || 0, ...` -- RAM accumulators are **seeded from the previous poll cycle's state**, not zeroed.
- Line 31 (inside `if (type === 'storage')`): `ramTotalMb += bytesTotal / 1048576; ramUsedMb += bytesUsed / 1048576;` -- each poll cycle **adds** this cycle's RAM-classified storage-table bytes onto whatever was already accumulated from every prior cycle. Disk, by contrast, does a straight replacement two lines later (`diskTotalGb = largestDiskBytes / 1073741824`), not `+=` -- that asymmetry is why disk isn't stuck and RAM is.
- Same line, later: `ramTotalMb = Math.min(ramTotalMb, 1048576);` -- a 1TB sanity ceiling, evidently added as a defensive clamp against garbage SNMP data. Because `ramTotalMb` grows unboundedly every poll (never resets), it eventually exceeds this ceiling and gets clamped to exactly `1048576`.
- Line 33 (return statement): `ramUsedMb: Math.max(0, Math.min(ramTotalMb, ...ramUsedMb...))` -- re-clamps `ramUsedMb` against the *already-clamped* `ramTotalMb`. Once `ramTotalMb` has saturated at `1048576`, `ramUsedMb` (which grew in lockstep, roughly proportionally) also gets clamped down to `1048576` on the same line. Both values land on the identical number -- self-reinforcing, because next cycle reads `state.ram_total` back out at `1048576` and adds more on top, immediately re-clamping to `1048576` again. Once a device hits the ceiling once, it is stuck there permanently until Node-RED restarts and `state` resets.

This fully explains the observed data: every device that's been polling long enough has saturated at 100% "RAM used," which is why `Fleet Health Score`'s `CASE WHEN ... ram_pct > 95 ... THEN 0` branch fires for every device, every time, driving the fleet score to a permanent `0%`.

## Fix (not deployed)

Two independent problems, both need fixing:

1. **Don't seed from previous state.** RAM accumulators should start at `0` each poll cycle for storage-type SNMP walks, the same way disk's `largestDiskBytes` does (`let largestDiskBytes = 0` is local to the cycle). Line 15's `state.ram_total || 0` / `state.ram_used || 0` seeding exists so a value survives across polls that *don't* include a storage walk (`isEmpty` walker-type branches already zero these out deliberately for `walkerType === 'storage'` -- see line just above, `if (walkerType === 'storage') { state.ram_total = 0; ... }`). The bug is that the *populated* path (the one this bug lives in) uses `+=` instead of `=` when a storage walk succeeds, so it compounds instead of replacing.

   Fix: change `ramTotalMb += bytesTotal / 1048576; ramUsedMb += bytesUsed / 1048576;` to `ramTotalMb = bytesTotal / 1048576; ramUsedMb = bytesUsed / 1048576;` (drop the seed-from-state read for these two variables specifically, or reset them to `0` right before the storage loop instead of seeding from `state.ram_total`/`state.ram_used`).

2. **The 1TB clamp is a symptom-hider, not a fix.** Once (1) is fixed, legitimate RAM totals will no longer exceed 1TB in normal operation, so the clamp becomes inert (harmless to leave as a defensive backstop) -- no change strictly required here, but worth a comment noting it's a last-resort sanity bound now, not a normal code path.

## Rollout (deferred)

Same discipline as `SPEC_PG_POOL_RESILIENCE.md`: this lives in `nodered_data/lib/parser.js`, which `ims-node-red`'s function nodes load via `global.get('parser')` at flow deploy time -- editing the file will NOT hot-reload the way Grafana dashboard JSON does; it requires a Node-RED deploy/restart to take effect. Per the standing freeze, do not deploy until a soak attempt completes cleanly or the freeze is explicitly lifted.

When deployed: verify all 4 (or however many by then) devices' `ram_used_mb`/`ram_total_mb` diverge from each other and from `1048576` within a few poll cycles, and that `Fleet Health Score` on both `ims-capacity` and `ims-noc-overview` moves off `0%`.

## Scope note

`disk_used_gb == disk_total_gb` for `ERP-MASTER-UBUNTU` (12500/12500, literally 100% disk) was also observed in the same query and looks suspicious on its own, but is NOT explained by this bug (disk doesn't accumulate). Not investigated further here -- flagged for a separate pass, not blocking this fix.
