-- ══════════════════════════════════════════════════════════════
-- 073: Alarm knowledge v1.1 -- structured Cause/Impact/Recovery
--      + SOP reference field + remaining mock-catalog translations
-- ══════════════════════════════════════════════════════════════
-- Implements docs/architecture/ALARM_DETAIL_STYLE_GUIDE.md v1.1:
--  1) Translates the 10 remaining Thai-language alarm_detail entries in
--     the mock catalog to English (completes English coverage for all
--     21 mock-catalog codes).
--  2) Adds cause/impact/recovery_action columns (§6 of the guide) and
--     populates all 25 codes covered so far (21 mock + 4 real-only
--     Critical codes from v1.0).
--  3) Adds sop_reference (§7) -- schema-ready, deliberately left NULL
--     everywhere; no real SOP/work-instruction documents exist to link
--     to yet, and inventing one would violate the guide's own provenance
--     rule (§4).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE-only, safe to re-run
-- regardless of which catalog (mock/real) is currently loaded, same
-- pattern as migration 072.

ALTER TABLE public.ldi_alarm_ms_code
    ADD COLUMN IF NOT EXISTS cause VARCHAR(500),
    ADD COLUMN IF NOT EXISTS impact VARCHAR(500),
    ADD COLUMN IF NOT EXISTS recovery_action VARCHAR(500),
    ADD COLUMN IF NOT EXISTS sop_reference VARCHAR(500);

COMMENT ON COLUMN public.ldi_alarm_ms_code.cause IS
    'Most likely root cause, one atomic clause. See docs/architecture/ALARM_DETAIL_STYLE_GUIDE.md §6.';
COMMENT ON COLUMN public.ldi_alarm_ms_code.impact IS
    'Operational consequence right now (blocked/delayed/quality-risk), one atomic clause. See ALARM_DETAIL_STYLE_GUIDE.md §6.';
COMMENT ON COLUMN public.ldi_alarm_ms_code.recovery_action IS
    'Imperative instruction for the operator/technician, one atomic clause. See ALARM_DETAIL_STYLE_GUIDE.md §6.';
COMMENT ON COLUMN public.ldi_alarm_ms_code.sop_reference IS
    'Link/ID for a real Standard Operating Procedure or Work Instruction document. Intentionally NULL until real SOP/WI documents exist -- see ALARM_DETAIL_STYLE_GUIDE.md §7. Do not populate with invented content.';

-- ── 1) Translate the 10 remaining mock-catalog codes (Thai -> English) ──
UPDATE public.ldi_alarm_ms_code SET alarm_detail = CASE alarm_id
    WHEN '01060009' THEN 'The camera''s detected serial number does not match the one configured for this station. Check that the correct camera is connected and reconfigure the station if a camera was recently swapped.'
    WHEN '0106000C' THEN 'The system could not stop the camera when commanded. Retry the stop command; if it persists, check the camera''s connection and power.'
    WHEN '0106001C' THEN 'The camera did not receive its stop-trigger signal within the expected time. Check the trigger source and cabling for this station.'
    WHEN '01060013' THEN 'A duplicate IP address was detected on the camera/device network, most likely from a network configuration error. Check the IP settings of all cameras and devices on this station''s network segment.'
    WHEN '010E0064' THEN 'The system has no motor type configured for this axis. Check the axis configuration and set the correct motor type before continuing.'
    WHEN '01100001' THEN 'The station could not establish a connection to the PLC. Check the communication cable and network configuration between the station and the PLC.'
    WHEN '01130002' THEN 'Communication between two connected devices on this station failed or became unstable. Check the physical connection and communication settings between the affected devices.'
    WHEN '80001' THEN 'The station waited too long for the subdrawing (job image) preparation data to arrive. Check the job data source and network path feeding this station.'
    WHEN '92013' THEN 'A network connection from this station timed out. Check the machine''s network status and cabling.'
    WHEN '97005' THEN 'The station''s connection to the database became abnormal or was lost. Check the database server status and this station''s network path to it.'
    ELSE alarm_detail
END
WHERE alarm_id IN ('01060009','0106000C','0106001C','01060013','010E0064','01100001','01130002','80001','92013','97005');

