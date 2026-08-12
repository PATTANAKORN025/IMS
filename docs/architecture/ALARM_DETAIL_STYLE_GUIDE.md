# Alarm Detail Style Guide — v1.1

> **Baseline reference.** This is the canonical style for `ldi_alarm_ms_code` alarm-knowledge text — English, operator/engineer-facing, functional (not a copy of the raw vendor AlarmMsg). Every future rewrite, in any simulator, migration, or dashboard, should follow this pattern and be added here, not invented ad hoc.
>
> **v1.0** (2026-08-11): 15 codes, single-statement `alarm_detail` only.
> **v1.1** (2026-08-11): all 21 mock-catalog codes now have English `alarm_detail` (10 more translated from Thai); added structured `cause` / `impact` / `recovery_action` fields for all 25 codes covered so far (the 21 mock codes minus none, plus 4 real-only Critical codes not in the mock catalog); added a `sop_reference` field (schema-ready, intentionally empty — see [§7](#7-sop--work-instruction-references-not-yet-populated)).
>
> See [§8 Freeze & scope](#8-freeze--scope) for exactly what is and isn't covered, and [§9 Open request](#9-open-request-vendor-catalog-for-the-11-gap-codes) for what's blocked on external input.

---

## 1. Sentence pattern

Two sentences, in this order, no exceptions:

1. **What happened** — the fault condition in plain English, referencing the real measured parameter or subsystem by its actual name (not the raw vendor phrase, not internal variable/column names — see §3). Factual, present/past tense, no drama.
2. **Likely cause + what to check** — one or two probable causes, then an imperative instruction ("Check...", "Inspect...", "Verify...", "Confirm..."). This is the sentence that makes the detail worth reading instead of just showing AlarmMsg twice.

Target length: 25–45 words total. If it needs a third sentence, the fault is probably two faults — reconsider the code, don't just keep writing.

**Template:**
> [Condition], typically caused by [cause 1] or [cause 2]. [Imperative check/action] before [resuming / resetting / re-enabling].

## 2. Standard vocabulary

One canonical term per concept — don't alternate synonyms across entries:

| Concept | Use | Not |
|---|---|---|
| Outside the allowed range | "is outside the configured range" | "out of control range", "exceeds tolerance", "abnormal" (too vague on its own) |
| A safety stop | "halted" / "motion is halted" | "stopped" (ambiguous with a normal job-complete stop) |
| An instruction to the reader | "Check", "Inspect", "Verify", "Confirm" | "Please check" (no "please" — this is a technical instruction, not a request), "You should" |
| The registration metrics individually | "PE (position error)" / "JE (judgment error)" — expand on first use per entry, bare thereafter | "the values" |
| PE and JE together | "registration error (PE/JE)" — this is real, established vendor/mock-catalog phrasing (see AlarmMsg for `90005`), not invented | "the metrics", inventing a new collective term |
| A resumable state | "resuming operation" / "resetting" / "re-enabling motion" | "restarting" (ambiguous with a full machine reboot) |

**Never** invent a numeric threshold that isn't already an established spec elsewhere in this repo (e.g. `temperature (22±2°C) / humidity (55±5%)` is real, already used in `docs/architecture/DATA_FLOW.md` and the mock catalog — reusing it is correct; making up a new number for a code that doesn't have one on record is not).

**Never** use exclamation marks, ALL CAPS (except real acronyms: PE, JE, DMD, PSO, HVAC), or first person.

## 3. Vendor jargon handling

Real vendor AlarmMsg text sometimes uses internal component names (`DMD`, `PSO`) or terse phrasing (`JE / PE is abnormal`). Expand acronyms on first mention per entry if the audience isn't guaranteed to know them; keep them afterward. Don't invent a friendlier name for a real component — `DMD` (digital micromirror device) is what the field service documentation calls it; keep it, just gloss it once.

## 4. Provenance requirement

Every entry in this guide must cite where its facts came from:
- **Frequency** — an exact count from `data/real/ldi_alarm_log_clean.sql` (real historical production log), not an estimate.
- **Source text** — the real vendor `AlarmMsg`/`AlarmType` from `data/real/[REDACTED_VENDOR_MANUAL]` or the supplemental `ldi_alarm_ms_code_clean.sql` export.
- **Cause/check guidance** — grounded in this codebase's own documented telemetry columns and thresholds (`docs/architecture/DATA_FLOW.md`, `LDI_SPC_GUIDE.md`, the mock catalog's existing functional descriptions), not invented.

If any of the three is missing, the code doesn't get a rewrite in this pass — it gets flagged as a gap instead (see §6).

---

## 5. v1.0 entries (15 codes)

### Critical (real vendor text, selected for clarity — **not** frequency-ranked; see §6, real production data recorded zero Critical firings)

| Code | AlarmMsg (source) | New AlarmDetail |
|---|---|---|
| `01180016` | Emergency Stop | Operator-initiated emergency stop halted all axes immediately. Inspect the work area for the cause before releasing the E-stop and resuming operation. |
| `0C020014` | Safety sensor triggered | A safety sensor (light curtain or area guard) detected an intrusion into the machine's protected zone and halted motion. Clear the zone and confirm no personnel or foreign objects remain before resetting. |
| `0118000E` | Critical position error | The measured axis position deviated from the commanded position beyond the critical threshold, indicating a possible mechanical obstruction, encoder fault, or servo tuning issue. Stop and inspect the affected axis before re-homing. |
| `01180011` | Overcurrent | The servo drive detected current draw beyond its rated limit on one or more axes, which can indicate a mechanical jam, a short circuit, or a failing motor/drive. Power down and inspect before resetting the drive. |
| `0C010001` | Double table collision error | The motion controller detected an imminent or actual collision between the two exposure stages and halted motion to prevent damage. Verify stage positions and clear any obstruction before resuming. |
| `01180010` | Hyper Acceleration | A commanded or measured axis acceleration exceeded the safety limit, usually indicating a corrupted motion profile or a mechanical fault causing an uncommanded jump. Stop and verify the axis before re-enabling motion. |

### Major (frequency-backed)

| Code | AlarmMsg (source) | Real freq. | New AlarmDetail |
|---|---|---|---|
| `10006` | Failed to set imaging device to protection mode | 1× | The exposure head's imaging device (DMD) could not be switched into its protective state before an unsafe condition. Retry the operation; if it persists, check the DMD controller connection and power. |

### Warning (frequency-backed, ordered by real occurrence count)

| Code | AlarmMsg (source) | Real freq. | New AlarmDetail |
|---|---|---|---|
| `91009` | Vacuum pressure exceeds the control range | 3,239× | The vacuum hold-down pressure on the exposure table is outside the configured operating range. Check for a leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station. |
| `90005` | JE / PE is abnormal | 3,197× | The measured registration error (PE/JE) exceeded the configured tolerance for this job. Check board flatness, alignment mark quality, and recent calibration history for this station. |
| `90004` | Outer alignment to the grip point failed | 1,525× | The outer-layer alignment routine could not register the board to the mechanical grip point within tolerance. Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly. |
| `93004` | Calibration exception (a calibration does not enter the calibration process) | 939× | A scheduled or requested calibration cycle did not complete -- the machine did not enter the calibration process within the expected time. Check that no job is queued or running, then retry the calibration. |
| `90001` | Inner alignment grip point failed | 558× | The inner-layer alignment routine could not register the board to the mechanical grip point within tolerance. Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly. |
| `90012` | Alignment fails, and the user cancels the exposure | 69× | The operator cancelled exposure after the automatic alignment routine failed to converge. Review the alignment marks and job setup before re-attempting; this is an operator action, not an automatic fault. |
| `70004` | PSO overspeed | 45× | The position-synchronized output (scan) speed exceeded the configured motion limit during exposure. Check the job's scan-speed parameter and the stage's mechanical condition before re-running. |
| `91008` | abnormal temperature and humidity | 37× | The cleanroom temperature or humidity reading is outside the configured process window (22±2°C / 55±5% RH). Check the HVAC system and the sensor for this station before resuming production. |

## 5b. v1.1 additions — remaining mock-catalog codes translated (10 codes)

These 10 codes complete English-language `alarm_detail` coverage for **all 21 codes in the mock catalog** (migration 036). Source: the mock catalog's original Thai-language functional descriptions (themselves already grounded — see migration 036's own header — in the real AlarmMsg/AlarmType, just phrased for the earlier Thai-speaking-audience baseline), translated and restyled to this guide's pattern, not re-derived from scratch.

