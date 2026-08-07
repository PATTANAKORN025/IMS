-- ══════════════════════════════════════════════════════════════
-- 056: ldi_data.filmno / board_id — normalize '' to NULL
-- ══════════════════════════════════════════════════════════════
-- Data-quality audit (2026-08-06): filmno and board_id are never
-- populated by any real integration (simulator or otherwise) -- both
-- always mean "no value". Despite that single meaning, live data has two
-- different representations of it: rows inserted before the accompanying
-- ldi_auth_check fix (same commit) coerced a missing value to '' via
-- `String(item.filmno || '')`, while other rows have true NULL. Any
-- query written as `WHERE filmno IS NULL` silently misses the ''
-- rows -- a real correctness trap, not just cosmetic.
--
-- The Node-RED ingestion function now stores NULL for both fields going
-- forward (item.filmno ? String(item.filmno) : null); this migration
-- backfills existing '' rows to NULL so the historical data matches the
-- new, single, correct representation of "no value".

UPDATE public.ldi_data SET filmno = NULL WHERE filmno = '';
UPDATE public.ldi_data SET board_id = NULL WHERE board_id = '';
