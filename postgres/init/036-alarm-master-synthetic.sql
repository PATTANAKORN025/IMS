-- ══════════════════════════════════════════════════════════════════
-- SYNTHETIC ALARM MASTER — AUTO-GENERATED (DIGITAL TWIN)
-- ══════════════════════════════════════════════════════════════════
TRUNCATE TABLE public.ldi_alarm_ms_code;
INSERT INTO public.ldi_alarm_ms_code (alarm_code, alarm_msg, alarm_type, eqp_type, process) VALUES
(1000, 'Laser Diode Temp Warning', 'Warning', 'LDI', 'EXPOSURE'),
(1001, 'Laser Diode Temp Critical', 'Critical', 'LDI', 'EXPOSURE'),
(2000, 'Positioning Error X-Axis', 'Critical', 'LDI', 'EXPOSURE'),
(2001, 'Positioning Error Y-Axis', 'Critical', 'LDI', 'EXPOSURE'),
(3000, 'Vacuum Pressure Low', 'Warning', 'LDI', 'EXPOSURE'),
(4000, 'Joule Effect Variance', 'Warning', 'LDI', 'EXPOSURE'),
(5000, 'General Machine Fault', 'Critical', 'LDI', 'EXPOSURE');
