import json

p_mfg = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-manufacturing.json'
with open(p_mfg, 'r', encoding='utf-8') as f:
    d = json.load(f)

# Helper to generate the CTE wrapper for Delta %
def wrap_delta(sql, prev_interval="1 hour", prev_window="2 hours"):
    # Replaces $__timeFilter("time") or $__timeFilter(time) with exact intervals
    sql_now = sql.replace('$__timeFilter("time")', f"\"time\" > NOW() - INTERVAL '{prev_interval}'")
    sql_now = sql_now.replace('$__timeFilter(time)', f"time > NOW() - INTERVAL '{prev_interval}'")
    
    sql_prev = sql.replace('$__timeFilter("time")', f"\"time\" BETWEEN NOW() - INTERVAL '{prev_window}' AND NOW() - INTERVAL '{prev_interval}'")
    sql_prev = sql_prev.replace('$__timeFilter(time)', f"time BETWEEN NOW() - INTERVAL '{prev_window}' AND NOW() - INTERVAL '{prev_interval}'")
    
    # Check if original sql starts with WITH
    if sql.strip().startswith('WITH'):
        # Just return the query inside CTEs. A bit complex to regex.
        # Let's wrap the entire query instead!
        # now_val AS ( sql_now ), prev_val AS ( sql_prev )
        pass
        
    return f"""WITH now_val AS (
{sql_now.strip(';')}
),
prev_val AS (
{sql_prev.strip(';')}
)
SELECT n.value, ROUND(((n.value - p.value)/NULLIF(p.value, 0) * 100)::NUMERIC, 1) AS "Delta %"
FROM now_val n, prev_val p"""

override = {
    "matcher": { "id": "byName", "options": "Delta %" },
    "properties": [
        { "id": "unit", "value": "percent" },
        { "id": "color", "value": { "mode": "thresholds" } },
        { "id": "thresholds", "value": { "mode": "absolute", "steps": [
            { "color": "#E5484D", "value": None },
            { "color": "#00E5FF", "value": 0 }
        ]}}
    ]
}

target_titles = ['◉ Estimated Yield (%)', '◉ Fleet Availability (%)', '◉ Avg Cpk (Fleet)', '◉ Running', '◉ Avg Temperature', '◉ Avg Humidity']

for p in d.get('panels', []):
    title = p.get('title', '')
    if title in target_titles and p.get('type') == 'stat':
        # Apply transformation SQL
        t = p['targets'][0]
        if 'rawSql' in t and '"Delta %"' not in t['rawSql']:
            t['rawSql'] = wrap_delta(t['rawSql'])
            
            # Ensure textMode is value_and_name
            p['options']['textMode'] = 'value_and_name'
            
            # Add field override for Delta %
            if 'overrides' not in p['fieldConfig']:
                p['fieldConfig']['overrides'] = []
            
            # check if Delta % override already exists
            has_override = False
            for ov in p['fieldConfig']['overrides']:
                if ov.get('matcher', {}).get('options') == 'Delta %':
                    has_override = True
                    break
            if not has_override:
                p['fieldConfig']['overrides'].append(override)

with open(p_mfg, 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
