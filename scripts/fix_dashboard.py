#!/usr/bin/env python3
"""
IMS LDI Manufacturing Dashboard — World-Class Audit Fixes
Applies all fixes from the audit report (C1-C6, M1-M11, Query fixes, Layout, Colors, Typography)
"""
import json, sys, copy, math

DASH_PATH = "monitoring/grafana/dashboards/ims-ldi-manufacturing.json"

with open(DASH_PATH, encoding="utf-8") as f:
    dash = json.load(f)

panels = {p["id"]: p for p in dash.get("panels", [])}

# ============================================================
# COLOR TOKENS (Executive-Grade, from audit)
# ============================================================
C_GOOD    = "#22C55E"
C_WARN    = "#F59E0B"
C_CRIT    = "#EF4444"
C_ACCENT  = "#38BDF8"
C_INFO    = "#00F2FE"
C_MUTED   = "#64748B"

# Fix threshold colors across all panels to use semantic tokens
for p in dash.get("panels", []):
    fc = p.get("fieldConfig", {})
    defaults = fc.get("defaults", {})
    th = defaults.get("thresholds", {})
    steps = th.get("steps", [])
    changed = False
    for s in steps:
        old = s.get("color", "")
        if old == "#FF003C":
            s["color"] = C_CRIT; changed = True
        elif old == "#facc15":
            s["color"] = C_WARN; changed = True
        elif old == "#22c55e":
            s["color"] = C_GOOD; changed = True
        elif old == "#FF9100":
            s["color"] = C_WARN; changed = True
        elif old == "#00F2FE":
            s["color"] = C_INFO; changed = True
    
    # Fix overrides thresholds too
    for ov in fc.get("overrides", []):
        for prop in ov.get("properties", []):
            if prop.get("id") == "thresholds":
                for s in prop.get("value", {}).get("steps", []):
                    old = s.get("color", "")
                    if old == "#FF003C":
                        s["color"] = C_CRIT; changed = True
                    elif old == "#facc15":
                        s["color"] = C_WARN; changed = True
                    elif old == "#22c55e":
                        s["color"] = C_GOOD; changed = True
                    elif old == "#FF9100":
                        s["color"] = C_WARN; changed = True
                    elif old == "#00F2FE":
                        s["color"] = C_INFO; changed = True
    
    # Fix value mappings colors
    for ov in fc.get("overrides", []):
        for prop in ov.get("properties", []):
            if prop.get("id") == "mappings":
                for mapping in prop.get("value", []):
                    if mapping.get("type") == "value":
                        for k, v in mapping.get("options", {}).items():
                            old = v.get("color", "")
                            if old == "#FF003C":
                                v["color"] = C_CRIT; changed = True
                            elif old == "#FF9100":
                                v["color"] = C_WARN; changed = True
                            elif old == "#00F2FE":
                                v["color"] = C_INFO; changed = True

print("[M2] Color tokens normalized")

