# IMS Grafana Design System

> **เป้าหมาย:** ทำให้ dashboard ทั้งหมดของ IMS (NOC Overview, Engineering Drill-Down, Capacity Planning, และตั้งแต่ Phase 2 เป็นต้นไป — LDI Manufacturing, LDI Engineering Analytics & SPC, LDI Machine Snapshot, LDI Operator Andon Board, LDI Data Readiness) มีมาตรฐานเดียวกัน แก้ที่นี่ที่เดียว ไม่ drift ข้ามไฟล์ และดูเป็นระบบ "ชุดเดียวกัน" ทันทีที่สลับหน้า
>
> เอกสารนี้คือ **contract** ไม่ใช่คำแนะนำ — panel ใหม่ทุกตัวต้องผ่านกฎในนี้ก่อน merge

---

## 1. หลักการออกแบบ (Design Principles)

1. **Function first, beauty follows** — ความสวยที่ไม่ช่วยให้อ่านข้อมูลเร็วขึ้นคือของตกแต่งที่ต้องตัดทิ้ง
2. **Color มีความหมายเดียวเสมอ** (Semantic, ไม่ใช่ Decorative) — กฎข้อ 3 ด้านล่าง
3. **3-Second Rule** — คนเดินผ่านจอ NOC ต้องรู้ภายใน 3 วินาทีว่า "ตอนนี้ปกติไหม" โดยไม่ต้องอ่าน label
4. **Consistency > Novelty** — panel ชนิดเดียวกันต้องหน้าตาเหมือนกันทุกที่ที่ปรากฏ (ผ่าน Library Panels)
5. **Progressive disclosure** — NOC ตอบ "ต้องเรียกใครไหม", Engineering ตอบ "ทำไม", Capacity ตอบ "จะเกิดอะไรต่อ" ห้ามผสมระดับรายละเอียดในหน้าเดียวกัน

---

## 2. Color System

### 2.1 Semantic Palette — ONE table, every dashboard (merged 2026-08-08)

Until now this repo ran **two** separate palettes: §2.1 for NOC/Engineering/Capacity
and a distinct "LDI Kiosk" palette for the 5 LDI dashboards. In practice both had
already drifted onto the *same* hex values almost everywhere (verified by counting
every `#RRGGBB` literal across all 10 dashboard files before writing this section) —
the two-table split had become a documentation fiction, not a real design boundary.
Merged into one table, applied to **all 12 dashboards** including the LDI kiosk set.
No dashboard is exempt.

