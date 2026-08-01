import json

p_cap = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-capacity-planning.json'
with open(p_cap, 'r', encoding='utf-8') as f:
    d = json.load(f)

for p in d['panels']:
    for t in p.get('targets', []):
        if 'rawSql' in t:
            if 'ORDER BY time ASC' in t['rawSql']:
                t['rawSql'] = t['rawSql'].replace(
                    'ORDER BY time ASC',
                    'ORDER BY time ASC, device_id ASC, metric ASC'
                )

with open(p_cap, 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
