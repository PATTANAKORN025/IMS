-- ══════════════════════════════════════════════════════════════
-- 072: AlarmDetail Style Guide v1.0 -- 15 curated rewrites
-- ══════════════════════════════════════════════════════════════
-- Applies docs/architecture/ALARM_DETAIL_STYLE_GUIDE.md's v1.0 entries:
-- 9 codes grounded in real production frequency (data/real/ldi_alarm_log_
-- clean.sql, 10,000-row real historical log) + real vendor AlarmMsg, and
-- 6 real-vendor Critical codes (not frequency-backed -- the real log
-- recorded zero Critical firings in the available window).
--
-- Idempotent UPDATE-only (no INSERT/TRUNCATE): safe to re-run regardless
-- of which catalog is currently loaded. A code not present in the current
-- catalog (mock vs. real) simply matches 0 rows -- not an error. This is
-- deliberately wired into scripts/switch-data-mode.sh (both mock and real
-- paths) so these 15 entries survive a future catalog reset in either
-- mode -- see that script for the re-application step.

UPDATE public.ldi_alarm_ms_code SET alarm_detail = CASE alarm_id
    -- Critical (real vendor text, hand-selected for clarity, not frequency-ranked)
    WHEN '01180016' THEN 'Operator-initiated emergency stop halted all axes immediately. Inspect the work area for the cause before releasing the E-stop and resuming operation.'
    WHEN '0C020014' THEN 'A safety sensor (light curtain or area guard) detected an intrusion into the machine''s protected zone and halted motion. Clear the zone and confirm no personnel or foreign objects remain before resetting.'
    WHEN '0118000E' THEN 'The measured axis position deviated from the commanded position beyond the critical threshold, indicating a possible mechanical obstruction, encoder fault, or servo tuning issue. Stop and inspect the affected axis before re-homing.'
    WHEN '01180011' THEN 'The servo drive detected current draw beyond its rated limit on one or more axes, which can indicate a mechanical jam, a short circuit, or a failing motor/drive. Power down and inspect before resetting the drive.'
    WHEN '0C010001' THEN 'The motion controller detected an imminent or actual collision between the two exposure stages and halted motion to prevent damage. Verify stage positions and clear any obstruction before resuming.'
    WHEN '01180010' THEN 'A commanded or measured axis acceleration exceeded the safety limit, usually indicating a corrupted motion profile or a mechanical fault causing an uncommanded jump. Stop and verify the axis before re-enabling motion.'
    -- Major (real production frequency: 1x)
    WHEN '10006' THEN 'The exposure head''s imaging device (DMD) could not be switched into its protective state before an unsafe condition. Retry the operation; if it persists, check the DMD controller connection and power.'
    -- Warning (real production frequency, highest first)
    WHEN '91009' THEN 'The vacuum hold-down pressure on the exposure table is outside the configured operating range. Check for a leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.'
    WHEN '90005' THEN 'The measured registration error (PE/JE) exceeded the configured tolerance for this job. Check board flatness, alignment mark quality, and recent calibration history for this station.'
    WHEN '90004' THEN 'The outer-layer alignment routine could not register the board to the mechanical grip point within tolerance. Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly.'
    WHEN '93004' THEN 'A scheduled or requested calibration cycle did not complete -- the machine did not enter the calibration process within the expected time. Check that no job is queued or running, then retry the calibration.'
    WHEN '90001' THEN 'The inner-layer alignment routine could not register the board to the mechanical grip point within tolerance. Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly.'
    WHEN '90012' THEN 'The operator cancelled exposure after the automatic alignment routine failed to converge. Review the alignment marks and job setup before re-attempting; this is an operator action, not an automatic fault.'
    WHEN '70004' THEN 'The position-synchronized output (scan) speed exceeded the configured motion limit during exposure. Check the job''s scan-speed parameter and the stage''s mechanical condition before re-running.'
    WHEN '91008' THEN 'The cleanroom temperature or humidity reading is outside the configured process window (22±2°C / 55±5% RH). Check the HVAC system and the sensor for this station before resuming production.'
    ELSE alarm_detail
END
WHERE alarm_id IN (
    '01180016','0C020014','0118000E','01180011','0C010001','01180010',
    '10006','91009','90005','90004','93004','90001','90012','70004','91008'
);
