# Spec: Ubuntu SNMP Disk Realism Fix (P0.2)

**Status: fixed and deployed 2026-08-15.**

## Root cause (already established, `READ_ONLY_AUDIT_2026-08-15.md` §3c)

`monitoring/snmpsim/ubuntu.snmprec`'s disk entry (`hrStorageSize`, OID `.5.2`) was `52428800`, while its `hrStorageUsed` random-walk range (`.6.2`) was `min=65536000,max=125000000` -- copy-pasted from `windows.snmprec`'s same OID without recalculating a total that stays above it. Used could never be less than ~125% of total, so `parser.js`'s `Math.min(diskUsedGb, diskTotalGb)` clamp pinned disk at exactly 100% for every sample, forever.

## Growth-mystery correction (before finalizing this fix, as required)

An earlier note in this session claimed `disk_total_gb` "grew from 9,375 to 12,500 GB" over time, implying a second bug. Re-investigated with raw (non-bucketed) queries: `disk_total_gb` takes exactly 2 distinct values in its entire history -- `0` (9 rows, from the parser's offline/empty-walker zeroing) and `12500` (3,484 rows). No intermediate value exists. The "growth" was an artifact of averaging real `12500` rows together with sporadic `0` rows inside a 10-minute bucket. Corrected in `READ_ONLY_AUDIT_2026-08-15.md` in place. There is no second mechanism -- the single used-range misconfiguration fully explains the observed behavior.

## Fix

Changed only `hrStorageSize` (`.5.2`): `52428800` → `180000000`. `au` (allocation unit, `.4.2` = `256000`) and the used-value range (`.6.2`) both left untouched -- smallest possible change, and the used range's own shape (its variation pattern) is preserved exactly, not replaced.

Sizing rationale, worked from first principles rather than copying `windows.snmprec`'s numbers: chose `180000000` so `total_bytes = 180000000 × 256000 = 46,080,000,000,000` bytes ≈ 42,915 GB, comfortably above the used range's max (`125000000 × 256000 / 1073741824` ≈ 29,802 GB). Resulting utilization band: **36.4% (min) – 69.4% (max)** -- a healthy, realistic range loosely similar in shape to `windows.snmprec`'s own 32.8%-62.5% band (used only as a sanity reference, not copied), distinct from it in its actual numbers since Ubuntu's "lower resource usage" profile (per the file's own header comment) warrants its own values rather than Windows's.

Also double-checked RAM's entries on the same file while investigating: `size=8388608, au=1024` gives 8192 MB total, used range `4194304-7864320` gives 4096-7680 MB (50%-93.75%) -- already healthy, not part of this bug, not touched.

## Rollout

`docker compose restart snmpsim` -- **narrowest possible restart, per the instruction to prefer this over a Node-RED restart**. `snmpsim` loads `.snmprec` files once at process start (`--force-index-rebuild`); Node-RED polls it fresh over the network every cycle with no client-side caching, so a Node-RED restart was not needed. Confirmed via `docker logs ims-snmpsim`: clean restart, all 3 device profiles (`Netk@`, `windows`, `ubuntu`) reopened and responding.

## Results

| | Before | After |
| --- | --- | --- |
| `ERP-MASTER-UBUNTU` disk | 12500/12500 GB, pinned 100% | **15974.31/42915.34 GB, 37.2%** |
| `ERP-MASTER-WINDOWS` disk (control, untouched file) | -- | 62398.71/186264.51 GB, 33.5% -- independently varying, confirms this fix didn't affect the other profile |
| Historical rows | 3,484 rows at `12500/12500`, spanning 2026-08-13T09:04:44Z → 2026-08-15T04:18:37Z (last pre-fix sample) | **Unchanged, still present** -- confirmed no history was rewritten, this is a forward-only fix |
| Parser logic | -- | **Not touched** -- fix is entirely in the `.snmprec` config file, per the instruction not to hide bad simulator input behind parser changes |

One transient `0/0` row observed at 04:19:03Z during the ~1s window while `snmpsim` was restarting (device briefly unreachable, correctly logged as zero by the existing `isEmpty` handling, not fabricated) -- expected, not a defect.

New value (37.2%) lands almost exactly on the calculated minimum of the designed band (36.4%), as expected for an early sample in the random walk.