| Token | Hex Code | ความหมาย | ใช้กับ |
|---|---|---|---|
| `ok` | `#22C55E` | สถานะดี / ปกติ | Healthy, running, PASS, Capable+ thresholds — any "this is fine" verdict |
| `warning` | `#F59E0B` | เฝ้าระวัง ยังไม่ฉุกเฉิน | IDLE, Marginal, warning thresholds |
| `critical` | `#EF4444` | อันตราย ต้องแก้เดี๋ยวนี้ | OUT OF SPEC, critical thresholds, error states |
| `info` | `#00F2FE` | ข้อมูลทั่วไปที่ไม่ใช่คำตัดสิน | Plain KPI numbers, machine-name labels, non-alerting stats |
| `accent` | `#3B82F6` | สีเน้น / Active UI elements | Navigation highlights, interactive elements |
| `no_data` | `#64748B` | NO_DATA โดยเฉพาะ | A genuine gap in reporting — a *different claim* than `critical` ("confirmed bad"). "We don't know" ≠ "something is wrong." Every stat/gauge/bargauge panel must carry an explicit `type: "special", options.match: "null+nan"` mapping to this color (or, for panels that convert no-rows into a sentinel value in SQL, a matching value-mapping to the text `NO_DATA`) — Grafana does not fall back to a neutral color on its own. `noValue` text must be the literal string `NO_DATA` everywhere (not `N/A`/`-`/Grafana's raw "No data"), except where a panel's fallback is a legitimate zero-count business value or already carries a more specific semantic label (e.g. NOC's `AWAITING TELEMETRY`). |
| `forecast` | `#4A5568` | เส้นคาดการณ์/Regression (เส้นประ) | Forecast, regression, trend projection — dashed line only |
| `severity-minor` | `#EAB308` | 4th alarm-severity tier | ISA-18.2 "Minor" severity specifically, distinct from `warning`/Major — the two are deliberately different shades so a 4-level severity scale (Critical/Major/Minor/Warning) stays visually distinguishable. Not part of the core 6; only used in alarm-severity value mappings. |

**กฎเหล็ก:**
- **ห้าม** ใช้สี Grafana default palette — ใช้เฉพาะ tokens ในตารางนี้เท่านั้น เพื่อสื่อสถานะ
- **ห้าม** ผูกสี fixed เข้ากับชื่อเครื่อง/series เฉพาะเจาะจง ยกเว้นกรณีเดียว: เครื่องจริงถาวรในโรงงานที่ต้องแยกด้วยสีคงที่ — ต้องประกาศ mapping ใน §8
- แดง (`#EF4444`) ต้องแปลว่า critical **เสมอ** — ห้ามใช้แดงเป็นสี series เฉยๆ เพราะจะไปแย่งความหมายกับ alert
- Forecast/regression/threshold reference ใช้ `#4A5568` เส้นประเสมอ ไม่ใช่สีสดที่แข่งกับข้อมูลจริง
- Decorative colors (graph-series differentiation for lines with no status meaning, backgrounds, borders) are exempt from this table — a dashboard can't be built from 6 saturated colors alone. A color is "decorative" only if it never communicates OK/warning/critical/no-data for anything; if in doubt, it's semantic.
- **Enforcement:** `tests/lint/dashboard-linter.js` (Check 15) validates every `thresholds.steps[].color` and `mappings[].options.color` in `monitoring/grafana/dashboards/*.json` against this table's hex values — scoped to those two structural locations specifically because that's where a color is *always* semantic, unlike a bare `fixedColor` which can legitimately be decorative (series differentiation). This is the actual "central" mechanism — `APPROVED_TOKENS` in that file is generated from this table; if you add a token here, add it there too.

### 2.1a (retired) — see history

The former "LDI Kiosk" 5-token table (`#22c55e`/`#FF9100`/`#FF003C`/`#00F2FE`/`#6B7280`)
is retired as of the merge above. Every one of its concepts now maps 1:1 onto §2.1's
table via the *already-dominant* hex values found in the live LDI dashboard files —
nothing about the LDI dashboards' visual identity (dark `#030407` background, Roboto
Mono) changed, only the status-color literals. See git history for the harmonization
changelog predating this merge (Phase 2/3 stray-instance cleanup).

### 2.1b Accessibility — WCAG AA contrast (audited 2026-08-08)

Grafana's Stat/Gauge `colorMode: "background"` always renders **white** value
text regardless of the background's actual brightness — verified empirically,
not assumed from the Grafana docs (there is no auto-contrast switch to black
text for light backgrounds in 13.1.1). Computed white-text contrast ratio for
every §2.1 token against a solid fill:

| Token | Hex | White-text ratio | AA large (≥3:1) | AA normal (≥4.5:1) |
|---|---|---|---|---|
| `ok` | `#22C55E` | 2.28 | | |
| `warning` | `#F59E0B` | 2.15 | | |
| `critical` | `#EF4444` | 3.76 | | |
| `info` | `#00F2FE` | 1.39 | | |
| `accent` | `#3B82F6` | 3.68 | | |
| `no_data` | `#64748B` | 4.76 | | |
| `severity-minor` | `#EAB308` | 1.92 | | |

**Fix applied, not just documented:** every stat/gauge/bargauge panel using
`colorMode: "background"` (31 panels) was switched to `colorMode: "value"` —
same token color, now as large bold text on the dark panel background instead
of a solid fill behind white text. As *text* against the dark panel background
(effectively the same ratio, inverted), every token passes AA-large and all
but `no_data` pass full AA-normal too (`no_data` is only ever used at the
large stat-value sizes this system uses, so AA-large is the applicable bar).
This also has a side benefit: it now visually reinforces §2.1's `ok`/`warning`/
`critical` ("this is a verdict") vs `info` ("neutral readout, not a verdict")
distinction — verdicts are solid-fill tiles, neutral readouts are colored text
on a dark tile — rather than being identical-looking and only distinguishable
by which specific color of solid tile it is.

**One deliberate exception:** the Andon board's per-machine traffic-light
tiles (`monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json`, panel
`1000`) keep `colorMode: "background"`. Their job is color *perception* from
3-5 meters, not text *reading* — a solid color block is more reliably
distinguishable at a glance from across a factory floor than colored text at
any panel size that still fits ten tiles across a kiosk screen, matching how
real industrial andon lights work. WCAG's text-contrast metric doesn't model
this "is the block red or green" task, so applying it here would trade away
the actual accessibility need (glanceability) for a metric that doesn't fit
the use case.

**Enforcement:** `tests/lint/dashboard-linter.js` (Check 17) warns on any
stat/gauge/bargauge panel using `colorMode: "background"` outside the
per-file exception list, so this doesn't silently regress as new panels are
added.

### 2.2 Threshold Contract (ต้องตรงกันทุก panel ที่วัดค่าเดียวกัน)

| Metric | Warning | Critical | หมายเหตุ |
|---|---|---|---|
| CPU Load % | 80 | 90 | |
| RAM Used % | 85 | 95 | |
| Disk Used % | 80 | 90 | |
| Temperature °C | 45 | 55 | ปรับตาม spec เครื่องจริงเมื่อรู้ค่า |
| LDI PE (µm, abs) | 10 | 15 | ตาม tolerance ที่ตกลงกับฝ่าย QA |
| Fleet Health Score | < 70 | < 50 | สเกลต่อเนื่อง 0–100 (ห้ามขั้นบันได) |

ตัวเลขนี้ต้อง**เขียนครั้งเดียว**แล้ว reuse ผ่าน field config template ไม่ใช่พิมพ์ threshold ซ้ำในทุก panel — ถ้าจะเปลี่ยนค่า เปลี่ยนที่เดียวแล้ว save เป็น Library Panel field config

---

## 3. Typography & Number Formatting

| องค์ประกอบ | กฎ |
|---|---|
| Panel title | สั้น ≤ 4 คำ, Title Case, ไม่ใส่หน่วยในชื่อ (หน่วยอยู่ใน axis/legend) |
| Panel description | ใส่ทุก panel เสมอ อธิบาย "นี่คืออะไร + คำนวณยังไง" แสดงผ่าน hover (ⓘ icon) |
| Stat value font size (NOC / kiosk row) | ≥ 56px สำหรับ KPI แถวบนสุดของ NOC Overview และ Andon Board (เพิ่มจาก 32px เดิม — อ่านจากระยะไกลกว่าเดิมบนจอ NOC/kiosk ขนาดใหญ่), `titleSize` ≥ 16px คู่กัน |
| Stat value font size (อื่นๆ) | ≥ 32px สำหรับ KPI ทั่วไป |
| Table `cellHeight` (NOC / kiosk) | `lg` เสมอ สำหรับตารางหลักบน NOC Overview และ Andon Board — ค่าเริ่มต้น `sm` เล็กเกินไปสำหรับอ่านจากระยะไกล |
| หน่วย (unit) | ตั้งทุก field เสมอ ห้ามปล่อยตัวเลขดิบ (`%`, `°C`, `GB`, `Mbps`) |
| Decimal | 1 ตำแหน่งพอสำหรับ % และอุณหภูมิ, 0 ตำแหน่งสำหรับ count |
| เวลา | `dateTimeFromNow` สำหรับ "last seen" (เช่น "12s ago"), absolute time เฉพาะ tooltip |
| Sentinel values | ค่าพิเศษ (เช่น 9999 = ไม่มีการเติบโต) ต้องมี value mapping เป็นข้อความเสมอ ห้ามโชว์ตัวเลขดิบที่ดูเหมือน bug |

---

## 4. Panel Type Decision Table

เลือกชนิด panel จาก**ธรรมชาติของข้อมูล** ไม่ใช่ความเคยชิน:

| ข้อมูลแบบไหน | ใช้ Panel | ตัวอย่างใน IMS |
|---|---|---|
| ค่าล่าสุด เดี่ยว + อยากเห็นเทรนด์คู่กัน | **Stat** (`graphMode: area`) | CPU ล่าสุด, RAM ล่าสุด |
| ค่าที่มีเพดาน ต้องรู้ "เหลือเท่าไหร่" | **Bar Gauge** / **Gauge** | RAM %, Disk % |
| สถานะจำนวนมากตามเวลา | **State Timeline** | Fleet uptime 24h |
| เทรนด์ต่อเนื่อง เปรียบเทียบหลาย series | **Time Series** | CPU/RAM/Network history |
| สัดส่วนของทั้งหมด ณ จุดเวลาหนึ่ง | **Pie / Donut** | Traffic breakdown ต่อ interface |
| ตารางรายละเอียด หลาย field | **Table** + gauge cell + color text | Server Fleet Status |
| Correlation ระหว่าง 2 ตัวแปร | **XY Chart** | CPU vs Temperature |
| Alert ที่กำลัง fire | **Alert List** | แถวบนสุดของ NOC |
| คำอธิบาย/ลิงก์ runbook | **Text (Markdown)** | หมายเหตุใต้ row |
| ตำแหน่งเชิงพื้นที่ในโรงงาน | **Geomap (custom image)** | ผังเครื่องจริงตามพื้นที่ผลิต |

**ข้อห้าม:** อย่ายัด time series ลง stat panel ขนาดเล็ก (6×6) เพราะมันจะไม่มีที่ให้อ่านแกน — ถ้าต้องการเทรนด์ในพื้นที่เล็ก ใช้ stat + sparkline แทน

---

## 5. Layout Grid System

### 5.1 กติกา Grid (24 columns มาตรฐาน Grafana)

```
┌─────────────────────────────────────────────────────┐
│ Row 1: KPI Strip    [4][4][4][4][4][4] h=4   │ ← ตัวเลขเดียว บอกสถานะรวม
├─────────────────────────────────────────────────────┤
│ Row 2: Alert + Status  [Alert List: 8][Table: 16] h=8│ ← สิ่งที่ต้องดูก่อนอย่างอื่น
├─────────────────────────────────────────────────────┤
│ Row 3: Trends (collapsible row ตาม domain)  h=8-10 │ ← 1-2 timeseries ต่อแถว กว้าง 12-24
├─────────────────────────────────────────────────────┤
│ Row N: Deep Debug (collapsed by default)   h=8   │ ← raw table, ไม่ critical
└─────────────────────────────────────────────────────┘
```

### 5.2 กฎ Width/Height

| Panel type | Width (คอลัมน์) | Height |
|---|---|---|
| Stat (KPI) | 4–6 | 4 |
| Gauge / Bar Gauge | 6–8 | 6 |
| Time Series หลัก | 12–24 | 8 |
| Time Series รอง (คู่เทียบ) | 12 | 8 |
| Table | 16–24 | 8–10 |
| Alert List | 8 | 8 |
| Pie/Donut | 6–8 | 8 |

- ห้ามผสม height ต่างกันในแถวเดียวกัน (ทำให้ grid ดูเอียง) — ถ้า panel สูงไม่เท่ากัน ให้แยกคนละแถว
- ใช้ **Row** เสมอเพื่อแบ่งโซนความหมาย ตั้งชื่อ row ให้สื่อ (`️ Compute`, ` Network`, `️ Environmental`) พร้อม emoji ตัวเดียวเป็น visual anchor
- Row ที่ไม่ critical → `collapsed: true` เป็นค่าเริ่มต้น
- **Panel density (2026-08-08):** dashboard ที่มี panel มากกว่า ~8 ตัวเรียงแนวตั้งแบบไม่มี row (สังเกตได้จาก `IMS LDI - Engineering Analytics & SPC` ที่เคยสูง 126 grid units) ต้องจัดกลุ่มเป็น row ตามโซนความหมาย แล้ว collapse ทุก row ยกเว้น row แรก/สำคัญที่สุด — เหลือแค่ header list สั้นๆ ให้เห็นภาพรวมทันที ไม่ต้อง scroll มหาศาล เนื้อหาทั้งหมดยังอยู่ครบ แค่ซ่อนไว้หลัง header ที่คลิกขยายได้
- **Kiosk no-scroll ceiling (2026-08-08):** 3 dashboards are glance/kiosk boards per §1 principle 5 ("progressive disclosure" — NOC and Easy Overview answer "is everything OK," Andon is the factory-floor wall display) and carry a hard 20-grid-unit ceiling in `tests/lint/dashboard-linter.js`'s `MAX_HEIGHT`, enforced as an error, not a warning. All 3 use the same pattern: only the single most decision-relevant row stays expanded (Andon's KPI strip + machine tiles, NOC's alert list, Easy Overview's KPI strip) — everything else is a collapsed row, content still fully present, one click away. Engineering/Capacity/Machine-Snapshot/Manufacturing are deliberately deep-dive dashboards under the same principle and are NOT in `MAX_HEIGHT` — forcing them to 20u would fight their actual purpose, not serve it.

