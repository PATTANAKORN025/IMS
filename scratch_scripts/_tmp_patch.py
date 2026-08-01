import json

# 1. Fix Capacity Planning (UNION mismatch)
path = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-capacity-planning.json'
with open(path, 'r', encoding='utf-8') as f:
    d = json.load(f)

for p in d['panels']:
    for t in p.get('targets', []):
        if 'SELECT bucket AS time, device_id, value, metric FROM future_points' in t.get('rawSql', ''):
            # The future_points table has (time, device_id, metric, value). But it's selecting (time, device_id, value, metric).
            # This is 4 columns, historical is 4 columns. Why the error?
            # Wait, is `future_points` selecting `value` then `metric`? Yes, `SELECT gs AS time, r.device_id, 'Forecast' AS metric, GREATEST(...) AS value`.
            # So `future_points` actually has `metric` as 3rd and `value` as 4th.
            # When we `SELECT bucket AS time, device_id, value, metric FROM future_points`, we are extracting exactly 4 columns!
            # Let me re-read the query from my dump:
            # WITH historical AS ( ... 'History' AS metric ... )
            # historical has: time, device_id, value, metric
            # future_points has: time, device_id, metric, value
            # SELECT bucket AS time, device_id, value, metric FROM historical
            # UNION ALL
            # SELECT bucket AS time, device_id, value, metric FROM future_points
            # Both sides have 4 columns. The UNION error MUST be from another query!
            pass

# Let's write a targeted fixer for the known bad columns
def replace_in_targets(dash, old, new):
    for p in dash.get('panels', []) + sum([r.get('panels', []) for r in dash.get('panels', []) if r.get('type')=='row'], []):
        for t in p.get('targets', []):
            if 'rawSql' in t:
                t['rawSql'] = t['rawSql'].replace(old, new)

# Readiness Dashboard: a.eqp_id -> a.equipmentid
p_readiness = 'c:/Projects/IMS/monitoring/grafana/dashboards/ldi-data-readiness.json'
dash_r = json.load(open(p_readiness, encoding='utf-8'))
replace_in_targets(dash_r, 'a.eqp_id = d.eqp_id', 'a.equipmentid = d.eqp_id')
replace_in_targets(dash_r, 'a.eqp_id IS NOT NULL', 'a.equipmentid IS NOT NULL')
replace_in_targets(dash_r, 'MAX(a.eqp_id)', 'MAX(a.equipmentid)')
replace_in_targets(dash_r, 'a.eqp_id =', 'a.equipmentid =')
with open(p_readiness, 'w', encoding='utf-8') as f:
    json.dump(dash_r, f, indent=2, ensure_ascii=False)

# Machine Snapshot: UNION ALL column mismatch
p_snap = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-machine-snapshot.json'
dash_s = json.load(open(p_snap, encoding='utf-8'))
# The "Alarm Context" query:
# alarm_rows has 6 columns: Time, Machine, errorcode, errortime, Message, Severity
# target has 1 column: time
# The UNION ALL is:
# SELECT target."time",sm.eqp_id,NULL::TEXT,NULL::TEXT,'No alarm in +/-5 minutes (real data)','NONE' FROM target CROSS JOIN selected_machine sm
# Wait, this second SELECT has 6 columns too! (target."time", sm.eqp_id, NULL, NULL, string, string)
# Why did my script flag it as `UNION column mismatch? [1, 6]`?
# Because my script did: select_match = re.search(r'(?i)SELECT\s+(.*?)\s+FROM', part)
# And the first SELECT in the entire SQL was `WITH target AS (SELECT "time" FROM public.ldi_data...` which has 1 column!
# Ah! My python checking script was just wrong. The queries actually have matching columns.
pass