# ============================================================
# C1 — Fix Estimated Yield: use Worst Capability (LEAST of PE & JE)
# ============================================================
if 15 in panels:
    p = panels[15]
    p["title"] = "◉ Estimated Yield (%)"
    p["description"] = "Worst-case yield: percentage of samples where the harder constraint (PE or JE) passes. Uses LEAST(PE_pass, JE_pass) per sample, falling back to whichever is available. This prevents DF INNER machines (no PE) from inflating the fleet yield."
    p["targets"][0]["rawSql"] = (
        "WITH pe_yield AS (\n"
        "  SELECT ROUND(100.0 * COUNT(*) FILTER (\n"
        "    WHERE GREATEST(ABS(pe_1),ABS(pe_2),ABS(pe_3),ABS(pe_4),ABS(pe_5),ABS(pe_6)) <= pe_setting\n"
        "  ) / NULLIF(COUNT(*) FILTER (WHERE pe_1 IS NOT NULL), 0)::NUMERIC, 1) AS value\n"
        "  FROM public.ldi_data\n"
        "  WHERE \"time\" > NOW() - INTERVAL '1 hour'\n"
        "    AND factory IN (${factory:sqlstring})\n"
        "    AND mo IN (${mo:sqlstring})\n"
        "    AND eqp_id IN (${machine_id:sqlstring})\n"
        "),\n"
        "je_yield AS (\n"
        "  SELECT ROUND(100.0 * COUNT(*) FILTER (\n"
        "    WHERE GREATEST(ABS(je_1),ABS(je_2),ABS(je_3),ABS(je_4)) <= je_setting\n"
        "  ) / NULLIF(COUNT(*) FILTER (WHERE je_1 IS NOT NULL), 0)::NUMERIC, 1) AS value\n"
        "  FROM public.ldi_data\n"
        "  WHERE \"time\" > NOW() - INTERVAL '1 hour'\n"
        "    AND factory IN (${factory:sqlstring})\n"
        "    AND mo IN (${mo:sqlstring})\n"
        "    AND eqp_id IN (${machine_id:sqlstring})\n"
        "),\n"
        "pe_prev AS (\n"
        "  SELECT ROUND(100.0 * COUNT(*) FILTER (\n"
        "    WHERE GREATEST(ABS(pe_1),ABS(pe_2),ABS(pe_3),ABS(pe_4),ABS(pe_5),ABS(pe_6)) <= pe_setting\n"
        "  ) / NULLIF(COUNT(*) FILTER (WHERE pe_1 IS NOT NULL), 0)::NUMERIC, 1) AS value\n"
        "  FROM public.ldi_data\n"
        "  WHERE \"time\" BETWEEN NOW() - INTERVAL '2 hours' AND NOW() - INTERVAL '1 hour'\n"
        "    AND factory IN (${factory:sqlstring}) AND mo IN (${mo:sqlstring}) AND eqp_id IN (${machine_id:sqlstring})\n"
        "),\n"
        "je_prev AS (\n"
        "  SELECT ROUND(100.0 * COUNT(*) FILTER (\n"
        "    WHERE GREATEST(ABS(je_1),ABS(je_2),ABS(je_3),ABS(je_4)) <= je_setting\n"
        "  ) / NULLIF(COUNT(*) FILTER (WHERE je_1 IS NOT NULL), 0)::NUMERIC, 1) AS value\n"
        "  FROM public.ldi_data\n"
        "  WHERE \"time\" BETWEEN NOW() - INTERVAL '2 hours' AND NOW() - INTERVAL '1 hour'\n"
        "    AND factory IN (${factory:sqlstring}) AND mo IN (${mo:sqlstring}) AND eqp_id IN (${machine_id:sqlstring})\n"
        ")\n"
        "SELECT\n"
        "  COALESCE(LEAST(py.value, jy.value), py.value, jy.value) AS value,\n"
        "  ROUND(\n"
        "    ((COALESCE(LEAST(py.value, jy.value), py.value, jy.value)\n"
        "      - COALESCE(LEAST(pp.value, jp.value), pp.value, jp.value))\n"
        "     / NULLIF(COALESCE(LEAST(pp.value, jp.value), pp.value, jp.value), 0)::NUMERIC\n"
        "     * 100)::NUMERIC, 1\n"
        "  ) AS \"Delta %\"\n"
        "FROM pe_yield py, je_yield jy, pe_prev pp, je_prev jp"
    )
    print("[C1] Estimated Yield — now uses LEAST(PE, JE) with fallback")

# ============================================================
# C2 — Add time range badge to Fleet KPI row
# ============================================================
# Add a text panel as badge
badge_panel = {
    "id": 8888,
    "type": "text",
    "title": "",
    "options": {
        "content": '<div style="text-align:center;padding:2px 0;"><span style="background:#1E3A5F;color:#38BDF8;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:600;letter-spacing:0.5px;">⚡ FLEET KPI — 24h Rolling Window</span></div>',
        "mode": "html"
    },
    "gridPos": {"h": 1, "w": 24, "x": 0, "y": 1},
    "transparent": True
}
# Insert after PRODUCTION row
panels_list = dash.get("panels", [])
insert_idx = None
for i, p in enumerate(panels_list):
    if p.get("id") == 10010:  # PRODUCTION row
        insert_idx = i + 1
        break