---

## 6. Interaction Standards

ตั้งค่าระดับ **dashboard settings** ให้เหมือนกันทุกไฟล์:

| Setting | ค่า | เหตุผล |
|---|---|---|
| Graph tooltip | `Shared crosshair` | ลาก cursor แล้วทุก panel sync ตำแหน่งเวลา — รู้สึกเป็นระบบเดียว |
| Tooltip mode (ต่อ panel ที่มีหลาย series) | `multi` | เห็นค่าทุกเส้น ณ จุดนั้นพร้อมกัน |
| `spanNulls` | `60000` (1 นาที) ไม่ใช่ `true` | รูบนกราฟ = เหตุการณ์จริง (outage) ต้องเห็น ไม่ใช่เส้นเรียบลวงตา |
| Default time range | NOC: `now-6h` / Engineering: `now-6h` / Capacity: `now-30d` | ตรงพฤติกรรมใช้งานจริงของแต่ละหน้า ไม่ default เดียวกันหมด |
| Refresh rate | NOC/Engineering: `10s` / Capacity: `5m` | ตรงความถี่ที่ข้อมูลเปลี่ยนจริง ไม่ยิง query เกินจำเป็น |
| `allowUiUpdates` (provider) | `false` | บังคับ dashboard-as-code, กัน drift จาก git |

