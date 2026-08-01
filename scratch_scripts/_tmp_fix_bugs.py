import json, glob, re

# Fix 1: The Machine Snapshot bug
f_snap = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-ldi-machine-snapshot.json'
with open(f_snap, 'r', encoding='utf-8') as f:
    d_snap = json.load(f)

for p in d_snap.get('panels', []):
    for t in p.get('targets', []):
        if 'rawSql' in t:
            sql = t['rawSql']
            if 'ELSE ${machine_id:sqlstring} END AS eqp_id' in sql:
                # Rewrite the selected_machine CTE to avoid CASE WHEN with multiple values
                new_cte = '''selected_machine AS (
 SELECT DISTINCT eqp_id FROM public.ldi_data
 WHERE (${event_time_ms:raw}::NUMERIC > 0 AND eqp_id = split_part(${clicked_series:sqlstring},' - ',1))
    OR (COALESCE(${event_time_ms:raw}::NUMERIC, 0) <= 0 AND eqp_id IN (${machine_id:sqlstring}))
)'''
                # Replace the old CTE block
                sql = re.sub(r'selected_machine AS \(\s*SELECT CASE WHEN \$\{event_time_ms:raw\}::NUMERIC > 0 THEN split_part\(\$\{clicked_series:sqlstring\},\' - \',1\)\s*ELSE \$\{machine_id:sqlstring\} END AS eqp_id\s*\)', new_cte, sql)
                t['rawSql'] = sql
                print(f"Fixed Snapshot bug in Panel {p.get('id')}")

with open(f_snap, 'w', encoding='utf-8') as f:
    json.dump(d_snap, f, indent=2, ensure_ascii=False)


# Fix 2: The double HAVING bug in net_metrics
for filepath in glob.glob('c:/Projects/IMS/monitoring/grafana/dashboards/*.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    modified = False
    for p in d.get('panels', []):
        for t in p.get('targets', []):
            if 'rawSql' in t:
                sql = t['rawSql']
                if 'HAVING' in sql.upper() and sql.upper().count('HAVING') > 1:
                    # Replace second HAVING with AND
                    parts = sql.split('HAVING')
                    if len(parts) > 2:
                        # Rejoin with AND for all subsequent HAVINGs
                        new_sql = parts[0] + 'HAVING' + parts[1] + ' AND ' + ' AND '.join(parts[2:])
                        t['rawSql'] = new_sql
                        modified = True
                        print(f"Fixed HAVING bug in {filepath.split('/')[-1]} Panel {p.get('id')}")
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