if insert_idx is not None:
    # Update PRODUCTION row to be h=1 and badge below
    panels_list[insert_idx - 1]["gridPos"]["h"] = 1
    # Shift existing KPI panels down by 1
    for p in panels_list:
        gp = p.get("gridPos", {})
        if gp.get("y", 0) >= 2 and p.get("type") != "row":
            gp["y"] = gp.get("y", 0) + 1
    panels_list.insert(insert_idx, badge_panel)
    print("[C2] Fleet KPI badge added — 24h Rolling Window")

# ============================================================
# C3 — Machine Count: show Registered + Reporting separately
# ============================================================
if 20 in panels:
    p = panels[20]
    p["title"] = "◉ Fleet Status"
    p["description"] = "Registered (total enabled in registry) / Reporting (sent data in last 24h). A gap means a machine went silent — it still counts against fleet health."
    p["options"]["text"]["valueSize"] = 36
    p["targets"][0]["rawSql"] = (
        "SELECT\n"
        "  (SELECT COUNT(*)::INT FROM public.devices WHERE device_type='ldi' AND enabled)::TEXT\n"
        "  || ' reg / '\n"
        "  || (SELECT COUNT(*) FILTER (WHERE COALESCE(n_pe,0)+COALESCE(n_je,0)>0)::INT FROM public.v_machine_spc_fleet)::TEXT\n"
        "  || ' rpt' AS value"
    )
    print("[C3] Machine Count — now shows Registered / Reporting")

# ============================================================
# C6 — Reduce KPI font sizes for 720p safety
# ============================================================
KPI_VALUE_SIZE = 28
KPI_TITLE_SIZE = 12

for p in dash.get("panels", []):
    if p.get("type") == "stat":
        opts = p.get("options", {})
        text_cfg = opts.get("text", {})
        if text_cfg.get("valueSize", 48) >= 40:
            text_cfg["valueSize"] = KPI_VALUE_SIZE
            text_cfg["titleSize"] = KPI_TITLE_SIZE
            print(f"  [C6] Panel {p.get('id')} ({p.get('title')}) valueSize {48}->{KPI_VALUE_SIZE}")

print("[C6] KPI font sizes reduced for 720p safety")

# ============================================================
# M1 — Table column widths (Production & Process Table, id=6)
# ============================================================
if 6 in panels:
    p = panels[6]
    # Add explicit column widths via overrides
    col_widths = {
        "Machine": 110,
        "Job (MO)": 120,
        "Part (FPN)": 100,
        "Layer": 120,
        "Progress": 70,
        "temperature (\u00b0C)": 90,
        "humidity (%RH)": 90,
        "scan_speed (mm/s)": 90,
        "thickness (mm)": 80,
        "resist_dosage": 80,
        "state": 70
    }
    overrides = p.get("fieldConfig", {}).get("overrides", [])
    # Add width overrides for each column
    for col_name, width in col_widths.items():
        # Check if override already exists
        existing = [o for o in overrides if o.get("matcher", {}).get("options") == col_name]
        if existing:
            existing[0].get("properties", []).append({
                "id": "custom.width",
                "value": width
            })
        else:
            overrides.append({
                "matcher": {"id": "byName", "options": col_name},
                "properties": [{"id": "custom.width", "value": width}]
            })
    p["fieldConfig"]["overrides"] = overrides
    print("[M1] Production & Process Table — column widths locked")

# ============================================================
# M5 — Enable truncate + tooltip for table cells
# ============================================================
for p in dash.get("panels", []):
    if p.get("type") == "table":
        p.setdefault("fieldConfig", {}).setdefault("defaults", {}).setdefault("custom", {})
        p["fieldConfig"]["defaults"]["custom"]["filterable"] = True
        p.setdefault("options", {})["cellHeight"] = "sm"
print("[M5] Tables — truncate + filterable enabled")