---

## 7. Data Visualization Rules เฉพาะกราฟ

- **spanNulls แบบมีเพดานเวลา** (ข้อ 6) ไม่ใช่เชื่อมทุกช่องว่างเสมอ
- **Threshold แสดงเป็น area shading** (`thresholdsStyle: "area"` หรือ `"line+area"`) แทน dashed line เปล่า — พื้นหลังแดงจางๆ เห็นจากระยะไกลง่ายกว่าเส้นบางๆ มาก
- **ค่าที่เป็น counter สะสม (SNMP errors/drops) ต้องแปลงเป็น rate ก่อนแสดง** ด้วย `LAG() OVER (...)` ใน SQL — ห้ามโชว์เส้นสะสมที่ขึ้นตลอดกาล อ่านไม่ออกว่าตอนนี้แย่ลงไหม
- **ข้อมูลที่ต้อง mirror แกน (เช่น TX ใต้ RX)** ใช้ field override `custom.transform: "negative-Y"` ที่ visualization layer เท่านั้น — ห้ามคูณ `-1` ใน SQL เพราะ legend/tooltip จะแสดงค่าติดลบผิดความจริง
- **Forecast/regression series** ต้องเป็นเส้นประสีเทาเสมอ (ดูข้อ 2.1) และ matcher ของ override ต้องใช้ `byRegexp` ไม่ใช่ `byName` แบบ literal เมื่อชื่อ series มีตัวแปร interpolate (เช่น `${machine_id}`) เพราะ `byName` ไม่ interpolate template
- **Legend:** `displayMode: table` + `placement: bottom` + เปิด `calcs: [mean, max, last]` เมื่อมีมากกว่า 3 series — ให้ legend ทำหน้าที่เป็น mini-table แทนแค่สัญลักษณ์สี

