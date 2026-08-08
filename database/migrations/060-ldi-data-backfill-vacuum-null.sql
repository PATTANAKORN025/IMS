-- ══════════════════════════════════════════════════════════════
-- 060: ldi_data.air_vacuum -- backfill legacy 0.0 sentinel to NULL
-- ══════════════════════════════════════════════════════════════
-- Migration 054 fixed the simulator to send NULL (not the old 0.0
-- "not applicable" sentinel) for DF OUTER/SM machines, which don't
-- measure vacuum -- but explicitly did not backfill existing rows,
-- planning to let them age out under the 180-day retention policy.
--
-- That's too slow in practice: 0.0 was never a genuine measurement for
-- ANY machine (DF INNER's real range is -16..-19 kPa; the fault-injected
-- excursions added in the same commit as migration 054 are -1..-6 kPa;
-- neither ever lands on exactly 0), so this UPDATE is unambiguous -- it
-- only touches rows carrying the already-acknowledged-wrong sentinel,
-- not any genuine reading. Confirmed live before writing this migration:
-- 143,600 of 323,588 ldi_data rows (44%) still had air_vacuum = 0,
-- which flag_vac_out_of_spec's recalibrated threshold (migration 057)
-- reads as permanently out-of-spec -- inflating the RCA baseline for
-- VACUUM (91009) enough to cap its achievable Lift even after the fault-
-- injection fix (migration 058's commit) was working correctly.
--
-- Fresh-deploy audit (2026-08-08): on a brand-new database, this UPDATE
-- runs against the full 034-ldi-statistical-mock.sql seed (several
-- hundred thousand rows, mostly already compressed by that point) and
-- fails with "tuple decompression limit exceeded ... current limit:
-- 100000" -- a hard TimescaleDB per-transaction safety cap on the live
-- system never hit historically because this migration was originally
-- applied incrementally, before the dataset grew this large. Raised per
-- TimescaleDB's own hint; scoped to this session/statement only, not a
-- global setting.

SET timescaledb.max_tuples_decompressed_per_dml_transaction = 0;

UPDATE public.ldi_data SET air_vacuum = NULL WHERE air_vacuum = 0;
