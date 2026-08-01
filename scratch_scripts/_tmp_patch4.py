import json
p_noc = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-engineering-drilldown.json'
with open(p_noc, 'r', encoding='utf-8') as f:
    d = json.load(f)

changed = False
for p in d.get('panels', []) + sum([r.get('panels', []) for r in d.get('panels', []) if r.get('type')=='row'], []):
    for t in p.get('targets', []):
        if 'rawSql' in t:
            if 'ORDER BY time ASC' in t['rawSql']:
                # Ensure it has a metric column to order by, if not, it won't hurt much if it doesn't have metric. Wait, if it doesn't have metric, it'll fail.
                # Let's check if 'metric' is selected
                if 'metric' in t['rawSql']:
                    t['rawSql'] = t['rawSql'].replace('ORDER BY time ASC', 'ORDER BY time ASC, metric ASC')
                    changed = True
                elif 'ORDER BY 1 ASC' in t['rawSql']:
                    if 'metric' in t['rawSql']:
                        t['rawSql'] = t['rawSql'].replace('ORDER BY 1 ASC', 'ORDER BY 1 ASC, metric ASC')
                        changed = True

if changed:
    with open(p_noc, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