### 7.1 ECharts panels (`volkovlabs-echarts-panel`) — theming is not optional (added 2026-08-08)

The plugin's own defaults are built for a light-mode, many-category dashboard
and actively fight this system if left untouched: a **white tooltip popup**
against the dark theme, and — the moment you have more than 2-3 series — a
**bright rainbow categorical palette** (candy blue/purple/pink/orange/etc.)
that turns a precision instrument reading into a screensaver. Both were
shipped in an earlier pass and had to be rolled back after review flagged
the whole SPC section as "cluttered" despite the underlying engineering
being sound — the defect was pure theming, not the chart choice itself.

Every `getOption` function on this system MUST:

- Set `tooltip.backgroundColor`/`borderColor`/`textStyle.color` explicitly
 to the dark-panel palette (`rgba(18,22,26,0.95)` / `rgba(255,255,255,0.12)`
 / `#E8EDF2`) — never leave ECharts' light-mode tooltip default active.
- **Not** assign each series its own bright hue just because there are many
 of them. For "N similar things over time" charts (e.g. 10 machines' raw
 samples), render all N in one muted neutral tone (`#8B98A9`) and reserve
 color for what's actually a verdict — e.g. the one machine currently
 outside its control limits gets `critical` red, everything else stays
 gray. This is the same §2.1 principle ("color has one meaning") applied
 to a plugin that doesn't enforce it for you.
