import json
with open('c:/Projects/IMS/monitoring/grafana/dashboards/ims-noc-overview.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
for p in d.get('panels', []):
    if p.get('id') in [0, 999, 998, 101, 200, 300, 500]:
        print(p.get('id'), p.get('type'), p.get('title'))
