# RAM Metric Accumulation Bug — Root Cause + Fix Design

**Status: Fixed and deployed 2026-08-15 (P0.1 of the Reliability Test Suite).** See Results section at the bottom.

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
- Line 33 (return statement): `ramUsedMb: Math.max(0, Math.min(ramTotalMb, ...ramUsedMb...))` -- re-clamps `ramUsedMb` against the _already-clamped_ `ramTotalMb`. Once `ramTotalMb` has saturated at `1048576`, `ramUsedMb` (which grew in lockstep, roughly proportionally) also gets clamped down to `1048576` on the same line. Both values land on the identical number -- self-reinforcing, because next cycle reads `state.ram_total` back out at `1048576` and adds more on top, immediately re-clamping to `1048576` again. Once a device hits the ceiling once, it is stuck there permanently until Node-RED restarts and `state` resets.

This fully explains the observed data: every device that's been polling long enough has saturated at 100% "RAM used," which is why `Fleet Health Score`'s `CASE WHEN ... ram_pct > 95 ... THEN 0` branch fires for every device, every time, driving the fleet score to a permanent `0%`.

## Fix (not deployed)

Two independent problems, both need fixing:

1. **Don't seed from previous state.** RAM accumulators should start at `0` each poll cycle for storage-type SNMP walks, the same way disk's `largestDiskBytes` does (`let largestDiskBytes = 0` is local to the cycle). Line 15's `state.ram_total || 0` / `state.ram_used || 0` seeding exists so a value survives across polls that _don't_ include a storage walk (`isEmpty` walker-type branches already zero these out deliberately for `walkerType === 'storage'` -- see line just above, `if (walkerType === 'storage') { state.ram_total = 0; ... }`). The bug is that the _populated_ path (the one this bug lives in) uses `+=` instead of `=` when a storage walk succeeds, so it compounds instead of replacing.

   Fix: change `ramTotalMb += bytesTotal / 1048576; ramUsedMb += bytesUsed / 1048576;` to `ramTotalMb = bytesTotal / 1048576; ramUsedMb = bytesUsed / 1048576;` (drop the seed-from-state read for these two variables specifically, or reset them to `0` right before the storage loop instead of seeding from `state.ram_total`/`state.ram_used`).

2. **The 1TB clamp is a symptom-hider, not a fix.** Once (1) is fixed, legitimate RAM totals will no longer exceed 1TB in normal operation, so the clamp becomes inert (harmless to leave as a defensive backstop) -- no change strictly required here, but worth a comment noting it's a last-resort sanity bound now, not a normal code path.

## Rollout

Deployed via `docker compose restart node-red` (single-service, same narrow-blast-radius pattern as Phase A1) at 2026-08-15T04:13:49Z. `nodered_data/lib/parser.js` is `require()`'d once into `functionGlobalContext.parser` by `nodered_data/settings.js` at process start, confirmed via direct read of `settings.js` line 31 before deploying -- a restart is both necessary and sufficient to pick up the fix.

## Results

Pre-fix baseline (captured moments before restart): `ERP-MASTER-WINDOWS`, `EXPOSURE LDI-2`, `EXPOSURE LDI-2B` all pinned at `ram_used_mb = ram_total_mb = 1048576`. `ERP-MASTER-UBUNTU` was mid-climb at `637440/679936` (93.7%) -- itself corroborating evidence for the accumulation theory, since it hadn't yet re-saturated to the ceiling since the A1 restart reset all devices' `flow` context to zero.

Post-fix, measured over 3 consecutive polling cycles (04:15:03 → 04:16:03Z, 30s apart):

| Device             | RAM used/total | %      | Stable across 3 cycles?      |
| ------------------ | -------------- | ------ | ---------------------------- |
| ERP-MASTER-UBUNTU  | 7680/8192 MB   | 93.75% | Yes, identical all 3 samples |
| ERP-MASTER-WINDOWS | 15360/32768 MB | 46.9%  | Yes                          |
| EXPOSURE LDI-2     | 15360/16384 MB | 93.75% | Yes                          |
| EXPOSURE LDI-2B    | 15360/16384 MB | 93.75% | Yes                          |

No device shows `1048576` anymore. No device is climbing. Values differ meaningfully across devices (46.9%-93.75%), not collapsed to one shared number -- confirms this is now a real per-device snapshot, not an accumulated artifact.

**CPU/disk/temp unaffected, confirmed by direct comparison against the same rows**: `cpu_load_percent` (50 / 88.25 / 83.75 / 83.75) and `temp_c` (65 / 95 / 92 / 92) match this session's earlier pre-fix baseline exactly. `disk_total_gb`/`disk_used_gb` also unchanged -- `ERP-MASTER-UBUNTU` still shows the separate, already-diagnosed `12500/12500` (100%) disk bug (`READ_ONLY_AUDIT_2026-08-15.md` §3c, fixed separately as P0.2) -- proving this RAM fix touched only what it was supposed to touch.

Unit tests re-run post-edit, pre-deploy: `tests/unit/parser.test.js` (22/22) and `tests/unit/v2-parser.test.js` (27/27) both pass, including the existing "RAM total capped at 1TB" and "RAM used never exceeds RAM total" boundary tests -- confirms the defensive clamp (kept, not removed -- see point 2 above) still behaves correctly and this fix didn't regress it.

## Scope note (resolved)

`disk_used_gb == disk_total_gb` for `ERP-MASTER-UBUNTU`, flagged here as a "not investigated" scope note -- root-caused separately in `READ_ONLY_AUDIT_2026-08-15.md` §3c (a `.snmprec` config bug, not related to this RAM accumulation issue) and fixed as P0.2.