- When two categories genuinely need to stay visually distinct (e.g. PE vs
 JE box plot) but neither is a verdict, pick two tokens from the
 **neutral-readout family** (`info` `#00F2FE`, `accent` `#3B82F6`) — not a
 warning/critical token, and not an arbitrary non-token hex.
- Style `xAxis`/`yAxis`/`legend` text color to `rgba(224,224,224,0.85)` and
 grid/split lines to `rgba(255,255,255,0.06-0.15)`, matching the rest of
 the system's restrained-gridline convention (§9 visual-noise rule).

Reference implementations: `ims-ldi-engineering-analytics.json` panels 17
(Thickness Control Chart) and 12 (PE/JE Box Plot).

---

## 8. Machine Identity Palette (ถ้าต้องผูกสีถาวรต่อเครื่องจริง)

> เติมตารางนี้เมื่อทราบรายชื่อเครื่องจริงที่จะ deploy ใน production ห้ามสร้าง fixed color override ที่อื่นนอกจากอ้างอิงจากตารางนี้

| Machine ID | สี | หมายเหตุ |
|---|---|---|
| _(รอข้อมูลเครื่องจริง)_ | | |

---

## 9. Reusability — Library Panels

Panel ที่ปรากฏซ้ำมากกว่า 1 dashboard **ต้อง**เป็น Library Panel (แก้ที่เดียว อัปเดตทุกที่) — **แต่เฉพาะกรณีที่ SQL/business logic ตรงกันจริงๆ**, ไม่ใช่แค่ชื่อ panel คล้ายกัน:

