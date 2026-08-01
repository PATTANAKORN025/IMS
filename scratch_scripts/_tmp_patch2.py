import json

p_cap = 'c:/Projects/IMS/monitoring/grafana/dashboards/ims-capacity-planning.json'
with open(p_cap, 'r', encoding='utf-8') as f:
    d = json.load(f)

for p in d['panels']:
    for t in p.get('targets', []):
        if 'rawSql' in t:
            if 'SELECT bucket AS time, device_id, value, metric FROM historical' in t['rawSql']:
                t['rawSql'] = t['rawSql'].replace(
                    'SELECT bucket AS time, device_id, value, metric FROM historical\nUNION ALL\nSELECT bucket AS time, device_id, value, metric FROM future_points',
                    'SELECT time, device_id, value, metric FROM historical\nUNION ALL\nSELECT time, device_id, value, metric FROM future_points'
                )

with open(p_cap, 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