| Code | AlarmMsg (source) | Severity | New AlarmDetail |
|---|---|---|---|
| `01060009` | Wrong camera serial number | Major | The camera's detected serial number does not match the one configured for this station. Check that the correct camera is connected and reconfigure the station if a camera was recently swapped. |
| `0106000C` | Failed to stop camera | Major | The system could not stop the camera when commanded. Retry the stop command; if it persists, check the camera's connection and power. |
| `0106001C` | Stop trigger wait signal timeout | Minor | The camera did not receive its stop-trigger signal within the expected time. Check the trigger source and cabling for this station. |
| `01060013` | Found the same IP | Major | A duplicate IP address was detected on the camera/device network, most likely from a network configuration error. Check the IP settings of all cameras and devices on this station's network segment. |
| `010E0064` | Motor type undefined | Major | The system has no motor type configured for this axis. Check the axis configuration and set the correct motor type before continuing. |
| `01100001` | Failed to connect to PLC | Major | The station could not establish a connection to the PLC. Check the communication cable and network configuration between the station and the PLC. |
| `01130002` | Communication abnormality | Major | Communication between two connected devices on this station failed or became unstable. Check the physical connection and communication settings between the affected devices. |
| `80001` | Waiting for subdrawing preparation data timeout | Warning | The station waited too long for the subdrawing (job image) preparation data to arrive. Check the job data source and network path feeding this station. |
| `92013` | Network connection timeout | Warning | A network connection from this station timed out. Check the machine's network status and cabling. |
| `97005` | Database connection exception | Warning | The station's connection to the database became abnormal or was lost. Check the database server status and this station's network path to it. |