-- ── 2) Cause / Impact / Recovery Action for all 25 codes ──
UPDATE public.ldi_alarm_ms_code SET
    cause = CASE alarm_id
        WHEN '01180016' THEN 'The operator (or an interlock) pressed or triggered the emergency stop control.'
        WHEN '0C020014' THEN 'A person, object, or the machine''s own moving parts crossed a light curtain or area guard boundary.'
        WHEN '0118000E' THEN 'A mechanical obstruction, encoder fault, or servo tuning issue caused the actual axis position to diverge from the commanded position beyond the safety threshold.'
        WHEN '01180011' THEN 'A mechanical jam, short circuit, or a failing motor/drive caused current draw to exceed the servo drive''s rated limit.'
        WHEN '0C010001' THEN 'A position error, timing fault, or sensor failure allowed the two exposure stages to approach each other beyond the safe separation distance.'
        WHEN '01180010' THEN 'A corrupted motion profile or a mechanical fault caused a commanded or measured axis acceleration to exceed the configured safety limit.'
        WHEN '10006' THEN 'The DMD controller did not acknowledge the protection-mode command, likely a communication fault or a controller-side error.'
        WHEN '91009' THEN 'A leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.'
        WHEN '90005' THEN 'Board flatness, alignment mark quality, or drift in this station''s calibration exceeded the job''s configured registration tolerance.'
        WHEN '90004' THEN 'Contamination or damage on the alignment marks, or a grip-mechanism seating issue, prevented registration to the mechanical grip point.'
        WHEN '93004' THEN 'A queued or running job blocked the calibration cycle from starting within the expected time window.'
        WHEN '90001' THEN 'Contamination or damage on the alignment marks, or a grip-mechanism seating issue, prevented registration to the mechanical grip point.'
        WHEN '90012' THEN 'The automatic alignment routine could not converge within its retry limit, and the operator chose to cancel rather than continue retrying.'
        WHEN '70004' THEN 'The job''s scan-speed parameter or a mechanical issue with the stage caused the position-synchronized output speed to exceed the configured motion limit.'
        WHEN '91008' THEN 'The cleanroom HVAC system drifted outside its setpoint, or the environmental sensor for this station is faulty.'
        WHEN '01060009' THEN 'A different camera unit is connected than the one registered for this station, or the station''s camera configuration was not updated after a hardware swap.'
        WHEN '0106000C' THEN 'The camera did not respond to the stop command, likely due to a communication fault or a camera driver/firmware issue.'
        WHEN '0106001C' THEN 'The trigger signal from the controller or I/O board did not arrive in time, likely a timing, cabling, or I/O configuration issue.'
        WHEN '01060013' THEN 'Two or more devices on this station''s network are configured with the same IP address, typically from a manual misconfiguration or a device replaced without updating its address.'
        WHEN '010E0064' THEN 'The motor-type parameter for this axis was never set, or was cleared by a configuration reset.'
        WHEN '01100001' THEN 'The PLC is powered off, unreachable on the network, or its communication parameters (IP/port/protocol) don''t match the station''s configuration.'
        WHEN '01130002' THEN 'A cable fault, port misconfiguration, or a device-side fault interrupted communication between the affected devices.'
        WHEN '80001' THEN 'The upstream system preparing the job''s subdrawing image did not deliver it within the expected time, likely due to a slow data source or a network delay.'
        WHEN '92013' THEN 'The network path to a required service (job server, database, or peer device) was slow or unreachable within the timeout window.'
        WHEN '97005' THEN 'The database server is unreachable, overloaded, or the station''s connection pool encountered an unexpected error.'
        ELSE cause
    END,
    impact = CASE alarm_id
        WHEN '01180016' THEN 'All axis motion is immediately halted and the machine cannot resume until the E-stop is cleared and reset.'
        WHEN '0C020014' THEN 'Motion is halted on this station until the zone is confirmed clear and the safety circuit is reset.'
        WHEN '0118000E' THEN 'The axis is disabled to prevent a crash or further position loss; the current job on this axis cannot continue.'
        WHEN '01180011' THEN 'The affected drive trips offline to protect the hardware, halting motion on that axis until reset.'
        WHEN '0C010001' THEN 'Motion is halted immediately to prevent physical damage to both stages; both stages are unavailable until cleared.'
        WHEN '01180010' THEN 'The axis is disabled to prevent an uncontrolled motion event; the current job on this axis cannot continue.'
        WHEN '10006' THEN 'The imaging device may remain in an unprotected state, which can risk damage during an unsafe condition; exposure is blocked until resolved.'
        WHEN '91009' THEN 'Board hold-down cannot be guaranteed, risking board shift or focus error during exposure on this station.'
        WHEN '90005' THEN 'The current board''s registration may be out of specification and should be flagged for downstream inspection.'
        WHEN '90004' THEN 'The current board cannot proceed to outer-layer exposure until alignment succeeds.'
        WHEN '93004' THEN 'The station''s calibration is not current, which can degrade registration accuracy on subsequent jobs until calibration completes.'
        WHEN '90001' THEN 'The current board cannot proceed to inner-layer exposure until alignment succeeds.'
        WHEN '90012' THEN 'The current board did not receive exposure and needs to be re-queued after the alignment issue is addressed.'
        WHEN '70004' THEN 'The current exposure pass may have inconsistent dosage due to the speed excursion and should be flagged for quality review.'
        WHEN '91008' THEN 'Process results (registration, resist behavior) on this station may be affected until the environment returns to the configured window.'
        WHEN '01060009' THEN 'The station cannot verify it is using the correct camera, so imaging is blocked until resolved.'
        WHEN '0106000C' THEN 'The camera may continue running or capturing after the station expected it to be idle, risking inconsistent state for the next operation.'
        WHEN '0106001C' THEN 'The camera''s current capture cycle did not stop as scheduled; the current job step may need to be retried.'
        WHEN '01060013' THEN 'Network communication with the affected devices becomes unreliable or fails outright, which can stall imaging or data transfer.'
        WHEN '010E0064' THEN 'The axis cannot be driven correctly since the controller doesn''t know how to command this motor type; motion commands to this axis will be rejected.'
        WHEN '01100001' THEN 'The station cannot exchange I/O or status with the PLC, which typically blocks the automated production sequence for this station.'
        WHEN '01130002' THEN 'Data or commands between the affected devices may be lost or delayed, which can stall the current operation.'
        WHEN '80001' THEN 'The station cannot begin exposure until the subdrawing data arrives, delaying the current job.'
        WHEN '92013' THEN 'The operation depending on that network connection did not complete and needs to be retried once connectivity is restored.'
        WHEN '97005' THEN 'The station cannot read or write production data until the connection is restored, which can stall data logging or job lookups.'
        ELSE impact
    END,
    recovery_action = CASE alarm_id
        WHEN '01180016' THEN 'Inspect the work area for the cause of the stop, then release the E-stop control and reset the machine before resuming.'
        WHEN '0C020014' THEN 'Clear the protected zone, confirm no personnel or foreign objects remain, then reset the safety circuit before resuming.'
        WHEN '0118000E' THEN 'Stop and inspect the affected axis for obstructions or encoder faults, then re-home the axis before resuming.'
        WHEN '01180011' THEN 'Power down and inspect the affected axis and drive for a jam or electrical fault before resetting the drive.'
        WHEN '0C010001' THEN 'Verify both stage positions and clear any obstruction before resuming; do not override without confirming actual stage separation.'
        WHEN '01180010' THEN 'Stop and verify the axis and its motion profile before re-enabling motion.'
        WHEN '10006' THEN 'Retry the operation; if it persists, check the DMD controller connection and power.'
        WHEN '91009' THEN 'Check for a leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.'
        WHEN '90005' THEN 'Check board flatness, alignment mark quality, and recent calibration history for this station.'
        WHEN '90004' THEN 'Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly.'
        WHEN '93004' THEN 'Check that no job is queued or running, then retry the calibration.'
        WHEN '90001' THEN 'Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly.'
        WHEN '90012' THEN 'Review the alignment marks and job setup before re-attempting; this is an operator action, not an automatic fault.'
        WHEN '70004' THEN 'Check the job''s scan-speed parameter and the stage''s mechanical condition before re-running.'
        WHEN '91008' THEN 'Check the HVAC system and the sensor for this station before resuming production.'
        WHEN '01060009' THEN 'Confirm the physically connected camera matches the configured serial number, then update the station configuration or reconnect the correct unit.'
        WHEN '0106000C' THEN 'Retry the stop command; if the camera still doesn''t respond, power-cycle the camera and check its cable connection.'
        WHEN '0106001C' THEN 'Check the trigger source and cabling for this station, then retry the operation.'
        WHEN '01060013' THEN 'Check the IP settings of all cameras and devices on this station''s network segment and correct the duplicate.'
        WHEN '010E0064' THEN 'Check the axis configuration and set the correct motor type before attempting to move this axis.'
        WHEN '01100001' THEN 'Check the communication cable and network configuration between the station and the PLC, and confirm the PLC is powered on.'
        WHEN '01130002' THEN 'Check the physical connection and communication settings between the affected devices, then retry.'
        WHEN '80001' THEN 'Check the job data source and the network path feeding this station; retry once the data is confirmed available.'
        WHEN '92013' THEN 'Check the machine''s network status and cabling, then retry the operation.'
        WHEN '97005' THEN 'Check the database server status and this station''s network path to it; the connection typically recovers automatically once the server is reachable.'
        ELSE recovery_action
    END
WHERE alarm_id IN (
    '01180016','0C020014','0118000E','01180011','0C010001','01180010',
    '10006','91009','90005','90004','93004','90001','90012','70004','91008',
    '01060009','0106000C','0106001C','01060013','010E0064','01100001','01130002','80001','92013','97005'
);