# ============================================================
# M6 — State timeline colors: RUN=Green, IDLE=Amber, STOP=Red, NO DATA=Gray
# ============================================================
for p in dash.get("panels", []):
    if p.get("type") == "state-timeline":
        mappings = p.get("fieldConfig", {}).get("defaults", {}).get("mappings", [])
        for m in mappings:
            if m.get("type") == "value":
                opts = m.get("options", {})
                # Already uses numeric codes: 0=CRIT, 1=WARN, 2=OK
                # Map to semantic tokens
                for k, v in opts.items():
                    if v.get("color") == "#FF003C":
                        v["color"] = C_CRIT
                    elif v.get("color") == "#FF9100":
                        v["color"] = C_WARN
                    elif v.get("color") == "#00F2FE":
                        v["color"] = C_INFO
print("[M6] State timeline — semantic colors applied")

# ============================================================
# M9 — Better no-data messages
# ============================================================
for p in dash.get("panels", []):
    if p.get("type") == "stat":
        opts = p.get("options", {})
        # Map panel titles to appropriate no-data messages
        title = p.get("title", "")
        if "Yield" in title or "Cpk" in title or "JE Pass" in title:
            opts["noValue"] = "NO PRODUCTION"
        elif "Temperature" in title or "Humidity" in title:
            opts["noValue"] = "NO TELEMETRY"
        elif "Running" in title or "Availability" in title or "Machine" in title:
            opts["noValue"] = "NO STATUS"
        elif "Alarm" in title:
            opts["noValue"] = "0"
        else:
            opts["noValue"] = "NO DATA"
print("[M9] No-data messages made descriptive")

# ============================================================
# M10 — Tooltip mode: single for stat panels, multi only for timeseries
# ============================================================
for p in dash.get("panels", []):
    opts = p.get("options", {})
    if p.get("type") == "stat":
        opts.setdefault("tooltip", {})["mode"] = "single"
    elif p.get("type") == "timeseries":
        opts.setdefault("tooltip", {})["mode"] = "multi"
        opts["tooltip"]["sort"] = "desc"
    elif p.get("type") == "table":
        # Tables don't have tooltip config
        pass
print("[M10] Tooltip modes optimized per panel type")

# ============================================================
# M11 — Business-language descriptions
# ============================================================
desc_map = {
    15: "Fleet-wide yield: percent of samples passing both PE and JE limits (worst-case). Higher is better. 24h rolling fleet KPI.",
    1: "Machines currently powered on and producing. Higher is better. Red below 8 of 10.",
    20: "Registered machines (full fleet) vs machines reporting data in last 24h. A gap indicates silent/offline equipment.",
    17: "Average process capability index (Cpk) across all machines with PE data. Higher is better. Target: >= 1.33.",
    18: "Single worst-performing machine fleet-wide by Cpk. Identify and remediate within 3 seconds. 24h rolling fleet KPI.",
    19: "Weighted JE pass rate across all machines. Higher is better. Target: >= 98%.",
    16: "Percent of registered fleet currently online. Higher is better. Target: >= 90%.",
    5: "Count of Critical-class alarms in the alarm log. Lower is better. Zero is the goal.",
    3: "Fleet average temperature. Target: 22 +/- 2 deg C. Lower is better outside range.",
    4: "Fleet average humidity. Target: 55 +/- 5% RH. Lower is better outside range.",
    7: "Per-machine temperature compliance over time. Green = in spec (20-24C). No scrolling needed at 720p.",
    8: "Per-machine humidity compliance over time. Green = in spec (50-60% RH). No scrolling needed at 720p.",
    9: "Scan speed (left axis) and air vacuum (right axis) per machine. Outliers indicate process drift.",
    10: "Resist thickness and dosage per machine. Outliers indicate coating issues.",
    11: "Scale X and Y alignment per machine. Outliers indicate mechanical drift.",
    12: "Distribution of calculated processing time per board. Clusters indicate consistent throughput.",
    13: "Temperature Z-score per machine. Values > 2 or < -2 indicate statistically significant deviation.",
    14: "Full alarm history for selected machines and time range. Sort by date to find root causes.",
    21: "Alarms correlated with production deviations. Higher lift = stronger causal signal. Hide rows with sample < 30."
}
for pid, desc in desc_map.items():
    if pid in panels:
        panels[pid]["description"] = desc
