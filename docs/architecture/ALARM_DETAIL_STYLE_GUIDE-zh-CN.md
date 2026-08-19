<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Alarm Detail Style Guide — v1.1

> **基准参考 (Baseline reference)。** 这是 `ldi_alarm_ms_code` 警报知识文本的标准规范——使用英语，面向操作员/工程师，侧重功能性（而不是原样复制供应商的原始 AlarmMsg）。未来在任何模拟器、迁移或仪表板中的重写，都应遵循此模式并在此处添加，而不是随意编造。
>
> **v1.0** (2026-08-11)：15 个代码，仅有单句 `alarm_detail`。
> **v1.1** (2026-08-11)：21 个模拟目录 (mock-catalog) 代码现在都有英文 `alarm_detail`（另外 10 个由泰语翻译而来）；为迄今涉及的所有 25 个代码（21 个模拟代码不减，加上模拟目录中没有的 4 个仅真实存在的 Critical 代码）添加了结构化的 `cause` / `impact` / `recovery_action` 字段；添加了一个 `sop_reference` 字段（模式已就绪，故意留空 — 见 [§7](#7-sop--work-instruction-references--not-yet-populated)）。
>
> 请参阅 [§8 Freeze & scope](#8-freeze--scope) 了解作用域边界，参阅 [§9 Vendor specification requests for pending codes](#9-vendor-specification-request-for-pending-codes) 了解待处理的外部输入信息。

---

## 1. 句型模式 (Sentence pattern)

由两句话组成，严格按照以下顺序，无一例外：

1. **发生了什么 (What happened)** — 用通俗易懂的英语描述故障情况，使用其实际名称引用实际测量的参数或子系统（而不是供应商的原始短语，也不是内部变量/列名 — 见 §3）。陈述事实，使用现在/过去时，不带有戏剧性色彩。
2. **可能的原因 + 检查什么 (Likely cause + what to check)** — 提出一两个可能的原因，然后是祈使指令（"Check...", "Inspect...", "Verify...", "Confirm..."）。正是这句话使得详细信息值得阅读，而不是仅仅把 AlarmMsg 重复显示两次。

目标长度：总共 25–45 个单词。如果需要第三句话，则该故障可能属于两种故障——请重新考虑该代码，不要仅仅是不断地写下去。

**模板 (Template)：**

> [Condition], typically caused by [cause 1] or [cause 2]. [Imperative check/action] before [resuming / resetting / re-enabling].

## 2. 标准词汇 (Standard vocabulary)

每个概念使用一个标准词汇 — 不要在一个条目中交替使用同义词：

| 概念 (Concept) | 使用 (Use)                                                                                                   | 避免使用 (Not)                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 超出允许范围   | "is outside the configured range"                                                                            | "out of control range", "exceeds tolerance", "abnormal"（单独使用过于模糊） |
| 安全停止       | "halted" / "motion is halted"                                                                                | "stopped"（与正常作业完成的停止相混淆）                                     |
| 给读者的指令   | "Check", "Inspect", "Verify", "Confirm"                                                                      | "Please check"（不要用 "please" — 这是技术指令，不是请求），"You should"    |
| 单独的对准指标 | "PE (position error)" / "JE (judgment error)" — 每个条目首次使用时需展开，之后可直接使用                     | "the values"                                                                |
| 结合 PE 和 JE  | "registration error (PE/JE)" — 这是真实、既定的供应商/模拟目录措辞（参见 `90005` 的 AlarmMsg），并非凭空捏造 | "the metrics"，或者是发明一个新统称                                         |
| 可恢复的状态   | "resuming operation" / "resetting" / "re-enabling motion"                                                    | "restarting"（与整个机器重启相混淆）                                        |

**切勿** 捏造任何本仓库其他规范中未曾出现过的数字阈值（例如 `temperature (22±2°C) / humidity (55±5%)` 是真实的，已在 `docs/architecture/DATA_FLOW.md` 和模拟目录中使用 — 重复使用是正确的；为没有记录的代码编造新数字则是错误的）。

**切勿** 使用感叹号、全部大写（除了真实的缩写：PE、JE、DMD、PSO、HVAC）或第一人称。

## 3. 供应商术语处理 (Vendor jargon handling)

真正的供应商 AlarmMsg 文本有时会使用内部组件名称（`DMD`、`PSO`）或简短措辞（`JE / PE is abnormal`）。如果无法保证受众了解这些缩略语，请在每个条目首次提及时将其展开；之后可以继续使用。不要为真实组件编造一个更通俗的名称 — 现场服务文档称之为 `DMD`（数字微镜器件，digital micromirror device）；保留它，只需解释一次即可。

## 4. 溯源要求 (Provenance requirement)

本指南中的每个条目都必须注明其事实来源：

- **频率 (Frequency)** — 来自 `data/real/ldi_alarm_log_clean.sql`（真实的生产历史日志）的确切计数，而非估计值。
- **源文本 (Source text)** — 真实的供应商 `AlarmMsg`/`AlarmType`，来自 `data/real/Machine error code list20250723.txt` 或补充的 `ldi_alarm_ms_code_clean.sql` 导出文件。
- **原因/检查指南 (Cause/check guidance)** — 基于本代码库中记录的遥测列和阈值（`docs/architecture/DATA_FLOW.md`、`LDI_SPC_GUIDE.md`、模拟目录中现有的功能描述），而非凭空捏造。

如果缺少这三者中的任何一个，则该代码会被标记以供将来更新（见 §6）。

---

## 5. v1.0 条目 (15 个代码)

### 紧急 (Critical)（真实的供应商文本，为了清晰起见而挑选 — **非** 依频率排名；见 §6，真实生产数据记录为零次 Critical 触发）

| Code       | AlarmMsg (source)            | New AlarmDetail                                                                                                                                                                                                                         |
| ---------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01180016` | Emergency Stop               | Operator-initiated emergency stop halted all axes immediately. Inspect the work area for the cause before releasing the E-stop and resuming operation.                                                                                  |
| `0C020014` | Safety sensor triggered      | A safety sensor (light curtain or area guard) detected an intrusion into the machine's protected zone and halted motion. Clear the zone and confirm no personnel or foreign objects remain before resetting.                            |
| `0118000E` | Critical position error      | The measured axis position deviated from the commanded position beyond the critical threshold, indicating a possible mechanical obstruction, encoder fault, or servo tuning issue. Stop and inspect the affected axis before re-homing. |
| `01180011` | Overcurrent                  | The servo drive detected current draw beyond its rated limit on one or more axes, which can indicate a mechanical jam, a short circuit, or a failing motor/drive. Power down and inspect before resetting the drive.                    |
| `0C010001` | Double table collision error | The motion controller detected an imminent or actual collision between the two exposure stages and halted motion to prevent damage. Verify stage positions and clear any obstruction before resuming.                                   |
| `01180010` | Hyper Acceleration           | A commanded or measured axis acceleration exceeded the safety limit, usually indicating a corrupted motion profile or a mechanical fault causing an uncommanded jump. Stop and verify the axis before re-enabling motion.               |

### 严重 (Major)（基于频率）

| Code    | AlarmMsg (source)                               | Real freq. | New AlarmDetail                                                                                                                                                                                          |
| ------- | ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `10006` | Failed to set imaging device to protection mode | 1×         | The exposure head's imaging device (DMD) could not be switched into its protective state before an unsafe condition. Retry the operation; if it persists, check the DMD controller connection and power. |

### 警告 (Warning)（基于频率，按真实发生次数排序）

| Code    | AlarmMsg (source)                                                            | Real freq. | New AlarmDetail                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `91009` | Vacuum pressure exceeds the control range                                    | 3,239×     | The vacuum hold-down pressure on the exposure table is outside the configured operating range. Check for a leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.                    |
| `90005` | JE / PE is abnormal                                                          | 3,197×     | The measured registration error (PE/JE) exceeded the configured tolerance for this job. Check board flatness, alignment mark quality, and recent calibration history for this station.                                  |
| `90004` | Outer alignment to the grip point failed                                     | 1,525×     | The outer-layer alignment routine could not register the board to the mechanical grip point within tolerance. Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly. |
| `93004` | Calibration exception (a calibration does not enter the calibration process) | 939×       | A scheduled or requested calibration cycle did not complete -- the machine did not enter the calibration process within the expected time. Check that no job is queued or running, then retry the calibration.          |
| `90001` | Inner alignment grip point failed                                            | 558×       | The inner-layer alignment routine could not register the board to the mechanical grip point within tolerance. Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly. |
| `90012` | Alignment fails, and the user cancels the exposure                           | 69×        | The operator cancelled exposure after the automatic alignment routine failed to converge. Review the alignment marks and job setup before re-attempting; this is an operator action, not an automatic fault.            |
| `70004` | PSO overspeed                                                                | 45×        | The position-synchronized output (scan) speed exceeded the configured motion limit during exposure. Check the job's scan-speed parameter and the stage's mechanical condition before re-running.                        |
| `91008` | abnormal temperature and humidity                                            | 37×        | The cleanroom temperature or humidity reading is outside the configured process window (22±2°C / 55±5% RH). Check the HVAC system and the sensor for this station before resuming production.                           |

## 5b. v1.1 增补 — 翻译剩余的模拟目录代码 (10 个代码)

这 10 个代码完成了 **模拟目录中所有 21 个代码** 的英文 `alarm_detail` 覆盖（迁移 036）。资料来源：模拟目录中最初的泰语功能描述（这些描述本身已经以真实的 AlarmMsg/AlarmType 为基础——见迁移 036 自己的说明，只是针对早期泰语受众基准进行了表述），被翻译并重新调整以适应本指南的模式，而不是从头开始推导。

| Code       | AlarmMsg (source)                               | Severity | New AlarmDetail                                                                                                                                                                                       |
| ---------- | ----------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01060009` | Wrong camera serial number                      | Major    | The camera's detected serial number does not match the one configured for this station. Check that the correct camera is connected and reconfigure the station if a camera was recently swapped.      |
| `0106000C` | Failed to stop camera                           | Major    | The system could not stop the camera when commanded. Retry the stop command; if it persists, check the camera's connection and power.                                                                 |
| `0106001C` | Stop trigger wait signal timeout                | Minor    | The camera did not receive its stop-trigger signal within the expected time. Check the trigger source and cabling for this station.                                                                   |
| `01060013` | Found the same IP                               | Major    | A duplicate IP address was detected on the camera/device network, most likely from a network configuration error. Check the IP settings of all cameras and devices on this station's network segment. |
| `010E0064` | Motor type undefined                            | Major    | The system has no motor type configured for this axis. Check the axis configuration and set the correct motor type before continuing.                                                                 |
| `01100001` | Failed to connect to PLC                        | Major    | The station could not establish a connection to the PLC. Check the communication cable and network configuration between the station and the PLC.                                                     |
| `01130002` | Communication abnormality                       | Major    | Communication between two connected devices on this station failed or became unstable. Check the physical connection and communication settings between the affected devices.                         |
| `80001`    | Waiting for subdrawing preparation data timeout | Warning  | The station waited too long for the subdrawing (job image) preparation data to arrive. Check the job data source and network path feeding this station.                                               |
| `92013`    | Network connection timeout                      | Warning  | A network connection from this station timed out. Check the machine's network status and cabling.                                                                                                     |
| `97005`    | Database connection exception                   | Warning  | The station's connection to the database became abnormal or was lost. Check the database server status and this station's network path to it.                                                         |

---

## 6. 结构化知识字段 (v1.1)：原因 (Cause) / 影响 (Impact) / 恢复操作 (Recovery Action)

除了单句 `alarm_detail` 外，迄今涉及的 25 个代码现在都包含三个原子字段 — 各有一个分句，不使用复合句：

- **`cause`** — 最可能的根本原因。具体且具有技术性，而不是重述 AlarmMsg。
- **`impact`** — _现在_ 在操作上的意义：生产受阻了吗，结果可疑吗，还是仅仅是延迟？这是单独的 `alarm_detail` 从未明确说明的维度。
- **`recovery_action`** — 祈使指令，内容与 `alarm_detail` 的第二句话相同，作为一个独立字段被隔离，以便 UI 可以将其显示为显眼的“我该怎么做 (what do I do)”行。

`alarm_detail` 保持不变，仍然是单句摘要（§1）；这些新字段是附加的，不是替代 — 仪表板可以仅显示 `alarm_detail` 供快速浏览，也可以显示所有三个结构化字段以供调查。

| Code       | Cause                                                                                                                                                                              | Impact                                                                                                                                               | Recovery Action                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01180016` | The operator (or an interlock) pressed or triggered the emergency stop control.                                                                                                    | All axis motion is immediately halted and the machine cannot resume until the E-stop is cleared and reset.                                           | Inspect the work area for the cause of the stop, then release the E-stop control and reset the machine before resuming.                               |
| `0C020014` | A person, object, or the machine's own moving parts crossed a light curtain or area guard boundary.                                                                                | Motion is halted on this station until the zone is confirmed clear and the safety circuit is reset.                                                  | Clear the protected zone, confirm no personnel or foreign objects remain, then reset the safety circuit before resuming.                              |
| `0118000E` | A mechanical obstruction, encoder fault, or servo tuning issue caused the actual axis position to diverge from the commanded position beyond the safety threshold.                 | The axis is disabled to prevent a crash or further position loss; the current job on this axis cannot continue.                                      | Stop and inspect the affected axis for obstructions or encoder faults, then re-home the axis before resuming.                                         |
| `01180011` | A mechanical jam, short circuit, or a failing motor/drive caused current draw to exceed the servo drive's rated limit.                                                             | The affected drive trips offline to protect the hardware, halting motion on that axis until reset.                                                   | Power down and inspect the affected axis and drive for a jam or electrical fault before resetting the drive.                                          |
| `0C010001` | A position error, timing fault, or sensor failure allowed the two exposure stages to approach each other beyond the safe separation distance.                                      | Motion is halted immediately to prevent physical damage to both stages; both stages are unavailable until cleared.                                   | Verify both stage positions and clear any obstruction before resuming; do not override without confirming actual stage separation.                    |
| `01180010` | A corrupted motion profile or a mechanical fault caused a commanded or measured axis acceleration to exceed the configured safety limit.                                           | The axis is disabled to prevent an uncontrolled motion event; the current job on this axis cannot continue.                                          | Stop and verify the axis and its motion profile before re-enabling motion.                                                                            |
| `10006`    | The DMD controller did not acknowledge the protection-mode command, likely a communication fault or a controller-side error.                                                       | The imaging device may remain in an unprotected state, which can risk damage during an unsafe condition; exposure is blocked until resolved.         | Retry the operation; if it persists, check the DMD controller connection and power.                                                                   |
| `91009`    | A leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.                                                                                        | Board hold-down cannot be guaranteed, risking board shift or focus error during exposure on this station.                                            | Check for a leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.                                                 |
| `90005`    | Board flatness, alignment mark quality, or drift in this station's calibration exceeded the job's configured registration tolerance.                                               | The current board's registration may be out of specification and should be flagged for downstream inspection.                                        | Check board flatness, alignment mark quality, and recent calibration history for this station.                                                        |
| `90004`    | Contamination or damage on the alignment marks, or a grip-mechanism seating issue, prevented registration to the mechanical grip point.                                            | The current board cannot proceed to outer-layer exposure until alignment succeeds.                                                                   | Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly.                                             |
| `93004`    | A queued or running job blocked the calibration cycle from starting within the expected time window.                                                                               | The station's calibration is not current, which can degrade registration accuracy on subsequent jobs until calibration completes.                    | Check that no job is queued or running, then retry the calibration.                                                                                   |
| `90001`    | Contamination or damage on the alignment marks, or a grip-mechanism seating issue, prevented registration to the mechanical grip point.                                            | The current board cannot proceed to inner-layer exposure until alignment succeeds.                                                                   | Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly.                                             |
| `90012`    | The automatic alignment routine could not converge within its retry limit, and the operator chose to cancel rather than continue retrying.                                         | The current board did not receive exposure and needs to be re-queued after the alignment issue is addressed.                                         | Review the alignment marks and job setup before re-attempting; this is an operator action, not an automatic fault.                                    |
| `70004`    | The job's scan-speed parameter or a mechanical issue with the stage caused the position-synchronized output speed to exceed the configured motion limit.                           | The current exposure pass may have inconsistent dosage due to the speed excursion and should be flagged for quality review.                          | Check the job's scan-speed parameter and the stage's mechanical condition before re-running.                                                          |
| `91008`    | The cleanroom HVAC system drifted outside its setpoint, or the environmental sensor for this station is faulty.                                                                    | Process results (registration, resist behavior) on this station may be affected until the environment returns to the configured window.              | Check the HVAC system and the sensor for this station before resuming production.                                                                     |
| `01060009` | A different camera unit is connected than the one registered for this station, or the station's camera configuration was not updated after a hardware swap.                        | The station cannot verify it is using the correct camera, so imaging is blocked until resolved.                                                      | Confirm the physically connected camera matches the configured serial number, then update the station configuration or reconnect the correct unit.    |
| `0106000C` | The camera did not respond to the stop command, likely due to a communication fault or a camera driver/firmware issue.                                                             | The camera may continue running or capturing after the station expected it to be idle, risking inconsistent state for the next operation.            | Retry the stop command; if the camera still doesn't respond, power-cycle the camera and check its cable connection.                                   |
| `0106001C` | The trigger signal from the controller or I/O board did not arrive in time, likely a timing, cabling, or I/O configuration issue.                                                  | The camera's current capture cycle did not stop as scheduled; the current job step may need to be retried.                                           | Check the trigger source and cabling for this station, then retry the operation.                                                                      |
| `01060013` | Two or more devices on this station's network are configured with the same IP address, typically from a manual misconfiguration or a device replaced without updating its address. | Network communication with the affected devices becomes unreliable or fails outright, which can stall imaging or data transfer.                      | Check the IP settings of all cameras and devices on this station's network segment and correct the duplicate.                                         |
| `010E0064` | The motor-type parameter for this axis was never set, or was cleared by a configuration reset.                                                                                     | The axis cannot be driven correctly since the controller doesn't know how to command this motor type; motion commands to this axis will be rejected. | Check the axis configuration and set the correct motor type before attempting to move this axis.                                                      |
| `01100001` | The PLC is powered off, unreachable on the network, or its communication parameters (IP/port/protocol) don't match the station's configuration.                                    | The station cannot exchange I/O or status with the PLC, which typically blocks the automated production sequence for this station.                   | Check the communication cable and network configuration between the station and the PLC, and confirm the PLC is powered on.                           |
| `01130002` | A cable fault, port misconfiguration, or a device-side fault interrupted communication between the affected devices.                                                               | Data or commands between the affected devices may be lost or delayed, which can stall the current operation.                                         | Check the physical connection and communication settings between the affected devices, then retry.                                                    |
| `80001`    | The upstream system preparing the job's subdrawing image did not deliver it within the expected time, likely due to a slow data source or a network delay.                         | The station cannot begin exposure until the subdrawing data arrives, delaying the current job.                                                       | Check the job data source and the network path feeding this station; retry once the data is confirmed available.                                      |
| `92013`    | The network path to a required service (job server, database, or peer device) was slow or unreachable within the timeout window.                                                   | The operation depending on that network connection did not complete and needs to be retried once connectivity is restored.                           | Check the machine's network status and cabling, then retry the operation.                                                                             |
| `97005`    | The database server is unreachable, overloaded, or the station's connection pool encountered an unexpected error.                                                                  | The station cannot read or write production data until the connection is restored, which can stall data logging or job lookups.                      | Check the database server status and this station's network path to it; the connection typically recovers automatically once the server is reachable. |

## 7. SOP / 工作指导参考 — 尚未填充 (SOP / work-instruction references — not yet populated)

`sop_reference` 被添加到模式（迁移 073）中，作为警报字典 (Alarm Dictionary) 在存在时显示的可选字段。目前 **每个代码都为 NULL** — 本仓库没有可以链接到的真实的“标准操作程序”或“工作指导”文档，凭空捏造 URL 或文档 ID 将违背本指南所基于的溯源测试（§4）。这是故意作为结构就绪状态发布的，而不是一种暂时性的完整性声明：一旦真实的 SOP/WI 文档（或文档管理系统）存在，填充此字段将是一项数据录入任务，而不是工程任务 — 不需要修改模式或仪表板。

---

## 8. 冻结与作用域 (Freeze & scope)

**这涵盖了什么 (v1.1)：** ~2,190 个真实供应商警报代码中有 25 个具有 `alarm_detail` + `cause` + `impact` + `recovery_action` — 这是模拟器当前可访问的所有代码（所有 21 个模拟目录代码）加上在 v1.0 中添加以供参考的 4 个纯真实的 Critical 代码。这不是“前 50 名” — 请参阅下方说明了解原因。

**在 v1.0 期间发现的真实数据上限：** 真实的生产历史日志（`data/real/ldi_alarm_log_clean.sql`，10,000 行，2026-04-10 至 2026-07-16，已确认为真实的生产数据 — 文件中没有任何带有 `SIM-` 前缀的 ID）**总共仅记录了 20 个不同的警报代码**，而不是 50 个。本地没有更大的真实频率数据集可以提取前 50 名。

**未闭合的空白，在 v1.1 中未变：** 在这 20 个真实代码中，**11 个在任一供应商目录来源中仍然没有记录**（`Machine error code list20250723.txt`，2,190 个代码，或 892 行的补充导出文件 `ldi_alarm_ms_code_clean.sql`）：`90013`、`91012`、`91017`、`91020`、`91024`、`93007`、`91029`、`20`、`20021`、`97014`、`2`。这些是真实的生产代码（真实的 UUID，真实的日期，占 10,000 行日志中的 390 行），但没有可用的源文本。它们仍未被编写 — 见 §9，该请求正是为了填补这一空白。

**紧急级别的代码不以频率为依据：** 真实生产日志在可用时间窗口内记录的 Critical 级别警报为零。这 6 个 Critical 条目是真实的供应商文本，为了含义的清晰度而手动挑选（避免了在 `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` §8 中已经标记为关键字误报或类型/消息本身矛盾的代码），而不是按发生率排名。

**这是应用在哪里：** `database/migrations/072-alarm-detail-style-guide-v1.sql` (v1.0，15 个代码的 `alarm_detail`) + `database/migrations/073-alarm-knowledge-structured-fields-v1.1.sql` (v1.1，另外 10 个代码的 `alarm_detail` + 所有 25 个代码的 `cause`/`impact`/`recovery_action`/`sop_reference` 模式和内容) — 这两者都是幂等的，可安全地重新运行，已接入 `scripts/switch-data-mode.sh mock` 和 `real` 路径，因此在未来任何模式下重置目录时都能保留下来。警报字典 (Alarm Dictionary) 仪表板 (`ims-ldi-alarm-dictionary.json`) 会实时读取这些列。

**已知的不对称性，明确指出：** 截至 v1.1，模拟目录的 21 个代码均具有英文版的 `alarm_detail`/`cause`/`impact`/`recovery_action`。完整的真实供应商目录中的其他 ~2,165 个代码（仅在真实数据模式下相关）则没有 — 这从来不是一次完整的目录重写，如果要负责任地进行重写（根据 §4 的溯源规则），则需要真实的频率和源数据，而对于其中大部分代码，我们目前缺乏这些数据。

**明确声明不包含的内容：** 这不是 ISA-18.2 合规性要求（请参阅早期审计中的 Known Gaps），它不是全目录覆盖，并且 `sop_reference` 没有填充真实内容（§7）。这是 25 个真实的、源头可验证的、样式一致的、结构完整的条目，作为以后扩展覆盖范围的参考模式。

## 9. 向供应商请求待处理代码的规格说明 (Vendor specification request for pending codes)

这是向管理供应商关系的人员提出的请求，并不是可以从本代码库内部解决的问题。以下 11 个代码在生产机器上真实触发过（390 个真实的日志行，`data/real/ldi_alarm_log_clean.sql`），但没有出现在本地可用的任何供应商目录文件中。填补这一空白需要以下其中之一：

- 从供应商处获取更新的/更完整的“机器错误代码列表 (Machine error code list)”导出文件，其中包含这些代码，或
- 直接从供应商/现场服务团队那里获得关于这些代码含义的确认，以便根据本指南的常规溯源规则编写条目。

**代码：** `90013`、`91012`、`91017`、`91020`、`91024`、`93007`、`91029`、`20`、`20021`、`97014`、`2`（真实发生次数：分别为 258、37、28、23、11、9、5、16、1、1、1，在 10,000 行的真实日志样本中）。

在提供这些信息之前，这 11 个代码在系统中的任何地方都没有 `alarm_msg`、`alarm_detail`、`cause`、`impact` 或 `recovery_action` — 确实属于未知，而不是靠猜测。