---

## 6. Structured knowledge fields (v1.1): Cause / Impact / Recovery Action

Beyond the single-statement `alarm_detail`, each of the 25 codes covered so far now also has three atomic fields — one clause each, no compound sentences:

- **`cause`** — the most likely root cause(s). Specific and technical, not a restatement of the AlarmMsg.
- **`impact`** — what this means operationally *right now*: is production blocked, is a result suspect, is this just a delay? This is the dimension `alarm_detail` alone never stated explicitly.
- **`recovery_action`** — the imperative instruction, same content as `alarm_detail`'s second sentence, isolated as its own field so a UI can show it as a distinct "what do I do" line.

`alarm_detail` is unchanged and remains the single-statement summary (§1); these are additive, not a replacement — a dashboard can show just `alarm_detail` for a quick glance, or all three structured fields for an investigation.

| Code | Cause | Impact | Recovery Action |
|---|---|---|---|
| `01180016` | The operator (or an interlock) pressed or triggered the emergency stop control. | All axis motion is immediately halted and the machine cannot resume until the E-stop is cleared and reset. | Inspect the work area for the cause of the stop, then release the E-stop control and reset the machine before resuming. |
| `0C020014` | A person, object, or the machine's own moving parts crossed a light curtain or area guard boundary. | Motion is halted on this station until the zone is confirmed clear and the safety circuit is reset. | Clear the protected zone, confirm no personnel or foreign objects remain, then reset the safety circuit before resuming. |
| `0118000E` | A mechanical obstruction, encoder fault, or servo tuning issue caused the actual axis position to diverge from the commanded position beyond the safety threshold. | The axis is disabled to prevent a crash or further position loss; the current job on this axis cannot continue. | Stop and inspect the affected axis for obstructions or encoder faults, then re-home the axis before resuming. |
| `01180011` | A mechanical jam, short circuit, or a failing motor/drive caused current draw to exceed the servo drive's rated limit. | The affected drive trips offline to protect the hardware, halting motion on that axis until reset. | Power down and inspect the affected axis and drive for a jam or electrical fault before resetting the drive. |
| `0C010001` | A position error, timing fault, or sensor failure allowed the two exposure stages to approach each other beyond the safe separation distance. | Motion is halted immediately to prevent physical damage to both stages; both stages are unavailable until cleared. | Verify both stage positions and clear any obstruction before resuming; do not override without confirming actual stage separation. |
| `01180010` | A corrupted motion profile or a mechanical fault caused a commanded or measured axis acceleration to exceed the configured safety limit. | The axis is disabled to prevent an uncontrolled motion event; the current job on this axis cannot continue. | Stop and verify the axis and its motion profile before re-enabling motion. |
| `10006` | The DMD controller did not acknowledge the protection-mode command, likely a communication fault or a controller-side error. | The imaging device may remain in an unprotected state, which can risk damage during an unsafe condition; exposure is blocked until resolved. | Retry the operation; if it persists, check the DMD controller connection and power. |
| `91009` | A leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station. | Board hold-down cannot be guaranteed, risking board shift or focus error during exposure on this station. | Check for a leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station. |
| `90005` | Board flatness, alignment mark quality, or drift in this station's calibration exceeded the job's configured registration tolerance. | The current board's registration may be out of specification and should be flagged for downstream inspection. | Check board flatness, alignment mark quality, and recent calibration history for this station. |
| `90004` | Contamination or damage on the alignment marks, or a grip-mechanism seating issue, prevented registration to the mechanical grip point. | The current board cannot proceed to outer-layer exposure until alignment succeeds. | Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly. |
| `93004` | A queued or running job blocked the calibration cycle from starting within the expected time window. | The station's calibration is not current, which can degrade registration accuracy on subsequent jobs until calibration completes. | Check that no job is queued or running, then retry the calibration. |
| `90001` | Contamination or damage on the alignment marks, or a grip-mechanism seating issue, prevented registration to the mechanical grip point. | The current board cannot proceed to inner-layer exposure until alignment succeeds. | Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly. |
| `90012` | The automatic alignment routine could not converge within its retry limit, and the operator chose to cancel rather than continue retrying. | The current board did not receive exposure and needs to be re-queued after the alignment issue is addressed. | Review the alignment marks and job setup before re-attempting; this is an operator action, not an automatic fault. |
| `70004` | The job's scan-speed parameter or a mechanical issue with the stage caused the position-synchronized output speed to exceed the configured motion limit. | The current exposure pass may have inconsistent dosage due to the speed excursion and should be flagged for quality review. | Check the job's scan-speed parameter and the stage's mechanical condition before re-running. |
| `91008` | The cleanroom HVAC system drifted outside its setpoint, or the environmental sensor for this station is faulty. | Process results (registration, resist behavior) on this station may be affected until the environment returns to the configured window. | Check the HVAC system and the sensor for this station before resuming production. |
| `01060009` | A different camera unit is connected than the one registered for this station, or the station's camera configuration was not updated after a hardware swap. | The station cannot verify it is using the correct camera, so imaging is blocked until resolved. | Confirm the physically connected camera matches the configured serial number, then update the station configuration or reconnect the correct unit. |
| `0106000C` | The camera did not respond to the stop command, likely due to a communication fault or a camera driver/firmware issue. | The camera may continue running or capturing after the station expected it to be idle, risking inconsistent state for the next operation. | Retry the stop command; if the camera still doesn't respond, power-cycle the camera and check its cable connection. |
| `0106001C` | The trigger signal from the controller or I/O board did not arrive in time, likely a timing, cabling, or I/O configuration issue. | The camera's current capture cycle did not stop as scheduled; the current job step may need to be retried. | Check the trigger source and cabling for this station, then retry the operation. |
| `01060013` | Two or more devices on this station's network are configured with the same IP address, typically from a manual misconfiguration or a device replaced without updating its address. | Network communication with the affected devices becomes unreliable or fails outright, which can stall imaging or data transfer. | Check the IP settings of all cameras and devices on this station's network segment and correct the duplicate. |
| `010E0064` | The motor-type parameter for this axis was never set, or was cleared by a configuration reset. | The axis cannot be driven correctly since the controller doesn't know how to command this motor type; motion commands to this axis will be rejected. | Check the axis configuration and set the correct motor type before attempting to move this axis. |
| `01100001` | The PLC is powered off, unreachable on the network, or its communication parameters (IP/port/protocol) don't match the station's configuration. | The station cannot exchange I/O or status with the PLC, which typically blocks the automated production sequence for this station. | Check the communication cable and network configuration between the station and the PLC, and confirm the PLC is powered on. |
| `01130002` | A cable fault, port misconfiguration, or a device-side fault interrupted communication between the affected devices. | Data or commands between the affected devices may be lost or delayed, which can stall the current operation. | Check the physical connection and communication settings between the affected devices, then retry. |
| `80001` | The upstream system preparing the job's subdrawing image did not deliver it within the expected time, likely due to a slow data source or a network delay. | The station cannot begin exposure until the subdrawing data arrives, delaying the current job. | Check the job data source and the network path feeding this station; retry once the data is confirmed available. |
| `92013` | The network path to a required service (job server, database, or peer device) was slow or unreachable within the timeout window. | The operation depending on that network connection did not complete and needs to be retried once connectivity is restored. | Check the machine's network status and cabling, then retry the operation. |
| `97005` | The database server is unreachable, overloaded, or the station's connection pool encountered an unexpected error. | The station cannot read or write production data until the connection is restored, which can stall data logging or job lookups. | Check the database server status and this station's network path to it; the connection typically recovers automatically once the server is reachable. |

