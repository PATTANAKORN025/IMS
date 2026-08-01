import json

filepath = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-capacity-planning.json'
with open(filepath, 'r', encoding='utf-8') as f:
    d = json.load(f)

for p in d.get('panels', []):
    for t in p.get('targets', []):
        if 'rawSql' in t:
            t['rawSql'] = t['rawSql'].replace(', device_id ASC, metric ASC', '')

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