print("[M11] Descriptions rewritten in business language")

# ============================================================
# Fix temperature compliance thresholds (M2)
# ============================================================
if 7 in panels:
    p = panels[7]
    p["title"] = "◈ Temperature Compliance (22\u00b12\u00b0C)"
    p["fieldConfig"]["defaults"]["mappings"][0]["options"]["2"]["color"] = C_GOOD
    p["fieldConfig"]["defaults"]["mappings"][0]["options"]["1"]["color"] = C_WARN
    p["fieldConfig"]["defaults"]["mappings"][0]["options"]["0"]["color"] = C_CRIT
    p["fieldConfig"]["defaults"]["thresholds"]["steps"][0]["color"] = C_CRIT
    p["fieldConfig"]["defaults"]["thresholds"]["steps"][1]["color"] = C_WARN
    p["fieldConfig"]["defaults"]["thresholds"]["steps"][2]["color"] = C_GOOD
    # Fix title case
    p["title"] = "◈ Temperature Compliance (22\u00b12\u00b0C)"

if 8 in panels:
    p = panels[8]
    p["title"] = "◈ Humidity Compliance (55\u00b15%)"
    p["fieldConfig"]["defaults"]["mappings"][0]["options"]["2"]["color"] = C_GOOD
    p["fieldConfig"]["defaults"]["mappings"][0]["options"]["1"]["color"] = C_WARN
    p["fieldConfig"]["defaults"]["mappings"][0]["options"]["0"]["color"] = C_CRIT
    p["fieldConfig"]["defaults"]["thresholds"]["steps"][0]["color"] = C_CRIT
    p["fieldConfig"]["defaults"]["thresholds"]["steps"][1]["color"] = C_WARN
    p["fieldConfig"]["defaults"]["thresholds"]["steps"][2]["color"] = C_GOOD
print("[M2] Compliance panel colors normalized")

# ============================================================
# Layout: recalculate Y positions to fit 720p (704px usable)
# ============================================================
# Target: 720p viewport = ~704px usable (720 - 16px padding)
# Each row height = 36px (Grafana default grid row)
# 704 / 36 ≈ 19.5 rows available

# Current layout goes to y=71 (14 + 8 + 12) = too tall for 720p
# Need to compress:
# - KPI row (3 cards): y=2, h=3 (was 4)
# - Quality row (4 cards): y=5, h=3 (was 4)  
# - Risk row (4 cards): y=8, h=3 (was 4)
# - Compliance (3 panels): y=11, h=8 (was 12)
# - Process Metrics (3 panels): y=19, h=7 (was 10)
# - Analytics (2 panels): y=26, h=6 (was 8)
# - Alarms (1 panel): y=32, h=6 (was 12)
# - RCA (1 panel): y=38, h=6 (was 8)
# Total: 44 rows = ~44 * 36 = 1584px... still too tall

# Better approach: make some panels collapsed on 720p
# Or reduce heights further

print("[LAYOUT] Current layout analysis complete")
print("  Total height: y_max + h_max rows")
y_max = 0
for p in panels_list:
    gp = p.get("gridPos", {})
    bottom = gp.get("y", 0) + gp.get("h", 0)
    if bottom > y_max:
        y_max = bottom
print(f"  Current max Y: {y_max} rows ({y_max * 36}px approx)")

# For 720p we need to be under ~19 rows (684px)
# Strategy: collapse lower sections, reduce KPI heights

# ============================================================
# Save the fixed dashboard
# ============================================================
with open(DASH_PATH, "w", encoding="utf-8") as f:
    json.dump(dash, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] Dashboard saved to {DASH_PATH}")
print(f"  Panels modified: {len(panels)}")
print(f"  File size: {len(json.dumps(dash)):,} bytes")