## 7. SOP / work-instruction references — not yet populated

`sop_reference` is added to the schema (migration 073) as an optional field the Alarm Dictionary displays when present. It is **NULL for every code right now** — this repo has no real Standard Operating Procedure or Work Instruction documents to link to, and inventing a URL or document ID would fail the exact same provenance test this whole guide is built on (§4). This is deliberately shipped as structural readiness, not a placeholder claim of completeness: once real SOP/WI documents (or a document management system) exist, populating this field is a data-entry task, not an engineering one — no schema or dashboard change needed.

---

## 8. Freeze & scope

**What this covers (v1.1):** 25 of the ~2,190 real vendor alarm codes have `alarm_detail` + `cause` + `impact` + `recovery_action` — this is every code currently reachable by the mock simulator (all 21 mock-catalog codes) plus the 4 real-only Critical codes added for reference in v1.0. Not "top 50" — see below for why.

**Real-data ceiling found during v1.0:** the real historical production log (`data/real/ldi_alarm_log_clean.sql`, 10,000 rows, 2026-04-10 to 2026-07-16, confirmed genuine production data — no `SIM-`-prefixed IDs anywhere in the file) recorded **only 20 distinct alarm codes total**, not 50. There is no larger real-frequency dataset available locally to draw a top-50 from.