- **Fleet Health Score** (stat) — true library panel, `ims-lib-fleet-health-score`. Confirmed byte-identical query (`SELECT value FROM public.v_fleet_score`) between `ims-capacity-planning.json` and `ims-noc-overview.json` before merging.
- **Availability / Critical Alarms / Running / Yield** — ️ audited 2026-08-08, found NOT duplicates despite similar names: each dashboard's version has a genuinely different SQL scope (e.g. Manufacturing's Yield panel adds a `machine_id` template filter and a period-over-period "Delta %" calc that Easy Overview's simpler version doesn't have; Andon/Manufacturing/Easy-Overview's "Availability"/"Running" panels differ in whether they filter by `machine_id` and which compression-chunk workaround they carry). Forcing these into one shared panel would mean changing what each dashboard actually computes — out of scope here (business logic is explicitly off-limits for this pass). If a real business decision is made later to standardize these to one canonical query/filter scope, redo this audit then and promote the survivors to library panels using the same mechanism.

**How this actually works in this repo (Grafana 13.1.1 has no file-based provisioning for library panels — only datasources/dashboards/alerting/plugins get that; verified empirically, not by trusting the Grafana docs' provisioning section):**

1. Write the panel spec to `monitoring/grafana/library-panels/<uid>.json` — shape: `{uid, name, kind: 1, model: {...full panel content...}}`. `uid` is hand-chosen and stable (not Grafana's auto-generated one) so dashboard JSON can reference it before it exists.
2. Run `bash scripts/provision-library-panels.sh` — idempotent HTTP API script (creates via `POST /api/library-elements` if missing, `PATCH` if the uid already exists) against the live Grafana instance. Not wired into `docker-compose` as an automatic service (no existing image here has both curl and python3 without a fragile custom build) — run it manually after `docker compose up`, same pattern as `scripts/import-real-data.sh`.
3. In the referencing dashboard's JSON, replace the panel with a minimal stub: `{"id": <id>, "gridPos": {...}, "libraryPanel": {"uid": "<uid>", "name": "<name>"}}` — no inline `type`/`fieldConfig`/`options`/`targets`/`description`; all of that comes from the library element.
4. `tests/lint/dashboard-linter.js` validates `library-panels/*.json` directly (color tokens, description, noValue) since a referencing panel stub has nothing inline to check.

---

## 10. Checklist ก่อน Merge Panel/Dashboard ใหม่

- [ ] สีที่ใช้อยู่ในตาราง §2.1 เท่านั้น ไม่มี fixed color ผูกกับ series เฉพาะที่ไม่ใช่เครื่องจริงถาวร
- [ ] Threshold ตรงกับสัญญาใน §2.2 (ถ้า metric ใหม่ ให้เพิ่มแถวในตารางนี้ก่อน)
- [ ] มี `unit` และ `description` ครบทุก field
- [ ] Panel type เลือกตามตาราง §4 ไม่ใช่ตามความเคยชิน
- [ ] Grid width/height ตรงกฎ §5.2 ไม่ผสม height ในแถวเดียวกัน
- [ ] `spanNulls` ตั้งเป็นตัวเลข ไม่ใช่ `true`
- [ ] ถ้า panel ซ้ำกับที่อื่น → แปลงเป็น Library Panel ก่อน merge
- [ ] Query ตรงกติกา tiering (raw ≤ latest value, minute CAGG ≤ 6h, hourly CAGG > 2d)
- [ ] ทดสอบด้วย `make test-visual` แล้ว screenshot ตรงกับที่คาดหวัง
- [ ] `node tests/lint/dashboard-linter.js` ผ่าน 0 errors — linter ตรวจ hex สีนอกตาราง §2.1 อัตโนมัติ นี่คือกลไก "central token" ตัวจริง ไม่ใช่แค่เอกสารนี้

---

*เอกสารนี้คือ living document — แก้ไขผ่าน PR เดียวกับที่แก้ dashboard ที่เกี่ยวข้องเสมอ ห้ามให้ dashboard กับเอกสารนี้ drift จากกัน*