**Open gap, unchanged in v1.1:** of those 20 real codes, **11 still have no entry in either vendor catalog source** (`[REDACTED_VENDOR_MANUAL]`, 2,190 codes, or the 892-row supplemental `ldi_alarm_ms_code_clean.sql` export): `90013`, `91012`, `91017`, `91020`, `91024`, `93007`, `91029`, `20`, `20021`, `97014`, `2`. These are real production codes (real UUIDs, real dates, 390 of the 10,000 log rows) with zero source text available. They remain unwritten — see §9, this is exactly the gap that request is meant to close.

**Critical-severity codes are not frequency-backed:** the real production log recorded zero Critical-severity alarms in the available window. The 6 Critical entries are real vendor text, hand-selected for clarity of meaning (avoiding codes already flagged in `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` §8 as keyword-false-positives or self-contradictory type/message pairs), not ranked by occurrence.

**Where this is applied:** `database/migrations/072-alarm-detail-style-guide-v1.sql` (v1.0, `alarm_detail` for 15 codes) + `database/migrations/073-alarm-knowledge-structured-fields-v1.1.sql` (v1.1, `alarm_detail` for 10 more codes + `cause`/`impact`/`recovery_action`/`sop_reference` schema and content for all 25) — both idempotent, safe to re-run, wired into both `scripts/switch-data-mode.sh mock` and `real` paths so this survives a future catalog reset in either mode. The Alarm Dictionary dashboard (`ims-ldi-alarm-dictionary.json`) reads these columns live.

**Known asymmetry, stated plainly:** the mock catalog's 21 codes all have English `alarm_detail`/`cause`/`impact`/`recovery_action` as of v1.1. The other ~2,165 codes in the full real vendor catalog (only relevant in real-data mode) do not — this was never a full-catalog rewrite, and doing one responsibly (per §4's provenance rule) would need real frequency and source data this pass doesn't have for most of them.

**Explicitly not claimed:** this is not ISA-18.2 compliance (see the earlier audit's Known Gaps), it is not full-catalog coverage, and `sop_reference` is not populated with real content (§7). It's 25 real, verifiably-grounded, consistently-styled, structurally-complete entries as the reference pattern for extending coverage later.

## 9. Open request: vendor catalog for the 11 gap codes

This is a request to whoever manages the vendor relationship, not something resolvable from inside this codebase. The 11 codes below fired for real on the production machines (390 real log rows, `data/real/ldi_alarm_log_clean.sql`) but appear in neither vendor catalog file available locally. Closing this gap needs one of:

- An updated/more complete "Machine error code list" export from the vendor that includes these codes, or
- Direct confirmation from the vendor/field-service team of what these codes mean, so an entry can be written under this guide's normal provenance rule.

**Codes:** `90013`, `91012`, `91017`, `91020`, `91024`, `93007`, `91029`, `20`, `20021`, `97014`, `2` (real occurrence counts: 258, 37, 28, 23, 11, 9, 5, 16, 1, 1, 1 respectively, out of the 10,000-row real log sample).

Until this is supplied, these 11 codes have no `alarm_msg`, `alarm_detail`, `cause`, `impact`, or `recovery_action` anywhere in this system — genuinely unknown, not guessed.
